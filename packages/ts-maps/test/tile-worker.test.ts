import type { ExecutionContext, R2Bucket, R2GetOptions, R2Object, R2ObjectBody, R2Range, TileWorker, WorkerCache } from '../src/worker'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parseHeader } from '../src/core-map/pmtiles/header'
import { PMTiles } from '../src/core-map/pmtiles/PMTiles'
import { FetchSource } from '../src/core-map/pmtiles/sources'
import { TileType } from '../src/core-map/pmtiles/header'
import { writePMTiles } from '../src/core-map/pmtiles/writer'
import { VectorTile } from '../src/core-map/mvt'
import { Pbf } from '../src/core-map/proto'
import { archiveKeyFromTileUrl, createTileWorker, parseRange } from '../src/worker'
import { encodeTile, road } from './helpers/mvt'

// ---------- fixtures ----------

// Tiles z0..z5 over San Francisco. The bounds are wider than the stored tiles,
// so the archive has empty tiles inside them (204) as well as tiles outside
// them (404).
const SF = { lon: -122.42, lat: 37.77 }
function lonLatToTile(z: number): [number, number] {
  const n = 2 ** z
  const rad = SF.lat * Math.PI / 180
  return [Math.floor((SF.lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n)]
}
const [x5, y5] = lonLatToTile(5)

function archive(label: string): Promise<Uint8Array> {
  const tiles = []
  for (let z = 0; z <= 5; z++) {
    const [x, y] = lonLatToTile(z)
    tiles.push({
      z,
      x,
      y,
      data: encodeTile({
        water: [road({ class: 'ocean' }, [0, 0], [4096, 4096])],
        transportation: [road({ class: 'primary', label }, [0, 2048], [4096, 2048])],
      }),
    })
  }
  // Small leaves, so tiles live behind leaf directories as they do in a planet.
  return writePMTiles(tiles, { tileType: TileType.Mvt, bounds: [-130, 30, -110, 45], leafSize: 2 })
}

const ARCHIVE_KEY = 'planet/20261006.pmtiles'
const HOST = 'https://tiles.wildloop.org'
const published = {
  tilejson: '3.0.0',
  version: '20261006',
  tiles: [`pmtiles://${HOST}/${ARCHIVE_KEY}`],
  minzoom: 0,
  maxzoom: 14,
  bounds: [-180, -85.0511, 180, 85.0511],
  center: [0, 0, 2],
  vector_layers: [{ id: 'water', fields: {} }],
  attribution: '© OpenMapTiles © OpenStreetMap contributors',
}

// ---------- an in-memory R2 bucket ----------

interface Stored { bytes: Uint8Array, etag: string, contentType?: string, uploaded: Date }

class MemoryBucket implements R2Bucket {
  readonly objects = new Map<string, Stored>()
  /** Every `get`, in order. */
  readonly reads: Array<{ key: string, range?: R2Range }> = []
  private nextEtag = 1

  put(key: string, bytes: Uint8Array | string, contentType?: string): void {
    const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
    this.objects.set(key, { bytes: data, etag: `etag${this.nextEtag++}`, contentType, uploaded: new Date('2026-10-06T00:00:00Z') })
  }

  readsOf(key: string): number {
    return this.reads.filter(read => read.key === key).length
  }

  private meta(key: string, stored: Stored, range?: R2Range): R2Object {
    return {
      key,
      size: stored.bytes.length,
      etag: stored.etag,
      httpEtag: `"${stored.etag}"`,
      uploaded: stored.uploaded,
      httpMetadata: { contentType: stored.contentType },
      range,
      writeHttpMetadata: (headers) => {
        if (stored.contentType)
          headers.set('Content-Type', stored.contentType)
      },
    }
  }

  async head(key: string): Promise<R2Object | null> {
    const stored = this.objects.get(key)
    return stored ? this.meta(key, stored) : null
  }

  async get(key: string, options: R2GetOptions = {}): Promise<R2ObjectBody | R2Object | null> {
    this.reads.push({ key, range: options.range })
    const stored = this.objects.get(key)
    if (!stored)
      return null
    // A failed precondition answers metadata without a body, as R2 does.
    if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== stored.etag)
      return this.meta(key, stored, options.range)

    const size = stored.bytes.length
    let start = 0
    let end = size
    const range = options.range
    if (range) {
      if (range.suffix !== undefined) {
        start = Math.max(0, size - range.suffix)
      }
      else {
        start = range.offset ?? 0
        if (start >= size)
          throw new Error('get: The requested range is not satisfiable (10039)')
        if (range.length !== undefined)
          end = Math.min(size, start + range.length)
      }
    }
    const slice = stored.bytes.slice(start, end)
    return {
      ...this.meta(key, stored, range),
      body: new Response(slice).body!,
      arrayBuffer: async () => slice.buffer,
      text: async () => new TextDecoder().decode(slice),
    }
  }
}

// ---------- caches.default and ctx ----------

class MemoryCache implements WorkerCache {
  readonly entries = new Map<string, Response>()
  async match(request: Request | string): Promise<Response | undefined> {
    return this.entries.get(typeof request === 'string' ? request : request.url)?.clone()
  }

  async put(request: Request | string, response: Response): Promise<void> {
    // Store a settled copy, the way the Cache API buffers the body.
    const body = response.status === 204 ? null : await response.arrayBuffer()
    this.entries.set(typeof request === 'string' ? request : request.url, new Response(body, response))
  }
}

function context(): ExecutionContext & { settle: () => Promise<void> } {
  const waiting: Promise<unknown>[] = []
  return {
    waitUntil: promise => void waiting.push(promise),
    settle: async () => {
      while (waiting.length)
        await waiting.shift()
    },
  }
}

let bucket: MemoryBucket
let cache: MemoryCache
let worker: TileWorker
let archiveBytes: Uint8Array
const originalCaches = (globalThis as { caches?: unknown }).caches

beforeEach(async () => {
  bucket = new MemoryBucket()
  archiveBytes = await archive('v1')
  bucket.put(ARCHIVE_KEY, archiveBytes)
  bucket.put('tiles.json', JSON.stringify(published), 'application/json')
  bucket.put('_builds/20261006/status.json', '{"state":"done"}', 'application/json')
  cache = new MemoryCache()
  ;(globalThis as { caches?: unknown }).caches = { default: cache }
  worker = createTileWorker()
})

afterEach(() => {
  ;(globalThis as { caches?: unknown }).caches = originalCaches
})

/** One request through the Worker, with its `waitUntil` work finished. */
async function get(path: string, init?: RequestInit, env: Record<string, unknown> = { TILES: bucket }): Promise<Response> {
  const ctx = context()
  const response = await worker.fetch(new Request(`${HOST}${path}`, init), env, ctx)
  await ctx.settle()
  return response
}

const tilePath = (z: number, x: number, y: number): string => `/planet/20261006/${z}/${x}/${y}.pbf`

function layersOf(gzipped: Uint8Array): string[] {
  return Object.keys(new VectorTile(new Pbf(gunzipSync(gzipped))).layers).sort()
}

// ---------- tests ----------

describe('GET /tiles.json', () => {
  test('rewrites the pmtiles:// archive into tile URLs on this host, keeping everything else', async () => {
    const res = await get('/tiles.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const doc = await res.json() as typeof published
    expect(doc).toEqual({ ...published, tiles: [`${HOST}/planet/20261006/{z}/{x}/{y}.pbf`] })
  })

  test('uses the host the request arrived on', async () => {
    const ctx = context()
    const res = await worker.fetch(new Request('http://localhost:8787/tiles.json'), { TILES: bucket }, ctx)
    expect((await res.json() as typeof published).tiles).toEqual(['http://localhost:8787/planet/20261006/{z}/{x}/{y}.pbf'])
  })

  test('is cached briefly at the edge, so repeat requests skip R2', async () => {
    await get('/tiles.json')
    const reads = bucket.readsOf('tiles.json')
    const again = await get('/tiles.json')
    expect(again.status).toBe(200)
    expect(bucket.readsOf('tiles.json')).toBe(reads)
  })

  test('honours tilejsonKey, cache options and a custom binding', async () => {
    worker = createTileWorker({ binding: 'MAPS', tilejsonKey: 'basemap.json', tilejsonCacheControl: 'public, max-age=5' })
    bucket.put('basemap.json', JSON.stringify(published), 'application/json')
    const res = await get('/basemap.json', undefined, { MAPS: bucket })
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=5')
    expect((await res.json() as typeof published).tiles[0]).toBe(`${HOST}/planet/20261006/{z}/{x}/{y}.pbf`)
  })

  test('404 when the bucket has no TileJSON; 500 without a binding', async () => {
    bucket.objects.delete('tiles.json')
    expect((await get('/tiles.json')).status).toBe(404)
    const original = console.error
    console.error = () => {}
    try {
      expect((await get('/tiles.json', undefined, {})).status).toBe(500)
    }
    finally {
      console.error = original
    }
  })
})

describe('GET /<archive>/{z}/{x}/{y}.pbf', () => {
  test('serves the stored gzip bytes as-is, cached forever', async () => {
    const res = await get(tilePath(5, x5, y5))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/vnd.mapbox-vector-tile')
    expect(res.headers.get('Content-Encoding')).toBe('gzip')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{16}-[0-9a-z]+-[0-9a-z]+"$/)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body = new Uint8Array(await res.arrayBuffer())
    expect([body[0], body[1]]).toEqual([0x1F, 0x8B])
    expect(layersOf(body)).toEqual(['transportation', 'water'])
  })

  test('a repeat tile is answered from caches.default without touching R2', async () => {
    const first = new Uint8Array(await (await get(tilePath(5, x5, y5))).arrayBuffer())
    expect(cache.entries.has(`${HOST}${tilePath(5, x5, y5)}`)).toBe(true)
    const reads = bucket.reads.length

    // A fresh isolate (a new worker, nothing in memory) still never reads R2.
    worker = createTileWorker()
    const again = await get(tilePath(5, x5, y5))
    expect(again.status).toBe(200)
    expect(again.headers.get('Content-Encoding')).toBe('gzip')
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(first)
    // Nor does a query string: the cache key is the path.
    expect((await get(`${tilePath(5, x5, y5)}?cachebust=1`)).status).toBe(200)
    expect(bucket.reads.length).toBe(reads)
  })

  test('answers 304 to a matching If-None-Match, and HEAD without a body', async () => {
    const etag = (await get(tilePath(5, x5, y5))).headers.get('ETag')!
    const notModified = await get(tilePath(5, x5, y5), { headers: { 'If-None-Match': etag } })
    expect(notModified.status).toBe(304)
    expect(notModified.headers.get('ETag')).toBe(etag)
    expect(await notModified.text()).toBe('')
    const head = await get(tilePath(4, ...lonLatToTile(4)), { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('Content-Encoding')).toBe('gzip')
    expect(await head.text()).toBe('')
  })

  test('204 for an empty tile inside the bounds, 404 outside them or past maxzoom', async () => {
    const empty = await get(tilePath(5, x5 - 1, y5))
    expect(empty.status).toBe(204)
    expect(empty.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(empty.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect((await get(tilePath(5, 0, 0))).status).toBe(404)
    expect((await get(tilePath(6, x5 * 2, y5 * 2))).status).toBe(404)

    // Both are immutable answers for this build, so they are cached too.
    const reads = bucket.reads.length
    expect((await get(tilePath(5, x5 - 1, y5))).status).toBe(204)
    expect((await get(tilePath(5, 0, 0))).status).toBe(404)
    expect(bucket.reads.length).toBe(reads)
  })

  test('400 for coordinates off the grid', async () => {
    expect((await get(tilePath(2, 4, 0))).status).toBe(400)
    expect((await get(tilePath(3, 0, 8))).status).toBe(400)
    expect((await get(tilePath(27, 0, 0))).status).toBe(400)
  })

  test('404, uncached, for an archive that is not in the bucket', async () => {
    const res = await get('/planet/20991231/0/0/0.pbf')
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(cache.entries.has(`${HOST}/planet/20991231/0/0/0.pbf`)).toBe(false)
  })

  test('keeps leaf directories in the Cache API for the next cold isolate', async () => {
    const header = parseHeader(archiveBytes)
    const leafReads = (): number => bucket.reads.filter(({ key, range }) =>
      key === ARCHIVE_KEY && range?.offset !== undefined
      && range.offset >= header.leafDirectoryOffset && range.offset < header.leafDirectoryOffset + header.leafDirectoryLength).length

    expect((await get(tilePath(5, x5, y5))).status).toBe(200)
    expect(leafReads()).toBeGreaterThan(0)
    const before = leafReads()
    expect([...cache.entries.keys()].some(key => key.startsWith(`${HOST}/__pmtiles/`))).toBe(true)

    // A new isolate, and the tile's own response evicted from the edge: the
    // header comes from R2, the leaf from the Cache API, then the tile itself.
    worker = createTileWorker()
    cache.entries.delete(`${HOST}${tilePath(5, x5, y5)}`)
    const reads = bucket.reads.length
    expect((await get(tilePath(5, x5, y5))).status).toBe(200)
    expect(bucket.reads.length).toBe(reads + 2)
    expect(leafReads()).toBe(before)
  })

  test('an archive overwritten in place is re-read, never mixed with the old build', async () => {
    expect((await get(tilePath(4, ...lonLatToTile(4)))).status).toBe(200)
    bucket.put(ARCHIVE_KEY, await archive('v2'))
    const res = await get(tilePath(3, ...lonLatToTile(3)))
    expect(res.status).toBe(200)
    const tile = new VectorTile(new Pbf(gunzipSync(new Uint8Array(await res.arrayBuffer()))))
    expect(tile.layers.transportation!.feature(0).properties.label).toBe('v2')
  })
})

describe('everything else passes through to R2', () => {
  test('a Range read of the archive is a 206 with Content-Range, as from the bucket', async () => {
    const res = await get(`/${ARCHIVE_KEY}`, { headers: { Range: 'bytes=0-126' } })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe(`bytes 0-126/${archiveBytes.length}`)
    expect(res.headers.get('Content-Length')).toBe('127')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(res.headers.get('ETag')).toMatch(/^"etag\d+"$/)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('Content-Range')
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('ETag')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(archiveBytes.slice(0, 127))

    const suffix = await get(`/${ARCHIVE_KEY}`, { headers: { Range: 'bytes=-10' } })
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('Content-Range')).toBe(`bytes ${archiveBytes.length - 10}-${archiveBytes.length - 1}/${archiveBytes.length}`)
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(archiveBytes.slice(-10))

    // Past the end: clamped like any HTTP host; starting past it: 416.
    const tail = await get(`/${ARCHIVE_KEY}`, { headers: { Range: `bytes=${archiveBytes.length - 4}-99999999` } })
    expect(tail.headers.get('Content-Range')).toBe(`bytes ${archiveBytes.length - 4}-${archiveBytes.length - 1}/${archiveBytes.length}`)
    const beyond = await get(`/${ARCHIVE_KEY}`, { headers: { Range: `bytes=${archiveBytes.length}-` } })
    expect(beyond.status).toBe(416)
    expect(beyond.headers.get('Content-Range')).toBe(`bytes */${archiveBytes.length}`)
  })

  test('pmtiles:// clients keep reading the archive through the Worker', async () => {
    const fetchViaWorker = (url: string, init: RequestInit): Promise<Response> => worker.fetch(new Request(url, init), { TILES: bucket }, context())
    const reader = new PMTiles(new FetchSource(`${HOST}/${ARCHIVE_KEY}`, { fetch: fetchViaWorker }))
    const bytes = await reader.getTileData(5, x5, y5)
    expect(Object.keys(new VectorTile(new Pbf(bytes!)).layers).sort()).toEqual(['transportation', 'water'])
  })

  test('other objects keep their Content-Type, ETag revalidation and HEAD', async () => {
    const res = await get('/_builds/20261006/status.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Content-Length')).toBe('16')
    expect(await res.json()).toEqual({ state: 'done' })

    const etag = res.headers.get('ETag')!
    expect((await get('/_builds/20261006/status.json', { headers: { 'If-None-Match': etag } })).status).toBe(304)
    expect((await get('/_builds/20261006/status.json', { headers: { 'If-Match': '"other"' } })).status).toBe(412)

    const head = await get(`/${ARCHIVE_KEY}`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('Content-Length')).toBe(String(archiveBytes.length))
    expect(await head.text()).toBe('')

    expect((await get('/nope.txt')).status).toBe(404)
  })

  test('OPTIONS is a CORS preflight; writes are refused', async () => {
    const preflight = await get(`/${ARCHIVE_KEY}`, { method: 'OPTIONS', headers: { 'Access-Control-Request-Headers': 'range' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS')
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('range')
    const post = await get('/tiles.json', { method: 'POST' })
    expect(post.status).toBe(405)
    expect(post.headers.get('Allow')).toBe('GET, HEAD, OPTIONS')
    expect((await get(`/${ARCHIVE_KEY}`, { method: 'PUT' })).status).toBe(405)
  })
})

describe('helpers', () => {
  test('archiveKeyFromTileUrl', () => {
    expect(archiveKeyFromTileUrl(`pmtiles://${HOST}/planet/20261006.pmtiles`)).toBe('planet/20261006.pmtiles')
    expect(archiveKeyFromTileUrl(`pmtiles://${HOST}/planet/20261006.pmtiles/{z}/{x}/{y}`)).toBe('planet/20261006.pmtiles')
    expect(archiveKeyFromTileUrl(`${HOST}/planet/{z}/{x}/{y}.pbf`)).toBeUndefined()
    expect(archiveKeyFromTileUrl(undefined)).toBeUndefined()
  })

  test('parseRange', () => {
    expect(parseRange('bytes=0-99')).toEqual({ offset: 0, length: 100 })
    expect(parseRange('bytes=100-')).toEqual({ offset: 100 })
    expect(parseRange('bytes=-5')).toEqual({ suffix: 5 })
    expect(parseRange('bytes=0-1,4-5')).toBeUndefined()
    expect(parseRange('bytes=9-1')).toBeUndefined()
    expect(parseRange(null)).toBeUndefined()
  })
})

describe('bundle', () => {
  test('builds for a Worker: no Bun, no node:*, nothing from ts-maps/server', async () => {
    const forbidden: string[] = []
    const loaded: string[] = []
    const result = await Bun.build({
      entrypoints: [resolve(import.meta.dir, '../src/worker/index.ts')],
      target: 'browser',
      format: 'esm',
      plugins: [{
        name: 'worker-safe',
        setup(build) {
          // Bun polyfills some `node:*` modules for the browser target, so a
          // successful build alone would not prove the bundle is Worker-safe.
          build.onResolve({ filter: /^(node:|bun$|bun:)/ }, (args) => {
            forbidden.push(args.path)
            return { path: args.path, external: true }
          })
          build.onLoad({ filter: /\.ts$/ }, async (args) => {
            loaded.push(args.path)
            return { contents: await Bun.file(args.path).text(), loader: 'ts' }
          })
        },
      }],
    })
    expect(result.success).toBe(true)
    expect(forbidden).toEqual([])
    expect(loaded.some(path => path.includes('/src/server/'))).toBe(false)
    const code = await result.outputs[0]!.text()
    expect(code).not.toMatch(/\bBun\./)
    expect(code).not.toMatch(/\brequire\(/)
    expect(code).toContain('createTileWorker')
  })
})
