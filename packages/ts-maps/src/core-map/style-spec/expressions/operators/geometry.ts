// Geometry predicates: `["within", polygon]` and `["distance", geometry]`.
//
// Both need the feature's actual coordinates, which the evaluation context
// carries as a lazy `geometry()` accessor rather than as data. Projecting a
// feature back to lng/lat is not free, and the overwhelming majority of
// expressions never ask — so nothing is computed until one of these runs.
//
// A style that uses them against a source that cannot supply geometry (a
// filter evaluated before decode, say) gets `false` and `Infinity`
// respectively: the honest "I cannot tell" answers, and the ones that leave a
// feature unstyled rather than wrongly styled.

import type { CompiledExpression, EvaluationContext } from '../types'
import { ExpressionError } from '../errors'
import { registerOperator } from '../registry'

type Position = [number, number]

/** Metres per degree of latitude, near enough for map-scale work. */
const EARTH_RADIUS = 6371008.8

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than a planar approximation: a planar one is wrong by
 * kilometres at high latitude, which is exactly where "is this within 500m"
 * questions stop being decorative.
 */
export function haversine(a: Position, b: Position): number {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinLng * sinLng
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Even-odd ray casting, with the boundary counted as inside.
 *
 * A point exactly on an edge is a real case — shared borders, snapped data —
 * and excluding it makes two adjacent polygons disagree about who owns it.
 */
export function pointInRing(point: Position, ring: Position[]): boolean {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!

    // On the segment: count it as inside and stop.
    const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi)
    if (Math.abs(cross) < 1e-12
      && Math.min(xi, xj) - 1e-12 <= x && x <= Math.max(xi, xj) + 1e-12
      && Math.min(yi, yj) - 1e-12 <= y && y <= Math.max(yi, yj) + 1e-12) {
      return true
    }

    if ((yi > y) !== (yj > y)) {
      const at = xi + ((y - yi) / (yj - yi)) * (xj - xi)
      if (x < at)
        inside = !inside
    }
  }

  return inside
}

/** Inside the outer ring and outside every hole. */
export function pointInPolygon(point: Position, polygon: Position[][]): boolean {
  if (!polygon.length || !pointInRing(point, polygon[0]!))
    return false
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i]!))
      return false
  }
  return true
}

/** Every polygon of a Polygon or MultiPolygon, as ring lists. */
function polygonsOf(geometry: any): Position[][][] {
  if (!geometry)
    return []
  if (geometry.type === 'Polygon')
    return [geometry.coordinates as Position[][]]
  if (geometry.type === 'MultiPolygon')
    return geometry.coordinates as Position[][][]
  if (geometry.type === 'Feature')
    return polygonsOf(geometry.geometry)
  if (geometry.type === 'FeatureCollection')
    return (geometry.features ?? []).flatMap((f: any) => polygonsOf(f))
  return []
}

/** Every coordinate in a geometry, flattened. */
function positionsOf(geometry: any): Position[] {
  if (!geometry)
    return []
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates as Position]
    case 'MultiPoint':
    case 'LineString':
      return geometry.coordinates as Position[]
    case 'MultiLineString':
    case 'Polygon':
      return (geometry.coordinates as Position[][]).flat()
    case 'MultiPolygon':
      return (geometry.coordinates as Position[][][]).flat(2)
    case 'Feature':
      return positionsOf(geometry.geometry)
    case 'FeatureCollection':
      return (geometry.features ?? []).flatMap((f: any) => positionsOf(f))
    default:
      return []
  }
}

function featureGeometry(ctx: EvaluationContext): any {
  const accessor = ctx.feature?.geometry
  return typeof accessor === 'function' ? accessor() : undefined
}

function noDeps(): Pick<CompiledExpression, 'dependsOnZoom' | 'dependsOnFeature' | 'dependsOnFeatureState'> {
  return { dependsOnZoom: false, dependsOnFeature: true, dependsOnFeatureState: false }
}

export function registerGeometryOps(): void {
  /**
   * `["within", polygon]` — is the feature inside the given GeoJSON polygon?
   *
   * The polygon is style data, not an expression: it is fixed geography, and
   * compiling it per feature would be waste.
   */
  registerOperator('within', (args, _compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"within" expects 1 argument, got ${args.length}`, ['within', ...args], path)

    const polygons = polygonsOf(args[0])
    if (!polygons.length)
      throw new ExpressionError('"within": argument must be a GeoJSON Polygon or MultiPolygon', ['within', ...args], path)

    return {
      evaluate: (ctx: EvaluationContext) => {
        const geometry = featureGeometry(ctx)
        const points = positionsOf(geometry)
        if (!points.length)
          return false

        // Every vertex must be inside, matching Mapbox: a line half outside
        // the polygon is not "within" it.
        return points.every(point => polygons.some(polygon => pointInPolygon(point, polygon)))
      },
      returnType: 'boolean',
      ...noDeps(),
    }
  })

  /**
   * `["distance", geometry]` — metres from the feature to the given geometry.
   *
   * Vertex-to-vertex, which is exact for points and a close upper bound for
   * anything else. Segment-aware distance would matter for a long line
   * evaluated at close range; the styling this feeds — fade a label by how far
   * away it is — does not notice.
   */
  registerOperator('distance', (args, _compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"distance" expects 1 argument, got ${args.length}`, ['distance', ...args], path)

    const targets = positionsOf(args[0])
    if (!targets.length)
      throw new ExpressionError('"distance": argument must be a GeoJSON geometry', ['distance', ...args], path)

    return {
      evaluate: (ctx: EvaluationContext) => {
        const points = positionsOf(featureGeometry(ctx))
        if (!points.length)
          return Infinity

        let nearest = Infinity
        for (const point of points) {
          for (const target of targets) {
            const d = haversine(point, target)
            if (d < nearest)
              nearest = d
          }
        }
        return nearest
      },
      returnType: 'number',
      ...noDeps(),
    }
  })
}
