// Boolean operations on polygons: union, intersection, difference, xor.
//
// A territory game runs on these. Finishing a lap unions the new loop into
// whatever the player already held; running through a rival's ground subtracts
// it from theirs. Both operations happen constantly and on shapes that share
// edges — two territories that grew against each other are exactly coincident
// along the border between them — so the naive clippers are not an option.
// Greiner–Hormann, for instance, is short and readable and falls apart on the
// shared-edge case, which here is not an edge case but the normal one.
//
// This is the Martínez–Rueda–Feito sweep-line algorithm, which handles
// coincident edges, self-touching contours and holes as part of its design
// rather than as patches. The sweep is faithful to the paper. Assembling the
// output contours afterwards is done differently: rather than tracking
// exterior/interior depth inside the sweep, result edges are walked into rings
// and nesting is worked out by containment at the end. That is a slower step
// and a far easier one to reason about — and being able to reason about it
// matters when it decides who owns what.

export type Position = number[]
export type Ring = Position[]
export type Polygon = Ring[]
export type MultiPolygon = Polygon[]

const INTERSECTION = 0
const UNION = 1
const DIFFERENCE = 2
const XOR = 3

type Operation = typeof INTERSECTION | typeof UNION | typeof DIFFERENCE | typeof XOR

// Edge classification, from the paper.
const NORMAL = 0
const NON_CONTRIBUTING = 1
const SAME_TRANSITION = 2
const DIFFERENT_TRANSITION = 3

class SweepEvent {
  point: Position
  left: boolean
  otherEvent: SweepEvent
  isSubject: boolean
  type: number
  /** Is the interior of the polygon above this edge, at this point? */
  inOut: boolean
  /** The same question, asked of the *other* polygon. */
  otherInOut: boolean
  inResult: boolean
  contourId: number

  constructor(point: Position, left: boolean, otherEvent: SweepEvent | null, isSubject: boolean, type = NORMAL) {
    this.point = point
    this.left = left
    this.otherEvent = otherEvent as SweepEvent
    this.isSubject = isSubject
    this.type = type
    this.inOut = false
    this.otherInOut = false
    this.inResult = false
    this.contourId = 0
  }

  /** Is `p` below the line this event's segment lies on? */
  isBelow(p: Position): boolean {
    const a = this.point
    const b = this.otherEvent.point
    return this.left
      ? signedArea(a, b, p) > 0
      : signedArea(b, a, p) > 0
  }

  isAbove(p: Position): boolean {
    return !this.isBelow(p)
  }

  isVertical(): boolean {
    return this.point[0] === this.otherEvent.point[0]
  }
}

/**
 * Twice the signed area of the triangle `p0 p1 p2`.
 *
 * Positive when the three turn counter-clockwise. Every orientation question
 * in the sweep reduces to this one.
 */
function signedArea(p0: Position, p1: Position, p2: Position): number {
  return (p0[0] - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (p0[1] - p2[1])
}

function equals(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/** Queue order: left to right, bottom to top, right events before left ones. */
function compareEvents(e1: SweepEvent, e2: SweepEvent): number {
  const p1 = e1.point
  const p2 = e2.point

  if (p1[0] > p2[0])
    return 1
  if (p1[0] < p2[0])
    return -1
  if (p1[1] !== p2[1])
    return p1[1] > p2[1] ? 1 : -1

  // Same point. A right event is processed first, so a segment is out of the
  // sweep status before another one starting here goes in.
  if (e1.left !== e2.left)
    return e1.left ? 1 : -1

  // Both left or both right at the same point: the lower segment first.
  if (signedArea(p1, e1.otherEvent.point, e2.otherEvent.point) !== 0)
    return e1.isBelow(e2.otherEvent.point) ? -1 : 1

  // Collinear and coincident: subject before clip, so the classification of
  // overlapping edges is deterministic.
  return !e1.isSubject && e2.isSubject ? 1 : -1
}

/** Sweep-status order: which segment is lower at the sweep line. */
function compareSegments(le1: SweepEvent, le2: SweepEvent): number {
  if (le1 === le2)
    return 0

  if (
    signedArea(le1.point, le1.otherEvent.point, le2.point) !== 0
    || signedArea(le1.point, le1.otherEvent.point, le2.otherEvent.point) !== 0
  ) {
    // Not collinear.
    if (equals(le1.point, le2.point))
      return le1.isBelow(le2.otherEvent.point) ? -1 : 1
    if (le1.point[0] === le2.point[0])
      return le1.point[1] < le2.point[1] ? -1 : 1
    // The one that starts first decides, judged from where the other starts.
    if (compareEvents(le1, le2) === 1)
      return le2.isAbove(le1.point) ? -1 : 1
    return le1.isBelow(le2.point) ? -1 : 1
  }

  // Collinear.
  if (le1.isSubject === le2.isSubject) {
    let p1 = le1.point
    let p2 = le2.point
    if (p1[0] === p2[0] && p1[1] === p2[1]) {
      p1 = le1.otherEvent.point
      p2 = le2.otherEvent.point
      if (p1[0] === p2[0] && p1[1] === p2[1])
        return 0
      return le1.contourId > le2.contourId ? 1 : -1
    }
    return compareEvents(le1, le2) === 1 ? 1 : -1
  }

  return le1.isSubject ? -1 : 1
}

/** A binary heap, so the queue can take the events division produces. */
class EventQueue {
  private _data: SweepEvent[] = []

  get length(): number {
    return this._data.length
  }

  push(event: SweepEvent): void {
    const data = this._data
    data.push(event)
    let pos = data.length - 1
    while (pos > 0) {
      const parent = (pos - 1) >> 1
      if (compareEvents(data[pos], data[parent]) >= 0)
        break
      const tmp = data[parent]
      data[parent] = data[pos]
      data[pos] = tmp
      pos = parent
    }
  }

  pop(): SweepEvent | undefined {
    const data = this._data
    const top = data[0]
    const last = data.pop()
    if (data.length === 0)
      return top
    data[0] = last as SweepEvent

    let pos = 0
    const half = data.length >> 1
    while (pos < half) {
      let child = 2 * pos + 1
      const right = child + 1
      if (right < data.length && compareEvents(data[right], data[child]) < 0)
        child = right
      if (compareEvents(data[child], data[pos]) >= 0)
        break
      const tmp = data[child]
      data[child] = data[pos]
      data[pos] = tmp
      pos = child
    }

    return top
  }
}

/**
 * The sweep line status: segments currently crossed, ordered bottom to top.
 *
 * A sorted array rather than a balanced tree. Insertion is linear, which makes
 * the sweep quadratic in the worst case — acceptable here, where the shapes are
 * territories with hundreds of vertices rather than coastlines with millions,
 * and worth it for a structure whose behaviour is obvious when a result looks
 * wrong.
 */
class SweepStatus {
  private _items: SweepEvent[] = []

  insert(event: SweepEvent): number {
    let low = 0
    let high = this._items.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (compareSegments(this._items[mid], event) < 0)
        low = mid + 1
      else
        high = mid
    }
    this._items.splice(low, 0, event)
    return low
  }

  remove(event: SweepEvent): void {
    const index = this._items.indexOf(event)
    if (index !== -1)
      this._items.splice(index, 1)
  }

  indexOf(event: SweepEvent): number {
    return this._items.indexOf(event)
  }

  at(index: number): SweepEvent | null {
    return index >= 0 && index < this._items.length ? this._items[index] : null
  }
}

/** Where two segments meet: no points, one, or a shared stretch of two. */
function segmentIntersection(
  a1: Position,
  a2: Position,
  b1: Position,
  b2: Position,
): Position[] | null {
  const va = [a2[0] - a1[0], a2[1] - a1[1]]
  const vb = [b2[0] - b1[0], b2[1] - b1[1]]
  const e = [b1[0] - a1[0], b1[1] - a1[1]]

  const cross = (u: number[], v: number[]): number => u[0] * v[1] - u[1] * v[0]
  const dot = (u: number[], v: number[]): number => u[0] * v[0] + u[1] * v[1]
  const at = (base: Position, s: number, v: number[]): Position => [base[0] + s * v[0], base[1] + s * v[1]]

  const kross = cross(va, vb)
  if (kross * kross > 0) {
    const s = cross(e, vb) / kross
    if (s < 0 || s > 1)
      return null
    const t = cross(e, va) / kross
    if (t < 0 || t > 1)
      return null
    if (s === 0 || s === 1)
      return [at(a1, s, va)]
    if (t === 0 || t === 1)
      return [at(b1, t, vb)]
    return [at(a1, s, va)]
  }

  // Parallel. Collinear only if the offset between them is parallel too.
  if (cross(e, va) ** 2 > 0)
    return null

  const sqrLenA = dot(va, va)
  if (sqrLenA === 0)
    return null

  const sa = dot(e, va) / sqrLenA
  const sb = sa + dot(vb, va) / sqrLenA
  const s0 = Math.max(Math.min(sa, sb), 0)
  const s1 = Math.min(Math.max(sa, sb), 1)

  if (s0 > s1)
    return null
  if (s0 === s1)
    return [at(a1, s0, va)]
  return [at(a1, s0, va), at(a1, s1, va)]
}

/** Split a segment at `p`, putting the two new events in the queue. */
function divideSegment(se: SweepEvent, p: Position, queue: EventQueue): void {
  const right = new SweepEvent(p, false, se, se.isSubject)
  const left = new SweepEvent(p, true, se.otherEvent, se.isSubject)
  right.contourId = se.contourId
  left.contourId = se.contourId

  // Rounding can put the split point past the segment's own right end, which
  // would leave an inverted segment behind. Swap the roles instead.
  if (compareEvents(left, se.otherEvent) > 0) {
    se.otherEvent.left = true
    left.left = false
  }

  se.otherEvent.otherEvent = left
  se.otherEvent = right

  queue.push(left)
  queue.push(right)
}

/** Classify or split two segments that meet. */
function possibleIntersection(se1: SweepEvent, se2: SweepEvent, queue: EventQueue): number {
  const inter = segmentIntersection(se1.point, se1.otherEvent.point, se2.point, se2.otherEvent.point)
  if (!inter)
    return 0

  const count = inter.length

  // Touching at a shared endpoint is not an intersection to act on.
  if (count === 1 && (equals(se1.point, se2.point) || equals(se1.otherEvent.point, se2.otherEvent.point)))
    return 0

  // Two edges of the same polygon overlapping is that polygon's own business.
  if (count === 2 && se1.isSubject === se2.isSubject)
    return 0

  if (count === 1) {
    if (!equals(se1.point, inter[0]) && !equals(se1.otherEvent.point, inter[0]))
      divideSegment(se1, inter[0], queue)
    if (!equals(se2.point, inter[0]) && !equals(se2.otherEvent.point, inter[0]))
      divideSegment(se2, inter[0], queue)
    return 1
  }

  // Overlapping stretch. One of the two carries the result, classified by
  // whether both polygons make the same inside/outside transition here; the
  // other contributes nothing.
  const events: SweepEvent[] = []
  let leftCoincide = false
  let rightCoincide = false

  if (equals(se1.point, se2.point))
    leftCoincide = true
  else if (compareEvents(se1, se2) === 1)
    events.push(se2, se1)
  else
    events.push(se1, se2)

  if (equals(se1.otherEvent.point, se2.otherEvent.point))
    rightCoincide = true
  else if (compareEvents(se1.otherEvent, se2.otherEvent) === 1)
    events.push(se2.otherEvent, se1.otherEvent)
  else
    events.push(se1.otherEvent, se2.otherEvent)

  if (leftCoincide) {
    se2.type = NON_CONTRIBUTING
    se1.type = se2.inOut === se1.inOut ? SAME_TRANSITION : DIFFERENT_TRANSITION
    if (!rightCoincide)
      divideSegment(events[1].otherEvent, events[0].point, queue)
    return 2
  }

  if (rightCoincide) {
    divideSegment(events[0], events[1].point, queue)
    return 3
  }

  if (events[0] !== events[3].otherEvent) {
    divideSegment(events[0], events[1].point, queue)
    divideSegment(events[1], events[2].point, queue)
    return 3
  }

  // One segment contains the other entirely.
  divideSegment(events[0], events[1].point, queue)
  divideSegment(events[3].otherEvent, events[2].point, queue)
  return 3
}

/** Decide whether an edge survives into the result of `operation`. */
function edgeInResult(event: SweepEvent, operation: Operation): boolean {
  switch (event.type) {
    case NORMAL:
      switch (operation) {
        case INTERSECTION:
          return !event.otherInOut
        case UNION:
          return event.otherInOut
        case DIFFERENCE:
          // A subject edge survives where it is outside the clip; a clip edge
          // survives where it is inside the subject, forming the new border.
          return (event.isSubject && event.otherInOut) || (!event.isSubject && !event.otherInOut)
        case XOR:
          return true
      }
      return false
    case SAME_TRANSITION:
      return operation === INTERSECTION || operation === UNION
    case DIFFERENT_TRANSITION:
      return operation === DIFFERENCE
    default:
      return false
  }
}

/** Work out which side of this edge is inside, from the edge below it. */
function computeFields(event: SweepEvent, prev: SweepEvent | null, operation: Operation): void {
  if (prev === null) {
    // Nothing below: outside both polygons.
    event.inOut = false
    event.otherInOut = true
  }
  else if (event.isSubject === prev.isSubject) {
    event.inOut = !prev.inOut
    event.otherInOut = prev.otherInOut
  }
  else {
    event.inOut = !prev.otherInOut
    event.otherInOut = prev.isVertical() ? !prev.inOut : prev.inOut
  }

  event.inResult = edgeInResult(event, operation)
}

interface Edge {
  from: Position
  to: Position
}

/** Run the sweep and return the edges that belong to the result. */
function sweep(subject: MultiPolygon, clip: MultiPolygon, operation: Operation): Edge[] {
  const queue = new EventQueue()
  let contourId = 0

  const addPolygonSet = (polygons: MultiPolygon, isSubject: boolean): void => {
    for (const polygon of polygons) {
      for (const ring of polygon) {
        contourId++
        const points = normaliseRing(ring)
        for (let i = 0; i < points.length; i++) {
          const a = points[i]
          const b = points[(i + 1) % points.length]
          if (equals(a, b))
            continue

          const e1 = new SweepEvent(a, false, null, isSubject)
          const e2 = new SweepEvent(b, false, e1, isSubject)
          e1.otherEvent = e2
          e1.contourId = contourId
          e2.contourId = contourId

          // The left event is whichever end the sweep reaches first.
          if (compareEvents(e1, e2) > 0)
            e2.left = true
          else
            e1.left = true

          queue.push(e1)
          queue.push(e2)
        }
      }
    }
  }

  addPolygonSet(subject, true)
  addPolygonSet(clip, false)

  const status = new SweepStatus()
  const results: SweepEvent[] = []

  while (queue.length > 0) {
    const event = queue.pop() as SweepEvent

    if (event.left) {
      const position = status.insert(event)
      const prev = status.at(position - 1)
      const next = status.at(position + 1)

      computeFields(event, prev, operation)

      if (next && possibleIntersection(event, next, queue) === 2) {
        // The classification of both may have changed.
        computeFields(event, prev, operation)
        computeFields(next, event, operation)
      }
      if (prev && possibleIntersection(prev, event, queue) === 2) {
        const prevOfPrev = status.at(status.indexOf(prev) - 1)
        computeFields(prev, prevOfPrev, operation)
        computeFields(event, prev, operation)
      }

      results.push(event)
    }
    else {
      // A right event closes the segment its left event opened.
      const left = event.otherEvent
      const position = status.indexOf(left)
      if (position !== -1) {
        const prev = status.at(position - 1)
        const next = status.at(position + 1)
        status.remove(left)
        if (prev && next)
          possibleIntersection(prev, next, queue)
      }
    }
  }

  const edges: Edge[] = []
  for (const event of results) {
    if (event.inResult && event.type !== NON_CONTRIBUTING)
      edges.push({ from: event.point, to: event.otherEvent.point })
  }
  return edges
}

/** Drop a repeated closing point and any consecutive duplicates. */
function normaliseRing(ring: Ring): Position[] {
  const points: Position[] = []
  for (const point of ring) {
    const last = points[points.length - 1]
    if (!last || !equals(last, point))
      points.push([point[0], point[1]])
  }
  while (points.length > 1 && equals(points[0], points[points.length - 1]))
    points.pop()
  return points
}

function key(p: Position): string {
  return `${p[0]},${p[1]}`
}

/**
 * Walk result edges into closed rings.
 *
 * The sweep has already split every segment at every crossing, so the edges
 * form a planar graph in which each vertex has even degree and a walk that
 * always leaves by an unused edge must come back to where it started. Where a
 * vertex has more than two edges — two territories meeting at a single point —
 * the walk takes the sharpest left turn available, which separates the rings
 * the way the eye does instead of joining them into a figure of eight.
 */
function buildRings(edges: Edge[]): Ring[] {
  interface Arc {
    /** Index into `edges`, so an edge is walked once however it is entered. */
    edge: number
    to: Position
    angle: number
  }

  const used: boolean[] = Array.from({ length: edges.length }, () => false)
  const outgoing = new Map<string, Arc[]>()

  const link = (from: Position, to: Position, edge: number): void => {
    const arc: Arc = { edge, to, angle: Math.atan2(to[1] - from[1], to[0] - from[0]) }
    const k = key(from)
    const list = outgoing.get(k)
    if (list)
      list.push(arc)
    else
      outgoing.set(k, [arc])
  }

  for (let i = 0; i < edges.length; i++) {
    const { from, to } = edges[i]
    if (equals(from, to)) {
      used[i] = true
      continue
    }
    // Both directions are reachable, but the edge itself is consumed the first
    // time it is walked — the boundary is undirected, and using each edge once
    // is what makes the walk produce each ring exactly once. Adding a
    // direction per edge instead traces every ring twice, once each way round.
    link(from, to, i)
    link(to, from, i)
  }

  const rings: Ring[] = []

  for (let seed = 0; seed < edges.length; seed++) {
    if (used[seed])
      continue

    const origin = edges[seed].from
    const ring: Ring = [origin]
    let from = origin
    let to = edges[seed].to
    used[seed] = true

    for (let guard = 0; guard <= edges.length + 1; guard++) {
      ring.push(to)
      if (equals(to, origin))
        break

      const candidates = outgoing.get(key(to))
      if (!candidates)
        break

      // Measured from the way we came, so the sharpest turn is the one that
      // hugs this ring rather than crossing into a neighbouring one. It only
      // matters where more than two edges meet — two territories touching at a
      // single point — and there it is what keeps them separate shapes.
      const back = Math.atan2(from[1] - to[1], from[0] - to[0])
      let best: Arc | null = null
      let bestTurn = Infinity

      for (const candidate of candidates) {
        if (used[candidate.edge])
          continue
        let turn = back - candidate.angle
        while (turn <= 0)
          turn += Math.PI * 2
        while (turn > Math.PI * 2)
          turn -= Math.PI * 2
        if (turn < bestTurn) {
          bestTurn = turn
          best = candidate
        }
      }

      if (!best)
        break

      used[best.edge] = true
      from = to
      to = best.to
    }

    // Three distinct points at minimum, plus the repeated closing one.
    if (ring.length >= 4 && equals(ring[0], ring[ring.length - 1]))
      rings.push(ring)
  }

  return rings
}

/** Twice the signed area of a ring in coordinate units. */
function ringSignedArea(ring: Ring): number {
  let sum = 0
  for (let i = 0, len = ring.length - 1; i < len; i++)
    sum += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1])
  return sum
}

function pointInRing(point: Position, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if ((yi > point[1]) !== (yj > point[1])
      && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** A point that is inside the ring rather than on its boundary. */
function interiorPoint(ring: Ring): Position {
  // The centroid of the first three vertices is inside for a convex corner and
  // outside for a reflex one, so fall back to walking for a point that tests
  // as inside rather than trusting one candidate.
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % (ring.length - 1)]
    const candidate: Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    // Nudge inward, perpendicular to the edge.
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len === 0)
      continue
    const scale = len * 1e-6
    const inward: Position = [candidate[0] - (dy / len) * scale, candidate[1] + (dx / len) * scale]
    if (pointInRing(inward, ring))
      return inward
    const other: Position = [candidate[0] + (dy / len) * scale, candidate[1] - (dx / len) * scale]
    if (pointInRing(other, ring))
      return other
  }
  return ring[0]
}

/**
 * Group rings into polygons, deciding which are holes.
 *
 * A ring nested inside an odd number of others is a hole in the innermost of
 * them; an even depth makes it an outer ring in its own right. That rule
 * handles the shapes a territory game actually produces — a park enclosed by a
 * loop, an island of one player's ground inside another's — without the sweep
 * having to track depth itself.
 */
function assemblePolygons(rings: Ring[]): MultiPolygon {
  const kept = rings.filter(ring => Math.abs(ringSignedArea(ring)) > 0)
  const samples = kept.map(interiorPoint)

  const parents: number[] = kept.map(() => -1)
  const depths: number[] = kept.map(() => 0)

  for (let i = 0; i < kept.length; i++) {
    let bestParent = -1
    let bestArea = Infinity
    for (let j = 0; j < kept.length; j++) {
      if (i === j)
        continue
      if (!pointInRing(samples[i], kept[j]))
        continue
      // The immediate parent is the smallest ring that contains this one.
      const area = Math.abs(ringSignedArea(kept[j]))
      if (area < bestArea) {
        bestArea = area
        bestParent = j
      }
      depths[i]++
    }
    parents[i] = bestParent
  }

  const polygons: MultiPolygon = []
  const polygonOf = new Map<number, number>()

  // Outer rings first, so a hole always has a polygon to attach to.
  for (let i = 0; i < kept.length; i++) {
    if (depths[i] % 2 !== 0)
      continue
    polygonOf.set(i, polygons.length)
    polygons.push([orient(kept[i], true)])
  }

  for (let i = 0; i < kept.length; i++) {
    if (depths[i] % 2 === 0)
      continue
    const target = parents[i] === -1 ? undefined : polygonOf.get(parents[i])
    if (target === undefined) {
      // A hole whose parent is itself a hole: it is solid ground again, and
      // the even-depth pass above already handled the ones that are.
      continue
    }
    polygons[target].push(orient(kept[i], false))
  }

  return polygons
}

/** Wind a ring counter-clockwise for an outer ring, clockwise for a hole. */
function orient(ring: Ring, outer: boolean): Ring {
  // The shoelace sum used here is positive for a clockwise ring in standard
  // orientation, so an outer ring wants a negative sum.
  const clockwise = ringSignedArea(ring) > 0
  const copy = ring.map(p => [p[0], p[1]])
  if (clockwise === outer)
    copy.reverse()
  return copy
}

function run(subject: MultiPolygon, clip: MultiPolygon, operation: Operation): MultiPolygon {
  // Shortcuts that are also the common cases: a player's first capture has
  // nothing to union with, and most captures overlap nobody.
  if (subject.length === 0) {
    if (operation === UNION || operation === XOR)
      return clone(clip)
    return []
  }
  if (clip.length === 0) {
    if (operation === UNION || operation === DIFFERENCE || operation === XOR)
      return clone(subject)
    return []
  }

  return assemblePolygons(buildRings(sweep(subject, clip, operation)))
}

function clone(multi: MultiPolygon): MultiPolygon {
  return multi.map(polygon => polygon.map(ring => ring.map(p => [p[0], p[1]])))
}

/** Everything covered by either. */
export function union(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon {
  return run(subject, clip, UNION)
}

/** Only what both cover. */
export function intersection(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon {
  return run(subject, clip, INTERSECTION)
}

/** What `subject` covers and `clip` does not — the shape of a territory steal. */
export function difference(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon {
  return run(subject, clip, DIFFERENCE)
}

/** Covered by one but not both. */
export function xor(subject: MultiPolygon, clip: MultiPolygon): MultiPolygon {
  return run(subject, clip, XOR)
}

/** Do these overlap at all? Cheaper than measuring the intersection. */
export function intersects(subject: MultiPolygon, clip: MultiPolygon): boolean {
  return intersection(subject, clip).length > 0
}

/** Is a `[lng, lat]` position inside this multipolygon? */
export function contains(multi: MultiPolygon, point: Position): boolean {
  for (const polygon of multi) {
    if (polygon.length === 0 || !pointInRing(point, closeRing(polygon[0])))
      continue
    let inHole = false
    for (let i = 1; i < polygon.length; i++) {
      if (pointInRing(point, closeRing(polygon[i]))) {
        inHole = true
        break
      }
    }
    if (!inHole)
      return true
  }
  return false
}

function closeRing(ring: Ring): Ring {
  if (ring.length > 0 && !equals(ring[0], ring[ring.length - 1]))
    return [...ring, ring[0]]
  return ring
}
