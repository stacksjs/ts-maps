import type { Bounds } from './Bounds'
import { LatLng } from '../geo/LatLng'
import { LatLngBounds } from '../geo/LatLngBounds'
import { Point } from './Point'
import { centroid } from './PolyUtil'

export function simplify(points: Point[], tolerance: number): Point[] {
  if (!tolerance || !points.length)
  return points.slice()

  const sqTolerance = tolerance * tolerance

  points = _reducePoints(points, sqTolerance)
  points = _simplifyDP(points, sqTolerance)

  return points
}

export function pointToSegmentDistance(p: Point, p1: Point, p2: Point): number {
  return Math.sqrt(_sqClosestPointOnSegment(p, p1, p2, true) as number)
}

export function closestPointOnSegment(p: Point, p1: Point, p2: Point): Point {
  return _sqClosestPointOnSegment(p, p1, p2) as Point
}

function _simplifyDP(points: Point[], sqTolerance: number): Point[] {
  const len = points.length
  const markers = new Uint8Array(len)
  markers[0] = markers[len - 1] = 1

  _simplifyDPStep(points, markers, sqTolerance, 0, len - 1)

  const newPoints: Point[] = []
  for (let i = 0; i < len; i++) {
    if (markers[i])
    newPoints.push(points[i])
  }
  return newPoints
}

function _simplifyDPStep(points: Point[], markers: Uint8Array, sqTolerance: number, first: number, last: number): void {
  let maxSqDist = 0
  let index = 0
  for (let i = first + 1; i <= last - 1; i++) {
    const sqDist = _sqClosestPointOnSegment(points[i], points[first], points[last], true) as number
    if (sqDist > maxSqDist) {
      index = i
      maxSqDist = sqDist
    }
  }

  if (maxSqDist > sqTolerance) {
    markers[index] = 1
    _simplifyDPStep(points, markers, sqTolerance, first, index)
    _simplifyDPStep(points, markers, sqTolerance, index, last)
  }
}

function _reducePoints(points: Point[], sqTolerance: number): Point[] {
  const reducedPoints: Point[] = [points[0]]
  let prev = 0

  for (let i = 1; i < points.length; i++) {
    if (_sqDist(points[i], points[prev]) > sqTolerance) {
      reducedPoints.push(points[i])
      prev = i
    }
  }
  if (prev < points.length - 1)
  reducedPoints.push(points[points.length - 1])

  return reducedPoints
}

let _lastCode: number

// Cohen-Sutherland segment clipping.
export function clipSegment(a: Point, b: Point, bounds: Bounds, useLastCode?: boolean, round?: boolean): [Point, Point] | false {
  let codeA = useLastCode ? _lastCode : _getBitCode(a, bounds)
  let codeB = _getBitCode(b, bounds)

  _lastCode = codeB

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!(codeA | codeB))
    return [a, b]

    if (codeA & codeB)
    return false

    const codeOut = codeA || codeB
    const p = _getEdgeIntersection(a, b, codeOut, bounds, round)
    const newCode = _getBitCode(p, bounds)

    if (codeOut === codeA) {
      a = p
      codeA = newCode
    }
    else {
      b = p
      codeB = newCode
    }
  }
}

export function _getEdgeIntersection(a: Point, b: Point, code: number, bounds: Bounds, round?: boolean): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const min = bounds.min
  const max = bounds.max
  let x = 0, y = 0

  if (code & 8) {
    x = a.x + dx * (max.y - a.y) / dy
    y = max.y
  }
  else if (code & 4) {
    x = a.x + dx * (min.y - a.y) / dy
    y = min.y
  }
  else if (code & 2) {
    x = max.x
    y = a.y + dy * (max.x - a.x) / dx
  }
  else if (code & 1) {
    x = min.x
    y = a.y + dy * (min.x - a.x) / dx
  }

  return new Point(x, y, round)
}

export function _getBitCode(p: Point, bounds: Bounds): number {
  let code = 0
  if (p.x < bounds.min.x)
  code |= 1
  else if (p.x > bounds.max.x)
  code |= 2
  if (p.y < bounds.min.y)
  code |= 4
  else if (p.y > bounds.max.y)
  code |= 8
  return code
}

function _sqDist(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return dx * dx + dy * dy
}

export function _sqClosestPointOnSegment(p: Point, p1: Point, p2: Point, sqDist?: boolean): Point | number {
  let x = p1.x, y = p1.y
  let dx = p2.x - x, dy = p2.y - y
  const dot = dx * dx + dy * dy
  let t: number

  if (dot > 0) {
    t = ((p.x - x) * dx + (p.y - y) * dy) / dot
    if (t > 1) {
      x = p2.x
      y = p2.y
    }
    else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }

  dx = p.x - x
  dy = p.y - y

  return sqDist ? dx * dx + dy * dy : new Point(x, y)
}

export function isFlat(latlngs: any[]): boolean {
  return !Array.isArray(latlngs[0]) || (typeof latlngs[0][0] !== 'object' && typeof latlngs[0][0] !== 'undefined')
}

export function polylineCenter(latlngs: any[], crs: any): LatLng {
  if (!latlngs || latlngs.length === 0)
  throw new Error('latlngs not passed')

  if (!isFlat(latlngs)) {
    // eslint-disable-next-line no-console
    console.warn('latlngs are not flat! Only the first ring will be used')
    latlngs = latlngs[0]
  }

  let centroidLatLng = new LatLng(0, 0)

  const bounds = new LatLngBounds(latlngs)
  const areaBounds = bounds.getNorthWest().distanceTo(bounds.getSouthWest())
  * bounds.getNorthEast().distanceTo(bounds.getNorthWest())
  if (areaBounds < 1700) {
    centroidLatLng = centroid(latlngs)
  }

  const len = latlngs.length
  const points: Point[] = []
  for (let i = 0; i < len; i++) {
    const latlng = new LatLng(latlngs[i])
    points.push(crs.project(new LatLng(latlng.lat - centroidLatLng.lat, latlng.lng - centroidLatLng.lng)))
  }

  let halfDist = 0
  for (let i = 0; i < len - 1; i++) {
    halfDist += points[i].distanceTo(points[i + 1]) / 2
  }

  let center: Point | [number, number]
  if (halfDist === 0) {
    center = points[0]
  }
  else {
    let dist = 0
    center = points[0]
    for (let i = 0; i < len - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]
      const segDist = p1.distanceTo(p2)
      dist += segDist
      if (dist > halfDist) {
        const ratio = (dist - halfDist) / segDist
        center = [p2.x - ratio * (p2.x - p1.x), p2.y - ratio * (p2.y - p1.y)]
        break
      }
    }
  }

  const latlngCenter = crs.unproject(new Point(center as any))
  return new LatLng(latlngCenter.lat + centroidLatLng.lat, latlngCenter.lng + centroidLatLng.lng)
}
