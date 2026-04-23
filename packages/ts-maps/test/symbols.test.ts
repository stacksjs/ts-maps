import { afterEach, describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'
import { Pbf } from '../src/core-map/proto/Pbf'
import { VectorTileMapLayer } from '../src/core-map'

// ---------------------------------------------------------------------------
// Fixture helpers — fabricate a single-point MVT tile via Pbf writer. Mirrors
// `test/vector-tile-map-layer.test.ts` but produces a Point feature so we can
// exercise the symbol draw path.
// ---------------------------------------------------------------------------

function zz(n: number): number {
  return (n << 1) ^ (n >> 31)
}

function cmd(id: number, count: number): number {
  return (id & 0x7) | (count << 3)
}

function pointGeom(x: number, y: number): number[] {
  // MoveTo 1 with a single zigzag pair.
  return [cmd(1, 1), zz(x), zz(y)]
}

function writeLayer(
  pbf: Pbf,
  name: string,
  keys: string[],
  values: string[],
  features: { tags: number[], type: 1 | 2 | 3, geometry: number[] }[],
  extent = 4096,
): void {
  pbf.writeVarintField(15, 2)
  pbf.writeStringField(1, name)

  for (const f of features) {
    pbf.writeMessage(2, (feat, p) => {
      if (feat.tags.length > 0)
        p.writePackedVarint(2, feat.tags)
      p.writeVarintField(3, feat.type)
      if (feat.geometry.length > 0)
        p.writePackedVarint(4, feat.geometry)
    }, f)
  }

  for (const k of keys)
    pbf.writeStringField(3, k)
  for (const v of values) {
    pbf.writeMessage(4, (val, p) => { p.writeStringField(1, val) }, v)
  }

  pbf.writeVarintField(5, extent)
}

function encodePlacesTile(): Uint8Array {
  const pbf = new Pbf()
  pbf.writeMessage(3, (_, p) => {
    writeLayer(p, 'places', ['name'], ['City-A'], [
      {
        tags: [0, 0],
        type: 1,
        geometry: pointGeom(2048, 2048),
      },
    ])
  }, null)
  return pbf.finish()
}

function createContainer(): HTMLElement {
  const container = document.createElement('div')
  container.style.width = '512px'
  container.style.height = '512px'
  document.body.appendChild(container)
  return container
}

function stampSize(map: TsMap, width: number, height: number): void {
  map._size = new Point(width, height)
  map._sizeChanged = false
  if (map._loaded && map._lastCenter)
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
}

function attachLayerForCreateTile(layer: VectorTileMapLayer, map: TsMap): void {
  layer._map = map
  layer._tiles = {}
}

function installFetchStub(handler: (url: string) => Promise<Response>): () => void {
  const original = globalThis.fetch
  globalThis.fetch = ((url: any) => handler(String(url))) as typeof fetch
  return () => { globalThis.fetch = original }
}

function responseFrom(bytes: Uint8Array, init?: ResponseInit): Response {
  return new Response(bytes as unknown as BodyInit, init)
}

// Spy: wrap the shared drawImage on the tile canvas' context so we can see
// that glyph compositing actually fired.
interface DrawCounts {
  drawImage: number
  fillText: number
}

function spyOnCanvas(canvas: HTMLCanvasElement): DrawCounts {
  const counts: DrawCounts = { drawImage: 0, fillText: 0 }
  const ctx = canvas.getContext('2d') as any
  if (!ctx)
    return counts

  const wrap = (key: keyof DrawCounts): void => {
    const orig = ctx[key]
    if (typeof orig !== 'function')
      return
    ctx[key] = function spied(...args: any[]): any {
      counts[key]++
      return orig.apply(ctx, args)
    }
  }
  wrap('drawImage')
  wrap('fillText')
  return counts
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VectorTileMapLayer: symbol layers', () => {
  let restoreFetch: (() => void) | undefined
  afterEach(() => { restoreFetch?.(); restoreFetch = undefined })

  test('symbol layer with a literal text-field draws text via the glyph atlas', async () => {
    const bytes = encodePlacesTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [
        {
          id: 'place-labels',
          type: 'symbol',
          sourceLayer: 'places',
          layout: { 'text-field': 'hi', 'text-size': 14 },
          paint: { 'text-color': '#111' },
        },
      ],
    })
    attachLayerForCreateTile(layer, map)

    const coords = new Point(0, 0) as Point & { z: number }
    coords.z = 4
    let resolveDone: (r: { err: any }) => void = () => {}
    const ready = new Promise<{ err: any }>((r) => { resolveDone = r })
    const canvas = layer.createTile(coords, (err) => resolveDone({ err })) as HTMLCanvasElement
    layer._tiles!['0:0:4'] = { el: canvas, coords, current: true } as any
    const counts = spyOnCanvas(canvas)

    const { err } = await ready
    expect(err).toBeNull()

    // The glyph atlas composites via ctx.drawImage — one call per glyph.
    expect(counts.drawImage).toBeGreaterThanOrEqual(1)
  })

  test("symbol layer with `['get', 'name']` resolves against feature properties", async () => {
    const bytes = encodePlacesTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [
        {
          id: 'place-labels',
          type: 'symbol',
          sourceLayer: 'places',
          layout: { 'text-field': ['get', 'name'], 'text-size': 14 },
          paint: { 'text-color': '#111' },
        },
      ],
    })
    attachLayerForCreateTile(layer, map)

    const coords = new Point(0, 0) as Point & { z: number }
    coords.z = 4
    let resolveDone: (r: { err: any }) => void = () => {}
    const ready = new Promise<{ err: any }>((r) => { resolveDone = r })
    const canvas = layer.createTile(coords, (err) => resolveDone({ err })) as HTMLCanvasElement
    layer._tiles!['0:0:4'] = { el: canvas, coords, current: true } as any
    const counts = spyOnCanvas(canvas)

    const { err } = await ready
    expect(err).toBeNull()
    expect(counts.drawImage).toBeGreaterThanOrEqual(1)
  })

  test('getGlyphAtlas is lazy and stable across calls', () => {
    const layer = new VectorTileMapLayer({ url: '' })
    const a = layer.getGlyphAtlas()
    const b = layer.getGlyphAtlas()
    expect(a).toBe(b)
  })

  test('getIconAtlas is lazy and stable across calls', () => {
    const layer = new VectorTileMapLayer({ url: '' })
    const a = layer.getIconAtlas()
    const b = layer.getIconAtlas()
    expect(a).toBe(b)
  })
})
