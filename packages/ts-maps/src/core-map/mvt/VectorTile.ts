// Mapbox Vector Tile (v2) decoder — in-house, zero-dep.
// Inspired by mapbox/vector-tile-js (BSD-3-Clause) and the MVT spec.
// Independent TypeScript implementation.

import { Pbf } from '../proto/Pbf'
import { VectorTileLayer } from './VectorTileLayer'

// Top-level MVT Tile message. Each tile contains one or more named Layers.
// The constructor walks the outer envelope; layer bodies are parsed eagerly
// into `VectorTileLayer` instances, but features inside a layer are lazy.
export class VectorTile {
  layers: Record<string, VectorTileLayer>

  constructor(pbf: Pbf, end?: number) {
    this.layers = {}

    const endPos = end === undefined ? pbf.length : end
    while (pbf.pos < endPos) {
      const val = pbf.readVarint()
      const tag = val >> 3
      pbf.type = val & 0x7

      if (tag === 3) {
        // Layer — length-delimited submessage.
        const layerEnd = pbf.readVarint() + pbf.pos
        const layer = new VectorTileLayer(pbf, layerEnd)
        // Ensure we end up at the layer's terminator even if it had unknown
        // fields at the tail.
        pbf.pos = layerEnd
        if (layer.name.length > 0)
          this.layers[layer.name] = layer
      }
      else {
        pbf.skip(val)
      }
    }
  }
}
