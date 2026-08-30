// The contract a decoded tile has to meet, whoever decoded it.
//
// Three things produce tiles now — the Pbf decoder, the worker's flat decoder
// wrapped by `FlatTile`, and `GeoJSONTileSource` for local data — and the
// renderer is indifferent to which. Writing that down as an interface is
// mostly so the indifference is enforced rather than assumed: there is no
// `instanceof` in the render path, and this is what keeps it that way.

import type { Point } from '../geometry/Point'
import type { GeoJSONFeature, VectorTileProperties } from './VectorTileFeature'

export interface DecodedFeature {
  id?: number
  /** MVT geometry type: 1 point, 2 line, 3 polygon. */
  type: 1 | 2 | 3
  extent: number
  properties: VectorTileProperties
  loadGeometry: () => Point[][]
  bbox: () => [number, number, number, number]
  toGeoJSON: (x: number, y: number, z: number) => GeoJSONFeature
}

export interface DecodedLayer {
  name?: string
  extent: number
  length: number
  feature: (i: number) => DecodedFeature
}

export interface DecodedTile {
  layers: Record<string, DecodedLayer>
}
