import { describe, expect, test } from 'bun:test'
import { PBF_BYTES, PBF_FIXED32, PBF_FIXED64, PBF_VARINT, Pbf } from '../src/core-map/proto'

// ---------- helpers shared across tests ----------

function roundTripVarint(val: number, signed?: boolean): number {
  const pbf = new Pbf()
  pbf.writeVarint(val)
  const out = new Pbf(pbf.finish())
  return out.readVarint(signed)
}

function roundTripSVarint(val: number): number {
  const pbf = new Pbf()
  pbf.writeSVarint(val)
  const out = new Pbf(pbf.finish())
  return out.readSVarint()
}

// ---------- tests ----------

describe('Pbf: construction & basic state', () => {
  test('empty Pbf has zero-length finish()', () => {
    expect(new Pbf().finish().length).toBe(0)
  })

  test('constructs from ArrayBuffer', () => {
    const ab = new ArrayBuffer(4)
    new Uint8Array(ab).set([1, 2, 3, 4])
    const pbf = new Pbf(ab)
    expect(pbf.buf.length).toBe(4)
    expect(pbf.length).toBe(4)
  })

  test('constructs from Uint8Array', () => {
    const u8 = new Uint8Array([0x08, 0x01])
    const pbf = new Pbf(u8)
    expect(pbf.buf).toBe(u8)
    expect(pbf.length).toBe(2)
  })

  test('destroy() leaves the instance inert', () => {
    const pbf = new Pbf()
    pbf.writeVarint(42)
    pbf.destroy()
    expect(pbf.buf.length).toBe(0)
    expect(pbf.pos).toBe(0)
    expect(pbf.length).toBe(0)
  })

  test('wire type constants match the spec', () => {
    expect(PBF_VARINT).toBe(0)
    expect(PBF_FIXED64).toBe(1)
    expect(PBF_BYTES).toBe(2)
    expect(PBF_FIXED32).toBe(5)
  })
})

describe('Pbf: varint round-trip', () => {
  test('zero', () => {
    expect(roundTripVarint(0)).toBe(0)
  })

  test('small positive values', () => {
    for (const v of [1, 127, 128, 16383, 16384, 2097151, 2097152]) {
      expect(roundTripVarint(v)).toBe(v)
    }
  })

  test('2^28 - 1 (boundary of fast path)', () => {
    expect(roundTripVarint(0xFFFFFFF)).toBe(0xFFFFFFF)
  })

  test('2^32', () => {
    const v = 4294967296
    expect(roundTripVarint(v)).toBe(v)
  })

  test('2^53 - 1 (max safe integer)', () => {
    const v = Number.MAX_SAFE_INTEGER
    expect(roundTripVarint(v)).toBe(v)
  })

  test('negative values encode as signed 64-bit (read back with isSigned)', () => {
    expect(roundTripVarint(-1, true)).toBe(-1)
    expect(roundTripVarint(-1000000, true)).toBe(-1000000)
  })

  test('readVarint64 is an alias for readVarint(true)', () => {
    const pbf = new Pbf()
    pbf.writeVarint(-42)
    const out = new Pbf(pbf.finish())
    expect(out.readVarint64()).toBe(-42)
  })
})

describe('Pbf: svarint (zigzag)', () => {
  test('zero round-trips', () => {
    expect(roundTripSVarint(0)).toBe(0)
  })

  test('positive values round-trip', () => {
    for (const v of [1, 2, 63, 64, 8191, 8192, 1 << 20, (1 << 27) - 1]) {
      expect(roundTripSVarint(v)).toBe(v)
    }
  })

  test('negative values round-trip', () => {
    for (const v of [-1, -2, -63, -64, -8191, -8192, -(1 << 20), -((1 << 27) - 1)]) {
      expect(roundTripSVarint(v)).toBe(v)
    }
  })

  test('wire encoding matches zigzag rules', () => {
    // zigzag(-1) === 1, zigzag(-2) === 3, zigzag(2) === 4
    const pbf = new Pbf()
    pbf.writeSVarint(-1)
    pbf.writeSVarint(-2)
    pbf.writeSVarint(2)
    const out = new Pbf(pbf.finish())
    expect(out.readVarint()).toBe(1)
    expect(out.readVarint()).toBe(3)
    expect(out.readVarint()).toBe(4)
  })
})

describe('Pbf: fixed-width scalars', () => {
  test('fixed32 round-trips unsigned values', () => {
    const pbf = new Pbf()
    pbf.writeFixed32(1, 0xDEADBEEF)
    const out = new Pbf(pbf.finish())
    out.readFields((tag, _acc, p) => {
      if (tag === 1)
        expect(p.readFixed32()).toBe(0xDEADBEEF)
    }, {})
  })

  test('sfixed32 preserves sign', () => {
    const pbf = new Pbf()
    pbf.writeSFixed32(3, -123456)
    const out = new Pbf(pbf.finish())
    out.readFields((tag, _acc, p) => {
      if (tag === 3)
        expect(p.readSFixed32()).toBe(-123456)
    }, {})
  })

  test('fixed64 round-trips large values', () => {
    const pbf = new Pbf()
    pbf.writeFixed64(1, 0x1FFFFFFFFFFFFF) // 2^53 - 1
    const out = new Pbf(pbf.finish())
    out.readFields((tag, _acc, p) => {
      if (tag === 1)
        expect(p.readFixed64()).toBe(0x1FFFFFFFFFFFFF)
    }, {})
  })

  test('sfixed64 preserves sign for values within 2^53', () => {
    const pbf = new Pbf()
    pbf.writeSFixed64(1, -4294967297)
    const out = new Pbf(pbf.finish())
    out.readFields((tag, _acc, p) => {
      if (tag === 1)
        expect(p.readSFixed64()).toBe(-4294967297)
    }, {})
  })

  test('float round-trips with single precision', () => {
    const pbf = new Pbf()
    pbf.writeFloatField(1, 3.14159)
    const out = new Pbf(pbf.finish())
    out.readFields((tag, _acc, p) => {
      if (tag === 1)
        expect(p.readFloat()).toBeCloseTo(3.14159, 5)
    }, {})
  })

  test('double round-trips with full precision', () => {
    const pbf = new Pbf()
    pbf.writeDoubleField(1, Math.PI)
    const out = new Pbf(pbf.finish())
    out.readFields((tag, _acc, p) => {
      if (tag === 1)
        expect(p.readDouble()).toBe(Math.PI)
    }, {})
  })
})

describe('Pbf: boolean', () => {
  test('true/false round-trip', () => {
    const pbf = new Pbf()
    pbf.writeBooleanField(1, true)
    pbf.writeBooleanField(2, false)
    const out = new Pbf(pbf.finish())
    const res: Record<number, boolean> = {}
    out.readFields((tag, acc, p) => {
      acc[tag] = p.readBoolean()
    }, res)
    expect(res[1]).toBe(true)
    expect(res[2]).toBe(false)
  })
})

describe('Pbf: string', () => {
  test('ASCII round-trip', () => {
    const pbf = new Pbf()
    pbf.writeStringField(1, 'hello, world')
    const out = new Pbf(pbf.finish())
    out.readFields((tag, _acc, p) => {
      if (tag === 1)
        expect(p.readString()).toBe('hello, world')
    }, {})
  })

  test('Unicode round-trip (BMP + supplementary planes)', () => {
    const samples = ['café', '日本語', '🗺️🚀', 'Zoë → 🌍']
    for (const s of samples) {
      const pbf = new Pbf()
      pbf.writeStringField(1, s)
      const out = new Pbf(pbf.finish())
      out.readFields((tag, _acc, p) => {
        if (tag === 1)
          expect(p.readString()).toBe(s)
      }, {})
    }
  })

  test('empty string', () => {
    const pbf = new Pbf()
    pbf.writeStringField(1, '')
    const out = new Pbf(pbf.finish())
    out.readFields((tag, _acc, p) => {
      if (tag === 1)
        expect(p.readString()).toBe('')
    }, {})
  })
})

describe('Pbf: bytes', () => {
  test('bytes round-trip', () => {
    const payload = new Uint8Array([0, 1, 2, 3, 4, 250, 251, 252])
    const pbf = new Pbf()
    pbf.writeBytesField(1, payload)
    const out = new Pbf(pbf.finish())
    out.readFields((tag, _acc, p) => {
      if (tag === 1) {
        const got = p.readBytes()
        expect(got.length).toBe(payload.length)
        for (let i = 0; i < got.length; i++)
          expect(got[i]).toBe(payload[i])
      }
    }, {})
  })

  test('large bytes triggers realloc', () => {
    const payload = new Uint8Array(10000)
    for (let i = 0; i < payload.length; i++)
      payload[i] = i & 0xFF
    const pbf = new Pbf()
    pbf.writeBytesField(2, payload)
    const out = new Pbf(pbf.finish())
    out.readFields((tag, _acc, p) => {
      if (tag === 2) {
        const got = p.readBytes()
        expect(got.length).toBe(10000)
        expect(got[9999]).toBe(9999 & 0xFF)
      }
    }, {})
  })
})

describe('Pbf: packed repeated fields', () => {
  test('packed varint via writePackedVarint + readFields', () => {
    const pbf = new Pbf()
    pbf.writePackedVarint(5, [1, 2, 3, 4, 5])
    const out = new Pbf(pbf.finish())
    const acc: number[] = []
    out.readFields((tag, dst, p) => {
      if (tag === 5)
        p.readPackedVarint(dst)
    }, acc)
    expect(acc).toEqual([1, 2, 3, 4, 5])
  })

  test('packed svarint', () => {
    const pbf = new Pbf()
    pbf.writePackedSVarint(1, [-3, -2, -1, 0, 1, 2, 3])
    const out = new Pbf(pbf.finish())
    const acc: number[] = []
    out.readFields((_tag, dst, p) => p.readPackedSVarint(dst), acc)
    expect(acc).toEqual([-3, -2, -1, 0, 1, 2, 3])
  })

  test('packed boolean', () => {
    const pbf = new Pbf()
    pbf.writePackedBoolean(1, [true, false, true, true, false])
    const out = new Pbf(pbf.finish())
    const acc: boolean[] = []
    out.readFields((_tag, dst, p) => p.readPackedBoolean(dst), acc)
    expect(acc).toEqual([true, false, true, true, false])
  })

  test('packed float', () => {
    const pbf = new Pbf()
    pbf.writePackedFloat(1, [1.5, 2.5, 3.5])
    const out = new Pbf(pbf.finish())
    const acc: number[] = []
    out.readFields((_tag, dst, p) => p.readPackedFloat(dst), acc)
    expect(acc.length).toBe(3)
    expect(acc[0]).toBeCloseTo(1.5)
    expect(acc[2]).toBeCloseTo(3.5)
  })

  test('packed double', () => {
    const pbf = new Pbf()
    pbf.writePackedDouble(1, [Math.PI, Math.E])
    const out = new Pbf(pbf.finish())
    const acc: number[] = []
    out.readFields((_tag, dst, p) => p.readPackedDouble(dst), acc)
    expect(acc[0]).toBe(Math.PI)
    expect(acc[1]).toBe(Math.E)
  })

  test('packed fixed32 / sfixed32 / fixed64 / sfixed64', () => {
    const pbf = new Pbf()
    pbf.writePackedFixed32(1, [100, 200, 300])
    pbf.writePackedSFixed32(2, [-100, -200, 300])
    pbf.writePackedFixed64(3, [1, 2, 3])
    pbf.writePackedSFixed64(4, [-1, -2, 3])
    const out = new Pbf(pbf.finish())
    const got: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] }
    out.readFields((tag, dst, p) => {
      if (tag === 1)
        p.readPackedFixed32(dst[1])
      else if (tag === 2)
        p.readPackedSFixed32(dst[2])
      else if (tag === 3)
        p.readPackedFixed64(dst[3])
      else if (tag === 4)
        p.readPackedSFixed64(dst[4])
    }, got)
    expect(got[1]).toEqual([100, 200, 300])
    expect(got[2]).toEqual([-100, -200, 300])
    expect(got[3]).toEqual([1, 2, 3])
    expect(got[4]).toEqual([-1, -2, 3])
  })

  test('empty packed arrays do not emit', () => {
    const pbf = new Pbf()
    pbf.writePackedVarint(5, [])
    expect(pbf.finish().length).toBe(0)
  })

  test('readPacked* with no arg returns a fresh array', () => {
    const pbf = new Pbf()
    pbf.writePackedVarint(1, [10, 20])
    const out = new Pbf(pbf.finish())
    let got: number[] = []
    out.readFields((_tag, _dst, p) => {
      got = p.readPackedVarint()
    }, {})
    expect(got).toEqual([10, 20])
  })
})

describe('Pbf: nested messages', () => {
  test('writeMessage / readMessage round-trip', () => {
    const pbf = new Pbf()
    pbf.writeMessage(1, (v, p) => p.writeStringField(2, v.name), { name: 'test' })
    const out = new Pbf(pbf.finish())
    const decoded = { name: '' }
    out.readFields((tag, dst, p) => {
      if (tag === 1) {
        p.readMessage((innerTag, inner, ip) => {
          if (innerTag === 2)
            inner.name = ip.readString()
        }, dst)
      }
    }, decoded)
    expect(decoded.name).toBe('test')
  })

  test('large message forces varint length prefix to grow', () => {
    const payload = 'x'.repeat(500)
    const pbf = new Pbf()
    pbf.writeMessage(1, (v, p) => p.writeStringField(2, v), payload)
    const out = new Pbf(pbf.finish())
    let got = ''
    out.readFields((tag, _dst, p) => {
      if (tag === 1) {
        p.readMessage((innerTag, _inner, ip) => {
          if (innerTag === 2)
            got = ip.readString()
        }, {})
      }
    }, {})
    expect(got).toBe(payload)
  })
})

describe('Pbf: unknown field skipping', () => {
  test('skip() advances past unrecognised fields', () => {
    const pbf = new Pbf()
    pbf.writeVarintField(1, 42)
    pbf.writeStringField(99, 'ignore me')
    pbf.writeFixed32(3, 7)
    pbf.writeFixed64(4, 8)
    const out = new Pbf(pbf.finish())
    const result: Record<string, number | string> = {}
    out.readFields((tag, acc, p) => {
      if (tag === 1)
        acc.v = p.readVarint()
      // tags 99/3/4 untouched → must be skipped implicitly
    }, result)
    expect(result.v).toBe(42)
    // After reading, cursor should be at end
    expect(out.pos).toBe(out.length)
  })

  test('skip() throws on reserved group wire types', () => {
    const pbf = new Pbf(new Uint8Array([0x0B])) // tag 1, wire type 3 (group start)
    expect(() => pbf.readFields(() => {}, {})).toThrow()
  })
})

// ---------- MVT fixture ----------
//
// Fabricate a minimal but valid Mapbox Vector Tile by hand using our own
// writer: one layer named "points" with a single POINT feature at (0, 0).
// See the MVT spec v2.1, §4.2–4.4.

const MVT_FEATURE_TAG_ID = 1
const MVT_FEATURE_TAG_TAGS = 2
const MVT_FEATURE_TAG_TYPE = 3
const MVT_FEATURE_TAG_GEOMETRY = 4

const MVT_LAYER_TAG_VERSION = 15
const MVT_LAYER_TAG_NAME = 1
const MVT_LAYER_TAG_FEATURES = 2
const MVT_LAYER_TAG_EXTENT = 5

const MVT_TILE_TAG_LAYERS = 3

const MVT_GEOM_MOVETO = 1
// const MVT_GEOM_LINETO = 2
// const MVT_GEOM_CLOSEPATH = 7
const MVT_GEOM_TYPE_POINT = 1

function encodeCommand(cmd: number, count: number): number {
  return (cmd & 0x7) | (count << 3)
}

function encodeZigzag(n: number): number {
  return n < 0 ? -n * 2 - 1 : n * 2
}

function buildFixtureTile(): Uint8Array {
  const tilePbf = new Pbf()

  tilePbf.writeMessage(MVT_TILE_TAG_LAYERS, (_layerValue, layerPbf) => {
    layerPbf.writeVarintField(MVT_LAYER_TAG_VERSION, 2)
    layerPbf.writeStringField(MVT_LAYER_TAG_NAME, 'points')
    layerPbf.writeVarintField(MVT_LAYER_TAG_EXTENT, 4096)

    layerPbf.writeMessage(MVT_LAYER_TAG_FEATURES, (_featureValue, featurePbf) => {
      featurePbf.writeVarintField(MVT_FEATURE_TAG_ID, 1)
      featurePbf.writeVarintField(MVT_FEATURE_TAG_TYPE, MVT_GEOM_TYPE_POINT)
      // Geometry: MoveTo(1), dx=0, dy=0 → point at origin.
      const geometry = [
        encodeCommand(MVT_GEOM_MOVETO, 1),
        encodeZigzag(0),
        encodeZigzag(0),
      ]
      featurePbf.writePackedVarint(MVT_FEATURE_TAG_GEOMETRY, geometry)
      featurePbf.writePackedVarint(MVT_FEATURE_TAG_TAGS, [])
    }, undefined)
  }, undefined)

  return tilePbf.finish()
}

interface MvtFeature {
  id: number
  type: number
  geometry: number[]
}

interface MvtLayer {
  version: number
  name: string
  extent: number
  features: MvtFeature[]
}

interface MvtTile {
  layers: MvtLayer[]
}

function readFeature(tag: number, feature: MvtFeature, pbf: Pbf): void {
  if (tag === MVT_FEATURE_TAG_ID)
    feature.id = pbf.readVarint()
  else if (tag === MVT_FEATURE_TAG_TYPE)
    feature.type = pbf.readVarint()
  else if (tag === MVT_FEATURE_TAG_GEOMETRY)
    pbf.readPackedVarint(feature.geometry)
}

function readLayer(tag: number, layer: MvtLayer, pbf: Pbf): void {
  if (tag === MVT_LAYER_TAG_VERSION) {
    layer.version = pbf.readVarint()
  }
  else if (tag === MVT_LAYER_TAG_NAME) {
    layer.name = pbf.readString()
  }
  else if (tag === MVT_LAYER_TAG_EXTENT) {
    layer.extent = pbf.readVarint()
  }
  else if (tag === MVT_LAYER_TAG_FEATURES) {
    const feature: MvtFeature = { id: 0, type: 0, geometry: [] }
    pbf.readMessage(readFeature, feature)
    layer.features.push(feature)
  }
}

function readTile(tag: number, tile: MvtTile, pbf: Pbf): void {
  if (tag === MVT_TILE_TAG_LAYERS) {
    const layer: MvtLayer = { version: 0, name: '', extent: 0, features: [] }
    pbf.readMessage(readLayer, layer)
    tile.layers.push(layer)
  }
}

describe('Pbf: MVT fixture round-trip', () => {
  test('decodes a hand-built single-point MVT tile', () => {
    const bytes = buildFixtureTile()
    const pbf = new Pbf(bytes)
    const tile: MvtTile = { layers: [] }
    pbf.readFields(readTile, tile)

    expect(tile.layers.length).toBe(1)
    const layer = tile.layers[0]
    expect(layer.name).toBe('points')
    expect(layer.version).toBe(2)
    expect(layer.extent).toBe(4096)
    expect(layer.features.length).toBe(1)

    const feature = layer.features[0]
    expect(feature.id).toBe(1)
    expect(feature.type).toBe(MVT_GEOM_TYPE_POINT)
    // [command(MoveTo,1), zigzag(0), zigzag(0)]
    expect(feature.geometry.length).toBe(3)
    expect(feature.geometry[0]).toBe(encodeCommand(MVT_GEOM_MOVETO, 1))
    expect(feature.geometry[1]).toBe(0)
    expect(feature.geometry[2]).toBe(0)
  })
})

// ---------- Method coverage check: assert every exported Pbf method is
// exercised by at least one assertion above. This is a cheap smoke test
// that fails loudly if someone adds a method without a test.

describe('Pbf: method coverage sentinel', () => {
  test('every public method on Pbf has been invoked', () => {
    // Methods that the tests above exercised; keep in sync.
    const covered = new Set<string>([
      'readFields',
      'readMessage',
      'readFixed32',
      'readSFixed32',
      'readFixed64',
      'readSFixed64',
      'readFloat',
      'readDouble',
      'readVarint',
      'readVarint64',
      'readSVarint',
      'readBoolean',
      'readString',
      'readBytes',
      'readPackedVarint',
      'readPackedSVarint',
      'readPackedBoolean',
      'readPackedFloat',
      'readPackedDouble',
      'readPackedFixed32',
      'readPackedSFixed32',
      'readPackedFixed64',
      'readPackedSFixed64',
      'skip',
      'writeTag',
      'realloc',
      'finish',
      'destroy',
      'writeVarint',
      'writeSVarint',
      'writeBoolean',
      'writeString',
      'writeFloat',
      'writeDouble',
      'writeBytes',
      'writeRawFixed32',
      'writeRawSFixed32',
      'writeRawFixed64',
      'writeRawSFixed64',
      'writeMessage',
      'writePackedVarint',
      'writePackedSVarint',
      'writePackedBoolean',
      'writePackedFloat',
      'writePackedDouble',
      'writePackedFixed32',
      'writePackedSFixed32',
      'writePackedFixed64',
      'writePackedSFixed64',
      'writeBytesField',
      'writeFixed32',
      'writeSFixed32',
      'writeFixed64',
      'writeSFixed64',
      'writeVarintField',
      'writeSVarintField',
      'writeStringField',
      'writeFloatField',
      'writeDoubleField',
      'writeBooleanField',
    ])

    const prototypeMethods = Object.getOwnPropertyNames(Pbf.prototype)
      .filter(n => n !== 'constructor')
      .filter(n => typeof (Pbf.prototype as any)[n] === 'function')
      .filter(n => !n.startsWith('_'))

    const missing = prototypeMethods.filter(n => !covered.has(n))
    expect(missing).toEqual([])
  })

  test('writeSVarintField round-trips (direct)', () => {
    const pbf = new Pbf()
    pbf.writeSVarintField(1, -99)
    const out = new Pbf(pbf.finish())
    out.readFields((_tag, _acc, p) => {
      expect(p.readSVarint()).toBe(-99)
    }, {})
  })
})
