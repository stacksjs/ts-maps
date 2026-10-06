// A Cloudflare Worker that serves vector tiles out of a PMTiles archive in R2,
// cached at the edge one tile at a time.
//
// Reading an archive straight from a bucket works (`pmtiles://` in the
// browser), but every tile is then a ranged GET that goes all the way to R2:
// uncached, 160-600 ms. Put this Worker on the bucket's hostname and the same
// archive is served as plain `{z}/{x}/{y}.pbf` URLs, each one cached in the
// colo that first asked for it, so a repeat tile never leaves the edge:
//
//   GET /tiles.json                    the bucket's `tiles.json`, its
//                                      `pmtiles://` archive rewritten into
//                                      tile URLs on this host
//   GET /<archive>/{z}/{x}/{y}.pbf     one tile from `<archive>.pmtiles`
//   GET|HEAD anything else             the R2 object of that key, with Range,
//                                      so `pmtiles://` clients and any other
//                                      file in the bucket keep working
//
// Tile URLs carry the archive's own key (`/planet/20261006/14/2620/6332.pbf`).
// Builds are published under new keys, so a tile URL never changes meaning
// and is cached `immutable` for a year: by browsers, and here, in
// `caches.default`. Publishing a new build changes `tiles.json` (cached for a
// minute), which changes every tile URL at once.
//
// Below the response cache, each isolate keeps open readers for the archives
// it has served (header, root and leaf directories decoded in memory, LRU
// bounded), and leaf directories also go to the Cache API, so even a cold
// isolate usually needs exactly one R2 read per new tile.

import type { ExecutionContext, R2Bucket, R2Object, R2ObjectBody, R2Range, WorkerCache } from './types'
import { compressionName } from '../core-map/pmtiles/compression'
import { Compression, TileType, tileTypeContentType } from '../core-map/pmtiles/header'
import { matchesEtag, tileInArchive } from '../core-map/pmtiles/http'
import { PMTiles } from '../core-map/pmtiles/PMTiles'
import { isPMTilesUrl, pmtilesArchiveUrl } from '../core-map/pmtiles/protocol'
import { PMTILES_MAX_ZOOM } from '../core-map/pmtiles/tileid'
import { ArchiveNotFoundError, hasBody, R2Source } from './r2'

export interface TileWorkerOptions {
  /** Name of the R2 bucket binding in `wrangler.toml`. Default `TILES`. */
  binding?: string
  /** Key of the published TileJSON in the bucket, served at `/<key>`. Default `tiles.json`. */
  tilejsonKey?: string
  /**
   * `Cache-Control` for tiles (and their `204` / `404` answers). Tile URLs
   * name an archive build, so the default is a year, `immutable`.
   */
  tileCacheControl?: string
  /** `Cache-Control` for the TileJSON. Default one minute, so a new build goes live within a minute. */
  tilejsonCacheControl?: string
  /**
   * A second cache tier shared by every data center.
   *
   * `caches.default` is local to one data center, and Cloudflare's tiered
   * cache does not reach it, so without this each city cuts each tile out of
   * the archive itself: a header read, a directory read and a range read, a
   * second or so. With it, a tile cut once is written back to the bucket as
   * its own small object under `prefix`, and every other data center fetches
   * that object from `origin` (a public hostname of the same bucket) through
   * Cloudflare's CDN, where tiered cache applies: a nearby upper tier answers,
   * and R2 is asked once per region.
   */
  tileStore?: {
    /** Public origin of the bucket, e.g. `https://tiles-origin.example.com`. */
    origin: string
    /** Key prefix for stored tiles. Default `_tiles/`. */
    prefix?: string
  }
}

/**
 * A Worker's `env`: the bucket binding lives under `options.binding`. Typed
 * as `object` so an app's own `Env` interface is accepted as it is.
 */
export type TileWorkerEnv = object

/** A module Worker: `export default createTileWorker()`. */
export interface TileWorker {
  // eslint-disable-next-line no-unused-vars
  fetch: (request: Request, env: TileWorkerEnv, ctx: ExecutionContext) => Promise<Response>
}

const DEFAULT_TILE_CACHE = 'public, max-age=31536000, immutable'
const DEFAULT_TILEJSON_CACHE = 'public, max-age=60'
const NO_STORE = 'no-store'

/** Archives an isolate keeps open. Each holds its header and up to 64 leaf directories. */
const MAX_OPEN_ARCHIVES = 8

/** `/<archive key>/{z}/{x}/{y}.pbf`; the key may itself contain slashes. */
const TILE_PATH = /^\/(.+)\/(\d+)\/(\d+)\/(\d+)\.pbf$/

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'ETag, Content-Range, Content-Length, Accept-Ranges, Content-Encoding',
}

const TEXT = 'text/plain; charset=utf-8'

/**
 * `encodeBody: 'manual'` is how a Worker returns bytes that are *already*
 * compressed: the runtime sends them as-is under the `Content-Encoding` the
 * headers name, instead of compressing them a second time. Other runtimes
 * ignore the field.
 */
type WorkerResponseInit = ResponseInit & { encodeBody?: 'automatic' | 'manual' }

function respond(status: number, body: BodyInit | null, headers: Record<string, string> | Headers = {}, manual = false): Response {
  const all = new Headers(headers)
  for (const [key, value] of Object.entries(CORS))
    all.set(key, value)
  const init: WorkerResponseInit = { status, headers: all }
  if (manual)
    init.encodeBody = 'manual'
  return new Response(body, init)
}

function text(status: number, message: string, cacheControl: string, extra: Record<string, string> = {}): Response {
  return respond(status, message, { 'Content-Type': TEXT, 'Cache-Control': cacheControl, ...extra })
}

/**
 * The edge cache and a pre-compressed body do not mix. Stored with
 * `Content-Encoding: gzip`, a tile comes back out of `caches.default` with the
 * gzip bytes and without the header, so a browser hands compressed bytes to
 * the decoder as if they were a tile. Every cache hit was broken that way.
 *
 * So the cached copy carries its encoding in a header of its own, which the
 * cache has no opinion about, and the bytes are opaque to it. On the way out
 * the encoding is restored for a client that accepts it, and the bytes are
 * inflated for one that does not.
 */
const STORED_ENCODING = 'X-Tile-Stored-Encoding'

/** The entry space for cached responses. Bumped to orphan entries stored the old way. */
const CACHE_GENERATION = 'g2'

function cacheKeyFor(url: URL): string {
  return `${url.origin}${url.pathname}?cache=${CACHE_GENERATION}`
}

function forCache(response: Response): Response {
  const headers = new Headers(response.headers)
  const encoding = headers.get('Content-Encoding')
  if (!encoding)
    return response
  headers.delete('Content-Encoding')
  headers.set(STORED_ENCODING, encoding)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function fromCache(request: Request, hit: Response): Response {
  const encoding = hit.headers.get(STORED_ENCODING)
  if (!encoding)
    return hit
  const headers = new Headers(hit.headers)
  headers.delete(STORED_ENCODING)
  const accepted = (request.headers.get('Accept-Encoding') ?? '').toLowerCase().split(',').map(part => part.split(';')[0]!.trim())
  if (accepted.includes(encoding) || accepted.includes('*')) {
    headers.set('Content-Encoding', encoding)
    return new Response(hit.body, { status: hit.status, headers, encodeBody: 'manual' } as WorkerResponseInit)
  }
  headers.delete('Content-Length')
  const body = hit.body && (encoding === 'gzip' || encoding === 'deflate')
    ? hit.body.pipeThrough(new DecompressionStream(encoding as 'gzip' | 'deflate'))
    : hit.body
  return new Response(body, { status: hit.status, headers })
}

/** `caches.default` where the runtime has it (Workers), else no response cache. */
function defaultCache(): WorkerCache | undefined {
  return (globalThis as { caches?: { default?: WorkerCache } }).caches?.default
}

/**
 * Shape a full `200` for the request that asked: `304` when its
 * `If-None-Match` names the ETag, headers only for `HEAD`, otherwise as is.
 * Applied to fresh and cached responses alike.
 */
function finish(request: Request, response: Response): Response {
  const etag = response.headers.get('ETag')
  const notModified = response.status === 200 && !!etag && matchesEtag(request.headers.get('If-None-Match'), etag)
  if (!notModified && request.method !== 'HEAD')
    return response
  void response.body?.cancel()
  const headers = new Headers(response.headers)
  if (notModified) {
    headers.delete('Content-Length')
    headers.delete('Content-Encoding')
  }
  return new Response(null, { status: notModified ? 304 : response.status, headers })
}

/** `planet/20261006` → `/planet/20261006`, each segment URL-encoded. */
function keyPath(key: string): string {
  return `/${key.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * The archive key behind a published tile URL:
 * `pmtiles://https://tiles.example.com/planet/20261006.pmtiles` →
 * `planet/20261006.pmtiles`. `undefined` for anything that is not one.
 */
export function archiveKeyFromTileUrl(url: unknown): string | undefined {
  if (!isPMTilesUrl(url))
    return undefined
  try {
    const key = decodeURIComponent(new URL(pmtilesArchiveUrl(url)).pathname.replace(/^\/+/, ''))
    return key.endsWith('.pmtiles') ? key : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Parse a single-range `Range` header into an R2 range. Anything else
 * (absent, multi-range, malformed) is `undefined`: answered with the whole
 * object, which RFC 9110 allows for a range a server chooses to ignore.
 */
export function parseRange(header: string | null): R2Range | undefined {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!match)
    return undefined
  const [, from, to] = match
  if (from === '' && to === '')
    return undefined
  if (from === '')
    return { suffix: Number(to) }
  if (to === '')
    return { offset: Number(from) }
  if (Number(to) < Number(from))
    return undefined
  return { offset: Number(from), length: Number(to) - Number(from) + 1 }
}

/** The bytes `[start, end]` a range covers in an object of `size`, or `undefined` when none. */
function rangeSpan(range: R2Range, size: number): [number, number] | undefined {
  if (range.suffix !== undefined) {
    if (range.suffix === 0 || size === 0)
      return undefined
    return [Math.max(0, size - range.suffix), size - 1]
  }
  const start = range.offset ?? 0
  if (start >= size)
    return undefined
  const end = range.length === undefined ? size - 1 : Math.min(size, start + range.length) - 1
  return [start, end]
}

/** Response headers for an R2 object, the way the bucket's public endpoint sends them. */
function objectHeaders(object: R2Object): Headers {
  const headers = new Headers()
  if (object.writeHttpMetadata)
    object.writeHttpMetadata(headers)
  else if (object.httpMetadata?.contentType)
    headers.set('Content-Type', object.httpMetadata.contentType)
  if (!headers.has('Content-Type'))
    headers.set('Content-Type', 'application/octet-stream')
  headers.set('ETag', object.httpEtag || `"${object.etag}"`)
  headers.set('Last-Modified', object.uploaded.toUTCString())
  headers.set('Accept-Ranges', 'bytes')
  return headers
}

/**
 * The tile Worker. Bind an R2 bucket and export it:
 *
 * ```ts
 * import { createTileWorker } from 'ts-maps/worker'
 * export default createTileWorker()
 * ```
 */
export function createTileWorker(options: TileWorkerOptions = {}): TileWorker {
  const binding = options.binding ?? 'TILES'
  const tilejsonKey = (options.tilejsonKey ?? 'tiles.json').replace(/^\/+/, '')
  const tileCacheControl = options.tileCacheControl ?? DEFAULT_TILE_CACHE
  const tilejsonCacheControl = options.tilejsonCacheControl ?? DEFAULT_TILEJSON_CACHE

  // Open readers, by archive key. Map order is LRU order. A reader is shared
  // by every request the isolate handles, so a burst of tiles from one map
  // view shares one header read and one read per leaf directory.
  const archives = new Map<string, { archive: PMTiles, source: R2Source }>()

  function bucketOf(env: TileWorkerEnv): R2Bucket {
    const bucket = (env as Record<string, unknown> | undefined)?.[binding] as R2Bucket | undefined
    if (!bucket || typeof bucket.get !== 'function')
      throw new Error(`ts-maps/worker: no R2 bucket bound as \`${binding}\` (add an [[r2_buckets]] binding to wrangler.toml)`)
    return bucket
  }

  function openArchive(bucket: R2Bucket, key: string, origin: string): { archive: PMTiles, source: R2Source } {
    const open = archives.get(key)
    if (open) {
      archives.delete(key)
      archives.set(key, open)
      return open
    }
    const source = new R2Source(bucket, key, { cache: defaultCache(), cacheKeyPrefix: `${origin}/__pmtiles` })
    // No `revalidate`: builds are published under new keys, and an archive
    // overwritten in place anyway is caught by the ETag precondition on
    // every directory and tile read.
    const opened = { archive: new PMTiles(source), source }
    archives.set(key, opened)
    while (archives.size > MAX_OPEN_ARCHIVES)
      archives.delete(archives.keys().next().value!)
    return opened
  }

  async function tileResponse(bucket: R2Bucket, archiveKey: string, origin: string, z: number, x: number, y: number, ctx: ExecutionContext): Promise<{ response: Response, cacheable: boolean }> {
    const { archive, source } = openArchive(bucket, archiveKey, origin)
    try {
      const [header, version] = await Promise.all([archive.getHeader(), archive.getVersion()])

      if (header.tileType !== TileType.Mvt)
        return { response: text(404, 'This archive does not hold vector tiles', tileCacheControl), cacheable: true }
      if (!tileInArchive(header, z, x, y))
        return { response: text(404, 'Tile outside archive bounds', tileCacheControl), cacheable: true }

      const tile = await archive.getTile(z, x, y)
      if (!tile)
        return { response: respond(204, null, { 'Cache-Control': tileCacheControl }), cacheable: true }

      // Archives store tiles compressed (gzip, for every planetiler build).
      // Those bytes go out untouched: `Content-Encoding` says what they are
      // and `encodeBody: 'manual'` stops the runtime compressing them again.
      // Cloudflare inflates them itself for the rare client without gzip.
      const compressed = tile.compression !== Compression.None && tile.compression !== Compression.Unknown
      const headers: Record<string, string> = {
        'Content-Type': tileTypeContentType(header.tileType),
        'Cache-Control': tileCacheControl,
        'ETag': `"${version}-${tile.offset.toString(36)}-${tile.data.length.toString(36)}"`,
      }
      if (compressed)
        headers['Content-Encoding'] = compressionName(tile.compression)
      return { response: respond(200, tile.data as Uint8Array<ArrayBuffer>, headers, compressed), cacheable: true }
    }
    catch (error) {
      if (!(error instanceof ArchiveNotFoundError))
        throw error
      archives.delete(archiveKey)
      // Not cached: the archive may simply not be uploaded yet.
      return { response: text(404, `No archive at ${archiveKey}`, NO_STORE), cacheable: false }
    }
    finally {
      // Leaf directories this request read went to the Cache API; keep the
      // isolate alive until they are written.
      for (const write of source.takePending())
        ctx.waitUntil(write)
    }
  }

  const tileStore = options.tileStore
  const tileStorePrefix = tileStore?.prefix ?? '_tiles/'

  /**
   * The tile as its own object, through Cloudflare's CDN so tiered cache
   * applies. `undefined` when it has not been stored yet, or the origin is
   * unreachable: the caller cuts it from the archive, as before. A zero-byte
   * object is a tile the archive does not have.
   */
  async function fromTileStore(key: string): Promise<Response | undefined> {
    let stored: Response
    try {
      stored = await fetch(`${tileStore!.origin.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`, {
        cf: { cacheEverything: true, cacheTtl: 31536000 },
      } as RequestInit)
    }
    catch {
      return undefined
    }
    if (stored.status !== 200) {
      void stored.body?.cancel()
      return undefined
    }
    const headers = new Headers({
      'Content-Type': 'application/vnd.mapbox-vector-tile',
      'Cache-Control': tileCacheControl,
      ...CORS,
    })
    const etag = stored.headers.get('ETag')
    if (etag)
      headers.set('ETag', etag)
    if (stored.headers.get('Content-Length') === '0') {
      void stored.body?.cancel()
      return new Response(null, { status: 204, headers })
    }
    // The body arrives decoded, whatever the object was stored as, and the
    // runtime compresses it again for the client that asked.
    return new Response(stored.body, { status: 200, headers })
  }

  /** Write a tile cut from the archive back to the bucket for every other data center. */
  async function storeTile(bucket: R2Bucket, key: string, response: Response): Promise<void> {
    const bytes = new Uint8Array(await response.arrayBuffer())
    await bucket.put!(key, bytes, {
      httpMetadata: {
        contentType: 'application/vnd.mapbox-vector-tile',
        cacheControl: tileCacheControl,
        ...(response.headers.get('Content-Encoding') ? { contentEncoding: response.headers.get('Content-Encoding')! } : {}),
      },
    })
  }

  async function serveTile(request: Request, url: URL, bucket: R2Bucket, ctx: ExecutionContext, match: RegExpExecArray): Promise<Response> {
    const [, rawKey, zs, xs, ys] = match
    const z = Number(zs)
    const x = Number(xs)
    const y = Number(ys)
    if (z > PMTILES_MAX_ZOOM || x >= 2 ** z || y >= 2 ** z)
      return text(400, `Tile ${z}/${x}/${y} does not exist`, NO_STORE)
    let archiveKey: string
    try {
      archiveKey = `${decodeURIComponent(rawKey!)}.pmtiles`
    }
    catch {
      return text(400, 'Malformed archive key', NO_STORE)
    }

    // Keyed on the path alone: a query string must not be a way to bypass
    // the cache and reach R2.
    const cache = defaultCache()
    const cacheKey = cacheKeyFor(url)
    const hit = await cache?.match(cacheKey)
    if (hit)
      return finish(request, fromCache(request, hit))

    const storedKey = `${tileStorePrefix}${archiveKey.slice(0, -'.pmtiles'.length)}/${z}/${x}/${y}.pbf`
    const tiered = tileStore ? await fromTileStore(storedKey) : undefined
    if (tiered) {
      if (cache)
        ctx.waitUntil(cache.put(cacheKey, forCache(tiered.clone())).catch(() => {}))
      return finish(request, tiered)
    }

    const { response, cacheable } = await tileResponse(bucket, archiveKey, url.origin, z, x, y, ctx)
    if (cache && cacheable)
      ctx.waitUntil(cache.put(cacheKey, forCache(response.clone())).catch(() => {}))
    if (tileStore && cacheable && bucket.put && (response.status === 200 || response.status === 204))
      ctx.waitUntil(storeTile(bucket, storedKey, response.clone()).catch(() => {}))
    return finish(request, response)
  }

  async function serveTileJSON(request: Request, url: URL, bucket: R2Bucket, ctx: ExecutionContext): Promise<Response> {
    const cache = defaultCache()
    const cacheKey = cacheKeyFor(url)
    const hit = await cache?.match(cacheKey)
    if (hit)
      return finish(request, fromCache(request, hit))

    const object = await bucket.get(tilejsonKey)
    if (!object || !hasBody(object))
      return text(404, `No ${tilejsonKey} in the bucket`, NO_STORE)
    let document: Record<string, unknown>
    try {
      document = JSON.parse(await (object as R2ObjectBody).text()) as Record<string, unknown>
    }
    catch {
      return text(502, `${tilejsonKey} is not valid JSON`, NO_STORE)
    }

    // `pmtiles://https://<host>/planet/20261006.pmtiles` becomes
    // `https://<this host>/planet/20261006/{z}/{x}/{y}.pbf`: the build stays in
    // the path, so every tile URL is immutable. Everything else is kept.
    const tiles = Array.isArray(document.tiles) ? document.tiles : []
    const archiveKey = archiveKeyFromTileUrl(tiles[0])
    if (archiveKey)
      document.tiles = [`${url.origin}${keyPath(archiveKey.slice(0, -'.pmtiles'.length))}/{z}/{x}/{y}.pbf`]

    const response = respond(200, JSON.stringify(document), {
      'Content-Type': 'application/json',
      'Cache-Control': tilejsonCacheControl,
      // Not the stored object's ETag: this is a different document (its tile
      // URLs are rewritten), and a browser that cached the stored one straight
      // from the bucket would revalidate with that ETag, get a 304 and keep
      // the old document for good.
      'ETag': `W/"tilejson-${object.etag}"`,
    })
    if (cache)
      ctx.waitUntil(cache.put(cacheKey, forCache(response.clone())).catch(() => {}))
    return finish(request, response)
  }

  /** Any other key: the R2 object itself, as the bucket's public endpoint would serve it. */
  async function serveObject(request: Request, url: URL, bucket: R2Bucket): Promise<Response> {
    let key: string
    try {
      key = decodeURIComponent(url.pathname.slice(1))
    }
    catch {
      return text(400, 'Malformed key', NO_STORE)
    }
    if (!key)
      return text(404, 'Not found', NO_STORE)

    if (request.method === 'HEAD') {
      const object = await bucket.head(key)
      if (!object)
        return text(404, 'Not found', NO_STORE)
      const headers = objectHeaders(object)
      headers.set('Content-Length', String(object.size))
      return finish(request, respond(200, null, headers))
    }

    const range = parseRange(request.headers.get('Range'))
    let object: R2Object | R2ObjectBody | null
    try {
      object = await bucket.get(key, range ? { range } : undefined)
    }
    catch (error) {
      // R2 rejects a range that starts past the end of the object.
      const head = range ? await bucket.head(key) : null
      if (head && !rangeSpan(range!, head.size))
        return text(416, 'Range not satisfiable', NO_STORE, { 'Content-Range': `bytes */${head.size}` })
      throw error
    }
    if (!object || !hasBody(object))
      return text(404, 'Not found', NO_STORE)

    const headers = objectHeaders(object)
    const etag = headers.get('ETag')!
    const ifMatch = request.headers.get('If-Match')
    if (ifMatch && !matchesEtag(ifMatch, etag)) {
      await object.body.cancel()
      return text(412, 'Precondition failed', NO_STORE)
    }
    if (matchesEtag(request.headers.get('If-None-Match'), etag)) {
      await object.body.cancel()
      return respond(304, null, headers)
    }

    // A stored `Content-Encoding` means the stored bytes are already encoded:
    // pass them through rather than letting the runtime encode them again.
    const manual = headers.has('Content-Encoding')
    if (range) {
      const span = rangeSpan(object.range ?? range, object.size)
      if (!span) {
        await object.body.cancel()
        return text(416, 'Range not satisfiable', NO_STORE, { 'Content-Range': `bytes */${object.size}` })
      }
      headers.set('Content-Range', `bytes ${span[0]}-${span[1]}/${object.size}`)
      headers.set('Content-Length', String(span[1] - span[0] + 1))
      return respond(206, object.body, headers, manual)
    }
    headers.set('Content-Length', String(object.size))
    return respond(200, object.body, headers, manual)
  }

  return {
    async fetch(request, env, ctx) {
      if (request.method === 'OPTIONS') {
        return respond(204, null, {
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') ?? 'Range, If-Match, If-None-Match',
          'Access-Control-Max-Age': '86400',
        })
      }
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return text(405, 'Method not allowed', NO_STORE, { Allow: 'GET, HEAD, OPTIONS' })

      try {
        const url = new URL(request.url)
        const bucket = bucketOf(env)
        if (url.pathname === `/${tilejsonKey}`)
          return await serveTileJSON(request, url, bucket, ctx)
        const tile = TILE_PATH.exec(url.pathname)
        if (tile)
          return await serveTile(request, url, bucket, ctx, tile)
        return await serveObject(request, url, bucket)
      }
      catch (error) {
        // eslint-disable-next-line no-console
        console.error('[ts-maps/worker]', error)
        return text(500, 'Tile archive unavailable', NO_STORE)
      }
    },
  }
}
