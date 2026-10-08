import type { Style as StyleSpecification } from '../src/core-map/style-spec/types'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { VectorTileMapLayer } from '../src/core-map/layer/tile/VectorTileMapLayer'
import { Map } from '../src/core-map/map/Map'
import { activeOfflineMaps, MemoryOfflineStore, OfflineMaps, offlineFetch, setOfflineMaps } from '../src/core-map/offline'
import {
  clearPMTilesArchives,
  FetchSource,
  getPMTilesArchive,
  isPMTilesUrl,
  parsePMTilesTileUrl,
  PMTiles,
  pmtilesArchiveUrl,
  pmtilesFetch,
  pmtilesSourceUrl,
  pmtilesTileJSON,
  pmtilesTileUrl,
  tileBounds,
  TileType,
  withPMTiles,
  writePMTiles,
} from '../src/core-map/pmtiles'
import { renderStaticMap } from '../src/core-map/static'
import { getDefaultCache, resetDefaultCache, saveOfflineRegion, TileCache } from '../src/core-map/storage'
import { encodeTile } from './helpers/mvt'

// A planet basemap as one file on R2, read in place from the browser. The
// archive here is built in-test with `writePMTiles` and served by a fake host
// that honours `Range` the way R2 and S3 do, so every test can count exactly
// which byte ranges were asked for.

const ARCHIVE = 'https://tiles.wildloop.test/planet/20261005.pmtiles'
const SOURCE = `pmtiles://${ARCHIVE}`
const TEMPLATE = `${SOURCE}/{z}/{x}/{y}`
const ATTRIBUTION = '© OpenStreetMap contributors'
const VECTOR_LAYERS = [{ id: 'water', fields: { id: 'String' } }]
/** Absent from the archive: open sea, as far as a reader is concerned. */
const MISSING = { z: 3, x: 0, y: 0 }

/** z0..z3, every tile one `water` polygon covering it and naming itself. */
function pyramid(tag = ''): Array<{ z: number, x: number, y: number, data: Uint8Array }> {
  const tiles = []
  for (let z = 0; z <= 3; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) {
        if (z === MISSING.z && x === MISSING.x && y === MISSING.y)
          continue
        tiles.push({ z, x, y, data: encodeTile({ water: [{ type: 3, props: { id: `${z}/${x}/${y}${tag}` }, lines: [[[0, 0], [4096, 0], [4096, 4096], [0, 4096], [0, 0]]] }] }) })
      }
    }
  }
  return tiles
}

function build(tag = ''): Promise<Uint8Array> {
  // Small leaves, so directory reads (and their coalescing) are exercised.
  return writePMTiles(pyramid(tag), {
    tileType: TileType.Mvt,
    leafSize: 8,
    metadata: { name: 'Planet', attribution: ATTRIBUTION, vector_layers: VECTOR_LAYERS },
  })
}

interface HostRequest {
  url: string
  range: string | null
  start: number
  signal?: AbortSignal | null
}

interface Host {
  bytes: Uint8Array
  etag: string
  requests: HostRequest[]
  /** Answer requests for other URLs (a TileJSON, say). */
  other?: (url: string) => Response | undefined
  /** Hold reads at or past this offset until their signal aborts. */
  hangFrom?: number
  /** No network at all. */
  offline?: boolean
  fetch: typeof fetch
}

/** A static host answering `Range` as R2 does: 206, an ETag, 416 past the end. */
function host(bytes: Uint8Array): Host {
  const state: Host = {
    bytes,
    etag: '"v1"',
    requests: [],
    fetch: undefined as unknown as typeof fetch,
  }
  state.fetch = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    if (state.offline)
      throw new TypeError('Failed to fetch')
    const range = new Headers(init?.headers).get('Range')
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(range ?? '') ?? []
    const start = Number(a ?? 0)
    state.requests.push({ url, range, start, signal: init?.signal })
    if (url !== ARCHIVE)
      return state.other?.(url) ?? new Response(null, { status: 404 })
    if (!range)
      return new Response(null, { status: 400 })
    if (start >= state.bytes.length)
      return new Response(null, { status: 416 })
    if (state.hangFrom !== undefined && start >= state.hangFrom) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }
    return new Response(state.bytes.slice(start, Number(b) + 1) as Uint8Array<ArrayBuffer>, { status: 206, headers: { 'ETag': state.etag, 'Content-Length': String(Number(b) + 1 - start) } })
  }) as unknown as typeof fetch
  return state
}

let restore: (() => void) | undefined

/** Put `state` behind the global `fetch`, as the browser's network. */
function install(state: Host): Host {
  const original = globalThis.fetch
  globalThis.fetch = state.fetch
  restore = () => { globalThis.fetch = original }
  return state
}

beforeEach(async () => {
  clearPMTilesArchives()
  await resetDefaultCache()
})

afterEach(async () => {
  restore?.()
  restore = undefined
  setOfflineMaps(null)
  // Settle the "are there any downloads?" probe the reset re-arms, so the
  // next file's first map-data fetch does not wait on it.
  await (await activeOfflineMaps())?.ready()
})

/** Reads of tile bodies, as opposed to the header and directories. */
async function tileReads(state: Host, from = 0): Promise<HostRequest[]> {
  const { tileDataOffset } = await getPMTilesArchive(SOURCE).getHeader()
  return state.requests.slice(from).filter(r => r.url === ARCHIVE && r.start >= tileDataOffset)
}

function waterId(tile: any): unknown {
  return tile.layers.water?.feature(0).properties.id
}

function coords(x: number, y: number, z: number): Point & { z: number } {
  const p = new Point(x, y) as Point & { z: number }
  p.z = z
  return p
}

/** Run `createTile` the way GridLayer would, and wait for its `done`. */
function createTile(layer: any, c: Point & { z: number }): { canvas: HTMLCanvasElement, ready: Promise<any> } {
  let resolve: (err: any) => void = () => {}
  const ready = new Promise<any>((r) => { resolve = r })
  const canvas = layer.createTile(c, (err: any) => resolve(err)) as HTMLCanvasElement
  layer._tiles[`${c.x}:${c.y}:${c.z}`] = { el: canvas, coords: c, current: true }
  return { canvas, ready }
}

function layerOn(options: Record<string, unknown> = {}): any {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const map = new Map(container, { center: [0, 0], zoom: 4 })
  const layer: any = new VectorTileMapLayer({
    url: SOURCE,
    workers: false,
    layers: [{ id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0af' } }],
    ...options,
  })
  layer._map = map
  layer._tiles = {}
  return layer
}

describe('pmtiles:// URLs', () => {
  test('name the archive, its template and its tiles', () => {
    expect(isPMTilesUrl(SOURCE)).toBe(true)
    expect(isPMTilesUrl(ARCHIVE)).toBe(false)
    expect(isPMTilesUrl(undefined)).toBe(false)
    expect(pmtilesArchiveUrl(SOURCE)).toBe(ARCHIVE)
    expect(pmtilesArchiveUrl(TEMPLATE)).toBe(ARCHIVE)
    expect(pmtilesTileUrl(SOURCE)).toBe(TEMPLATE)
    expect(pmtilesTileUrl(TEMPLATE)).toBe(TEMPLATE)
    expect(pmtilesSourceUrl(TEMPLATE)).toBe(SOURCE)
    expect(parsePMTilesTileUrl(`${SOURCE}/14/2620/6332`)).toEqual({ archive: ARCHIVE, z: 14, x: 2620, y: 6332 })
    expect(parsePMTilesTileUrl(SOURCE)).toBeUndefined()
  })

  test('an archive reads as TileJSON from its header and metadata', async () => {
    install(host(await build()))
    const tilejson = await pmtilesTileJSON(SOURCE)
    expect(tilejson).toMatchObject({
      tilejson: '3.0.0',
      tiles: [TEMPLATE],
      minzoom: 0,
      maxzoom: 3,
      name: 'Planet',
      attribution: ATTRIBUTION,
      vector_layers: VECTOR_LAYERS,
    })
    expect(tilejson.bounds).toHaveLength(4)
  })

  test('withPMTiles answers tiles as 200, missing tiles as 204, and the archive as TileJSON', async () => {
    const state = install(host(await build()))
    const tile = await pmtilesFetch(`${SOURCE}/2/1/3`)
    expect(tile.status).toBe(200)
    expect(tile.headers.get('content-type')).toBe('application/vnd.mapbox-vector-tile')
    const { VectorTile } = await import('../src/core-map/mvt')
    const { Pbf } = await import('../src/core-map/proto')
    // Stored gzipped, handed back decompressed.
    expect(waterId(new VectorTile(new Pbf(new Uint8Array(await tile.arrayBuffer()))))).toBe('2/1/3')

    const empty = await pmtilesFetch(`${SOURCE}/${MISSING.z}/${MISSING.x}/${MISSING.y}`)
    expect(empty.status).toBe(204)

    expect((await (await pmtilesFetch(SOURCE)).json()).maxzoom).toBe(3)

    // Everything else is passed through untouched.
    state.other = () => new Response('style')
    expect(await (await withPMTiles(state.fetch)('https://tiles.wildloop.test/style.json')).text()).toBe('style')
  })
})

describe('the interactive map', () => {
  for (const [form, source] of [
    ['url', { type: 'vector', url: SOURCE }],
    ['tiles[0]', { type: 'vector', tiles: [SOURCE] }],
    ['tiles[0] template', { type: 'vector', tiles: [TEMPLATE] }],
  ] as const) {
    test(`a style source naming the archive as ${form} reads from it`, async () => {
      install(host(await build()))
      const container = document.createElement('div')
      document.body.appendChild(container)
      const map = new Map(container, {
        zoomAnimation: false,
        fadeAnimation: false,
        style: {
          version: 8,
          sources: { basemap: source as any },
          layers: [{ id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': '#0af' } }],
        } as unknown as StyleSpecification,
      })
      let layer: any
      map.eachLayer((l: any) => {
        if (l instanceof VectorTileMapLayer)
          layer = l
      })
      expect(layer.options.url).toBe(TEMPLATE)
      await layer.sourceReady()
      // Zoom range from the header, shifted into the 512px grid; credit from
      // the metadata.
      expect(layer.options.sourceMaxZoom).toBe(4)
      expect(layer.options.attribution).toBe(ATTRIBUTION)
      expect(layer.getTileJSON().vector_layers).toEqual(VECTOR_LAYERS)
      map.remove()
      container.remove()
    })
  }

  test('loads tiles with one range request each once directories are warm', async () => {
    const state = install(host(await build()))
    const layer = layerOn()
    // Grid 4 is archive zoom 3 for 512px tiles.
    const first = createTile(layer, coords(5, 6, 4))
    expect(await first.ready).toBeNull()
    expect(waterId(layer._decodedTiles.get(first.canvas).tile)).toBe('3/5/6')

    // Another map on the page, same archive: the reader is shared, so the
    // header and directories are already here and only the tile is read.
    const before = state.requests.length
    const other = layerOn()
    const second = createTile(other, coords(5, 6, 4))
    expect(await second.ready).toBeNull()
    expect(waterId(other._decodedTiles.get(second.canvas).tile)).toBe('3/5/6')
    expect(state.requests.length - before).toBe(1)
  })

  test('a tile the archive lacks draws blank, without an error', async () => {
    const state = install(host(await build()))
    const layer = layerOn()
    const errors: unknown[] = []
    const original = console.error
    console.error = (...args: unknown[]) => { errors.push(args) }
    try {
      const tile = createTile(layer, coords(MISSING.x, MISSING.y, MISSING.z + 1))
      expect(await tile.ready).toBeNull()
      expect(layer._decodedTiles.get(tile.canvas).tile.layers.water).toBeUndefined()
    }
    finally {
      console.error = original
    }
    expect(errors).toEqual([])
    // Found absent in the directory: no tile read was spent on it.
    expect(await tileReads(state)).toHaveLength(0)
  })

  test('overzooms past the archive maxzoom from the ancestor, one read for all its children', async () => {
    const state = install(host(await build()))
    const layer = layerOn()
    await layer.sourceReady()
    const before = state.requests.length
    // Grid 6 is two levels past grid 4 (archive zoom 3): sixteen children
    // of archive tile 3/5/6. Four of them here.
    const children = [coords(20, 24, 6), coords(21, 24, 6), coords(20, 25, 6), coords(23, 27, 6)].map(c => createTile(layer, c))
    for (const child of children)
      expect(await child.ready).toBeNull()
    for (const child of children)
      expect(waterId(layer._decodedTiles.get(child.canvas).tile)).toBe('3/5/6')
    expect(layer.getTileUrl(coords(23, 27, 6))).toBe(`${SOURCE}/3/5/6`)
    // One leaf directory at most, and one tile: not four of each.
    expect(await tileReads(state, before)).toHaveLength(1)
    expect(state.requests.length - before).toBeLessThanOrEqual(2)
  })

  test('removing a tile cancels its range request', async () => {
    const state = install(host(await build()))
    const layer = layerOn()
    await layer.sourceReady()
    const { tileDataOffset } = await getPMTilesArchive(SOURCE).getHeader()
    state.hangFrom = tileDataOffset
    const tile = createTile(layer, coords(5, 6, 4))
    // Let the directory read resolve and the tile read start.
    for (let i = 0; i < 50 && !state.requests.some(r => r.start >= tileDataOffset); i++)
      await new Promise(r => setTimeout(r, 1))
    const inflight = state.requests.findLast(r => r.start >= tileDataOffset)!
    expect(inflight.signal?.aborted).toBe(false)
    ;(tile.canvas as any).remove = (): void => {}
    layer._removeTile('5:6:4')
    expect(inflight.signal?.aborted).toBe(true)
    expect((await tile.ready)?.name).toBe('AbortError')
  })
})

describe('renderStaticMap', () => {
  const style = (source: Record<string, unknown>): StyleSpecification => ({
    version: 8,
    sources: { basemap: { type: 'vector', ...source } },
    layers: [
      { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': '#0b1a2b' } },
    ],
  }) as unknown as StyleSpecification

  // Archive tile 3/5/6 drawn 512px square: style zoom 3.
  const view = { left: 5 / 8, top: 6 / 8, scale: 512 * 8 }

  test('draws from an archive named by url', async () => {
    const state = host(await build())
    const map = await renderStaticMap({ style: style({ url: SOURCE }), width: 512, height: 512, view, fetch: state.fetch })
    expect(map.tiles).toBe(1)
    expect(map.attribution).toBe(ATTRIBUTION)
    expect(map.markup).toContain('fill="#0b1a2b"')
  })

  test('draws from an archive in tiles[0], and overzooms past its maxzoom', async () => {
    const state = host(await build())
    // Style zoom 5, two past the archive's top: drawn from 3/5/6.
    const deep = { left: 5 / 8, top: 6 / 8, scale: 512 * 32 }
    const map = await renderStaticMap({ style: style({ tiles: [SOURCE] }), width: 512, height: 512, view: deep, fetch: state.fetch })
    expect(map.tiles).toBe(1)
    expect(map.markup).toContain('fill="#0b1a2b"')
  })

  test('follows a TileJSON whose tiles[0] is a pmtiles:// archive', async () => {
    const state = host(await build())
    state.other = url => url === 'https://tiles.wildloop.test/planet.json'
      ? Response.json({ tilejson: '3.0.0', tiles: [SOURCE], minzoom: 0, maxzoom: 3, bounds: [-180, -85, 180, 85], vector_layers: VECTOR_LAYERS, attribution: ATTRIBUTION })
      : undefined
    const map = await renderStaticMap({ style: style({ url: 'https://tiles.wildloop.test/planet.json' }), width: 512, height: 512, view, fetch: state.fetch })
    expect(map.tiles).toBe(1)
    expect(map.attribution).toBe(ATTRIBUTION)
  })

  test('a missing tile is skipped, not an error', async () => {
    const state = host(await build())
    const map = await renderStaticMap({ style: style({ url: SOURCE }), width: 512, height: 512, view: { left: 0, top: 0, scale: 512 * 8 }, fetch: state.fetch })
    expect(map.tiles).toBe(0)
  })
})

describe('offline', () => {
  // A trail inside archive tile 3/5/6.
  const [w, s, e, n] = tileBounds(3, 5, 6)
  const trail = [w + (e - w) * 0.4, s + (n - s) * 0.4, w + (e - w) * 0.6, s + (n - s) * 0.6] as [number, number, number, number]

  test('saveOfflineRegion stores archive tiles under the keys the map reads offline', async () => {
    const state = install(host(await build()))
    // Wildloop's call, verbatim: tileUrl is its TileJSON's tiles[0].
    const result = await saveOfflineRegion({ bounds: trail, zoomRange: [2, 3], tileUrl: SOURCE, concurrency: 4 })
    expect(result).toEqual({ saved: 2, failed: 0, skipped: 0 })
    const cache = getDefaultCache()
    expect((await cache.get(`${SOURCE}/3/5/6`))?.data.byteLength).toBeGreaterThan(0)
    expect(await cache.get(`${SOURCE}/2/2/3`)).toBeDefined()
    expect(await cache.get(SOURCE)).toBeDefined()

    // No network now. A fresh page: no reader, nothing in memory but the cache.
    clearPMTilesArchives()
    state.offline = true
    const layer = layerOn({ offlineCache: true })
    await layer.sourceReady()
    expect(layer.options.sourceMaxZoom).toBe(4)
    const tile = createTile(layer, coords(5, 6, 4))
    expect(await tile.ready).toBeNull()
    expect(waterId(layer._decodedTiles.get(tile.canvas).tile)).toBe('3/5/6')
    // Overzoomed children of the saved tile draw too.
    const child = createTile(layer, coords(21, 25, 6))
    expect(await child.ready).toBeNull()
    expect(waterId(layer._decodedTiles.get(child.canvas).tile)).toBe('3/5/6')
  })

  test('the cache key round trip: put by a pmtiles read, got by the same URL', async () => {
    install(host(await build()))
    const cache = new TileCache()
    const url = `${SOURCE}/3/5/6`
    const { cachedFetch } = await import('../src/core-map/storage')
    const first = await cachedFetch(url, { cache })
    expect(first.fromCache).toBe(false)
    expect(first.mime).toBe('application/vnd.mapbox-vector-tile')
    const again = await cachedFetch(url, { cache })
    expect(again.fromCache).toBe(true)
    expect(again.data).toEqual(first.data)
  })

  test('a downloaded map keeps the archive tiles and its TileJSON, and serves them with no network', async () => {
    const state = install(host(await build()))
    const maps = new OfflineMaps({ store: new MemoryOfflineStore() })
    setOfflineMaps(maps)
    const region = await maps.download({ bounds: trail, minZoom: 0, maxZoom: 7, sources: [{ url: SOURCE, maxZoom: 3 }] })
    expect(region.status).toBe('complete')
    expect((await maps.lookup(`${SOURCE}/3/5/6`))?.data.byteLength).toBeGreaterThan(0)
    expect(await maps.lookup(SOURCE)).toBeDefined()

    clearPMTilesArchives()
    state.offline = true
    const response = await offlineFetch(`${SOURCE}/3/5/6`)
    expect(response.status).toBe(200)

    maps.onlyOffline = true
    const layer = layerOn()
    await layer.sourceReady()
    const tile = createTile(layer, coords(5, 6, 4))
    expect(await tile.ready).toBeNull()
    expect(waterId(layer._decodedTiles.get(tile.canvas).tile)).toBe('3/5/6')
  })
})

describe('reading a planet over HTTP', () => {
  test('concurrent reads share one header and one read of each directory', async () => {
    const state = host(await build())
    const archive = new PMTiles(new FetchSource(ARCHIVE, { fetch: state.fetch }))
    const zxy: Array<[number, number, number]> = []
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        if (!(x === MISSING.x && y === MISSING.y))
          zxy.push([3, x, y])
      }
    }
    await Promise.all(zxy.map(([z, x, y]) => archive.getTile(z, x, y)))
    const header = await archive.getHeader()
    const roots = state.requests.filter(r => r.start === 0)
    const leaves = state.requests.filter(r => r.start >= header.leafDirectoryOffset && r.start < header.tileDataOffset)
    const tiles = state.requests.filter(r => r.start >= header.tileDataOffset)
    expect(roots).toHaveLength(1)
    expect(leaves.length).toBeGreaterThan(1)
    expect(new Set(leaves.map(r => r.start)).size).toBe(leaves.length)
    expect(tiles).toHaveLength(zxy.length)

    // Warm: one request per tile, nothing else.
    const before = state.requests.length
    await Promise.all(zxy.map(([z, x, y]) => archive.getTile(z, x, y)))
    expect(state.requests.length - before).toBe(zxy.length)
  })

  test('an ETag change reloads the header once, however many reads notice it', async () => {
    const state = host(await build())
    const archive = new PMTiles(new FetchSource(ARCHIVE, { fetch: state.fetch }))
    expect(new TextDecoder().decode((await archive.getTileData(3, 5, 6))!)).toContain('3/5/6')

    state.bytes = await build(' rebuilt')
    state.etag = '"v2"'
    const reads = [[3, 5, 6], [3, 4, 6], [3, 5, 7], [3, 4, 7], [2, 1, 1]] as const
    const datas = await Promise.all(reads.map(([z, x, y]) => archive.getTileData(z, x, y)))
    datas.forEach((data, i) => expect(new TextDecoder().decode(data!)).toContain(`${reads[i]!.join('/')} rebuilt`))
    expect(state.requests.filter(r => r.start === 0)).toHaveLength(2)
  })

  test('416 from a shrunken rebuild reloads the header and retries', async () => {
    const state = host(await build())
    const archive = new PMTiles(new FetchSource(ARCHIVE, { fetch: state.fetch }))
    // Warm the directories, so the next read goes straight to tile data.
    await archive.getTile(3, 7, 7)
    // Rebuilt smaller, and served without an ETag, so only the range fails.
    const small = await writePMTiles([{ z: 0, x: 0, y: 0, data: encodeTile({ water: [] }) }, { z: 3, x: 7, y: 7, data: encodeTile({ water: [] }) }], { tileType: TileType.Mvt })
    state.bytes = small
    state.etag = ''
    expect(await archive.getTile(3, 7, 7)).toBeDefined()
    expect(state.requests.some(r => r.start >= small.length)).toBe(true)
    expect(state.requests.filter(r => r.start === 0)).toHaveLength(2)
  })

  test('never downloads a whole file from a host that ignores Range', async () => {
    let cancelled = false
    const stream = new ReadableStream({ cancel() { cancelled = true } })
    const archive = new PMTiles(new FetchSource(ARCHIVE, {
      // A 200 with no Content-Length: a CDN streaming the planet.
      fetch: async () => new Response(stream, { status: 200 }),
    }))
    await expect(archive.getHeader()).rejects.toThrow('ignores HTTP Range')
    expect(cancelled).toBe(true)
  })
})

describe('exports', () => {
  test('the main entry decodes tiles and speaks pmtiles://', async () => {
    const main = await import('../src/index')
    for (const name of ['VectorTile', 'VectorTileLayer', 'VectorTileFeature', 'Pbf', 'isPMTilesUrl', 'pmtilesTileJSON', 'pmtilesFetch', 'withPMTiles', 'readPMTilesTile', 'getPMTilesArchive', 'setPMTilesArchive'])
      expect(typeof (main as any)[name]).toBe('function')

    // The publish-time check: read with ts-maps/pmtiles, decode with ts-maps.
    const archive = new PMTiles(new FetchSource(ARCHIVE, { fetch: host(await build()).fetch }))
    const tile = new main.VectorTile(new main.Pbf((await archive.getTileData(3, 5, 6))!))
    expect(waterId(tile)).toBe('3/5/6')
  })
})
