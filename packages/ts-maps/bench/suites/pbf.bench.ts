/**
 * PBF benches — decoder / encoder throughput at shapes that matter for
 * Mapbox Vector Tile parsing.
 *
 * The MVT fixture mirrors the shape built by `test/pbf.test.ts` but
 * is scaled up (100 features × 50 coordinates each) to measure
 * steady-state parse throughput rather than per-call overhead.
 */

import type { BenchmarkResult } from '../runner'
import { Pbf } from '../../src/core-map/proto'
import { runBenchmark } from '../runner'

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
const MVT_GEOM_LINETO = 2
const MVT_GEOM_TYPE_LINESTRING = 2

function encodeCommand(cmd: number, count: number): number {
  return (cmd & 0x7) | (count << 3)
}

function encodeZigzag(n: number): number {
  return n < 0 ? -n * 2 - 1 : n * 2
}

/**
 * Build a larger-than-life MVT fixture: a single layer with `numFeatures`
 * LineString features, each carrying `coordsPerFeature` coordinates.
 *
 * The geometry is a synthetic sawtooth so the varint lengths vary and
 * we exercise the multi-byte decode path, not the trivial zero path.
 */
function buildMvtFixture(numFeatures: number, coordsPerFeature: number): Uint8Array {
  const tilePbf = new Pbf()

  tilePbf.writeMessage(MVT_TILE_TAG_LAYERS, (_v, layerPbf) => {
    layerPbf.writeVarintField(MVT_LAYER_TAG_VERSION, 2)
    layerPbf.writeStringField(MVT_LAYER_TAG_NAME, 'bench-layer')
    layerPbf.writeVarintField(MVT_LAYER_TAG_EXTENT, 4096)

    for (let f = 0; f < numFeatures; f++) {
      layerPbf.writeMessage(MVT_LAYER_TAG_FEATURES, (_v2, featurePbf) => {
        featurePbf.writeVarintField(MVT_FEATURE_TAG_ID, f + 1)
        featurePbf.writeVarintField(MVT_FEATURE_TAG_TYPE, MVT_GEOM_TYPE_LINESTRING)

        // MoveTo(1) + LineTo(coordsPerFeature - 1)
        const geom: number[] = []
        geom.push(encodeCommand(MVT_GEOM_MOVETO, 1))
        geom.push(encodeZigzag(10))
        geom.push(encodeZigzag(20))
        geom.push(encodeCommand(MVT_GEOM_LINETO, coordsPerFeature - 1))
        for (let i = 1; i < coordsPerFeature; i++) {
          // Varying deltas so varints span multiple byte lengths.
          geom.push(encodeZigzag((i * 17) % 500 - 250))
          geom.push(encodeZigzag((i * 31) % 500 - 250))
        }

        featurePbf.writePackedVarint(MVT_FEATURE_TAG_GEOMETRY, geom)
        featurePbf.writePackedVarint(MVT_FEATURE_TAG_TAGS, [])
      }, undefined)
    }
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

export function runPbfSuite(): BenchmarkResult[] {
  const results: BenchmarkResult[] = []

  // 1) Packed-varint round trip — ~1 KB of MVT-style geometry stream.
  //    256 packed varints of varying length roughly yields >1 KB encoded.
  const packedValues: number[] = []
  for (let i = 0; i < 256; i++)
    packedValues.push(encodeZigzag((i * 37) % 500 - 250))

  results.push(runBenchmark(
    'pbf.packed-varint-1kb-roundtrip',
    () => ({ values: packedValues }),
    (ctx) => {
      const w = new Pbf()
      w.writePackedVarint(1, ctx.values)
      const buf = w.finish()
      const r = new Pbf(buf)
      const acc: number[] = []
      r.readFields((_tag, dst, p) => p.readPackedVarint(dst), acc)
    },
  ))

  // 2) Full MVT decode — 100 features, 50 coords each — per iteration.
  //    This is the steady-state parse throughput number.
  const mvtBuf = buildMvtFixture(100, 50)
  results.push(runBenchmark(
    'pbf.mvt-decode-100features-50coords',
    () => ({ buf: mvtBuf }),
    (ctx) => {
      const pbf = new Pbf(ctx.buf)
      const tile: MvtTile = { layers: [] }
      pbf.readFields(readTile, tile)
    },
    // Heavier bench — lower the iteration cap so we don't over-run.
    { iterations: 20_000 },
  ))

  // 3) Nested message round trip — a ~500 byte payload in a single
  //    sub-message, exercising the length-prefix realloc path.
  const payload500 = 'x'.repeat(500)
  results.push(runBenchmark(
    'pbf.nested-message-500b-roundtrip',
    () => ({ payload: payload500 }),
    (ctx) => {
      const w = new Pbf()
      w.writeMessage(1, (v, p) => p.writeStringField(2, v), ctx.payload)
      const buf = w.finish()
      const r = new Pbf(buf)
      r.readFields((tag, _dst, p) => {
        if (tag === 1) {
          p.readMessage((innerTag, _inner, ip) => {
            if (innerTag === 2)
              ip.readString()
          }, {})
        }
      }, {})
    },
  ))

  return results
}
