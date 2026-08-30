import type { Position } from '../src/core-map/geo/area'
import { describe, expect, test } from 'bun:test'
import { detectLoop, LoopDetector, simplifyTrack } from '../src/core-map/game/loop'

// Turning a GPS track into a shape is the mechanic. Getting it wrong in either
// direction is bad in a way players notice: closing a loop they did not run
// hands out free territory, and missing one they did run loses them the run.

const LAT = 34.02
const M_LAT = 1 / 111320
const M_LNG = 1 / (111320 * Math.cos((LAT * Math.PI) / 180))

/** A point `east`/`north` metres from the origin of these tests. */
function at(east: number, north: number): Position {
  return [-118.47 + east * M_LNG, LAT + north * M_LAT]
}

/** A closed square lap of `side` metres, sampled every `step` metres. */
function lap(side: number, step = 10): Position[] {
  const points: Position[] = []
  for (let d = 0; d < side; d += step) points.push(at(d, 0))
  for (let d = 0; d < side; d += step) points.push(at(side, d))
  for (let d = side; d > 0; d -= step) points.push(at(d, side))
  for (let d = side; d > 0; d -= step) points.push(at(0, d))
  return points
}

describe('detectLoop', () => {
  test('finds a lap that returns to its start', () => {
    const loop = detectLoop([...lap(100), at(0, 0)])

    expect(loop).not.toBeNull()
    expect(loop!.closure).toBe('proximity')
    expect(loop!.area).toBeGreaterThan(9000)
    expect(loop!.area).toBeLessThan(11000)
  })

  test('finds a lap that crosses its own path', () => {
    // Out, around, and back across the outbound leg — the runner overshoots
    // the start and the crossing is where the loop actually closes.
    const track: Position[] = [
      at(-40, 0),
      at(0, 0),
      at(100, 0),
      at(100, 100),
      at(0, 100),
      at(0, -40),
    ]
    const loop = detectLoop(track)

    expect(loop).not.toBeNull()
    expect(loop!.closure).toBe('crossing')
    // The tail before the crossing is not part of the shape.
    expect(loop!.area).toBeGreaterThan(9000)
    expect(loop!.area).toBeLessThan(11000)
  })

  test('finds a crossing that lands between recorded points', () => {
    // The common case: the return leg cuts across the outbound one somewhere
    // in the middle of a segment rather than through a sample.
    const track: Position[] = [
      at(-40, 0),
      at(0, 0),
      at(100, 0),
      at(100, 100),
      at(0, 100),
      at(-20, -40),
    ]
    const loop = detectLoop(track)

    expect(loop).not.toBeNull()
    expect(loop!.closure).toBe('crossing')
    expect(loop!.area).toBeGreaterThan(9500)
    expect(loop!.area).toBeLessThan(12000)
  })

  test('an out-and-back encloses nothing', () => {
    const track = [at(0, 0), at(50, 0), at(100, 0), at(50, 0), at(0, 0)]
    expect(detectLoop(track)).toBeNull()
  })

  test('a straight run never closes', () => {
    const track = Array.from({ length: 50 }, (_, i) => at(i * 20, 0))
    expect(detectLoop(track)).toBeNull()
  })

  test('standing still does not claim anything', () => {
    // A stationary receiver wanders by a few metres. Without a floor on area
    // and length, that jitter reads as a lap of a very small thing.
    const jitter: Position[] = []
    for (let i = 0; i < 60; i++)
      jitter.push(at(Math.sin(i) * 3, Math.cos(i * 1.7) * 3))

    expect(detectLoop(jitter)).toBeNull()
  })

  test('a loop below the area floor is refused', () => {
    const tiny = [...lap(8, 2), at(0, 0)]
    expect(detectLoop(tiny, { minArea: 200 })).toBeNull()
  })

  test('the floors can be lowered for a small-scale game', () => {
    const tiny = [...lap(20, 5), at(0, 0)]
    expect(detectLoop(tiny, { minArea: 100, minLoopLength: 40 })).not.toBeNull()
  })

  test('snapDistance decides whether coming back counts', () => {
    // Finishing 30 m from the start: a loose tolerance closes it, a tight one
    // says the runner never came back.
    const track = [...lap(120, 20), at(0, 30)]
    expect(detectLoop(track, { snapDistance: 40 })).not.toBeNull()
    expect(detectLoop(track, { snapDistance: 10 })).toBeNull()
  })

  test('the reported indices bound the loop within the track', () => {
    const track = [at(-50, 0), ...lap(100), at(0, 0)]
    const loop = detectLoop(track)

    expect(loop!.startIndex).toBeGreaterThan(0)
    expect(loop!.endIndex).toBeGreaterThan(loop!.startIndex)
    expect(loop!.endIndex).toBeLessThan(track.length)
  })

  test('perimeter is the distance actually run', () => {
    const loop = detectLoop([...lap(100), at(0, 0)])
    expect(loop!.perimeter).toBeGreaterThan(380)
    expect(loop!.perimeter).toBeLessThan(420)
  })

  test('too few points to be a shape', () => {
    expect(detectLoop([at(0, 0), at(10, 0)])).toBeNull()
    expect(detectLoop([])).toBeNull()
  })

  test('the ring comes back closed', () => {
    const loop = detectLoop([...lap(100), at(0, 0)])!
    const first = loop.ring[0]
    const last = loop.ring[loop.ring.length - 1]
    expect(first[0]).toBeCloseTo(last[0], 12)
    expect(first[1]).toBeCloseTo(last[1], 12)
  })
})

describe('LoopDetector', () => {
  test('reports the loop on the point that closes it, and not before', () => {
    const detector = new LoopDetector()
    const track = [...lap(100), at(0, 0)]

    const closures = track.map(point => detector.push(point)).filter(Boolean)

    expect(closures.length).toBe(1)
    expect(closures[0]!.area).toBeGreaterThan(9000)
  })

  test('keeps running after a capture, and can close a second loop', () => {
    const detector = new LoopDetector()
    for (const point of [...lap(100), at(0, 0)])
      detector.push(point)

    // A second lap, offset, run straight after the first.
    let second = null
    for (const point of [...lap(100).map(([lng, lat]) => [lng + 200 * M_LNG, lat] as Position), at(200, 0)])
      second = detector.push(point) ?? second

    expect(second).not.toBeNull()
  })

  test('the track shrinks to the tail once a loop is spent', () => {
    // Otherwise the next lap would be measured against ground already claimed,
    // and every subsequent loop would get larger for no reason.
    const detector = new LoopDetector()
    for (const point of [...lap(100), at(0, 0)])
      detector.push(point)

    expect(detector.track.length).toBeLessThan(5)
  })

  test('repeated identical positions are ignored', () => {
    const detector = new LoopDetector()
    detector.push(at(0, 0))
    detector.push(at(0, 0))
    detector.push(at(0, 0))
    expect(detector.track.length).toBe(1)
  })

  test('exposes the distance run so far', () => {
    const detector = new LoopDetector()
    detector.push(at(0, 0))
    detector.push(at(100, 0))
    expect(detector.length).toBeGreaterThan(95)
    expect(detector.length).toBeLessThan(105)
  })

  test('reset drops the track', () => {
    const detector = new LoopDetector()
    detector.push(at(0, 0))
    detector.push(at(50, 0))
    detector.reset()
    expect(detector.track.length).toBe(0)
  })

  test('feeding it a whole run finds the same loop as the batch scan', () => {
    const track = [...lap(120, 15), at(0, 0)]

    const detector = new LoopDetector()
    let incremental = null
    for (const point of track)
      incremental = detector.push(point) ?? incremental

    const batch = detectLoop(track)

    expect(incremental).not.toBeNull()
    expect(batch).not.toBeNull()
    expect(incremental!.area).toBeCloseTo(batch!.area, 6)
  })
})

describe('simplifyTrack', () => {
  test('drops points that lie on the line between their neighbours', () => {
    const straight = Array.from({ length: 50 }, (_, i) => at(i * 10, 0))
    expect(simplifyTrack(straight).length).toBe(2)
  })

  test('keeps the corners', () => {
    const simplified = simplifyTrack(lap(100, 5))
    expect(simplified.length).toBeGreaterThanOrEqual(4)
    expect(simplified.length).toBeLessThan(lap(100, 5).length)
  })

  test('the tolerance is in metres, not degrees', () => {
    // A degree of longitude is a different distance at every latitude; a
    // tolerance that changed with where you were running would not be one.
    const nearEquator: Position[] = [[0, 0], [0.0005, 0.00002], [0.001, 0]]
    const farNorth: Position[] = [[0, 60], [0.0005, 0.00002 + 60], [0.001, 60]]
    expect(simplifyTrack(nearEquator, 5).length).toBe(simplifyTrack(farNorth, 5).length)
  })

  test('a short track comes back unchanged', () => {
    expect(simplifyTrack([at(0, 0), at(10, 0)]).length).toBe(2)
    expect(simplifyTrack([]).length).toBe(0)
  })

  test('the simplified shape still measures about the same', () => {
    const detailed = [...lap(200, 5), at(0, 0)]
    const simple = simplifyTrack(detailed, 3)

    const a = detectLoop(detailed)!
    const b = detectLoop(simple)!
    expect(b.area / a.area).toBeGreaterThan(0.97)
    expect(b.area / a.area).toBeLessThan(1.03)
  })
})
