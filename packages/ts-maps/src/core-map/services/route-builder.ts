// Drawing a route by tapping the map: waypoints, and the line between each
// pair — along real paths through a router, or straight. Headless, so any
// UI (a map click, a list of places, a test) drives the same logic.
//
//   const builder = new RouteBuilder({ router: directionsRouter(new ValhallaDirections(), 'walking') })
//   builder.onChange(() => line.setLatLngs(builder.path))
//   map.on('click', e => builder.add(e.latlng))
//
// Every change after the first tap — dragging a waypoint (move), pulling
// the line to go a different way (insert), dropping a waypoint (remove) —
// reroutes only the segments that touch it. `RouteEditor` is the map UI
// for all of it.

import type { DirectionsProvider, LatLngLike, TransportProfile } from './types'
import { distanceMeters, pathLengthMeters } from './paths'

/** The line from one waypoint to the next, first and last points included. */
export type SegmentRouter = (from: LatLngLike, to: LatLngLike, signal?: AbortSignal) => Promise<LatLngLike[]>

/** A straight line: for open ground, beaches, or when routing is off. */
export const straightRouter: SegmentRouter = async (from, to) => [from, to]

/** Route each segment through a directions provider — walking follows footpaths and trails. */
export function directionsRouter(provider: DirectionsProvider, profile: TransportProfile = 'walking'): SegmentRouter {
  return async (from, to, signal) => {
    const [route] = await provider.getDirections([from, to], { profile, signal })
    if (!route?.geometry?.length)
      throw new Error('No route between these points')
    return route.geometry
  }
}

export interface RouteBuilderOptions {
  /** How each new segment is drawn. Default: straight. */
  router?: SegmentRouter
  /**
   * When the router fails (no path, offline, rate-limited), draw that one
   * segment straight instead of refusing the tap. Default true: a route with
   * one straight stretch beats a map that ignores the person.
   */
  fallbackToStraight?: boolean
  /** A route whose ends are this close is a loop. Default 50 m. */
  loopToleranceMeters?: number
}

export interface RouteBuilderState {
  waypoints: LatLngLike[]
  /** segments[i] runs from waypoints[i] to waypoints[i + 1]. */
  segments: LatLngLike[][]
  /** Segments that fell back to a straight line. */
  straight: boolean[]
}

type Listener = (builder: RouteBuilder) => void

function samePoint(a: LatLngLike, b: LatLngLike): boolean {
  return a.lat === b.lat && a.lng === b.lng
}

function pairKey(from: LatLngLike, to: LatLngLike): string {
  return `${from.lat},${from.lng}>${to.lat},${to.lng}`
}

/** How far `p` is from the stretch a–b, in degrees of latitude, with longitude scaled by `kx`. */
function distanceToStretch(p: LatLngLike, a: LatLngLike, b: LatLngLike, kx: number): number {
  const ax = (a.lng - p.lng) * kx
  const ay = a.lat - p.lat
  const dx = (b.lng - a.lng) * kx
  const dy = b.lat - a.lat
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

/**
 * Indexes to cut a line at, about `every` metres apart along it, first and
 * last always included. A last piece shorter than half the spacing joins the
 * one before it rather than leaving a waypoint just short of the end.
 */
function cutEvery(points: LatLngLike[], every: number): number[] {
  const cuts = [0]
  let run = 0
  for (let i = 1; i < points.length - 1; i++) {
    run += distanceMeters(points[i - 1], points[i])
    if (run >= every) {
      cuts.push(i)
      run = 0
    }
  }
  run += distanceMeters(points[points.length - 2], points[points.length - 1])
  if (cuts.length > 1 && run < every / 2)
    cuts.pop()
  cuts.push(points.length - 1)
  return cuts
}

export class RouteBuilder {
  private state: RouteBuilderState = { waypoints: [], segments: [], straight: [] }
  private history: RouteBuilderState[] = []
  private listeners = new Set<Listener>()
  private queue: Promise<void> = Promise.resolve()
  private pendingCount = 0
  private router: SegmentRouter
  private fallbackToStraight: boolean
  private loopTolerance: number
  /** Why the last segment could not be routed, if it could not. */
  lastError: string | null = null

  constructor(opts: RouteBuilderOptions = {}) {
    this.router = opts.router ?? straightRouter
    this.fallbackToStraight = opts.fallbackToStraight ?? true
    this.loopTolerance = opts.loopToleranceMeters ?? 50
  }

  get waypoints(): LatLngLike[] {
    return this.state.waypoints.slice()
  }

  get segments(): LatLngLike[][] {
    return this.state.segments.map(s => s.slice())
  }

  /** The whole line, segments joined without repeating their shared ends. */
  get path(): LatLngLike[] {
    const { waypoints, segments } = this.state
    if (!segments.length)
      return waypoints.slice(0, 1)
    const out: LatLngLike[] = []
    for (const segment of segments) {
      for (const point of segment) {
        if (!out.length || !samePoint(out[out.length - 1], point))
          out.push(point)
      }
    }
    return out
  }

  get distanceMeters(): number {
    return this.state.segments.reduce((sum, s) => sum + pathLengthMeters(s), 0)
  }

  /**
   * The line ends where it starts, and is long enough to be a route at all.
   * Judged on the drawn path, not the waypoints: a closed route loaded with
   * load() has only its two (equal) ends as waypoints, and was never a loop.
   */
  get isLoop(): boolean {
    const path = this.path
    return path.length > 2
      && this.distanceMeters > this.loopTolerance * 2
      && distanceMeters(path[0], path[path.length - 1]) <= this.loopTolerance
  }

  /** Segments being routed right now. */
  get pending(): number {
    return this.pendingCount
  }

  get canUndo(): boolean {
    return this.history.length > 0
  }

  /** Use a different router for segments added from now on. */
  setRouter(router: SegmentRouter): void {
    this.router = router
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Add a waypoint, routing the segment to it from the last one. Taps made
   * while a segment is still routing wait their turn, so a fast series of
   * taps still draws in order.
   */
  add(point: LatLngLike, opts: { router?: SegmentRouter } = {}): Promise<void> {
    const target = { lat: point.lat, lng: point.lng }
    return this.track(async () => {
      const before = this.snapshot()
      const { waypoints } = this.state
      if (!waypoints.length) {
        this.state = { waypoints: [target], segments: [], straight: [] }
      }
      else {
        const from = waypoints[waypoints.length - 1]
        const [{ segment, straight }] = await this.routeAll([[from, target]], opts.router ?? this.router)
        this.state = {
          waypoints: [...waypoints, target],
          segments: [...this.state.segments, segment],
          straight: [...this.state.straight, straight],
        }
      }
      this.history.push(before)
    })
  }

  /**
   * Move a waypoint, rerouting the segments on either side of it. Copies of
   * the same point move with it — both ends of a closed loop, both passes of
   * an out-and-back — so dragging the start of a loop keeps it a loop.
   */
  move(index: number, point: LatLngLike, opts: { router?: SegmentRouter } = {}): Promise<void> {
    const target = { lat: point.lat, lng: point.lng }
    return this.track(async () => {
      const moving = this.state.waypoints[index]
      if (!moving || samePoint(moving, target))
        return
      await this.rebuild(this.state.waypoints.map(w => samePoint(w, moving) ? target : w), opts.router)
    })
  }

  /**
   * Add a waypoint at `index` — between the two it now sits between, so the
   * route goes through it on the way. The segment it splits is rerouted as
   * two; `index` 0 adds a new start, and `waypoints.length` is `add()`.
   */
  insert(index: number, point: LatLngLike, opts: { router?: SegmentRouter } = {}): Promise<void> {
    const target = { lat: point.lat, lng: point.lng }
    return this.track(async () => {
      const { waypoints } = this.state
      const at = Math.max(0, Math.min(index, waypoints.length))
      await this.rebuild([...waypoints.slice(0, at), target, ...waypoints.slice(at)], opts.router)
    })
  }

  /**
   * Drop a waypoint, joining its neighbours with a new segment. Its copies go
   * with it, as with `move()`; dropping the start of a closed loop makes the
   * next waypoint the start and keeps it closed.
   */
  remove(index: number, opts: { router?: SegmentRouter } = {}): Promise<void> {
    return this.track(async () => {
      const { waypoints } = this.state
      const removing = waypoints[index]
      if (!removing)
        return
      const closed = waypoints.length >= 3 && samePoint(waypoints[0], waypoints[waypoints.length - 1])
      const next = waypoints.filter(w => !samePoint(w, removing))
      if (closed && samePoint(removing, waypoints[0]) && next.length >= 2)
        next.push(next[0])
      // [a, b, a] without b is [a, a]: one point, not a route to itself.
      await this.rebuild(next.filter((w, i) => i === 0 || !samePoint(w, next[i - 1])), opts.router)
    })
  }

  /**
   * The segment that passes closest to `point`: where a press on the line
   * lands, so a waypoint dragged out of it goes in the right place. -1 with
   * no segments.
   */
  nearestSegment(point: LatLngLike): number {
    // Flat metres around the point: plenty for picking between nearby lines.
    const kx = Math.cos(point.lat * Math.PI / 180)
    let best = -1
    let bestDistance = Infinity
    this.state.segments.forEach((segment, index) => {
      for (let i = 0; i < segment.length; i++) {
        const d = distanceToStretch(point, segment[i], segment[i + 1] ?? segment[i], kx)
        if (d < bestDistance) {
          bestDistance = d
          best = index
        }
      }
    })
    return best
  }

  /** Route back to the first waypoint. */
  closeLoop(opts: { router?: SegmentRouter } = {}): Promise<void> {
    const start = this.state.waypoints[0]
    if (!start || this.state.waypoints.length < 2 || this.isLoop)
      return this.queue
    return this.add(start, opts)
  }

  /** Return the way you came: the path so far, mirrored onto its end. */
  outAndBack(): Promise<void> {
    const run = async (): Promise<void> => {
      const { waypoints, segments, straight } = this.state
      if (waypoints.length < 2)
        return
      this.history.push(this.snapshot())
      this.state = {
        waypoints: [...waypoints, ...waypoints.slice(0, -1).reverse()],
        segments: [...segments, ...segments.slice().reverse().map(s => s.slice().reverse())],
        straight: [...straight, ...straight.slice().reverse()],
      }
    }
    return this.enqueue(run)
  }

  /** Take back the last change — a waypoint, a loop, an out-and-back. */
  undo(): Promise<void> {
    return this.enqueue(async () => {
      const previous = this.history.pop()
      if (previous)
        this.state = previous
    })
  }

  clear(): Promise<void> {
    return this.enqueue(async () => {
      if (this.state.waypoints.length)
        this.history.push(this.snapshot())
      this.state = { waypoints: [], segments: [], straight: [] }
      this.lastError = null
    })
  }

  /**
   * Start from an existing line (a catalog trail, a saved route), drawn
   * exactly as given. By default only its ends are waypoints; with
   * `waypointEveryMeters` it is cut into waypoints about that far apart,
   * so moving one reshapes that stretch rather than rerouting the whole line.
   */
  load(path: LatLngLike[], opts: { waypointEveryMeters?: number } = {}): Promise<void> {
    return this.enqueue(async () => {
      this.history.push(this.snapshot())
      const points = path.map(p => ({ lat: p.lat, lng: p.lng }))
      if (points.length < 2) {
        this.state = { waypoints: points.slice(0, 1), segments: [], straight: [] }
        return
      }
      const cuts = cutEvery(points, opts.waypointEveryMeters ?? Infinity)
      this.state = {
        waypoints: cuts.map(i => points[i]),
        segments: cuts.slice(1).map((end, i) => points.slice(cuts[i], end + 1)),
        straight: cuts.slice(1).map(() => false),
      }
    })
  }

  /** Resolves once every queued change has been applied. */
  settled(): Promise<void> {
    return this.queue
  }

  toJSON(): { waypoints: LatLngLike[], path: LatLngLike[], distanceMeters: number, loop: boolean } {
    return { waypoints: this.waypoints, path: this.path, distanceMeters: this.distanceMeters, loop: this.isLoop }
  }

  private async route(from: LatLngLike, to: LatLngLike, router: SegmentRouter): Promise<{ segment: LatLngLike[], straight: boolean, error: string | null }> {
    try {
      const line = await router(from, to)
      if (line.length >= 2) {
        // The router snaps to the nearest path; keep the exact taps as the
        // segment's ends so the next segment starts where the person tapped.
        const segment = line.slice()
        if (!samePoint(segment[0], from))
          segment.unshift(from)
        if (!samePoint(segment[segment.length - 1], to))
          segment.push(to)
        return { segment, straight: router === straightRouter, error: null }
      }
    }
    catch (error) {
      if (!this.fallbackToStraight)
        throw error
      return { segment: [from, to], straight: true, error: error instanceof Error ? error.message : String(error) }
    }
    return { segment: [from, to], straight: true, error: null }
  }

  /**
   * Route several segments at once. A segment asked for twice, or in both
   * directions — the two passes of an out-and-back — is routed once, so the
   * way back still retraces the way out. `lastError` is the first failure.
   */
  private async routeAll(pairs: Array<[LatLngLike, LatLngLike]>, router: SegmentRouter): Promise<Array<{ segment: LatLngLike[], straight: boolean }>> {
    const jobs = new Map<string, ReturnType<RouteBuilder['route']>>()
    const results = await Promise.all(pairs.map(async ([from, to]) => {
      const reverse = jobs.get(pairKey(to, from))
      if (reverse) {
        const found = await reverse
        return { ...found, segment: found.segment.slice().reverse() }
      }
      const key = pairKey(from, to)
      if (!jobs.has(key))
        jobs.set(key, this.route(from, to, router))
      return jobs.get(key)!
    }))
    this.lastError = results.find(r => r.error)?.error ?? null
    return results.map(({ segment, straight }) => ({ segment, straight }))
  }

  /**
   * Replace the waypoints with `next`, keeping every segment whose two ends
   * are still next to each other and routing only the rest — which keeps a
   * loaded line exactly as drawn everywhere it was not touched.
   */
  private async rebuild(next: LatLngLike[], router: SegmentRouter = this.router): Promise<void> {
    const { waypoints, segments, straight } = this.state
    const kept = new Map<string, { segment: LatLngLike[], straight: boolean }>()
    segments.forEach((segment, i) => {
      kept.set(pairKey(waypoints[i], waypoints[i + 1]), { segment, straight: straight[i] })
      const back = pairKey(waypoints[i + 1], waypoints[i])
      if (!kept.has(back))
        kept.set(back, { segment: segment.slice().reverse(), straight: straight[i] })
    })
    const legs = next.slice(1).map((to, i) => [next[i], to] as [LatLngLike, LatLngLike])
    const missing = legs.filter(([from, to]) => !kept.has(pairKey(from, to)))
    const routed = await this.routeAll(missing, router)
    missing.forEach(([from, to], i) => kept.set(pairKey(from, to), routed[i]))
    this.history.push(this.snapshot())
    this.state = {
      waypoints: next,
      segments: legs.map(([from, to]) => kept.get(pairKey(from, to))!.segment),
      straight: legs.map(([from, to]) => kept.get(pairKey(from, to))!.straight),
    }
  }

  /** Queue a change that routes, counting it in `pending` until it lands. */
  private track(task: () => Promise<void>): Promise<void> {
    this.pendingCount++
    this.emit()
    return this.enqueue(async () => {
      try {
        await task()
      }
      finally {
        this.pendingCount--
      }
    })
  }

  /**
   * Run `task` after everything already queued. A task that throws rejects
   * its own promise but not the queue, so one failed segment cannot stop
   * every tap after it.
   */
  private enqueue(task: () => Promise<void>): Promise<void> {
    const result = this.queue.then(task)
    this.queue = result.catch(() => {}).finally(() => this.emit())
    return result
  }

  private snapshot(): RouteBuilderState {
    return {
      waypoints: this.state.waypoints.slice(),
      segments: this.state.segments.map(s => s.slice()),
      straight: this.state.straight.slice(),
    }
  }

  private emit(): void {
    for (const listener of this.listeners)
      listener(this)
  }
}
