// A GeoJSON source that answers in tiles.
//
// The renderer, the filter evaluator, the expression machinery and the query
// index all speak one language: MVT tiles. Rather than teach any of them about
// GeoJSON, this cuts a FeatureCollection into the same shape a decoded vector
// tile has — `{ layers: { name: { length, feature(i) } } }` — so a `geojson`
// style source renders through exactly the same path as a remote vector
// source, with the same paint properties, filters and `queryRenderedFeatures`.
//
// This is the geojson-vt job, in the small: index once, clip per tile. There is
// no simplification pass — the datasets a style feeds through here are point
// and small-polygon overlays, where simplification would cost more than it
// saves. Large line datasets belong in real vector tiles.

const EXTENT = 4096

export interface GeoJSONTileSourceOptions {
  /**
   * The layer name tiles are published under, which style layers reference as
   * `source-layer`. Mapbox uses the source id here for geojson sources, and a
   * plain default keeps hand-written styles short.
   */
  layerName?: string
  /** Extra room around the tile, in extent units, so wide strokes and labels
   * near an edge are not cut off mid-symbol. */
  buffer?: number
  maxZoom?: number
}

type Ring = Array<{ x: number, y: number }>

interface IndexedFeature {
  /** MVT geometry type: 1 Point, 2 LineString, 3 Polygon. */
  type: 1 | 2 | 3
  id?: number | string
  properties: Record<string, unknown>
  /** Rings in world mercator space, [0, 1] on both axes. */
  rings: Ring[]
  bbox: [number, number, number, number]
}

/** A decoded-tile-shaped feature, duck-typed to `VectorTileFeature`. */
class LocalFeature {
  declare type: 1 | 2 | 3
  declare id?: number | string
  declare properties: Record<string, unknown>
  declare extent: number
  declare _rings: Ring[]

  constructor(source: IndexedFeature, rings: Ring[]) {
    this.type = source.type
    this.id = source.id
    this.properties = source.properties
    this.extent = EXTENT
    this._rings = rings
  }

  loadGeometry(): Ring[] {
    return this._rings
  }

  bbox(): [number, number, number, number] {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const ring of this._rings) {
      for (const point of ring) {
        if (point.x < minX) minX = point.x
        if (point.y < minY) minY = point.y
        if (point.x > maxX) maxX = point.x
        if (point.y > maxY) maxY = point.y
      }
    }
    if (minX === Infinity)
      return [0, 0, 0, 0]
    return [minX, minY, maxX, maxY]
  }
}

class LocalLayer {
  declare name: string
  declare extent: number
  declare length: number
  declare _features: LocalFeature[]

  constructor(name: string, features: LocalFeature[]) {
    this.name = name
    this.extent = EXTENT
    this.length = features.length
    this._features = features
  }

  feature(index: number): LocalFeature {
    return this._features[index]!
  }
}

const GEOMETRY_TYPES: Record<string, 1 | 2 | 3> = {
  Point: 1,
  MultiPoint: 1,
  LineString: 2,
  MultiLineString: 2,
  Polygon: 3,
  MultiPolygon: 3,
}

/** Longitude/latitude to world mercator, both axes in [0, 1]. */
function project(lng: number, lat: number): { x: number, y: number } {
  const x = lng / 360 + 0.5
  const sin = Math.sin((lat * Math.PI) / 180)
  // Clamped rather than allowed to run to infinity at the poles: a stray
  // 90-degree latitude in real data would otherwise poison every bbox it
  // touches with NaN.
  const y = 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI
  return { x, y: y < 0 ? 0 : y > 1 ? 1 : y }
}

function ringsOf(geometry: any): Ring[] {
  const type = geometry?.type
  const coords = geometry?.coordinates
  if (!type || !coords)
    return []

  switch (type) {
    case 'Point':
      return [[project(coords[0], coords[1])]]
    case 'MultiPoint':
      return coords.map((c: number[]) => [project(c[0]!, c[1]!)])
    case 'LineString':
      return [coords.map((c: number[]) => project(c[0]!, c[1]!))]
    case 'MultiLineString':
    case 'Polygon':
      return coords.map((line: number[][]) => line.map(c => project(c[0]!, c[1]!)))
    case 'MultiPolygon':
      return coords.flatMap((polygon: number[][][]) =>
        polygon.map(ring => ring.map(c => project(c[0]!, c[1]!))))
    default:
      return []
  }
}

/** Sutherland–Hodgman against one tile edge, in world space. */
function clipRingToEdge(ring: Ring, inside: (p: { x: number, y: number }) => boolean, intersect: (a: { x: number, y: number }, b: { x: number, y: number }) => { x: number, y: number }): Ring {
  const out: Ring = []
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i]!
    const previous = ring[(i + ring.length - 1) % ring.length]!
    const currentIn = inside(current)
    const previousIn = inside(previous)

    if (currentIn) {
      if (!previousIn)
        out.push(intersect(previous, current))
      out.push(current)
    }
    else if (previousIn) {
      out.push(intersect(previous, current))
    }
  }
  return out
}

function clipPolygonRing(ring: Ring, minX: number, minY: number, maxX: number, maxY: number): Ring {
  let out = ring
  const lerp = (a: any, b: any, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

  out = clipRingToEdge(out, p => p.x >= minX, (a, b) => lerp(a, b, (minX - a.x) / (b.x - a.x)))
  if (!out.length) return out
  out = clipRingToEdge(out, p => p.x <= maxX, (a, b) => lerp(a, b, (maxX - a.x) / (b.x - a.x)))
  if (!out.length) return out
  out = clipRingToEdge(out, p => p.y >= minY, (a, b) => lerp(a, b, (minY - a.y) / (b.y - a.y)))
  if (!out.length) return out
  out = clipRingToEdge(out, p => p.y <= maxY, (a, b) => lerp(a, b, (maxY - a.y) / (b.y - a.y)))
  return out
}

/**
 * Liang–Barsky, emitting every surviving run as its own line. A line that
 * leaves the tile and comes back must not be rejoined by a straight segment
 * across the gap.
 */
function clipLine(line: Ring, minX: number, minY: number, maxX: number, maxY: number): Ring[] {
  const parts: Ring[] = []
  let current: Ring = []

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!
    const b = line[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    let t0 = 0
    let t1 = 1
    let visible = true

    for (const [p, q] of [[-dx, a.x - minX], [dx, maxX - a.x], [-dy, a.y - minY], [dy, maxY - a.y]] as Array<[number, number]>) {
      if (p === 0) {
        if (q < 0) {
          visible = false
          break
        }
        continue
      }
      const r = q / p
      if (p < 0) {
        if (r > t1) {
          visible = false
          break
        }
        if (r > t0) t0 = r
      }
      else {
        if (r < t0) {
          visible = false
          break
        }
        if (r < t1) t1 = r
      }
    }

    if (!visible) {
      if (current.length > 1) parts.push(current)
      current = []
      continue
    }

    const start = { x: a.x + dx * t0, y: a.y + dy * t0 }
    const end = { x: a.x + dx * t1, y: a.y + dy * t1 }

    if (!current.length) {
      current.push(start)
    }
    else if (t0 > 0) {
      // The previous segment was clipped short — this is a new run, not a
      // continuation, so the gap is never bridged by a straight segment.
      if (current.length > 1) parts.push(current)
      current = [start]
    }

    current.push(end)

    if (t1 < 1) {
      if (current.length > 1) parts.push(current)
      current = []
    }
  }

  if (current.length > 1)
    parts.push(current)
  return parts
}

export class GeoJSONTileSource {
  declare _features: IndexedFeature[]
  declare _layerName: string
  declare _buffer: number

  constructor(data?: unknown, options: GeoJSONTileSourceOptions = {}) {
    this._layerName = options.layerName ?? 'geojson'
    // In extent units of a tile; 64/4096 is the usual 1/64th margin.
    this._buffer = options.buffer ?? 64
    this._features = []
    if (data)
      this.setData(data)
  }

  /** Replace the whole dataset. Cheap enough to call on every feed update. */
  setData(data: unknown): this {
    this._features = []
    const collection = data as any
    const features: any[] = collection?.type === 'FeatureCollection'
      ? (collection.features ?? [])
      : collection?.type === 'Feature'
        ? [collection]
        : Array.isArray(collection)
          ? collection
          : []

    for (const feature of features) {
      const geometry = feature?.geometry ?? feature
      const type = GEOMETRY_TYPES[geometry?.type]
      if (!type)
        continue

      const rings = ringsOf(geometry)
      if (!rings.length)
        continue

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const ring of rings) {
        for (const point of ring) {
          if (point.x < minX) minX = point.x
          if (point.y < minY) minY = point.y
          if (point.x > maxX) maxX = point.x
          if (point.y > maxY) maxY = point.y
        }
      }

      this._features.push({
        type,
        id: feature?.id,
        properties: feature?.properties ?? {},
        rings,
        bbox: [minX, minY, maxX, maxY],
      })
    }
    return this
  }

  /** How many features the source holds. */
  get length(): number {
    return this._features.length
  }

  /**
   * The tile at z/x/y, in the shape a decoded `VectorTile` has, or `null` when
   * nothing falls inside it — the caller then leaves the tile blank rather
   * than drawing an empty canvas.
   */
  getTile(z: number, x: number, y: number): { layers: Record<string, LocalLayer> } | null {
    const scale = 2 ** z
    const margin = this._buffer / EXTENT
    const minX = (x - margin) / scale
    const maxX = (x + 1 + margin) / scale
    const minY = (y - margin) / scale
    const maxY = (y + 1 + margin) / scale

    const toTile = (point: { x: number, y: number }) => ({
      x: Math.round((point.x * scale - x) * EXTENT),
      y: Math.round((point.y * scale - y) * EXTENT),
    })

    const kept: LocalFeature[] = []

    for (const feature of this._features) {
      const [fMinX, fMinY, fMaxX, fMaxY] = feature.bbox
      if (fMaxX < minX || fMinX > maxX || fMaxY < minY || fMinY > maxY)
        continue

      let rings: Ring[]

      if (feature.type === 1) {
        rings = feature.rings
          .map(ring => ring.filter(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY))
          .filter(ring => ring.length > 0)
      }
      else if (feature.type === 2) {
        rings = feature.rings.flatMap(ring => clipLine(ring, minX, minY, maxX, maxY))
      }
      else {
        rings = feature.rings
          .map(ring => clipPolygonRing(ring, minX, minY, maxX, maxY))
          .filter(ring => ring.length >= 3)
      }

      if (!rings.length)
        continue

      kept.push(new LocalFeature(feature, rings.map(ring => ring.map(toTile))))
    }

    if (!kept.length)
      return null

    return { layers: { [this._layerName]: new LocalLayer(this._layerName, kept) } }
  }
}

/**
 * Adapts a `GeoJSONClusterSource` to the same tile shape.
 *
 * The cluster source already answers per tile, but in GeoJSON coordinates — it
 * was built to feed markers, not a renderer. This projects its points into
 * tile-local extent space so clustered data can be painted by ordinary style
 * layers, with `point_count` available to expressions exactly as in Mapbox.
 */
export function clusterTileSource(
  cluster: { getTile: (z: number, x: number, y: number) => { features: Array<{ geometry: { coordinates: [number, number] }, properties: Record<string, unknown>, id?: number }> } | null },
  layerName = 'geojson',
): { getTile: (z: number, x: number, y: number) => { layers: Record<string, LocalLayer> } | null } {
  return {
    getTile(z: number, x: number, y: number) {
      const tile = cluster.getTile(z, x, y)
      if (!tile?.features?.length)
        return null

      const scale = 2 ** z
      const features = tile.features.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates
        const world = project(lng, lat)
        const point = {
          x: Math.round((world.x * scale - x) * EXTENT),
          y: Math.round((world.y * scale - y) * EXTENT),
        }
        return new LocalFeature(
          { type: 1, id: feature.id, properties: feature.properties, rings: [], bbox: [0, 0, 0, 0] },
          [[point]],
        )
      })

      return { layers: { [layerName]: new LocalLayer(layerName, features) } }
    },
  }
}
