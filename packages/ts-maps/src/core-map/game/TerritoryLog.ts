// Keeping every player's map the same.
//
// Two runners close overlapping loops within the same second, in different
// parts of the world, on phones with clocks that disagree. Whatever each of
// them sees, and whatever the server sees, has to end up identical — otherwise
// one player's app says they own a block and another's says they lost it, and
// there is no way to tell which is right.
//
// The property that makes that work is **convergence**: the same set of
// captures produces the same map whatever order they arrive in. Getting it is
// a matter of two decisions.
//
// First, **captures are the state**, not the polygons they produce. A capture
// is the ring somebody ran; territory is what you get by folding those rings
// together in order. Replaying is therefore always possible, which is what
// lets a late arrival be slotted into its proper place rather than jammed on
// the end.
//
// Second, the order is **total and agreed**, not "when it reached me". A
// server sequence number decides it where there is one; failing that, the
// capture's timestamp, and failing that — two events with the same
// timestamp — the event id, which every participant can compare and none can
// argue with. Wall clocks disagree between phones, so the id tiebreak is not a
// formality: it is what stops two clients ordering the same pair differently.
//
// The cost is replay. A capture that arrives out of order invalidates the fold
// after its position, so everything from there is recomputed. `compact()`
// bounds that by turning settled history into a snapshot.

import type { CaptureResult, TerritoryStore, TerritoryStoreOptions } from './TerritoryStore'
import type { MultiPolygon, Ring } from '../geo/polygonClip'
import { Evented } from '../core/Events'

export interface CaptureEvent {
  /**
   * Unique, and stable across retries of the same capture.
   *
   * Doubles as the idempotency key — a client that resends after a timeout
   * must not claim the ground twice — and as the final tiebreak in ordering,
   * so two captures with identical timestamps still order the same way for
   * everybody.
   */
  id: string
  owner: string
  ring: Ring
  /** Client wall clock, milliseconds. Ordering falls back to this. */
  at: number
  /**
   * Server-assigned order, where a server assigns one.
   *
   * Authoritative when present, because it is the one number every client
   * agrees on and no client can fake. Events carrying it always sort before
   * those that do not: an event the server has accepted is settled, and one
   * still in flight is not.
   */
  seq?: number
}

export interface AppliedCapture {
  event: CaptureEvent
  /** What changed. Absent when the event was a duplicate. */
  result?: CaptureResult
  /** True when this event had already been applied. */
  duplicate: boolean
  /**
   * True when the event landed before events already applied, so the fold had
   * to be replayed. Worth watching: a high rate means clock skew or a slow
   * network path, not a bug.
   */
  replayed: boolean
}

export interface TerritoryLogOptions {
  /**
   * Events to keep before `compact()` folds the oldest into the snapshot.
   * Only the retained ones can be replayed around, so this is how far out of
   * order an event may arrive and still be placed correctly.
   */
  maxEvents?: number
  /** Passed to the stores this creates. */
  store?: TerritoryStoreOptions
}

/**
 * An ordered log of captures, and the territory they add up to.
 *
 * ```ts
 * const log = new TerritoryLog()
 *
 * // Local: apply at once, send to the server.
 * const applied = log.apply({ id: uuid(), owner: 'me', ring, at: Date.now() })
 * socket.send(applied.event)
 *
 * // Remote: apply whatever arrives, in whatever order.
 * socket.on('capture', event => log.apply(event))
 * ```
 */
export class TerritoryLog extends Evented {
  // `_log`, not `_events`: the Evented base keeps its listener registry on
  // `_events`, and shadowing it would break every handler on this object.
  declare _log: CaptureEvent[]
  declare _seen: Set<string>
  declare _store: TerritoryStore
  declare _baseline: Map<string, MultiPolygon>
  declare _options: Required<Omit<TerritoryLogOptions, 'store'>> & { store?: TerritoryStoreOptions }

  initialize(options: TerritoryLogOptions = {}): void {
    this._log = []
    this._seen = new Set()
    this._baseline = new Map()
    this._options = { maxEvents: options.maxEvents ?? 500, store: options.store }
    this._store = this._newStore()
  }

  /** The territory these captures add up to. */
  get store(): TerritoryStore {
    return this._store
  }

  /** The retained log, in order. */
  get events(): readonly CaptureEvent[] {
    return this._log
  }

  /**
   * Add a capture, wherever it belongs in the order.
   *
   * Applying it directly is the fast path and the common one — captures
   * usually arrive roughly in order. An event belonging before ones already
   * applied means replaying the fold from its position, which is correct
   * rather than fast, and is the price of everyone agreeing.
   */
  apply(event: CaptureEvent): AppliedCapture {
    if (this._seen.has(event.id))
      return { event, duplicate: true, replayed: false }

    const last = this._log[this._log.length - 1]
    const inOrder = !last || compareEvents(last, event) < 0

    this._seen.add(event.id)

    if (inOrder) {
      this._log.push(event)
      const result = this._store.capture(event.owner, event.ring)
      this.fire('applied', { event, result, replayed: false })
      return { event, result, duplicate: false, replayed: false }
    }

    // Out of order: slot it in and refold from the baseline.
    const index = insertionIndex(this._log, event)
    this._log.splice(index, 0, event)
    this._rebuild()

    this.fire('applied', { event, replayed: true })
    return { event, duplicate: false, replayed: true }
  }

  /** Apply many, cheapest when they are given roughly in order. */
  applyAll(events: CaptureEvent[]): AppliedCapture[] {
    return events.map(event => this.apply(event))
  }

  /**
   * Has this capture been applied?
   *
   * For a client deciding whether an acknowledgement needs acting on.
   */
  has(id: string): boolean {
    return this._seen.has(id)
  }

  /**
   * Give a locally-applied capture the order the server assigned it.
   *
   * A client applies its own capture at once so the map responds, then learns
   * where it actually belongs. If that is not where it was put, the fold is
   * replayed — which is exactly the case this whole design exists to make
   * correct rather than to avoid.
   */
  confirm(id: string, seq: number): boolean {
    const index = this._log.findIndex(event => event.id === id)
    if (index === -1)
      return false

    const event = this._log[index]
    if (event.seq === seq)
      return false

    event.seq = seq

    // Re-sort and refold only if the new number actually moves it.
    const reordered = [...this._log].sort(compareEvents)
    const moved = reordered.some((e, i) => e !== this._log[i])
    if (!moved)
      return false

    this._log = reordered
    this._rebuild()
    this.fire('reordered', { id, seq })
    return true
  }

  /**
   * Fold settled history into a snapshot and drop those events.
   *
   * Replay is bounded by the log, so an unbounded log is an unbounded worst
   * case. Compaction trades the ability to reorder around old events — which
   * nothing should still be doing — for a bound on the work any one late
   * arrival can cause.
   */
  compact(keep: number = this._options.maxEvents): number {
    const excess = this._log.length - keep
    if (excess <= 0)
      return 0

    const settled = this._log.slice(0, excess)
    this._log = this._log.slice(excess)

    // A throwaway store, only to compute what the settled events add up to.
    const folded = this._newStore()
    for (const [owner, territory] of this._baseline)
      folded.set(owner, territory)
    for (const event of settled)
      folded.capture(event.owner, event.ring)

    this._baseline = new Map(folded.owners().map(owner => [owner, folded.get(owner)]))
    for (const event of settled)
      this._seen.delete(event.id)

    this._rebuild()
    return settled.length
  }

  /** Everything needed to restore this log elsewhere. */
  snapshot(): {
    baseline: Array<{ owner: string, territory: MultiPolygon }>
    events: CaptureEvent[]
  } {
    return {
      baseline: [...this._baseline.entries()].map(([owner, territory]) => ({ owner, territory })),
      events: this._log.map(event => ({ ...event })),
    }
  }

  /** Restore from a snapshot, discarding whatever was here. */
  restore(snapshot: { baseline?: Array<{ owner: string, territory: MultiPolygon }>, events?: CaptureEvent[] }): this {
    this._baseline = new Map((snapshot.baseline ?? []).map(entry => [entry.owner, entry.territory]))
    this._log = [...(snapshot.events ?? [])].sort(compareEvents)
    this._seen = new Set(this._log.map(event => event.id))
    this._rebuild()
    return this
  }

  clear(): this {
    this._log = []
    this._seen = new Set()
    this._baseline = new Map()
    this._store.clear()
    this.fire('rebuilt', {})
    return this
  }

  _newStore(): TerritoryStore {
    // Required lazily so the two modules can reference each other's types
    // without a cycle at load time.
    // eslint-disable-next-line ts/no-require-imports
    const { TerritoryStore: Store } = require('./TerritoryStore')
    return new Store(this._options.store) as TerritoryStore
  }

  /**
   * Refold from the baseline, in place.
   *
   * The store object is reused rather than replaced, because things hold on to
   * it — a `TerritoryLayer` is given `log.store` once and follows it from then
   * on. Handing back a new store on every replay would leave the map drawing
   * whichever one it was given first, and the bug would only appear when
   * captures arrived out of order.
   */
  _rebuild(): void {
    const store = this._store
    store.clear()
    for (const [owner, territory] of this._baseline)
      store.set(owner, territory)
    for (const event of this._log)
      store.capture(event.owner, event.ring)

    this.fire('rebuilt', {})
  }
}

/**
 * The agreed order: server sequence, then timestamp, then id.
 *
 * Every participant computes this the same way from the event alone, which is
 * what makes the fold converge. The id tiebreak is not a formality — phone
 * clocks disagree, so identical timestamps are common enough that without it
 * two clients would order the same pair differently and diverge.
 */
export function compareEvents(a: CaptureEvent, b: CaptureEvent): number {
  const aSeq = a.seq
  const bSeq = b.seq

  if (aSeq !== undefined && bSeq !== undefined) {
    if (aSeq !== bSeq)
      return aSeq < bSeq ? -1 : 1
  }
  else if (aSeq !== undefined) {
    // Sequenced events are settled; unsequenced ones are still in flight.
    return -1
  }
  else if (bSeq !== undefined) {
    return 1
  }

  if (a.at !== b.at)
    return a.at < b.at ? -1 : 1

  if (a.id === b.id)
    return 0
  return a.id < b.id ? -1 : 1
}

function insertionIndex(events: CaptureEvent[], event: CaptureEvent): number {
  let low = 0
  let high = events.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (compareEvents(events[mid], event) < 0)
      low = mid + 1
    else
      high = mid
  }
  return low
}
