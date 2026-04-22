// Mapbox Vector Tile (v2) layer — in-house, zero-dep.
// Inspired by mapbox/vector-tile-js (BSD-3-Clause) and the MVT spec.
// Independent TypeScript implementation.

import { Pbf } from '../proto/Pbf'
import { VectorTileFeature } from './VectorTileFeature'
import type { VectorTileValue } from './VectorTileFeature'

// Lazy-decoded MVT Layer message. Construction only scans the outer frame
// and records byte offsets for each Feature (tag 2) — individual features
// are materialized on demand by `.feature(i)`.
export class VectorTileLayer {
  version: number
  name: string
  extent: number
  length: number

  private _pbf: Pbf
  private _keys: string[]
  private _values: VectorTileValue[]
  private _features: number[]

  constructor(pbf: Pbf, end?: number) {
    this.version = 1
    this.name = ''
    this.extent = 4096
    this.length = 0
    this._pbf = pbf
    this._keys = []
    this._values = []
    this._features = []

    const endPos = end === undefined ? pbf.length : end

    while (pbf.pos < endPos) {
      const val = pbf.readVarint()
      const tag = val >> 3
      pbf.type = val & 0x7

      if (tag === 15) {
        this.version = pbf.readVarint()
      }
      else if (tag === 1) {
        this.name = pbf.readString()
      }
      else if (tag === 5) {
        this.extent = pbf.readVarint()
      }
      else if (tag === 2) {
        // Feature — record offset and skip the body.
        this._features.push(pbf.pos)
        const featureEnd = pbf.readVarint() + pbf.pos
        pbf.pos = featureEnd
      }
      else if (tag === 3) {
        this._keys.push(pbf.readString())
      }
      else if (tag === 4) {
        this._values.push(readValueMessage(pbf))
      }
      else {
        pbf.skip(val)
      }
    }

    this.length = this._features.length
  }

  feature(i: number): VectorTileFeature {
    if (i < 0 || i >= this._features.length)
      throw new Error(`feature index out of bounds: ${i}`)

    const pbf = this._pbf
    pbf.pos = this._features[i]
    const end = pbf.readVarint() + pbf.pos
    return new VectorTileFeature(pbf, end, this.extent, this._keys, this._values)
  }
}

// Decode a Value message (field tags per the MVT spec):
//   1: string_value   (string)
//   2: float_value    (float)
//   3: double_value   (double)
//   4: int_value      (int64)
//   5: uint_value     (uint64)
//   6: sint_value     (sint64)
//   7: bool_value     (bool)
function readValueMessage(pbf: Pbf): VectorTileValue {
  const msgEnd = pbf.readVarint() + pbf.pos
  let value: VectorTileValue = null

  while (pbf.pos < msgEnd) {
    const val = pbf.readVarint()
    const tag = val >> 3
    pbf.type = val & 0x7

    if (tag === 1)
      value = pbf.readString()
    else if (tag === 2)
      value = pbf.readFloat()
    else if (tag === 3)
      value = pbf.readDouble()
    else if (tag === 4)
      value = pbf.readVarint(true)
    else if (tag === 5)
      value = pbf.readVarint()
    else if (tag === 6)
      value = pbf.readSVarint()
    else if (tag === 7)
      value = pbf.readBoolean()
    else
      pbf.skip(val)
  }

  return value
}
