// Mapbox Vector Tile (v2) feature — in-house, zero-dep.
// Inspired by mapbox/vector-tile-js (BSD-3-Clause) and the MVT spec.
// Independent TypeScript implementation.

import type { Pbf } from '../proto/Pbf'
import { Point } from '../geometry/Point'

// MVT GeomType enum values (tile.proto).
export const MVT_GEOM_UNKNOWN: number = 0
export const MVT_GEOM_POINT: number = 1
export const MVT_GEOM_LINESTRING: number = 2
export const MVT_GEOM_POLYGON: number = 3

// Geometry command ids (MVT spec, section 4.3).
const CMD_MOVE_TO = 1
const CMD_LINE_TO = 2
const CMD_CLOSE_PATH = 7

export type GeomType = 'Unknown' | 'Point' | 'LineString' | 'Polygon'
export type VectorTileValue = string | number | boolean | null
export type VectorTileProperties = Record<string, VectorTileValue>

// Human-readable name table indexed by MVT GeomType enum value.
export const GEOM_TYPE_NAMES: GeomType[] = ['Unknown', 'Point', 'LineString', 'Polygon']

// GeoJSON output types (structural; we don't depend on @types/geojson to stay dep-free).
export interface GeoJSONPoint {
  type: 'Point'
  coordinates: [number, number]
}
export interface GeoJSONMultiPoint {
  type: 'MultiPoint'
  coordinates: [number, number][]
}
export interface GeoJSONLineString {
  type: 'LineString'
  coordinates: [number, number][]
}
export interface GeoJSONMultiLineString {
  type: 'MultiLineString'
  coordinates: [number, number][][]
}
export interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: [number, number][][]
}
export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon'
  coordinates: [number, number][][][]
}

export type GeoJSONGeometry =
  | GeoJSONPoint
  | GeoJSONMultiPoint
  | GeoJSONLineString
  | GeoJSONMultiLineString
  | GeoJSONPolygon
  | GeoJSONMultiPolygon

export interface GeoJSONFeature {
  type: 'Feature'
  id?: number
  geometry: GeoJSONGeometry
  properties: VectorTileProperties
}

export class VectorTileFeature {
  id?: number
  type: 1 | 2 | 3
  extent: number
  properties: VectorTileProperties

  // Reference to the underlying Pbf buffer and the byte range occupied by
  // this feature's `geometry` (tag 4) field. Populated during construction.
  private _pbf: Pbf
  private _geometry: number
  private _geometryEnd: number
  private _keys: string[]
  private _values: VectorTileValue[]

  constructor(pbf: Pbf, end: number, extent: number, keys: string[], values: VectorTileValue[]) {
    this.id = undefined
    this.type = MVT_GEOM_UNKNOWN as 1 | 2 | 3
    this.extent = extent
    this.properties = {}
    this._pbf = pbf
    this._geometry = -1
    this._geometryEnd = -1
    this._keys = keys
    this._values = values

    // Walk the feature message, recording tag offsets.
    let tags: number[] = []
    while (pbf.pos < end) {
      const val = pbf.readVarint()
      const tag = val >> 3
      pbf.type = val & 0x7
      if (tag === 1) {
        this.id = pbf.readVarint()
      }
      else if (tag === 2) {
        tags = pbf.readPackedVarint(tags)
      }
      else if (tag === 3) {
        this.type = pbf.readVarint() as 1 | 2 | 3
      }
      else if (tag === 4) {
        // Geometry is a packed repeated uint32. Record the byte range; we
        // only decode it when loadGeometry() is called.
        this._geometry = pbf.pos
        const geomEnd = pbf.readVarint() + pbf.pos
        this._geometryEnd = geomEnd
        pbf.pos = geomEnd
      }
      else {
        pbf.skip(val)
      }
    }

    // Materialize properties once, up front. The tags array is small and
    // this avoids needing a lazy getter (which complicates isolatedDeclarations).
    for (let i = 0; i < tags.length; i += 2) {
      const key = keys[tags[i]]
      const value = values[tags[i + 1]]
      if (key !== undefined)
        this.properties[key] = value ?? null
    }
  }

  loadGeometry(): Point[][] {
    if (this._geometry < 0)
      return []

    const pbf = this._pbf
    const savedPos = pbf.pos
    pbf.pos = this._geometry
    // Re-read the length prefix to enter the packed region cleanly.
    const end = pbf.readVarint() + pbf.pos

    let cmd = 1
    let length = 0
    let x = 0
    let y = 0
    const lines: Point[][] = []
    let line: Point[] | null = null

    while (pbf.pos < end) {
      if (length <= 0) {
        const cmdLen = pbf.readVarint()
        cmd = cmdLen & 0x7
        length = cmdLen >> 3
      }

      length--

      if (cmd === CMD_MOVE_TO || cmd === CMD_LINE_TO) {
        const zx = pbf.readVarint()
        const zy = pbf.readVarint()
        // Zigzag decode: (n >> 1) ^ (-(n & 1)).
        x += (zx >> 1) ^ (-(zx & 1))
        y += (zy >> 1) ^ (-(zy & 1))

        if (cmd === CMD_MOVE_TO) {
          if (line !== null)
            lines.push(line)
          line = []
        }
        if (line === null) {
          // LineTo without a preceding MoveTo — malformed but tolerate by
          // starting a fresh line so we don't NPE downstream.
          line = []
        }
        line.push(new Point(x, y))
      }
      else if (cmd === CMD_CLOSE_PATH) {
        if (line !== null && line.length > 0) {
          // Close the ring by repeating the first point.
          line.push(line[0].clone())
        }
      }
      else {
        pbf.pos = savedPos
        throw new Error(`Unknown geometry command id: ${cmd}`)
      }
    }

    if (line !== null)
      lines.push(line)

    // A well-formed geometry stream ends with its command counter exhausted.
    // A non-zero leftover means the stream claimed more coordinates than the
    // packed region actually contained — treat that as a decode error.
    if (length > 0) {
      pbf.pos = savedPos
      throw new Error(`Truncated geometry: ${length} coordinate pair(s) missing`)
    }

    pbf.pos = savedPos
    return lines
  }

  bbox(): [number, number, number, number] {
    if (this._geometry < 0)
      return [0, 0, 0, 0]

    const pbf = this._pbf
    const savedPos = pbf.pos
    pbf.pos = this._geometry
    const end = pbf.readVarint() + pbf.pos

    let cmd = 1
    let length = 0
    let x = 0
    let y = 0
    let x1 = Infinity
    let x2 = -Infinity
    let y1 = Infinity
    let y2 = -Infinity

    while (pbf.pos < end) {
      if (length <= 0) {
        const cmdLen = pbf.readVarint()
        cmd = cmdLen & 0x7
        length = cmdLen >> 3
      }
      length--

      if (cmd === CMD_MOVE_TO || cmd === CMD_LINE_TO) {
        const zx = pbf.readVarint()
        const zy = pbf.readVarint()
        x += (zx >> 1) ^ (-(zx & 1))
        y += (zy >> 1) ^ (-(zy & 1))
        if (x < x1)
          x1 = x
        if (x > x2)
          x2 = x
        if (y < y1)
          y1 = y
        if (y > y2)
          y2 = y
      }
      else if (cmd !== CMD_CLOSE_PATH) {
        pbf.pos = savedPos
        throw new Error(`Unknown geometry command id: ${cmd}`)
      }
    }

    if (length > 0) {
      pbf.pos = savedPos
      throw new Error(`Truncated geometry: ${length} coordinate pair(s) missing`)
    }

    pbf.pos = savedPos
    return [x1, y1, x2, y2]
  }

  toGeoJSON(x: number, y: number, z: number): GeoJSONFeature {
    const size = this.extent * Math.pow(2, z)
    const x0 = this.extent * x
    const y0 = this.extent * y
    const rings = this.loadGeometry()

    // Convert tile-local coordinates to WGS84 lat/lng.
    const project = (pts: Point[]): [number, number][] => {
      const out: [number, number][] = []
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const px = p.x + x0
        const py = p.y + y0
        const lng = (px * 360) / size - 180
        const y2 = 180 - (py * 360) / size
        const lat = (360 / Math.PI) * Math.atan(Math.exp((y2 * Math.PI) / 180)) - 90
        out.push([lng, lat])
      }
      return out
    }

    let geometry: GeoJSONGeometry

    if (this.type === MVT_GEOM_POINT) {
      const coords: [number, number][] = []
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i]
        for (let j = 0; j < ring.length; j++) {
          const projected = project([ring[j]])
          coords.push(projected[0])
        }
      }
      if (coords.length === 1) {
        geometry = { type: 'Point', coordinates: coords[0] }
      }
      else {
        geometry = { type: 'MultiPoint', coordinates: coords }
      }
    }
    else if (this.type === MVT_GEOM_LINESTRING) {
      const lines: [number, number][][] = []
      for (let i = 0; i < rings.length; i++)
        lines.push(project(rings[i]))
      if (lines.length === 1) {
        geometry = { type: 'LineString', coordinates: lines[0] }
      }
      else {
        geometry = { type: 'MultiLineString', coordinates: lines }
      }
    }
    else if (this.type === MVT_GEOM_POLYGON) {
      // Classify rings into polygons by orientation. MVT uses a y-down tile
      // space where outer rings are clockwise; under our shoelace variant
      // (sum += (p2.x - p1.x) * (p1.y + p2.y)) clockwise-in-y-down yields a
      // *positive* area.
      const polygons: [number, number][][][] = []
      let current: [number, number][][] | null = null
      for (let i = 0; i < rings.length; i++) {
        const area = signedArea(rings[i])
        if (area === 0)
          continue
        const projected = project(rings[i])
        if (area > 0) {
          // Outer ring — start a new polygon.
          current = [projected]
          polygons.push(current)
        }
        else {
          // Inner ring — attach to the most recent outer. If none yet, drop
          // it (malformed tile).
          if (current !== null)
            current.push(projected)
        }
      }
      if (polygons.length === 1) {
        geometry = { type: 'Polygon', coordinates: polygons[0] }
      }
      else {
        geometry = { type: 'MultiPolygon', coordinates: polygons }
      }
    }
    else {
      // Unknown geometry — emit an empty Point as a conservative default.
      geometry = { type: 'Point', coordinates: [0, 0] }
    }

    const feature: GeoJSONFeature = {
      type: 'Feature',
      geometry,
      properties: this.properties,
    }
    if (this.id !== undefined)
      feature.id = this.id
    return feature
  }
}

// Signed area of a ring using the shoelace formula. Negative means
// clockwise in tile coordinates (y-down), which MVT uses for outer rings.
function signedArea(ring: Point[]): number {
  let sum = 0
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    const p1 = ring[i]
    const p2 = ring[j]
    sum += (p2.x - p1.x) * (p1.y + p2.y)
  }
  return sum
}
