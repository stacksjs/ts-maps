// A vector (and raster) tile server over one PMTiles archive.
//
// Framework-neutral — a Web `Request` in, a `Response` out — so the same
// handler runs under `Bun.serve`, inside a Stacks route or action, or behind
// any fetch-style router. It serves:
//
//   GET {basePath}/tiles.json         TileJSON 3.0 (also at {basePath} itself)
//   GET {basePath}/{z}/{x}/{y}.pbf    a tile (.png / .jpg / .webp / .avif for
//                                     raster archives)
//
// Answers are shaped for what sits in front of a tile server in production —
// a CDN — and for what reads it — MapLibre, ts-maps, Leaflet:
//
// - **Cache forever, safely.** TileJSON hands out tile URLs carrying the
//   archive's version (`?v=3d12dcf7…`, a hash of its header and root
//   directory). A versioned URL can never change meaning, so it is served
//   `immutable` for a year; rebuild the archive and the TileJSON points at new
//   URLs. Requests without (or with a stale) `v` still work, cached briefly.
// - **ETag / 304** on every tile, keyed on the tile's bytes in the archive.
// - **No double compression work.** Archives store tiles gzipped. A client
//   that accepts gzip gets those bytes untouched with `Content-Encoding:
//   gzip`; one that does not gets them inflated. `Vary: Accept-Encoding` keeps
//   caches honest.
// - **Empty vs. missing.** Inside the archive's zoom range and bounds, a tile
//   the archive does not store is *empty* (open sea, empty desert): `204`, which
//   map clients render as blank without logging an error. Outside them it is
//   `404`, which tells a client to overzoom from the parent tile instead.
// - **CORS** `*` by default: tiles are public data, read cross-origin.

import type { Source } from '../core-map/pmtiles/sources'
import type { OpenArchiveOptions } from './sources'
import { compressionName } from '../core-map/pmtiles/compression'
import { Compression, TileType, tileTypeContentType, tileTypeExtension } from '../core-map/pmtiles/header'
import { acceptsEncoding, archiveBounds, matchesEtag, tileInArchive } from '../core-map/pmtiles/http'
import { PMTiles } from '../core-map/pmtiles/PMTiles'
import { FileSource, sourceFromLocation } from './sources'
import { nodeDecompress } from './zlib'

export interface TileServerOptions {
  /**
   * The archive: a path, `https://` URL, `s3://bucket/key`, a `Source`, or an
   * open `PMTiles` reader.
   */
  archive: string | Source | PMTiles
  /** Path prefix the routes live under, e.g. `/tiles`. Default: none. */
  basePath?: string
  /**
   * Public URL of `basePath`, used to build the absolute tile URLs in TileJSON,
   * e.g. `https://tiles.example.com` or `https://example.com/tiles`. Default:
   * the request's own origin + `basePath`. Set it whenever a proxy or CDN sits
   * in front, since the request then carries the internal address.
   */
  publicUrl?: string
  /** TileJSON `attribution`. Default: the archive metadata's. */
  attribution?: string
  /** TileJSON `name`. Default: the archive metadata's. */
  name?: string
  /** TileJSON `description`. Default: the archive metadata's. */
  description?: string
  /** `Cache-Control` for tiles requested under the current version. */
  cacheControl?: string
  /** `Cache-Control` for tiles requested without (or with a stale) version. */
  unversionedCacheControl?: string
  /** `Cache-Control` for the TileJSON document. */
  tileJSONCacheControl?: string
  /** `Access-Control-Allow-Origin`. Default `*`; `false` sends no CORS headers. */
  cors?: string | false
  /** Extra headers on every response. */
  headers?: Record<string, string>
  /** Options for opening a string `archive`. */
  open?: OpenArchiveOptions
  /**
   * How often (ms) to re-read the archive header to pick up a rebuilt archive
   * published under the same name. Default 5 s for local files (a 16 KiB
   * read), 60 s for remote ones (one ranged request). `false` never checks.
   * Ignored when `archive` is an already-open `PMTiles`.
   */
  revalidate?: number | false
  /** Called with failures that became a 5xx. Default: `console.error`. */
  // eslint-disable-next-line no-unused-vars
  onError?: (error: unknown, request: Request) => void
}

/** TileJSON 3.0.0 (https://github.com/mapbox/tilejson-spec/tree/master/3.0.0). */
export interface TileJSON {
  tilejson: '3.0.0'
  tiles: string[]
  name?: string
  description?: string
  version?: string
  attribution?: string
  scheme: 'xyz'
  minzoom: number
  maxzoom: number
  bounds: [number, number, number, number]
  center: [number, number, number]
  /** Tile format, the Mapbox convention: `pbf`, `png`, … */
  format?: string
  vector_layers?: unknown[]
}

export interface TileServer {
  /** The reader, for direct use (`getTileData`, `getMetadata`, …). */
  readonly archive: PMTiles
  /** Answer a tile-server request, or `undefined` for paths it does not own. */
  // eslint-disable-next-line no-unused-vars
  handle: (request: Request) => Promise<Response | undefined>
  /** `handle` for `Bun.serve`: paths it does not own get a `404`. */
  // eslint-disable-next-line no-unused-vars
  fetch: (request: Request) => Promise<Response>
  /** The TileJSON document, with tile URLs under `publicUrl` (or `baseUrl`). */
  // eslint-disable-next-line no-unused-vars
  tileJSON: (baseUrl?: string) => Promise<TileJSON>
  /** Close the archive's file handles. */
  close: () => Promise<void>
}

const DEFAULT_CACHE = 'public, max-age=31536000, immutable'
const DEFAULT_UNVERSIONED_CACHE = 'public, max-age=3600, stale-while-revalidate=86400'
const DEFAULT_TILEJSON_CACHE = 'public, max-age=300'

const TILE_PATH = /^\/(\d{1,2})\/(\d{1,8})\/(\d{1,8})\.([a-z]{3,4})$/

/** Extensions accepted per tile type; the first is the canonical one. */
function extensionsFor(type: number): string[] {
  switch (type) {
    case TileType.Mvt: return ['pbf', 'mvt']
    case TileType.Jpeg: return ['jpg', 'jpeg']
    default: {
      const ext = tileTypeExtension(type as never)
      return ext ? [ext] : []
    }
  }
}

/** Build the TileJSON for `archive` with tiles under `baseUrl`. */
export async function buildTileJSON(
  archive: PMTiles,
  baseUrl: string,
  overrides: Pick<TileServerOptions, 'attribution' | 'name' | 'description'> = {},
): Promise<TileJSON> {
  const [header, metadata, version] = await Promise.all([archive.getHeader(), archive.getMetadata(), archive.getVersion()])
  const ext = tileTypeExtension(header.tileType) ?? 'bin'
  const text = (value: unknown): string | undefined => typeof value === 'string' && value !== '' ? value : undefined

  // planetiler / tippecanoe write `vector_layers` at the top level; archives
  // converted from MBTiles may still carry it inside a JSON-encoded `json` key.
  let vectorLayers = Array.isArray(metadata.vector_layers) ? metadata.vector_layers : undefined
  if (!vectorLayers && typeof metadata.json === 'string') {
    try {
      const nested = JSON.parse(metadata.json) as { vector_layers?: unknown }
      if (Array.isArray(nested.vector_layers))
        vectorLayers = nested.vector_layers
    }
    catch { /* not JSON; leave it out */ }
  }

  const tileJSON: TileJSON = {
    tilejson: '3.0.0',
    tiles: [`${baseUrl.replace(/\/$/, '')}/{z}/{x}/{y}.${ext}?v=${version}`],
    name: overrides.name ?? text(metadata.name),
    description: overrides.description ?? text(metadata.description),
    version: text(metadata.version),
    attribution: overrides.attribution ?? text(metadata.attribution),
    scheme: 'xyz',
    minzoom: header.minZoom,
    maxzoom: header.maxZoom,
    bounds: archiveBounds(header),
    center: [header.centerLon, header.centerLat, header.centerZoom],
    format: ext,
  }
  if (header.tileType === TileType.Mvt)
    tileJSON.vector_layers = vectorLayers ?? []
  // Drop absent optional keys so the document stays tidy on the wire.
  for (const key of Object.keys(tileJSON) as Array<keyof TileJSON>) {
    if (tileJSON[key] === undefined)
      delete tileJSON[key]
  }
  return tileJSON
}

/**
 * Serve one PMTiles archive over HTTP.
 *
 * ```ts
 * const tiles = createTileServer({ archive: './basemap.pmtiles', basePath: '/tiles' })
 * Bun.serve({ port: 8080, fetch: tiles.fetch })
 * // http://localhost:8080/tiles/tiles.json
 * ```
 */
export function createTileServer(options: TileServerOptions): TileServer {
  const base = (options.basePath ?? '').replace(/\/+$/, '')
  let archive: PMTiles
  if (options.archive instanceof PMTiles) {
    archive = options.archive
  }
  else {
    const source = typeof options.archive === 'string' ? sourceFromLocation(options.archive, options.open) : options.archive
    const revalidate = options.revalidate ?? (source instanceof FileSource ? 5000 : 60_000)
    archive = new PMTiles(source, { decompress: nodeDecompress, revalidate })
  }

  const cacheControl = options.cacheControl ?? DEFAULT_CACHE
  const unversionedCacheControl = options.unversionedCacheControl ?? DEFAULT_UNVERSIONED_CACHE
  const tileJSONCacheControl = options.tileJSONCacheControl ?? DEFAULT_TILEJSON_CACHE
  const cors = options.cors === undefined ? '*' : options.cors
  const report = options.onError ?? ((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[ts-maps/server]', error)
  })

  const headersFor = (extra: Record<string, string>): Headers => {
    const headers = new Headers(options.headers)
    if (cors) {
      headers.set('Access-Control-Allow-Origin', cors)
      headers.set('Access-Control-Expose-Headers', 'ETag, Content-Encoding, Content-Length')
    }
    for (const [key, value] of Object.entries(extra))
      headers.set(key, value)
    return headers
  }

  const respond = (request: Request, status: number, body: Uint8Array | string | null, extra: Record<string, string> = {}): Response => {
    const headers = headersFor(extra)
    if (body !== null && request.method === 'HEAD') {
      headers.set('Content-Length', String(typeof body === 'string' ? new TextEncoder().encode(body).length : body.length))
      return new Response(null, { status, headers })
    }
    return new Response(body as BodyInit | null, { status, headers })
  }

  const tileJSON = (baseUrl?: string): Promise<TileJSON> =>
    buildTileJSON(archive, options.publicUrl ?? baseUrl ?? base, options)

  async function serveTile(request: Request, url: URL, z: number, x: number, y: number, ext: string): Promise<Response> {
    const [header, version] = await Promise.all([archive.getHeader(), archive.getVersion()])
    const plain = { 'Content-Type': 'text/plain; charset=utf-8' }

    if (!extensionsFor(header.tileType).includes(ext))
      return respond(request, 404, `This archive serves .${extensionsFor(header.tileType)[0] ?? 'bin'} tiles`, plain)
    const n = 2 ** z
    if (x >= n || y >= n)
      return respond(request, 400, `Tile ${z}/${x}/${y} does not exist`, plain)

    const versioned = url.searchParams.get('v') === version
    const caching = { 'Cache-Control': versioned ? cacheControl : unversionedCacheControl }

    // Outside the zoom range or the bounds: not ours, let the client overzoom.
    if (!tileInArchive(header, z, x, y))
      return respond(request, 404, 'Tile outside archive bounds', { ...plain, ...caching })

    const tile = await archive.getTile(z, x, y, request.signal)
    if (!tile)
      return respond(request, 204, null, caching)

    // Serve the stored encoding when the client takes it; inflate otherwise.
    const coding = compressionName(tile.compression)
    const compressed = tile.compression !== Compression.None && tile.compression !== Compression.Unknown
    const passthrough = compressed && acceptsEncoding(request.headers.get('Accept-Encoding'), coding)
    const etag = `"${version}-${tile.offset.toString(36)}-${tile.data.length.toString(36)}${passthrough ? `-${coding}` : ''}"`

    const headers: Record<string, string> = {
      'Content-Type': tileTypeContentType(header.tileType),
      'ETag': etag,
      ...caching,
    }
    if (compressed)
      headers.Vary = 'Accept-Encoding'

    if (matchesEtag(request.headers.get('If-None-Match'), etag))
      return respond(request, 304, null, headers)

    if (passthrough) {
      headers['Content-Encoding'] = coding
      return respond(request, 200, tile.data, headers)
    }
    return respond(request, 200, await archive.decompressBytes(tile.data, tile.compression), headers)
  }

  async function handle(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url)
    if (base && url.pathname !== base && !url.pathname.startsWith(`${base}/`))
      return undefined
    const rest = url.pathname.slice(base.length)

    const isTileJSON = rest === '' || rest === '/' || rest === '/tiles.json'
    const match = isTileJSON ? null : TILE_PATH.exec(rest)
    if (!isTileJSON && !match)
      return undefined

    if (request.method === 'OPTIONS') {
      return respond(request, 204, null, {
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return respond(request, 405, 'Method not allowed', { 'Allow': 'GET, HEAD, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' })

    try {
      if (isTileJSON) {
        const body = JSON.stringify(await tileJSON(`${url.origin}${base}`))
        return respond(request, 200, body, { 'Content-Type': 'application/json', 'Cache-Control': tileJSONCacheControl })
      }
      const [, z, x, y, ext] = match!
      return await serveTile(request, url, Number(z), Number(x), Number(y), ext!)
    }
    catch (error) {
      if (request.signal.aborted)
        return respond(request, 499, null)
      report(error, request)
      return respond(request, 500, 'Tile archive unavailable', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    }
  }

  return {
    archive,
    handle,
    fetch: async request => (await handle(request)) ?? respond(request, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' }),
    tileJSON,
    close: () => archive.close(),
  }
}
