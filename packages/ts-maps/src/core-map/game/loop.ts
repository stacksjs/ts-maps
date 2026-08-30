// Finding the loop in a run.
//
// The rule players understand is "run around something and it is yours", but a
// GPS track is a stream of points, not a shape. Turning one into the other is
// the whole mechanic, and it has to be right in both directions: closing a loop
// the player did not run loses them a run, and failing to close one they did
// feels like the game is broken.
//
// Two things actually close a loop on the ground:
//
//   - **The runner crosses their own path.** A figure of eight, a lap that
//     overshoots the start and doubles back. The enclosed shape starts at the
//     crossing point, not at the start of the run, and the tail before the
//     crossing is not part of it.
//   - **The runner comes back to where they started.** GPS will not put them on
//     the same coordinate twice, so returning "to the start" means within some
//     metres of it. That tolerance is the difference between a loop closing at
//     the gate you left from and one that never closes at all.
//
// Both are handled here, crossing first, because a crossing is unambiguous
// evidence and proximity is a judgement call.

import type { Position } from '../geo/area'
import { haversine, ringArea, ringPerimeter } from '../geo/area'

export interface LoopOptions {
  /**
   * How close the runner has to get to an earlier point to close a loop, in
   * metres. Consumer GPS is good to about five metres in the open and much
   * worse between buildings, so this is a tolerance, not a precision.
   */
  snapDistance?: number
  /**
   * Smallest loop worth claiming, in square metres. Below this a "loop" is
   * almost always GPS noise while the runner stood still, or a lap of
   * something too small to be a territory.
   */
  minArea?: number
  /**
   * Shortest path that may close a loop, in metres. Stops a few jittery
   * points from being read as a lap of a very small object.
   */
  minLoopLength?: number
  /** Fewest points a loop may be made of. */
  minPoints?: number
}

export interface DetectedLoop {
  /** The captured ring, closed, as `[lng, lat]` positions. */
  ring: Position[]
  /** Enclosed area in square metres. */
  area: number
  /** Length of the loop itself in metres — what the player ran to earn it. */
  perimeter: number
  /** Index in the track where the loop begins. */
  startIndex: number
  /** Index in the track where it closes. */
  endIndex: number
  /** What closed it: crossing their own path, or coming back to it. */
  closure: 'crossing' | 'proximity'
}

const DEFAULTS: Required<LoopOptions> = {
  snapDistance: 20,
  minArea: 200,
  minLoopLength: 120,
  minPoints: 4,
}

/**
 * Where two segments cross, as a fraction along each.
 *
 * Returns null for parallel segments and for touching endpoints — a track that
 * merely touches its own previous point has not enclosed anything.
 */
function segmentCross(
  a1: Position,
  a2: Position,
  b1: Position,
  b2: Position,
): { t: number, u: number } | null {
  const ax = a2[0] - a1[0]
  const ay = a2[1] - a1[1]
  const bx = b2[0] - b1[0]
  const by = b2[1] - b1[1]

  const denominator = ax * by - ay * bx
  if (denominator === 0)
    return null

  const dx = b1[0] - a1[0]
  const dy = b1[1] - a1[1]

  const t = (dx * by - dy * bx) / denominator
  const u = (dx * ay - dy * ax) / denominator

  // The new segment must be crossed in its interior: a crossing at its start
  // was already found on the previous point, and reporting it twice would
  // claim the same loop twice.
  if (t <= 0 || t >= 1)
    return null

  // The earlier segment may be met at either end. A runner crossing their own
  // path exactly through a recorded position is not a special case to them,
  // and only the segments either side of the new one are excluded — those
  // share an endpoint by construction rather than by crossing.
  if (u < 0 || u > 1)
    return null

  return { t, u }
}

function lerp(a: Position, b: Position, t: number): Position {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function pathLength(points: Position[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++)
    total += haversine(points[i - 1], points[i])
  return total
}

/** Build and measure a candidate, or reject it against the thresholds. */
function makeLoop(
  ring: Position[],
  startIndex: number,
  endIndex: number,
  closure: DetectedLoop['closure'],
  options: Required<LoopOptions>,
): DetectedLoop | null {
  if (ring.length < options.minPoints + 1)
    return null

  const perimeter = ringPerimeter(ring, false)
  if (perimeter < options.minLoopLength)
    return null

  const area = Math.abs(ringArea(ring))
  if (area < options.minArea)
    return null

  return { ring, area, perimeter, startIndex, endIndex, closure }
}

/**
 * Find the first loop a track closes, or null.
 *
 * The loop returned is the earliest one that closes, not the largest — a
 * runner who laps a park and keeps going has earned the park at the moment
 * they closed it, and waiting to see whether a bigger shape appears later
 * would mean the game reacting to a run several minutes after it happened.
 */
export function detectLoop(track: Position[], options: LoopOptions = {}): DetectedLoop | null {
  const opts = { ...DEFAULTS, ...options }
  if (track.length < opts.minPoints)
    return null

  for (let i = 1; i < track.length; i++) {
    const a1 = track[i - 1]
    const a2 = track[i]

    // Against every earlier segment, skipping the one immediately before —
    // adjacent segments share an endpoint by construction.
    for (let j = 1; j < i - 1; j++) {
      const cross = segmentCross(a1, a2, track[j - 1], track[j])
      if (!cross)
        continue

      const point = lerp(a1, a2, cross.t)
      // The loop runs from the crossing, around, and back to it.
      const ring = [point, ...track.slice(j, i), point]
      const loop = makeLoop(ring, j - 1, i, 'crossing', opts)
      if (loop)
        return loop
    }

    // No crossing here: has the runner come back to an earlier point?
    for (let j = 0; j < i - 1; j++) {
      if (haversine(a2, track[j]) > opts.snapDistance)
        continue

      const segment = track.slice(j, i + 1)
      if (pathLength(segment) < opts.minLoopLength)
        continue

      const ring = [...segment, track[j]]
      const loop = makeLoop(ring, j, i, 'proximity', opts)
      if (loop)
        return loop
    }
  }

  return null
}

export interface LoopDetectorOptions extends LoopOptions {
  /**
   * Points to keep after a loop closes. The runner is still running, and the
   * tail of the last loop is the head of the next one — dropping it entirely
   * would mean the next loop has to start from a standstill.
   */
  carryOver?: number
}

/**
 * Feed it GPS points; it tells you when a loop closes.
 *
 * A live run calls this on every position update, so it does the work
 * incrementally rather than re-scanning the whole track each time: only the
 * newest segment is tested, against the ones already recorded.
 *
 * ```ts
 * const detector = new LoopDetector({ snapDistance: 25 })
 * watchPosition((position) => {
 *   const loop = detector.push([position.coords.longitude, position.coords.latitude])
 *   if (loop)
 *     territories.capture('me', loop.ring)
 * })
 * ```
 */
export class LoopDetector {
  private _track: Position[] = []
  private _options: Required<LoopOptions>
  private _carryOver: number

  constructor(options: LoopDetectorOptions = {}) {
    const { carryOver, ...loopOptions } = options
    this._options = { ...DEFAULTS, ...loopOptions }
    this._carryOver = carryOver ?? 1
  }

  /** The track as it stands, for drawing the trail behind the runner. */
  get track(): Position[] {
    return this._track
  }

  /** Distance run since the last loop closed, in metres. */
  get length(): number {
    return pathLength(this._track)
  }

  /**
   * Add a point. Returns the loop it closed, if it closed one.
   *
   * Only the new segment is checked, which is what makes this affordable to
   * call once a second for an hour.
   */
  push(point: Position): DetectedLoop | null {
    const track = this._track
    const previous = track[track.length - 1]

    // A GPS receiver standing still emits the same position repeatedly; those
    // points carry no information and only slow the scan down.
    if (previous && haversine(previous, point) < 0.5)
      return null

    track.push(point)
    if (track.length < this._options.minPoints)
      return null

    const i = track.length - 1
    const a1 = track[i - 1]
    const a2 = track[i]

    for (let j = 1; j < i - 1; j++) {
      const cross = segmentCross(a1, a2, track[j - 1], track[j])
      if (!cross)
        continue

      const crossing = lerp(a1, a2, cross.t)
      const ring = [crossing, ...track.slice(j, i), crossing]
      const loop = makeLoop(ring, j - 1, i, 'crossing', this._options)
      if (loop) {
        this._consume(loop)
        return loop
      }
    }

    for (let j = 0; j < i - 1; j++) {
      if (haversine(a2, track[j]) > this._options.snapDistance)
        continue

      const segment = track.slice(j, i + 1)
      if (pathLength(segment) < this._options.minLoopLength)
        continue

      const ring = [...segment, track[j]]
      const loop = makeLoop(ring, j, i, 'proximity', this._options)
      if (loop) {
        this._consume(loop)
        return loop
      }
    }

    return null
  }

  /** Start again, keeping nothing. */
  reset(): void {
    this._track = []
  }

  private _consume(loop: DetectedLoop): void {
    // Everything up to and including the loop has been spent. What is kept is
    // the runner's current position and a little of the path into it, so the
    // trail does not visibly restart from nothing mid-stride.
    const keep = Math.max(1, this._carryOver)
    this._track = this._track.slice(Math.max(0, loop.endIndex - keep + 1))
  }
}

/**
 * Reduce a track to its shape, dropping points that say nothing new.
 *
 * A GPS logging at 1 Hz produces a great many points that lie on the line
 * between their neighbours. Keeping them costs area calculations, boolean
 * operations and every redraw, and they change none of the answers.
 *
 * `tolerance` is in metres: the furthest a dropped point may lie from the line
 * that replaces it.
 */
export function simplifyTrack(track: Position[], tolerance = 3): Position[] {
  if (track.length < 3)
    return track.slice()

  // Douglas–Peucker, with distances measured on the ground rather than in
  // degrees — a degree of longitude is a different distance at every latitude,
  // and a tolerance that changes with where you are running is not a
  // tolerance.
  const keep = new Set<number>([0, track.length - 1])

  const simplifySection = (first: number, last: number): void => {
    let furthest = -1
    let maxDistance = tolerance

    for (let i = first + 1; i < last; i++) {
      const distance = perpendicularDistance(track[i], track[first], track[last])
      if (distance > maxDistance) {
        maxDistance = distance
        furthest = i
      }
    }

    if (furthest === -1)
      return

    keep.add(furthest)
    simplifySection(first, furthest)
    simplifySection(furthest, last)
  }

  simplifySection(0, track.length - 1)

  return [...keep].sort((a, b) => a - b).map(i => track[i])
}

/** Distance in metres from `p` to the segment `a`–`b`. */
function perpendicularDistance(p: Position, a: Position, b: Position): number {
  // Locally flat is fine over the tens of metres between GPS samples, as long
  // as longitude is scaled for the latitude it is being measured at.
  const scale = Math.cos((p[1] * Math.PI) / 180)
  const px = (p[0] - a[0]) * scale
  const py = p[1] - a[1]
  const bx = (b[0] - a[0]) * scale
  const by = b[1] - a[1]

  const lengthSquared = bx * bx + by * by
  let t = lengthSquared === 0 ? 0 : (px * bx + py * by) / lengthSquared
  t = Math.max(0, Math.min(1, t))

  const dx = px - bx * t
  const dy = py - by * t
  // Degrees to metres, via the mean radius.
  return Math.hypot(dx, dy) * 111319.49
}
