import type { Bounds } from './Bounds'
import * as LineUtil from './LineUtil'
import { LatLng } from '../geo/LatLng'
import { LatLngBounds } from '../geo/LatLngBounds'
import { Point } from './Point'

export function clipPolygon(points: Array<Point & { _code?: number }>, bounds: Bounds, round?: boolean): Point[] {
  let clippedPoints: Array<Point & { _code?: number }>
  const edges = [1, 4, 2, 8]

  for (let i = 0, len = points.length; i < len; i++) {
    points[i]._code = LineUtil._getBitCode(points[i], bounds)
  }

  for (let k = 0; k < 4; k++) {
    const edge = edges[k]
    clippedPoints = []

    for (let i = 0, len = points.length, j = len - 1; i < len; j = i++) {
      const a = points[i]
      const b = points[j]

      if (!((a._code as number) & edge)) {
        if ((b._code as number) & edge) {
          const p = LineUtil._getEdgeIntersection(b, a, edge, bounds, round) as Point & { _code?: number }
          p._code = LineUtil._getBitCode(p, bounds)
          clippedPoints.push(p)
        }
        clippedPoints.push(a)
      }
      else if (!((b._code as number) & edge)) {
        const p = LineUtil._getEdgeIntersection(b, a, edge, bounds, round) as Point & { _code?: number }
        p._code = LineUtil._getBitCode(p, bounds)
        clippedPoints.push(p)
      }
    }
    points = clippedPoints
  }

  return points
}

export function polygonCenter(latlngs: any[], crs: any): LatLng {
  if (!latlngs || latlngs.length === 0)
  throw new Error('latlngs not passed')

  if (!LineUtil.isFlat(latlngs)) {
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

  let area = 0, x = 0, y = 0
  let center: Point | [number, number]

  for (let i = 0, j = len - 1; i < len; j = i++) {
    const p1 = points[i]
    const p2 = points[j]
    const f = p1.y * p2.x - p2.y * p1.x
    x += (p1.x + p2.x) * f
    y += (p1.y + p2.y) * f
    area += f * 3
  }

  if (area === 0) {
    center = points[0]
  }
  else {
    center = [x / area, y / area]
  }

  const latlngCenter = crs.unproject(new Point(center as any))
  return new LatLng(latlngCenter.lat + centroidLatLng.lat, latlngCenter.lng + centroidLatLng.lng)
}

export function centroid(coords: any[]): LatLng {
  let latSum = 0
  let lngSum = 0
  let len = 0
  for (const coord of coords) {
    const latlng = new LatLng(coord)
    latSum += latlng.lat
    lngSum += latlng.lng
    len++
  }
  return new LatLng(latSum / len, lngSum / len)
}
