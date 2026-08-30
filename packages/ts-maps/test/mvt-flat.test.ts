import { describe, expect, test } from 'bun:test'
import { FlatTile } from '../src/core-map/mvt/FlatTile'
import { VectorTile } from '../src/core-map/mvt/VectorTile'
import { Pbf } from '../src/core-map/proto/Pbf'
import { decodeMvtFlat } from '../src/core-map/workers/decodeMvtFlat'

// `decodeMvtFlat` is a second decoder, kept separate because it has to
// survive being stringified into a worker and because it answers in typed
// arrays. Two decoders is a liability unless something holds them to the same
// answers, which is what this file is: every case is decoded both ways and
// the results compared.

function cmd(id: number, count: number): number {
  return (id & 0x7) | (count << 3)
}

function zz(n: number): number {
  return (n << 1) ^ (n >> 31)
}

interface FeatureSpec {
  id?: number
  type: number
  tags?: number[]
  geometry: number[]
}

/** Encode one layer into a tile, both decoders' input. */
function buildTile(layers: Array<{
  name: string
  extent?: number
  keys?: string[]
  values?: Array<string | number | boolean>
  features: FeatureSpec[]
}>): Uint8Array {
  const pbf = new Pbf()
  for (const layer of layers) {
    pbf.writeMessage(3, (_, p) => {
      p.writeVarintField(15, 2)
      p.writeStringField(1, layer.name)
      for (const feature of layer.features) {
        p.writeMessage(2, (_f, q) => {
          if (feature.id !== undefined)
            q.writeVarintField(1, feature.id)
          if (feature.tags?.length)
            q.writePackedVarint(2, feature.tags)
          q.writeVarintField(3, feature.type)
          q.writePackedVarint(4, feature.geometry)
        }, null)
      }
      for (const key of layer.keys ?? [])
        p.writeStringField(3, key)
      for (const value of layer.values ?? []) {
        p.writeMessage(4, (_v, q) => {
          if (typeof value === 'string')
            q.writeStringField(1, value)
          else if (typeof value === 'boolean')
            q.writeBooleanField(7, value)
          else if (Number.isInteger(value) && value < 0)
            q.writeSVarintField(6, value)
          else if (Number.isInteger(value))
            q.writeVarintField(5, value)
          else
            q.writeDoubleField(3, value)
        }, null)
      }
      p.writeVarintField(5, layer.extent ?? 4096)
    }, null)
  }
  return pbf.finish()
}

/** Everything a renderer can ask a tile for, as comparable plain data. */
function summarise(tile: { layers: Record<string, any> }): unknown {
  const out: Record<string, unknown> = {}
  for (const name of Object.keys(tile.layers).sort()) {
    const layer = tile.layers[name]
    const features = []
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i)
      features.push({
        id: f.id,
        type: f.type,
        extent: f.extent,
        properties: f.properties,
        geometry: f.loadGeometry().map((ring: any[]) => ring.map(p => [p.x, p.y])),
        bbox: f.bbox(),
        geojson: f.toGeoJSON(3, 5, 4),
      })
    }
    out[name] = { extent: layer.extent, length: layer.length, features }
  }
  return out
}

function bothWays(bytes: Uint8Array): { pbf: unknown, flat: unknown } {
  return {
    pbf: summarise(new VectorTile(new Pbf(bytes))),
    flat: summarise(new FlatTile(decodeMvtFlat(bytes))),
  }
}

describe('decodeMvtFlat', () => {
  test('agrees with the Pbf decoder on a point layer', () => {
    const bytes = buildTile([{
      name: 'poi',
      keys: ['name', 'rank'],
      values: ['Pier', 3],
      features: [
        { id: 7, type: 1, tags: [0, 0, 1, 1], geometry: [cmd(1, 1), zz(100), zz(200)] },
        { id: 8, type: 1, tags: [0, 0], geometry: [cmd(1, 1), zz(-50), zz(4200)] },
      ],
    }])
    const { pbf, flat } = bothWays(bytes)
    expect(flat).toEqual(pbf)
  })

  test('agrees on multi-ring polygons, including ClosePath', () => {
    const bytes = buildTile([{
      name: 'building',
      features: [{
        type: 3,
        geometry: [
          // Outer ring.
          cmd(1, 1),
          zz(0),
          zz(0),
          cmd(2, 3),
          zz(10),
          zz(0),
          zz(0),
          zz(10),
          zz(-10),
          zz(0),
          cmd(7, 1),
          // Inner ring.
          cmd(1, 1),
          zz(2),
          zz(-8),
          cmd(2, 3),
          zz(4),
          zz(0),
          zz(0),
          zz(4),
          zz(-4),
          zz(0),
          cmd(7, 1),
        ],
      }],
    }])
    const { pbf, flat } = bothWays(bytes)
    expect(flat).toEqual(pbf)
  })

  test('agrees on multi-linestrings', () => {
    const bytes = buildTile([{
      name: 'transportation',
      extent: 8192,
      keys: ['class'],
      values: ['primary'],
      features: [{
        type: 2,
        tags: [0, 0],
        geometry: [
          cmd(1, 1),
          zz(5),
          zz(5),
          cmd(2, 2),
          zz(20),
          zz(0),
          zz(0),
          zz(20),
          cmd(1, 1),
          zz(100),
          zz(100),
          cmd(2, 1),
          zz(-30),
          zz(10),
        ],
      }],
    }])
    const { pbf, flat } = bothWays(bytes)
    expect(flat).toEqual(pbf)
  })

  test('agrees on every property value type, negatives included', () => {
    const bytes = buildTile([{
      name: 'mixed',
      keys: ['s', 'd', 'i', 'neg', 'b'],
      values: ['text', 1.5, 42, -17, true],
      features: [{
        type: 1,
        tags: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4],
        geometry: [cmd(1, 1), zz(1), zz(1)],
      }],
    }])
    const { pbf, flat } = bothWays(bytes)
    expect(flat).toEqual(pbf)
  })

  test('agrees on a feature with no geometry', () => {
    const bytes = buildTile([{
      name: 'empty',
      features: [{ type: 1, geometry: [] }],
    }])
    const { pbf, flat } = bothWays(bytes)
    expect(flat).toEqual(pbf)
  })

  test('keeps layers separate and skips unnamed ones', () => {
    const bytes = buildTile([
      { name: 'a', features: [{ type: 1, geometry: [cmd(1, 1), zz(1), zz(2)] }] },
      { name: '', features: [{ type: 1, geometry: [cmd(1, 1), zz(3), zz(4)] }] },
      { name: 'b', features: [{ type: 1, geometry: [cmd(1, 1), zz(5), zz(6)] }] },
    ])
    const flat = decodeMvtFlat(bytes)
    expect(flat.layers.map(l => l.name)).toEqual(['a', 'b'])
    expect(bothWays(bytes).flat).toEqual(bothWays(bytes).pbf)
  })

  test('rejects an unknown geometry command', () => {
    const bytes = buildTile([{
      name: 'bad',
      features: [{ type: 1, geometry: [cmd(4, 1), zz(1), zz(2)] }],
    }])
    expect(() => decodeMvtFlat(bytes)).toThrow('Unknown geometry command')
  })

  test('materialises properties only when asked', () => {
    const bytes = buildTile([{
      name: 'poi',
      keys: ['name'],
      values: ['Pier'],
      features: [{ type: 1, tags: [0, 0], geometry: [cmd(1, 1), zz(1), zz(1)] }],
    }])
    const tile = new FlatTile(decodeMvtFlat(bytes))
    const feature = tile.layers.poi.feature(0)
    // Two reads hand back the same object rather than rebuilding it.
    expect(feature.properties).toBe(feature.properties)
    expect(feature.properties).toEqual({ name: 'Pier' })
  })

  test('feature index is bounds-checked', () => {
    const bytes = buildTile([{ name: 'a', features: [{ type: 1, geometry: [cmd(1, 1), zz(1), zz(1)] }] }])
    const tile = new FlatTile(decodeMvtFlat(bytes))
    expect(() => tile.layers.a.feature(1)).toThrow('out of bounds')
    expect(() => tile.layers.a.feature(-1)).toThrow('out of bounds')
  })
})
