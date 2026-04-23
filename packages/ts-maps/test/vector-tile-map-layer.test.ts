import { afterEach, describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'
import { Pbf } from '../src/core-map/proto/Pbf'
import { VectorTileMapLayer, vectorTileLayer } from '../src/core-map'
import type { VectorTileStyleLayer } from '../src/core-map'

// ---------------------------------------------------------------------------
// Fixture helpers — fabricate an MVT tile body in-memory via the Pbf writer.
// The shape mirrors `packages/ts-maps/test/mvt.test.ts`; kept local so this
// file has no test-helper dependency outside the `src/core-map` public API.
// ---------------------------------------------------------------------------

function zz(n: number): number {
  return (n << 1) ^ (n >> 31)
}

function cmd(id: number, count: number): number {
  return (id & 0x7) | (count << 3)
}

// A clockwise square in tile-extent coordinates. Returns the packed command
// stream ready for field 4 of a Feature message.
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

// Write a single MVT layer message body (no outer tag — callers wrap it with
// `writeMessage(3, …)` to land it inside a Tile).
function writeLayer(
  pbf: Pbf,
  name: string,
  keys: string[],
  values: string[],
  features: { tags: number[], type: 1 | 2 | 3, geometry: number[] }[],
  extent = 4096,
): void {
  pbf.writeVarintField(15, 2) // version
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

// A tile with a single `water` layer holding one polygon that covers the
// middle of the tile (1000,1000) → (3000,3000) at extent 4096.
function encodeWaterTile(): Uint8Array {
  const pbf = new Pbf()
  pbf.writeMessage(3, (_, p) => {
    writeLayer(p, 'water', ['name'], ['Ocean'], [
      {
        tags: [0, 0],
        type: 3,
        geometry: clockwiseSquare(1000, 1000, 2000),
      },
    ])
  }, null)
  return pbf.finish()
}

// A tile with `count` tiny disjoint polygons arranged on a grid. Each
// feature has a unique `name` property ("cell-<i>") to verify that the
// right one is returned from a point query.
function encodeGridTile(count: number, cellSize = 100): Uint8Array {
  // Arrange cells on a square grid whose side fits within the 4096 extent.
  const side = Math.ceil(Math.sqrt(count))
  const stride = Math.floor((4096 - cellSize) / Math.max(side - 1, 1))

  const keys = ['name']
  const values: string[] = []
  const features: { tags: number[], type: 1 | 2 | 3, geometry: number[] }[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / side)
    const col = i % side
    const x0 = col * stride
    const y0 = row * stride
    values.push(`cell-${i}`)
    features.push({
      tags: [0, i],
      type: 3,
      geometry: clockwiseSquare(x0, y0, cellSize),
    })
  }

  const pbf = new Pbf()
  pbf.writeMessage(3, (_, p) => {
    writeLayer(p, 'cells', keys, values, features)
  }, null)
  return pbf.finish()
}

// ---------------------------------------------------------------------------
// Test container + size stamping (mirrors bearing.test.ts).
// ---------------------------------------------------------------------------

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

// Build a layer ready for direct `createTile` invocation. We bypass `addTo`
// because very-happy-dom's <canvas> doesn't expose the `classList` that
// GridLayer._initTile touches, so the normal tile-add pipeline can't run in
// this environment. Wiring `_map` + `_tiles` manually mirrors the state
// GridLayer would otherwise set up.
function attachLayerForCreateTile(layer: VectorTileMapLayer, map: TsMap): void {
  layer._map = map
  layer._tiles = {}
}

// ---------------------------------------------------------------------------
// Canvas spy. very-happy-dom treats `fill()`/`stroke()` as no-ops that don't
// reflect in any inspectable state, so we wrap the context's drawing methods
// with counters. Spying on the canvas *instance* (rather than the prototype)
// side-steps very-happy-dom's HTMLCanvasElement not populating its prototype.
// ---------------------------------------------------------------------------

interface CanvasSpyCounts {
  beginPath: number
  fill: number
  stroke: number
  arc: number
  moveTo: number
  lineTo: number
}

function spyOnCanvas(canvas: HTMLCanvasElement): CanvasSpyCounts {
  const counts: CanvasSpyCounts = { beginPath: 0, fill: 0, stroke: 0, arc: 0, moveTo: 0, lineTo: 0 }
  // Eagerly instantiate the underlying 2D context so we can wrap its methods
  // before `_drawTile` fetches it. Since very-happy-dom caches the context on
  // first call, any later `getContext('2d')` returns the same (spied) object.
  const ctx = canvas.getContext('2d') as any
  if (!ctx)
    return counts

  for (const key of Object.keys(counts) as (keyof CanvasSpyCounts)[]) {
    const orig = ctx[key]
    if (typeof orig !== 'function')
      continue
    ctx[key] = function spied(...args: any[]): any {
      counts[key]++
      return orig.apply(ctx, args)
    }
  }
  return counts
}

// Stub `globalThis.fetch` with a handler that returns a body or rejects.
function installFetchStub(handler: (url: string) => Promise<Response>): () => void {
  const original = globalThis.fetch
  globalThis.fetch = ((url: any) => handler(String(url))) as typeof fetch
  return () => { globalThis.fetch = original }
}

// TS's `Response` typings don't list `Uint8Array<ArrayBufferLike>` as a
// `BodyInit`, but every runtime (including Bun) accepts it. Route through a
// helper so the cast lives in exactly one place.
function responseFrom(bytes: Uint8Array, init?: ResponseInit): Response {
  return new Response(bytes as unknown as BodyInit, init)
}

// Drive a single tile creation through the layer. Returns the tile canvas
// and a promise that resolves (or rejects) when `done` fires.
function createTileOnLayer(
  layer: VectorTileMapLayer,
  coords: Point & { z: number },
): { canvas: HTMLCanvasElement, ready: Promise<{ err: any, tile: HTMLElement }> } {
  let resolveReady: (r: { err: any, tile: HTMLElement }) => void = () => {}
  const ready = new Promise<{ err: any, tile: HTMLElement }>((resolve) => { resolveReady = resolve })

  const canvas = layer.createTile(coords, (err, tile) => {
    resolveReady({ err, tile })
  }) as HTMLCanvasElement

  // Register in GridLayer's bookkeeping so `_removeTile` paths stay sane if
  // the test later tears the layer down.
  const key = `${coords.x}:${coords.y}:${coords.z}`
  layer._tiles![key] = { el: canvas, coords, current: true } as any

  return { canvas, ready }
}

function tileCoords(x: number, y: number, z: number): Point & { z: number } {
  const p = new Point(x, y) as Point & { z: number }
  p.z = z
  return p
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VectorTileMapLayer: construction & options', () => {
  test('stores the url and tileSize passed via options', () => {
    const layer = new VectorTileMapLayer({ url: 'https://example.com/{z}/{x}/{y}.pbf', tileSize: 512 })
    expect(layer.options!.url).toBe('https://example.com/{z}/{x}/{y}.pbf')
    expect(layer.options!.tileSize).toBe(512)
    expect(layer._styleLayers).toEqual([])
  })

  test('normalises a string subdomains option into an array', () => {
    const layer = new VectorTileMapLayer({ url: '', subdomains: 'xyz' })
    expect(Array.isArray(layer.options!.subdomains)).toBe(true)
    expect(layer.options!.subdomains).toEqual(['x', 'y', 'z'])
  })

  test('factory helper produces an instance equivalent to `new`', () => {
    const layer = vectorTileLayer({ url: '/tiles/{z}/{x}/{y}.pbf', tileSize: 256 })
    expect(layer).toBeInstanceOf(VectorTileMapLayer)
    expect(layer.options!.tileSize).toBe(256)
  })
})

describe('VectorTileMapLayer: url composition', () => {
  test('substitutes {z}/{x}/{y}', () => {
    const layer = new VectorTileMapLayer({ url: 'https://tiles/{z}/{x}/{y}.pbf' })
    const url = layer.getTileUrl(tileCoords(5, 3, 4))
    expect(url).toBe('https://tiles/4/5/3.pbf')
  })

  test('substitutes {s} with the expected subdomain', () => {
    const layer = new VectorTileMapLayer({
      url: 'https://{s}.tiles/{z}/{x}/{y}.pbf',
      subdomains: ['a', 'b', 'c'],
    })
    // `|x + y| % subdomains.length`. (5, 3) → 8 % 3 = 2 → 'c'.
    expect(layer.getTileUrl(tileCoords(5, 3, 4))).toBe('https://c.tiles/4/5/3.pbf')
    // (0, 0) → 0 → 'a'.
    expect(layer.getTileUrl(tileCoords(0, 0, 1))).toBe('https://a.tiles/1/0/0.pbf')
  })
})

describe('VectorTileMapLayer: decode + render path', () => {
  let restoreFetch: (() => void) | undefined
  afterEach(() => { restoreFetch?.(); restoreFetch = undefined })

  test('fires tileload and draws when the fetch resolves with a valid PBF', async () => {
    const bytes = encodeWaterTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [
        { id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0af' } },
      ],
    })
    attachLayerForCreateTile(layer, map)

    const { canvas, ready } = createTileOnLayer(layer, tileCoords(0, 0, 4))
    const counts = spyOnCanvas(canvas)

    const { err, tile } = await ready
    expect(err).toBeNull()
    expect(tile).toBe(canvas)
    expect(canvas.width).toBe(512)
    expect(canvas.height).toBe(512)

    // Fill path: at least one begin/moveTo/lineTo/fill should have fired.
    expect(counts.beginPath).toBeGreaterThan(0)
    expect(counts.moveTo).toBeGreaterThan(0)
    expect(counts.lineTo).toBeGreaterThan(0)
    expect(counts.fill).toBeGreaterThan(0)
  })

  test('renders both fill and line style layers pointed at the same source', async () => {
    const bytes = encodeWaterTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const styleLayers: VectorTileStyleLayer[] = [
      { id: 'water-fill', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0af' } },
      { id: 'water-line', type: 'line', sourceLayer: 'water', paint: { 'line-color': '#036', 'line-width': 2 } },
    ]
    const layer = new VectorTileMapLayer({ url: 'https://tiles/{z}/{x}/{y}.pbf', tileSize: 512, layers: styleLayers })
    attachLayerForCreateTile(layer, map)

    const { canvas, ready } = createTileOnLayer(layer, tileCoords(0, 0, 4))
    const counts = spyOnCanvas(canvas)

    const { err } = await ready
    expect(err).toBeNull()

    // Fill produced a `fill()`; line produced a `stroke()`.
    expect(counts.fill).toBeGreaterThan(0)
    expect(counts.stroke).toBeGreaterThan(0)
  })

  test('zoom filter: minzoom above map zoom suppresses drawing', async () => {
    const bytes = encodeWaterTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 5 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [
        {
          id: 'water',
          type: 'fill',
          sourceLayer: 'water',
          minzoom: 10, // above map zoom → skipped
          paint: { 'fill-color': '#0af' },
        },
      ],
    })
    attachLayerForCreateTile(layer, map)

    const { canvas, ready } = createTileOnLayer(layer, tileCoords(0, 0, 5))
    const counts = spyOnCanvas(canvas)

    const { err } = await ready
    expect(err).toBeNull()

    // No drawing primitives — the single style layer was suppressed by zoom.
    expect(counts.fill).toBe(0)
    expect(counts.stroke).toBe(0)
    expect(counts.beginPath).toBe(0)
  })
})

describe('VectorTileMapLayer: queryRenderedFeatures', () => {
  let restoreFetch: (() => void) | undefined
  afterEach(() => { restoreFetch?.(); restoreFetch = undefined })

  test('returns every decoded feature when called without a point', async () => {
    const bytes = encodeWaterTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [{ id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0af' } }],
    })
    attachLayerForCreateTile(layer, map)

    const { ready } = createTileOnLayer(layer, tileCoords(0, 0, 4))
    await ready

    const all = layer.queryRenderedFeatures({ layers: ['water'] })
    expect(all.length).toBe(1)
    expect(all[0].layer.id).toBe('water')
    expect(all[0].feature.properties.name).toBe('Ocean')
    expect(all[0].tile).toEqual({ x: 0, y: 0, z: 4 })

    // Layer filter with a non-existent id: empty result.
    expect(layer.queryRenderedFeatures({ layers: ['does-not-exist'] })).toEqual([])
  })

  test('point query hits the polygon and misses outside it', async () => {
    const bytes = encodeWaterTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [{ id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0af' } }],
    })
    attachLayerForCreateTile(layer, map)

    const { ready } = createTileOnLayer(layer, tileCoords(0, 0, 4))
    await ready

    // Polygon spans extent (1000,1000) → (3000,3000) in a 4096-extent tile.
    // Scaled to a 512-px tile that's (125,125) → (375,375). Hit at the center
    // (250, 250); miss at a corner (10, 10).
    // `containerPointToLayerPoint` is identity at bearing 0 / position 0, so
    // the point we pass IS the layer-local point.
    const hit = layer.queryRenderedFeatures(new Point(250, 250))
    expect(hit.length).toBe(1)
    expect(hit[0].feature.properties.name).toBe('Ocean')

    const miss = layer.queryRenderedFeatures(new Point(10, 10))
    expect(miss).toEqual([])
  })
})

describe('VectorTileMapLayer: queryRenderedFeatures (R-tree)', () => {
  let restoreFetch: (() => void) | undefined
  afterEach(() => { restoreFetch?.(); restoreFetch = undefined })

  test('options-bag `point` hits the polygon bbox', async () => {
    const bytes = encodeWaterTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [{ id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0af' } }],
    })
    attachLayerForCreateTile(layer, map)

    const { ready } = createTileOnLayer(layer, tileCoords(0, 0, 4))
    await ready

    const inside = layer.queryRenderedFeatures({ point: [250, 250] })
    expect(inside.length).toBe(1)
    expect(inside[0].feature.properties.name).toBe('Ocean')

    const outside = layer.queryRenderedFeatures({ point: [10, 10] })
    expect(outside).toEqual([])
  })

  test('bbox query returns every feature whose geometry intersects the box', async () => {
    const bytes = encodeWaterTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [{ id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0af' } }],
    })
    attachLayerForCreateTile(layer, map)

    const { ready } = createTileOnLayer(layer, tileCoords(0, 0, 4))
    await ready

    // Bbox enclosing a corner of the polygon in container px.
    const hits = layer.queryRenderedFeatures({ bbox: [[120, 120], [260, 260]] })
    expect(hits.length).toBe(1)
    expect(hits[0].feature.properties.name).toBe('Ocean')

    // Bbox entirely outside the polygon.
    const miss = layer.queryRenderedFeatures({ bbox: [[0, 0], [10, 10]] })
    expect(miss).toEqual([])
  })

  test('point query on a 100-feature grid returns the single matching cell', async () => {
    const N = 100
    const cellSize = 60
    const bytes = encodeGridTile(N, cellSize)
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [{ id: 'cells', type: 'fill', sourceLayer: 'cells', paint: { 'fill-color': '#f80' } }],
    })
    attachLayerForCreateTile(layer, map)

    const { ready } = createTileOnLayer(layer, tileCoords(0, 0, 4))
    await ready

    // Pick a target cell and compute its container-pixel centre. The layer
    // uses extent 4096; container is 512; side = ceil(sqrt(100)) = 10.
    const side = Math.ceil(Math.sqrt(N))
    const stride = Math.floor((4096 - cellSize) / Math.max(side - 1, 1))
    const targetIndex = 42
    const row = Math.floor(targetIndex / side)
    const col = targetIndex % side
    const extentScale = 512 / 4096
    const centerX = (col * stride + cellSize / 2) * extentScale
    const centerY = (row * stride + cellSize / 2) * extentScale

    const hits = layer.queryRenderedFeatures({ point: [centerX, centerY] })
    expect(hits.length).toBe(1)
    expect(hits[0].feature.properties.name).toBe('cell-42')

    // Empty-space pixel between grid cells should miss.
    const gapX = ((col + 0) * stride + cellSize + (stride - cellSize) / 2) * extentScale
    const gapY = (row * stride + cellSize / 2) * extentScale
    // Only assert a miss if we actually landed in a gap (depends on stride).
    if (stride - cellSize > 2) {
      const miss = layer.queryRenderedFeatures({ point: [gapX, gapY] })
      expect(miss).toEqual([])
    }
  })

  test('legacy `(point)` positional overload still hits', async () => {
    const bytes = encodeWaterTile()
    restoreFetch = installFetchStub(async () => responseFrom(bytes, { status: 200 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({
      url: 'https://tiles/{z}/{x}/{y}.pbf',
      tileSize: 512,
      layers: [{ id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0af' } }],
    })
    attachLayerForCreateTile(layer, map)

    const { ready } = createTileOnLayer(layer, tileCoords(0, 0, 4))
    await ready

    const hit = layer.queryRenderedFeatures(new Point(250, 250))
    expect(hit.length).toBe(1)
    expect(hit[0].feature.properties.name).toBe('Ocean')
  })
})

describe('VectorTileMapLayer: error handling', () => {
  let restoreFetch: (() => void) | undefined
  afterEach(() => { restoreFetch?.(); restoreFetch = undefined })

  test('surfaces fetch rejection through the createTile callback', async () => {
    restoreFetch = installFetchStub(async () => { throw new Error('network down') })

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({ url: 'https://tiles/{z}/{x}/{y}.pbf', tileSize: 512 })
    attachLayerForCreateTile(layer, map)

    const { ready } = createTileOnLayer(layer, tileCoords(0, 0, 4))
    const { err } = await ready
    expect(err).toBeDefined()
    expect((err as Error).message).toBe('network down')
  })

  test('surfaces HTTP errors through the createTile callback', async () => {
    restoreFetch = installFetchStub(async () => new Response('nope', { status: 404 }))

    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 4 })
    stampSize(map, 512, 512)

    const layer = new VectorTileMapLayer({ url: 'https://tiles/{z}/{x}/{y}.pbf', tileSize: 512 })
    attachLayerForCreateTile(layer, map)

    const { ready } = createTileOnLayer(layer, tileCoords(0, 0, 4))
    const { err } = await ready
    expect(err).toBeDefined()
    expect((err as Error).message).toMatch(/HTTP 404/)
  })
})

