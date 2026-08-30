// decodeMvtFlat — an MVT decoder that answers in typed arrays.
//
// This is deliberately a second decoder rather than a reuse of `Pbf` +
// `VectorTile`, for two reasons.
//
// **It has to survive being turned into a string.** WorkerPool ships its
// handlers by stringifying them into an inline worker, so anything a handler
// reaches for through an import is simply not there when it runs. This
// function closes over nothing at all — no imports, no module constants, no
// sibling helpers — which is a property the file is written to preserve, not
// an accident. Adding an import here breaks decoding in the worker while
// leaving every main-thread test passing, so don't.
//
// **It decodes to a different shape.** The output is flat typed arrays whose
// buffers are transferred to the main thread rather than copied. That is the
// entire point of the exercise: a tile decoded into `{x, y}` objects is
// hundreds of thousands of allocations that structured-clone must then walk
// and rebuild, which costs more than the decode it was meant to save. Moving
// work to a worker only helps when what crosses the boundary is cheap.
//
// Geometry stays lazy on the far side. The layout below is the tile's own —
// shared key and value tables, features as indices into them — so the main
// thread materialises a feature's points and properties when something asks
// for them, exactly as the Pbf path does.
//
// `test/mvt-flat.test.ts` decodes the same fixtures both ways and asserts the
// results match, which is what keeps the duplication honest.

export interface FlatLayer {
  name: string
  version: number
  extent: number
  /** Shared property-key table; `tags` indexes into it. */
  keys: string[]
  /** Shared property-value table. */
  values: Array<string | number | boolean | null>
  /** Feature ids; `NaN` where the tile gave none. */
  ids: Float64Array
  /** MVT geometry type per feature: 0 unknown, 1 point, 2 line, 3 polygon. */
  types: Uint8Array
  /** Feature `f` owns `tags[tagStart[f] .. tagStart[f + 1]]`, as key/value pairs. */
  tagStart: Uint32Array
  tags: Uint32Array
  /** Feature `f` owns rings `ringStart[f] .. ringStart[f + 1]`. */
  ringStart: Uint32Array
  /** Ring `r` covers points `ringOffset[r] .. ringOffset[r + 1]`. */
  ringOffset: Uint32Array
  /** Interleaved x, y in tile units. */
  coords: Int32Array
}

export interface FlatTile {
  layers: FlatLayer[]
}

/** Every ArrayBuffer in a decoded tile, for a `postMessage` transfer list. */
export function flatTileBuffers(tile: FlatTile): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = []
  for (const layer of tile.layers) {
    buffers.push(
      layer.ids.buffer as ArrayBuffer,
      layer.types.buffer as ArrayBuffer,
      layer.tagStart.buffer as ArrayBuffer,
      layer.tags.buffer as ArrayBuffer,
      layer.ringStart.buffer as ArrayBuffer,
      layer.ringOffset.buffer as ArrayBuffer,
      layer.coords.buffer as ArrayBuffer,
    )
  }
  return buffers
}

/**
 * Decode a `.pbf` tile into flat arrays.
 *
 * Self-contained by construction — see the note at the top of the file.
 */
export function decodeMvtFlat(bytes: Uint8Array): FlatTile {
  const buf = bytes
  const len = buf.length
  let pos = 0

  const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null

  function readVarint(isSigned?: boolean): number {
    let byte = buf[pos++]
    let value = byte & 0x7F
    if (byte < 0x80)
      return value
    byte = buf[pos++]
    value |= (byte & 0x7F) << 7
    if (byte < 0x80)
      return value
    byte = buf[pos++]
    value |= (byte & 0x7F) << 14
    if (byte < 0x80)
      return value
    byte = buf[pos++]
    value |= (byte & 0x7F) << 21
    if (byte < 0x80)
      return value

    // Past 28 bits a varint no longer fits the 32-bit shift space, so the
    // upper half is accumulated separately. Same arithmetic as the Pbf
    // reader, deliberately: the two decoders must agree on every value,
    // including negative int64 properties, which is the only reason the
    // signed path exists here at all.
    let high = 0
    byte = buf[pos++]
    value |= (byte & 0x0F) << 28
    high = (byte & 0x70) >> 4
    if (byte < 0x80)
      return toNum(value, high, isSigned === true)

    const shifts = [3, 10, 17, 24]
    for (const shift of shifts) {
      byte = buf[pos++]
      high |= (byte & 0x7F) << shift
      if (byte < 0x80)
        return toNum(value, high, isSigned === true)
    }

    byte = buf[pos++]
    high |= (byte & 0x01) << 31
    if (byte < 0x80)
      return toNum(value, high, isSigned === true)

    throw new Error('Expected varint not more than 10 bytes')
  }

  function toNum(low: number, high: number, isSigned: boolean): number {
    const SHIFT_LEFT_32 = (1 << 16) * (1 << 16)
    if (isSigned && (high & 0x80000000) !== 0) {
      const negLow = (~low + 1) >>> 0
      let negHigh = (~high) >>> 0
      if (negLow === 0)
        negHigh = (negHigh + 1) >>> 0
      const mag = negHigh * SHIFT_LEFT_32 + negLow
      if (mag > Number.MAX_SAFE_INTEGER)
        throw new Error('Varint exceeds safe integer range')
      return -mag
    }
    const val = (high >>> 0) * SHIFT_LEFT_32 + (low >>> 0)
    if (val > Number.MAX_SAFE_INTEGER)
      throw new Error('Varint exceeds safe integer range')
    return val
  }

  function readSVarint(): number {
    const n = readVarint()
    return n % 2 === 1 ? (n + 1) / -2 : n / 2
  }

  function readString(end: number): string {
    const slice = buf.subarray(pos, end)
    pos = end
    if (textDecoder)
      return textDecoder.decode(slice)
    let out = ''
    for (let i = 0; i < slice.length; i++)
      out += String.fromCharCode(slice[i])
    return out
  }

  function readDouble(): number {
    const view = new DataView(buf.buffer, buf.byteOffset + pos, 8)
    pos += 8
    return view.getFloat64(0, true)
  }

  function readFloat(): number {
    const view = new DataView(buf.buffer, buf.byteOffset + pos, 4)
    pos += 4
    return view.getFloat32(0, true)
  }

  /** Step over a field whose contents we don't need. */
  function skip(wireType: number): void {
    if (wireType === 0) {
      while (buf[pos++] >= 0x80) { /* varint continuation */ }
    }
    else if (wireType === 2) {
      pos = readVarint() + pos
    }
    else if (wireType === 5) {
      pos += 4
    }
    else if (wireType === 1) {
      pos += 8
    }
    else {
      throw new Error(`Unimplemented wire type: ${wireType}`)
    }
  }

  function readValue(): string | number | boolean | null {
    const end = readVarint() + pos
    let value: string | number | boolean | null = null
    while (pos < end) {
      const key = readVarint()
      const tag = key >> 3
      const wire = key & 0x7
      if (tag === 1) {
        value = readString(readVarint() + pos)
      }
      else if (tag === 2) {
        value = readFloat()
      }
      else if (tag === 3) {
        value = readDouble()
      }
      else if (tag === 4) {
        value = readVarint(true)
      }
      else if (tag === 5) {
        value = readVarint()
      }
      else if (tag === 6) {
        value = readSVarint()
      }
      else if (tag === 7) {
        value = readVarint() !== 0
      }
      else {
        skip(wire)
      }
    }
    pos = end
    return value
  }

  const layers: FlatLayer[] = []

  while (pos < len) {
    const key = readVarint()
    const tag = key >> 3
    const wire = key & 0x7

    if (tag !== 3) {
      skip(wire)
      continue
    }

    const layerEnd = readVarint() + pos
    let name = ''
    let version = 1
    let extent = 4096
    const keys: string[] = []
    const values: Array<string | number | boolean | null> = []
    // Feature bodies are scanned in a second pass so the shared tables are
    // complete first — a tile is free to emit them after the features.
    const featureRanges: number[] = []

    while (pos < layerEnd) {
      const fkey = readVarint()
      const ftag = fkey >> 3
      const fwire = fkey & 0x7

      if (ftag === 15) {
        version = readVarint()
      }
      else if (ftag === 1) {
        name = readString(readVarint() + pos)
      }
      else if (ftag === 5) {
        extent = readVarint()
      }
      else if (ftag === 3) {
        keys.push(readString(readVarint() + pos))
      }
      else if (ftag === 4) {
        values.push(readValue())
      }
      else if (ftag === 2) {
        const featureEnd = readVarint() + pos
        featureRanges.push(pos, featureEnd)
        pos = featureEnd
      }
      else {
        skip(fwire)
      }
    }

    const count = featureRanges.length / 2
    const ids = new Float64Array(count)
    const types = new Uint8Array(count)
    const tagStart = new Uint32Array(count + 1)
    const ringStart = new Uint32Array(count + 1)
    const tags: number[] = []
    const ringOffset: number[] = [0]
    const coords: number[] = []

    for (let f = 0; f < count; f++) {
      const start = featureRanges[f * 2]
      const end = featureRanges[f * 2 + 1]
      pos = start

      ids[f] = Number.NaN
      tagStart[f] = tags.length
      ringStart[f] = ringOffset.length - 1

      let geometryStart = -1
      let geometryEnd = -1

      while (pos < end) {
        const gkey = readVarint()
        const gtag = gkey >> 3
        const gwire = gkey & 0x7

        if (gtag === 1) {
          ids[f] = readVarint()
        }
        else if (gtag === 2) {
          const tagsEnd = readVarint() + pos
          while (pos < tagsEnd)
            tags.push(readVarint())
        }
        else if (gtag === 3) {
          types[f] = readVarint()
        }
        else if (gtag === 4) {
          geometryEnd = readVarint() + pos
          geometryStart = pos
          pos = geometryEnd
        }
        else {
          skip(gwire)
        }
      }

      if (geometryStart < 0)
        continue

      pos = geometryStart
      let cmd = 1
      let length = 0
      let x = 0
      let y = 0
      let ringPoints = 0
      let ringFirstX = 0
      let ringFirstY = 0
      let inRing = false

      while (pos < geometryEnd) {
        if (length <= 0) {
          const cmdLen = readVarint()
          cmd = cmdLen & 0x7
          length = cmdLen >> 3
        }
        length--

        if (cmd === 1 || cmd === 2) {
          const zx = readVarint()
          const zy = readVarint()
          x += (zx >> 1) ^ (-(zx & 1))
          y += (zy >> 1) ^ (-(zy & 1))

          if (cmd === 1) {
            if (inRing)
              ringOffset.push(coords.length / 2)
            inRing = true
            ringPoints = 0
          }
          if (!inRing) {
            // LineTo with no MoveTo before it. Malformed, but the Pbf path
            // tolerates it by opening a ring, so match that rather than
            // dropping the feature.
            inRing = true
            ringPoints = 0
          }
          if (ringPoints === 0) {
            ringFirstX = x
            ringFirstY = y
          }
          coords.push(x, y)
          ringPoints++
        }
        else if (cmd === 7) {
          if (inRing && ringPoints > 0) {
            coords.push(ringFirstX, ringFirstY)
            ringPoints++
          }
        }
        else {
          throw new Error(`Unknown geometry command id: ${cmd}`)
        }
      }

      if (inRing)
        ringOffset.push(coords.length / 2)

      if (length > 0)
        throw new Error(`Truncated geometry: ${length} coordinate pair(s) missing`)
    }

    tagStart[count] = tags.length
    ringStart[count] = ringOffset.length - 1
    pos = layerEnd

    if (name.length === 0)
      continue

    layers.push({
      name,
      version,
      extent,
      keys,
      values,
      ids,
      types,
      tagStart,
      tags: new Uint32Array(tags),
      ringStart,
      ringOffset: new Uint32Array(ringOffset),
      coords: new Int32Array(coords),
    })
  }

  return { layers }
}
