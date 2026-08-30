// FlatTile — the main-thread view of a tile decoded in a worker.
//
// `decodeMvtFlat` hands back typed arrays, which is what makes transferring a
// decoded tile across the thread boundary nearly free. This file wraps those
// arrays in the same interface the renderer already uses for `VectorTile`:
// `layers` by name, `layer.feature(i)`, and features with `loadGeometry()`,
// `bbox()` and `toGeoJSON()`. Nothing downstream needs to know which decoder
// produced a tile — there is no `instanceof` anywhere in the render path, and
// `GeoJSONTileSource` already relies on that.
//
// Laziness is preserved. Points and properties are materialised only when a
// feature is asked for them, so a tile whose layers the style never mentions
// costs an index lookup and no allocation.

import type { FlatLayer, FlatTile as FlatTileData } from '../workers/decodeMvtFlat'
import type { GeoJSONFeature, VectorTileProperties, VectorTileValue } from './VectorTileFeature'
import { Point } from '../geometry/Point'
import { geometryToGeoJSON } from './VectorTileFeature'

export class FlatTileFeature {
  id?: number
  type: 1 | 2 | 3
  extent: number

  private _layer: FlatLayer
  private _index: number
  private _properties?: VectorTileProperties

  constructor(layer: FlatLayer, index: number) {
    this._layer = layer
    this._index = index
    this.extent = layer.extent
    this.type = layer.types[index] as 1 | 2 | 3
    const id = layer.ids[index]
    this.id = Number.isNaN(id) ? undefined : id
  }

  /** Built on first read from the layer's shared key and value tables. */
  get properties(): VectorTileProperties {
    if (this._properties)
      return this._properties

    const layer = this._layer
    const out: VectorTileProperties = {}
    const start = layer.tagStart[this._index]
    const end = layer.tagStart[this._index + 1]
    for (let i = start; i + 1 < end; i += 2) {
      const key = layer.keys[layer.tags[i]]
      if (key !== undefined)
        out[key] = layer.values[layer.tags[i + 1]] as VectorTileValue
    }
    this._properties = out
    return out
  }

  loadGeometry(): Point[][] {
    const layer = this._layer
    const first = layer.ringStart[this._index]
    const last = layer.ringStart[this._index + 1]
    const rings: Point[][] = []

    for (let r = first; r < last; r++) {
      const from = layer.ringOffset[r]
      const to = layer.ringOffset[r + 1]
      const ring: Point[] = []
      for (let p = from; p < to; p++)
        ring.push(new Point(layer.coords[p * 2], layer.coords[p * 2 + 1]))
      rings.push(ring)
    }

    return rings
  }

  bbox(): [number, number, number, number] {
    const layer = this._layer
    const from = layer.ringOffset[layer.ringStart[this._index]]
    const to = layer.ringOffset[layer.ringStart[this._index + 1]]
    if (from === undefined || to === undefined || to <= from)
      return [0, 0, 0, 0]

    let x1 = Infinity
    let y1 = Infinity
    let x2 = -Infinity
    let y2 = -Infinity
    for (let p = from; p < to; p++) {
      const x = layer.coords[p * 2]
      const y = layer.coords[p * 2 + 1]
      if (x < x1)
        x1 = x
      if (x > x2)
        x2 = x
      if (y < y1)
        y1 = y
      if (y > y2)
        y2 = y
    }
    return [x1, y1, x2, y2]
  }

  toGeoJSON(x: number, y: number, z: number): GeoJSONFeature {
    return geometryToGeoJSON(this.type, this.loadGeometry(), this.extent, x, y, z, this.properties, this.id)
  }
}

export class FlatTileLayer {
  name: string
  version: number
  extent: number
  length: number

  private _data: FlatLayer

  constructor(data: FlatLayer) {
    this._data = data
    this.name = data.name
    this.version = data.version
    this.extent = data.extent
    this.length = data.types.length
  }

  feature(i: number): FlatTileFeature {
    if (i < 0 || i >= this.length)
      throw new Error(`feature index out of bounds: ${i}`)
    return new FlatTileFeature(this._data, i)
  }
}

export class FlatTile {
  layers: Record<string, FlatTileLayer>

  constructor(data: FlatTileData) {
    this.layers = {}
    for (const layer of data.layers)
      this.layers[layer.name] = new FlatTileLayer(layer)
  }
}
