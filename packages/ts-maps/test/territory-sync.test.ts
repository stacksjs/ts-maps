import type { CaptureEvent } from '../src/core-map/game/TerritoryLog'
import type { Ring } from '../src/core-map/geo/polygonClip'
import { describe, expect, test } from 'bun:test'
import { compareEvents, TerritoryLog } from '../src/core-map/game/TerritoryLog'

// The property under test is convergence: the same captures produce the same
// map whatever order they arrive in. Without it one player's phone says they
// own a block and another's says they lost it, and nothing can say which is
// right.

const LAT = 34.02
const mLat = 1 / 111320
const mLng = 1 / (111320 * Math.cos((LAT * Math.PI) / 180))

function block(east: number, north: number, metres: number): Ring {
  const h = metres / 2
  return [
    [-118.47 + (east - h) * mLng, LAT + (north - h) * mLat],
    [-118.47 + (east + h) * mLng, LAT + (north - h) * mLat],
    [-118.47 + (east + h) * mLng, LAT + (north + h) * mLat],
    [-118.47 + (east - h) * mLng, LAT + (north + h) * mLat],
    [-118.47 + (east - h) * mLng, LAT + (north - h) * mLat],
  ]
}

function event(id: string, owner: string, east: number, north: number, at: number, seq?: number): CaptureEvent {
  return { id, owner, ring: block(east, north, 200), at, ...(seq === undefined ? {} : { seq }) }
}

/** The map as a comparable value: every owner and their area. */
function fingerprint(log: TerritoryLog): string {
  return log.store
    .leaderboard()
    .map(entry => `${entry.owner}:${entry.area.toFixed(3)}`)
    .join('|')
}

/** Deterministic shuffle, so a failure can be reproduced. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items]
  let state = seed
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Overlapping captures by several players — the contested case. */
const CONTESTED: CaptureEvent[] = [
  event('a', 'sam', 0, 0, 1000),
  event('b', 'alex', 120, 0, 1001),
  event('c', 'sam', 60, 60, 1002),
  event('d', 'jo', 0, 120, 1003),
  event('e', 'alex', 60, 0, 1004),
  event('f', 'sam', 180, 60, 1005),
  event('g', 'jo', 120, 120, 1006),
]

describe('convergence', () => {
  test('arrival order does not change the outcome', () => {
    const inOrder = new TerritoryLog()
    inOrder.applyAll(CONTESTED)
    const expected = fingerprint(inOrder)

    for (let seed = 1; seed <= 40; seed++) {
      const shuffled = new TerritoryLog()
      shuffled.applyAll(shuffle(CONTESTED, seed))
      expect(fingerprint(shuffled)).toBe(expected)
    }
  })

  test('the log ends up in the agreed order however it arrived', () => {
    const shuffled = new TerritoryLog()
    shuffled.applyAll(shuffle(CONTESTED, 7))
    expect(shuffled.events.map(e => e.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  })

  test('server sequence overrides client clocks', () => {
    // Phone clocks disagree; a capture stamped earlier can be sequenced later.
    const events = [
      event('a', 'sam', 0, 0, 5000, 1),
      event('b', 'alex', 0, 0, 1000, 2),
    ]

    const log = new TerritoryLog()
    log.applyAll(events)

    // Alex ran second by the server's reckoning, so alex holds the ground.
    expect(log.store.areaOf('alex')).toBeGreaterThan(0)
    expect(log.store.areaOf('sam')).toBeCloseTo(0, 0)
  })

  test('identical timestamps still order the same for everyone', () => {
    // Without the id tiebreak two clients would order these differently and
    // diverge, which is the whole failure this design exists to prevent.
    const tied = [
      event('zzz', 'sam', 0, 0, 2000),
      event('aaa', 'alex', 0, 0, 2000),
    ]

    const forward = new TerritoryLog()
    forward.applyAll(tied)
    const backward = new TerritoryLog()
    backward.applyAll([...tied].reverse())

    expect(fingerprint(forward)).toBe(fingerprint(backward))
    // 'aaa' sorts first, so sam ran last and holds it.
    expect(forward.store.areaOf('sam')).toBeGreaterThan(0)
  })

  test('sequenced events settle before unsequenced ones', () => {
    const log = new TerritoryLog()
    log.applyAll([
      event('later', 'sam', 0, 0, 9000),
      event('sequenced', 'alex', 0, 0, 1000, 1),
    ])
    expect(log.events.map(e => e.id)).toEqual(['sequenced', 'later'])
  })
})

describe('idempotency', () => {
  test('replaying a capture claims nothing twice', () => {
    // A client resending after a timeout must not be paid twice for one run.
    const log = new TerritoryLog()
    const first = log.apply(event('a', 'sam', 0, 0, 1000))
    const area = log.store.areaOf('sam')

    const second = log.apply(event('a', 'sam', 0, 0, 1000))

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.result).toBeUndefined()
    expect(log.store.areaOf('sam')).toBeCloseTo(area, 6)
    expect(log.events.length).toBe(1)
  })

  test('has() answers whether an acknowledgement needs acting on', () => {
    const log = new TerritoryLog()
    log.apply(event('a', 'sam', 0, 0, 1000))
    expect(log.has('a')).toBe(true)
    expect(log.has('b')).toBe(false)
  })
})

describe('ordering', () => {
  test('an in-order arrival is applied without replay', () => {
    const log = new TerritoryLog()
    log.apply(event('a', 'sam', 0, 0, 1000))
    const applied = log.apply(event('b', 'alex', 300, 0, 2000))

    expect(applied.replayed).toBe(false)
    expect(applied.result).toBeDefined()
  })

  test('a late arrival is slotted in and replayed', () => {
    const log = new TerritoryLog()
    log.apply(event('b', 'alex', 0, 0, 2000))
    const applied = log.apply(event('a', 'sam', 0, 0, 1000))

    expect(applied.replayed).toBe(true)
    expect(log.events.map(e => e.id)).toEqual(['a', 'b'])
    // Alex ran second, so alex holds the contested ground.
    expect(log.store.areaOf('alex')).toBeGreaterThan(0)
    expect(log.store.areaOf('sam')).toBeCloseTo(0, 0)
  })

  test('compareEvents is a total order', () => {
    const a = event('a', 'x', 0, 0, 1000)
    const b = event('b', 'x', 0, 0, 1000)
    expect(compareEvents(a, b)).toBeLessThan(0)
    expect(compareEvents(b, a)).toBeGreaterThan(0)
    expect(compareEvents(a, a)).toBe(0)
  })
})

describe('confirm', () => {
  test('a server sequence that reorders a local capture replays it', () => {
    // The optimistic case: both captures are applied as they arrive, ordered
    // by client clock, and the server later says the second one really came
    // first.
    const log = new TerritoryLog()
    log.apply(event('mine', 'sam', 0, 0, 1000))
    log.apply(event('theirs', 'alex', 0, 0, 2000))

    // By the clocks alex ran last, so the ground is theirs.
    expect(log.store.areaOf('alex')).toBeGreaterThan(0)
    expect(log.store.areaOf('sam')).toBeCloseTo(0, 0)

    const moved = log.confirm('theirs', 1)

    expect(moved).toBe(true)
    expect(log.events.map(e => e.id)).toEqual(['theirs', 'mine'])
    // And the map follows the new order: alex ran first, sam took it back.
    expect(log.store.areaOf('sam')).toBeGreaterThan(0)
    expect(log.store.areaOf('alex')).toBeCloseTo(0, 0)
  })

  test('a confirmation that changes the winner changes the map', () => {
    const log = new TerritoryLog()
    log.apply(event('theirs', 'alex', 0, 0, 1000))
    log.apply(event('mine', 'sam', 0, 0, 2000))

    // By the clocks sam ran last and holds it.
    expect(log.store.areaOf('sam')).toBeGreaterThan(0)

    // The server says sam's capture was really first.
    log.confirm('mine', 1)

    expect(log.events.map(e => e.id)).toEqual(['mine', 'theirs'])
    // So alex ran last, and the ground is theirs.
    expect(log.store.areaOf('alex')).toBeGreaterThan(0)
    expect(log.store.areaOf('sam')).toBeCloseTo(0, 0)
  })

  test('a sequence that changes nothing does not replay', () => {
    const log = new TerritoryLog()
    log.apply(event('a', 'sam', 0, 0, 1000))
    log.apply(event('b', 'alex', 300, 0, 2000))

    expect(log.confirm('a', 1)).toBe(false)
  })

  test('confirming an unknown id is a no-op', () => {
    expect(new TerritoryLog().confirm('nope', 1)).toBe(false)
  })
})

describe('compaction', () => {
  test('folds settled history and keeps the map identical', () => {
    const log = new TerritoryLog()
    for (let i = 0; i < 20; i++)
      log.apply(event(`e${i}`, i % 2 === 0 ? 'sam' : 'alex', i * 60, 0, 1000 + i))

    const before = fingerprint(log)
    const dropped = log.compact(5)

    expect(dropped).toBe(15)
    expect(log.events.length).toBe(5)
    expect(fingerprint(log)).toBe(before)
  })

  test('compacting below the log size does nothing', () => {
    const log = new TerritoryLog()
    log.apply(event('a', 'sam', 0, 0, 1000))
    expect(log.compact(10)).toBe(0)
  })

  test('captures still apply correctly after compaction', () => {
    const log = new TerritoryLog()
    for (let i = 0; i < 10; i++)
      log.apply(event(`e${i}`, 'sam', i * 60, 0, 1000 + i))
    log.compact(2)

    const before = log.store.areaOf('sam')
    log.apply(event('new', 'alex', 0, 0, 5000))

    expect(log.store.areaOf('alex')).toBeGreaterThan(0)
    expect(log.store.areaOf('sam')).toBeLessThan(before)
  })
})

describe('snapshots', () => {
  test('a log restores to the same map elsewhere', () => {
    const log = new TerritoryLog()
    log.applyAll(CONTESTED)
    log.compact(3)

    const restored = new TerritoryLog().restore(JSON.parse(JSON.stringify(log.snapshot())))

    expect(fingerprint(restored)).toBe(fingerprint(log))
    expect(restored.events.length).toBe(log.events.length)
  })

  test('a restored log still rejects duplicates', () => {
    const log = new TerritoryLog()
    log.applyAll(CONTESTED)

    const restored = new TerritoryLog().restore(log.snapshot())
    expect(restored.apply(CONTESTED[0]).duplicate).toBe(true)
  })

  test('restoring sorts whatever it is given', () => {
    const log = new TerritoryLog()
    log.applyAll(CONTESTED)

    const snapshot = log.snapshot()
    snapshot.events.reverse()

    const restored = new TerritoryLog().restore(snapshot)
    expect(restored.events.map(e => e.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  })
})

describe('two clients', () => {
  test('reach the same map from opposite arrival orders', () => {
    // The actual production scenario: two phones, one network, no agreement
    // about what arrived when.
    const phoneA = new TerritoryLog()
    const phoneB = new TerritoryLog()

    phoneA.applyAll(shuffle(CONTESTED, 11))
    phoneB.applyAll(shuffle(CONTESTED, 29))

    expect(fingerprint(phoneA)).toBe(fingerprint(phoneB))
    expect(phoneA.events.map(e => e.id)).toEqual(phoneB.events.map(e => e.id))
  })

  test('and stay agreed when one of them compacts', () => {
    const phoneA = new TerritoryLog()
    const phoneB = new TerritoryLog()

    phoneA.applyAll(CONTESTED)
    phoneA.compact(2)
    phoneB.applyAll(shuffle(CONTESTED, 3))

    expect(fingerprint(phoneA)).toBe(fingerprint(phoneB))
  })
})

describe('events', () => {
  test('fires applied for each new capture', () => {
    const log = new TerritoryLog()
    const seen: string[] = []
    log.on('applied', (e: any) => seen.push(e.event.id))

    log.apply(event('a', 'sam', 0, 0, 1000))
    log.apply(event('a', 'sam', 0, 0, 1000))
    log.apply(event('b', 'alex', 300, 0, 2000))

    // The duplicate does not fire.
    expect(seen).toEqual(['a', 'b'])
  })

  test('fires rebuilt when the fold is replayed', () => {
    const log = new TerritoryLog()
    let rebuilds = 0
    log.on('rebuilt', () => rebuilds++)

    log.apply(event('b', 'alex', 0, 0, 2000))
    log.apply(event('a', 'sam', 0, 0, 1000))

    expect(rebuilds).toBe(1)
  })
})

describe('store identity', () => {
  test('the store survives a replay', () => {
    // A `TerritoryLayer` is handed `log.store` once and follows it from then
    // on. Replacing the store on every replay would leave the map drawing a
    // stale one, and only when captures arrived out of order.
    const log = new TerritoryLog()
    const store = log.store

    log.apply(event('b', 'alex', 0, 0, 2000))
    log.apply(event('a', 'sam', 0, 0, 1000))

    expect(log.store).toBe(store)
    expect(store.areaOf('alex')).toBeGreaterThan(0)
  })

  test('and survives compaction and clearing', () => {
    const log = new TerritoryLog()
    const store = log.store
    for (let i = 0; i < 10; i++)
      log.apply(event(`e${i}`, 'sam', i * 60, 0, 1000 + i))

    log.compact(2)
    expect(log.store).toBe(store)

    log.clear()
    expect(log.store).toBe(store)
    expect(store.owners()).toEqual([])
  })
})
