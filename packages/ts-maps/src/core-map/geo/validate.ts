// Making a claim safe to act on.
//
// A territory game takes geometry from a GPS receiver, and in production that
// means geometry from a device in a pocket, in a tunnel, with a flat battery —
// or from a client that has been tampered with. Three things go wrong often
// enough to handle deliberately rather than discover in a support ticket:
//
//   - **Coordinates that are not numbers.** A receiver losing lock emits NaN,
//     and NaN propagates silently through every area calculation to produce a
//     capture worth nothing, with nothing to say why.
//   - **A ring that crosses itself.** A figure of eight, or a track that
//     doubles back. Its signed area is the difference of its lobes rather than
//     their sum, so a perfectly good run measures as zero.
//   - **A ring that crosses the antimeridian.** The longitude jumps by 360,
//     one edge is read as spanning the planet, and a strip a few metres wide
//     off Fiji measures as forty billion square metres.
//
// Silence is the wrong answer to all three. The first is rejected with a
// message naming the problem; the other two are repaired, because they are
// valid runs described awkwardly rather than bad data.

import type { MultiPolygon, Position, Ring } from './polygonClip'
import { union } from './polygonClip'

/** Thrown for geometry that cannot be repaired into a claim. */
export class InvalidGeometryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidGeometryError'
  }
}

/**
 * Check a ring is something that can be claimed.
 *
 * Throws rather than returning a flag, because every caller's correct response
 * to unusable geometry is to stop, and a boolean invites carrying on.
 */
export function validateRing(ring: Ring): void {
  if (!Array.isArray(ring))
    throw new InvalidGeometryError('ring must be an array of positions')

  if (ring.length < 4)
    throw new InvalidGeometryError(`ring needs at least 4 positions to enclose an area, got ${ring.length}`)

  for (let i = 0; i < ring.length; i++) {
    const position = ring[i]
    if (!Array.isArray(position) || position.length < 2)
      throw new InvalidGeometryError(`position ${i} is not a [lng, lat] pair`)

    const [lng, lat] = position
    if (!Number.isFinite(lng) || !Number.isFinite(lat))
      throw new InvalidGeometryError(`position ${i} is not finite: [${lng}, ${lat}] — a receiver losing lock reports this`)

    if (lat < -90 || lat > 90)
      throw new InvalidGeometryError(`position ${i} has latitude ${lat}, outside [-90, 90]`)
  }
}

/**
 * Make a ring's longitudes continuous.
 *
 * A run crossing the antimeridian is recorded as longitudes that jump from
 * 179.99 to -179.99, and every consumer of that ring — area, the clipper,
 * anything measuring an edge — reads the jump as a segment spanning the globe.
 * Carrying the winding forward instead produces longitudes outside the usual
 * range but geometry that means what the runner did.
 *
 * A ring not near the antimeridian is returned untouched, so this costs a scan
 * and nothing else in the overwhelmingly common case.
 */
export function unwrapRing(ring: Ring): Ring {
  let crosses = false
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) {
      crosses = true
      break
    }
  }
  if (!crosses)
    return ring

  const out: Ring = [[ring[0][0], ring[0][1]]]
  let offset = 0
  for (let i = 1; i < ring.length; i++) {
    const delta = ring[i][0] - ring[i - 1][0]
    // A single edge spanning more than half the planet is always the wrap
    // rather than a real edge: the shorter way round is the one that was run.
    if (delta > 180)
      offset -= 360
    else if (delta < -180)
      offset += 360
    out.push([ring[i][0] + offset, ring[i][1]])
  }
  return out
}

/**
 * Split a self-crossing ring into the simple loops it is made of.
 *
 * Walking the ring and cutting it at each crossing is what separates a figure
 * of eight into its two lobes. The crossing point is computed once and used as
 * a vertex of both loops, which is the reason to do it this way rather than by
 * unioning the shape with itself: the sweep would compute that point twice,
 * from two different pairs of segments, and at GPS precision the two answers
 * differ in the last bits — enough for a lobe to be dropped.
 */
export function splitSelfIntersecting(ring: Ring): Ring[] {
  const points = closeRing(ring).slice(0, -1)
  const count = points.length
  if (count < 3)
    return [closeRing(ring)]

  const loops: Ring[] = []
  const open: Position[] = []

  for (let i = 0; i < count; i++) {
    const a1 = points[i]
    const a2 = points[(i + 1) % count]
    open.push(a1)

    // Against the path walked so far, excluding the segment just added, which
    // shares an endpoint with the one being tested.
    for (let j = 0; j + 2 < open.length; j++) {
      const point = crossingPoint(a1, a2, open[j], open[j + 1])
      if (!point)
        continue

      // Everything since that earlier segment is a closed loop of its own.
      loops.push([point, ...open.slice(j + 1), point])
      open.length = j + 1
      open.push(point)
      break
    }
  }

  loops.push([...open, open[0]])
  return loops.filter(loop => loop.length >= 4)
}

/**
 * Resolve a ring that crosses itself into polygons that do not.
 *
 * A figure of eight has a signed area of nearly zero — its lobes have opposite
 * winding and cancel — so measuring it directly says the runner enclosed
 * nothing. Both lobes were run around, so both should count.
 */
export function resolveSelfIntersections(ring: Ring): MultiPolygon {
  const single: MultiPolygon = [[closeRing(ring)]]
  if (!selfIntersects(ring))
    return single

  const loops = splitSelfIntersecting(ring)
  if (loops.length <= 1)
    return single

  // Unioned rather than simply collected: the loops of a track that crosses
  // itself several times can overlap, and ground inside two of them is still
  // ground the runner went round once.
  let result: MultiPolygon = []
  for (const loop of loops)
    result = union(result, [[loop]])
  return result
}

/** Where two segments cross, if they cross in both their interiors. */
function crossingPoint(a1: Position, a2: Position, b1: Position, b2: Position): Position | null {
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

  if (t <= 0 || t >= 1 || u <= 0 || u >= 1)
    return null

  return [a1[0] + ax * t, a1[1] + ay * t]
}

/** Does any pair of non-adjacent segments in this ring cross? */
export function selfIntersects(ring: Ring): boolean {
  const points = closeRing(ring)
  const count = points.length - 1
  if (count < 4)
    return false

  for (let i = 0; i < count; i++) {
    for (let j = i + 2; j < count; j++) {
      // The first and last segments share an endpoint by construction.
      if (i === 0 && j === count - 1)
        continue
      if (segmentsCross(points[i], points[i + 1], points[j], points[j + 1]))
        return true
    }
  }
  return false
}

function segmentsCross(a1: Position, a2: Position, b1: Position, b2: Position): boolean {
  const d1 = cross(a1, a2, b1)
  const d2 = cross(a1, a2, b2)
  const d3 = cross(b1, b2, a1)
  const d4 = cross(b1, b2, a2)

  // Strictly opposite sides on both tests: a genuine crossing rather than a
  // touch, which a ring is entitled to do at a shared vertex.
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function cross(o: Position, a: Position, b: Position): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

function closeRing(ring: Ring): Ring {
  if (ring.length === 0)
    return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1])
    return ring
  return [...ring, first]
}

/**
 * Everything above, in the order a claim needs it.
 *
 * Validate, then unwrap, then resolve — each step assumes the previous one has
 * run, and repairing geometry that has not been checked is how a NaN ends up
 * inside a polygon instead of inside an error message.
 */
export function prepareClaim(ring: Ring): MultiPolygon {
  validateRing(ring)
  return resolveSelfIntersections(unwrapRing(ring))
}
