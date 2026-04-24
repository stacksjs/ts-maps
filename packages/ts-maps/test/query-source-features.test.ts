import { afterEach, describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'
import { Pbf } from '../src/core-map/proto/Pbf'
import { VectorTileMapLayer } from '../src/core-map'

// Re-use the fixture pattern from vector-tile-map-layer.test.ts — a minimal
// MVT tile with one layer and one polygon feature.
function zz(n: number): number { return (n << 1) ^ (n >> 31) }
function cmd(id: number, count: number): number { return (id & 0x7) | (count << 3) }

function clockwiseSquare(x0: number, y0: number, size: number): number[] {
  return [
    cmd(1, 1), zz(x0), zz(y0),
    cmd(2, 3),
    zz(size), zz(0),
    zz(0), zz(size),
    zz(-size), zz(0),
    cmd(7, 1),
  ]
}

function encodeMultiLayerTile(): Uint8Array {
  const pbf = new Pbf()
  // Layer 1: water — 1 feature
  pbf.writeMessage(3, (_, p) => {
    p.writeVarintField(15, 2)
    p.writeStringField(1, 'water')
    p.writeMessage(2, (_, q) => {
      q.writePackedVarint(2, [0, 0])
      q.writeVarintField(3, 3)
      q.writePackedVarint(4, clockwiseSquare(500, 500, 1000))
    }, null)
    p.writeStringField(3, 'name')
    p.writeMessage(4, (_, q) => { q.writeStringField(1, 'Lake A') }, null)
    p.writeVarintField(5, 4096)
  }, null)
  // Layer 2: roads — 2 features
  pbf.writeMessage(3, (_, p) => {
    p.writeVarintField(15, 2)
    p.writeStringField(1, 'roads')
    p.writeMessage(2, (_, q) => {
      q.writePackedVarint(2, [0, 0])
      q.writeVarintField(3, 3)
      q.writePackedVarint(4, clockwiseSquare(100, 100, 100))
    }, null)
    p.writeMessage(2, (_, q) => {
      q.writePackedVarint(2, [0, 1])
      q.writeVarintField(3, 3)
      q.writePackedVarint(4, clockwiseSquare(2000, 2000, 100))
    }, null)
    p.writeStringField(3, 'class')
    p.writeMessage(4, (_, q) => { q.writeStringField(1, 'primary') }, null)
    p.writeMessage(4, (_, q) => { q.writeStringField(1, 'secondary') }, null)
    p.writeVarintField(5, 4096)
  }, null)
  return pbf.finish()
}

function createContainer(): HTMLElement {
  const c = document.createElement('div')
  c.style.width = '512px'
  c.style.height = '512px'
  document.body.appendChild(c)
  return c
}

function stampSize(map: TsMap, w: number, h: number): void {
  map._size = new Point(w, h)
  map._sizeChanged = false
  if (map._loaded && map._lastCenter)
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
}

function installFetchStub(handler: (url: string) => Promise<Response>): () => void {
  const original = globalThis.fetch
  globalThis.fetch = ((url: any) => handler(String(url))) as typeof fetch
  return () => { globalThis.fetch = original }
}

function responseFrom(bytes: Uint8Array, init?: ResponseInit): Response {
  return new Response(bytes as unknown as BodyInit, init)
}

function tileCoords(x: number, y: number, z: number): Point & { z: number } {
  const p = new Point(x, y) as Point & { z: number }
  p.z = z
  return p
}

function attachLayerForCreateTile(layer: VectorTileMapLayer, map: TsMap): void {
  layer._map = map
  layer._tiles = {}
}

describe('VectorTileMapLayer.querySourceFeatures', () => {
  let restoreFetch: (() => void) | undefined
  afterEach(() => { restoreFetch?.(); restoreFetch = undefined })

  test('returns every feature from every source-layer with no filter', async () => {
    const bytes = encodeMultiLayerTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)
    const layer = new VectorTileMapLayer({ url: 'https://tiles/{z}/{x}/{y}.pbf', tileSize: 512 })
    attachLayerForCreateTile(layer, map)

    await new Promise<void>((resolve) => {
      layer.createTile(tileCoords(0, 0, 4), () => resolve())
    })

    const all = layer.querySourceFeatures()
    // 1 water + 2 roads = 3 features across 2 source-layers.
    expect(all.length).toBe(3)
    const layers = new Set(all.map(r => r.sourceLayer))
    expect(layers.has('water')).toBe(true)
    expect(layers.has('roads')).toBe(true)
  })

  test('sourceLayer option restricts results', async () => {
    const bytes = encodeMultiLayerTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)
    const layer = new VectorTileMapLayer({ url: 'https://tiles/{z}/{x}/{y}.pbf', tileSize: 512 })
    attachLayerForCreateTile(layer, map)

    await new Promise<void>((resolve) => {
      layer.createTile(tileCoords(0, 0, 4), () => resolve())
    })

    const roads = layer.querySourceFeatures({ sourceLayer: 'roads' })
    expect(roads.length).toBe(2)
    expect(roads.every(r => r.sourceLayer === 'roads')).toBe(true)
  })

  test('filter expression narrows results', async () => {
    const bytes = encodeMultiLayerTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)
    const layer = new VectorTileMapLayer({ url: 'https://tiles/{z}/{x}/{y}.pbf', tileSize: 512 })
    attachLayerForCreateTile(layer, map)

    await new Promise<void>((resolve) => {
      layer.createTile(tileCoords(0, 0, 4), () => resolve())
    })

    const primary = layer.querySourceFeatures({
      sourceLayer: 'roads',
      filter: ['==', ['get', 'class'], 'primary'],
    })
    expect(primary.length).toBe(1)
    expect(primary[0].feature.properties.class).toBe('primary')
  })
})

describe('TsMap.querySourceFeatures', () => {
  test('returns [] when no style is loaded', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    expect(map.querySourceFeatures('nope')).toEqual([])
  })

  test('returns [] when the source id is unknown', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    map.setStyle({ version: 8, sources: {}, layers: [] })
    expect(map.querySourceFeatures('nope')).toEqual([])
  })
})
