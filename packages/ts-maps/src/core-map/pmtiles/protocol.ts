// `pmtiles://` — a PMTiles archive on a static host, read as if it were a
// tile server.
//
// A whole planet basemap can live in one file in a bucket (R2, S3, GCS) and be
// read straight from the browser with HTTP range requests: no tile server, no
// per-tile objects, one upload. A style says so by prefixing the archive's URL:
//
//   sources: { basemap: { type: 'vector', url: 'pmtiles://https://tiles.example.com/planet.pmtiles' } }
//
// or, TileJSON-style, with the archive in `tiles`:
//
//   sources: { basemap: { type: 'vector', tiles: ['pmtiles://https://tiles.example.com/planet.pmtiles'] } }
//
// Everything downstream of a source speaks in tile URLs — the map's layers,
// the static renderer, the offline cache, downloaded maps — so rather than
// teach each of them a second way to get a tile, an archive gets tile URLs of
// its own:
//
//   pmtiles://https://tiles.example.com/planet.pmtiles/{z}/{x}/{y}
//
// They are synthetic (no host serves them), but they are stable and unique per
// tile, which is all a cache key needs to be. `withPMTiles(fetch)` is the one
// place that knows to answer them from the archive instead of the network: a
// tile there comes back `200` with its decompressed bytes, a tile the archive
// does not have comes back `204` exactly like a tile server's empty answer,
// and the bare archive URL comes back as its TileJSON.
//
// Readers are shared per archive URL. A page with a map, a static figure and
// an offline download all reading one planet open it once: one header read,
// one set of cached directories, and after that one range request per tile.

import type { PMTilesOptions } from './PMTiles'
import type { FetchLike, Source } from './sources'
import { tileTypeContentType } from './header'
import { PMTiles } from './PMTiles'
import { FetchSource } from './sources'

/** The URL scheme that marks a PMTiles archive. */
export const PMTILES_PROTOCOL = 'pmtiles://'

const TEMPLATE_SUFFIX = '/{z}/{x}/{y}'
const TILE_URL = /^pmtiles:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)$/

/** True for any `pmtiles://` URL: an archive, a tile template or a tile. */
export function isPMTilesUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(PMTILES_PROTOCOL)
}

/**
 * The archive behind a `pmtiles://` URL, as a plain URL a reader can fetch:
 * `pmtiles://https://host/a.pmtiles` and
 * `pmtiles://https://host/a.pmtiles/{z}/{x}/{y}` both give
 * `https://host/a.pmtiles`. A URL without the prefix is returned as is.
 */
export function pmtilesArchiveUrl(url: string): string {
  let rest = url.startsWith(PMTILES_PROTOCOL) ? url.slice(PMTILES_PROTOCOL.length) : url
  if (rest.endsWith(TEMPLATE_SUFFIX))
    rest = rest.slice(0, -TEMPLATE_SUFFIX.length)
  return rest
}

/**
 * The archive's own `pmtiles://` URL, `pmtiles://https://host/a.pmtiles`,
 * from any of its forms. Fetched through `withPMTiles` it answers with the
 * archive's TileJSON, which is also the key that TileJSON is cached under
 * offline: without it a map with no connection would not know the archive's
 * top zoom, and could not overzoom past it.
 */
export function pmtilesSourceUrl(url: string): string {
  return `${PMTILES_PROTOCOL}${pmtilesArchiveUrl(url)}`
}

/**
 * The tile URL template for an archive:
 * `pmtiles://https://host/a.pmtiles/{z}/{x}/{y}`. Accepts the archive in any
 * form `pmtilesArchiveUrl` does, so it is safe to call on a template too.
 */
export function pmtilesTileUrl(url: string): string {
  return `${PMTILES_PROTOCOL}${pmtilesArchiveUrl(url)}${TEMPLATE_SUFFIX}`
}

/** Split a concrete tile URL (`pmtiles://…/14/2620/6332`) into archive + coordinates. */
export function parsePMTilesTileUrl(url: string): { archive: string, z: number, x: number, y: number } | undefined {
  const match = TILE_URL.exec(url)
  if (!match)
    return undefined
  return { archive: match[1]!, z: Number(match[2]), x: Number(match[3]), y: Number(match[4]) }
}

// ---------- shared readers ----------

export interface PMTilesArchiveOptions extends PMTilesOptions {
  /**
   * The fetch range requests go through. Readers are shared per fetch, so a
   * custom one (a signing wrapper, a test double) gets readers of its own
   * rather than borrowing the page's. Default: the global `fetch`, looked up
   * on every request.
   */
  fetch?: FetchLike
}

/** Archives registered by hand (`setPMTilesArchive`); they win over everything. */
const registered = new Map<string, PMTiles>()
/** Readers over the global `fetch`. */
const shared = new Map<string, PMTiles>()
/** Readers over a caller's own `fetch`, dropped with it. */
const byFetch = new WeakMap<FetchLike, Map<string, PMTiles>>()

/**
 * The shared reader for an archive. Created on first use; every later call
 * for the same URL (and the same `fetch`) returns the same instance, so the
 * header and directories are read once per page. Reader options only apply
 * when this call is the one that creates it.
 */
export function getPMTilesArchive(url: string, options: PMTilesArchiveOptions = {}): PMTiles {
  const archiveUrl = pmtilesArchiveUrl(url)
  const own = registered.get(archiveUrl)
  if (own)
    return own

  let readers = shared
  if (options.fetch) {
    readers = byFetch.get(options.fetch) ?? new Map()
    byFetch.set(options.fetch, readers)
  }
  let reader = readers.get(archiveUrl)
  if (!reader) {
    const { fetch, ...readerOptions } = options
    reader = new PMTiles(new FetchSource(archiveUrl, { fetch }), readerOptions)
    readers.set(archiveUrl, reader)
  }
  return reader
}

/**
 * Serve `url` from a reader of your own: an archive in memory
 * (`BytesSource`), one behind auth (`FetchSource` with headers), or a private
 * bucket on the server (`S3Source`). `null` forgets it.
 */
export function setPMTilesArchive(url: string, archive: PMTiles | Source | null): void {
  const archiveUrl = pmtilesArchiveUrl(url)
  if (archive === null)
    registered.delete(archiveUrl)
  else
    registered.set(archiveUrl, archive instanceof PMTiles ? archive : new PMTiles(archive))
}

/** Forget every shared and registered reader. Tests, and long-lived hosts. */
export function clearPMTilesArchives(): void {
  registered.clear()
  shared.clear()
}

// ---------- TileJSON ----------

/** What a source learns from an archive: TileJSON 3.0, built from its header and metadata. */
export interface PMTilesTileJSON {
  tilejson: '3.0.0'
  /** One template, `pmtiles://<archive>/{z}/{x}/{y}`. */
  tiles: string[]
  scheme: 'xyz'
  minzoom: number
  maxzoom: number
  /** `[west, south, east, north]`. */
  bounds: [number, number, number, number]
  /** `[lon, lat, zoom]`. */
  center: [number, number, number]
  name?: string
  description?: string
  version?: string
  attribution?: string
  vector_layers?: unknown[]
}

/**
 * The archive as a TileJSON document: zoom range, bounds and centre from the
 * header; name, attribution and `vector_layers` from the metadata. Two reads
 * on a cold reader (the first 16 KiB, then the metadata), none after.
 */
export async function pmtilesTileJSON(url: string, options: PMTilesArchiveOptions = {}): Promise<PMTilesTileJSON> {
  const archive = getPMTilesArchive(url, options)
  const [header, metadata] = await Promise.all([archive.getHeader(), archive.getMetadata()])
  const text = (key: string): string | undefined => typeof metadata[key] === 'string' ? metadata[key] as string : undefined
  const tilejson: PMTilesTileJSON = {
    tilejson: '3.0.0',
    tiles: [pmtilesTileUrl(url)],
    scheme: 'xyz',
    minzoom: header.minZoom,
    maxzoom: header.maxZoom,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    center: [header.centerLon, header.centerLat, header.centerZoom],
  }
  for (const key of ['name', 'description', 'version', 'attribution'] as const) {
    const value = text(key)
    if (value !== undefined)
      tilejson[key] = value
  }
  if (Array.isArray(metadata.vector_layers))
    tilejson.vector_layers = metadata.vector_layers
  return tilejson
}

// ---------- tiles ----------

/**
 * The decompressed bytes of the tile a `pmtiles://…/z/x/y` URL names, or
 * `undefined` when the archive has none there. One range request on a warm
 * reader; `signal` cancels it (the shared directory reads are never cancelled,
 * since other tiles are waiting on them too).
 */
export async function readPMTilesTile(url: string, options: { signal?: AbortSignal, fetch?: FetchLike } = {}): Promise<Uint8Array | undefined> {
  const tile = parsePMTilesTileUrl(url)
  if (!tile)
    throw new Error(`PMTiles: ${url} is not a tile URL (expected pmtiles://<archive>/{z}/{x}/{y})`)
  const archive = getPMTilesArchive(tile.archive, { fetch: options.fetch })
  const data = await archive.getTileData(tile.z, tile.x, tile.y, options.signal)
  // A view into something bigger (an archive held in memory) is copied, so a
  // cache that stores it keeps the tile and not the whole buffer behind it.
  if (data && (data.byteOffset !== 0 || data.byteLength !== data.buffer.byteLength))
    return data.slice()
  return data
}

/** `fetch`, as `withPMTiles` returns it. */
// eslint-disable-next-line no-unused-vars
export type PMTilesFetch = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Wrap `fetch` so `pmtiles://` URLs are answered from the archive:
 *
 * - `pmtiles://<archive>/z/x/y` → `200` with the tile's decompressed bytes and
 *   its `Content-Type`, or `204` when the archive has no tile there, which is
 *   how every consumer already reads "nothing to draw".
 * - `pmtiles://<archive>` → `200` with the archive's TileJSON.
 *
 * Anything else goes to `fetchImpl` untouched. Range requests for the archive
 * go through `fetchImpl` too, so a custom fetch must pass `init` along.
 */
export function withPMTiles(fetchImpl?: FetchLike): PMTilesFetch {
  const network: FetchLike = fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  const fromArchive = async (url: string, init: RequestInit): Promise<Response> => {
    const tile = parsePMTilesTileUrl(url)
    if (!tile) {
      const tilejson = await pmtilesTileJSON(url, { fetch: fetchImpl })
      return new Response(JSON.stringify(tilejson), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const archive = getPMTilesArchive(tile.archive, { fetch: fetchImpl })
    const [header, data] = await Promise.all([
      archive.getHeader(),
      readPMTilesTile(url, { signal: init.signal ?? undefined, fetch: fetchImpl }),
    ])
    if (!data)
      return new Response(null, { status: 204 })
    return new Response(data as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'content-type': tileTypeContentType(header.tileType) } })
  }
  // Not `async`: anything that is not an archive reaches the network on the
  // same tick it would have without this wrapper.
  return (url, init = {}) => isPMTilesUrl(url) ? fromArchive(url, init) : network(url, init)
}

/** `withPMTiles` over the global `fetch`: what the map, the caches and downloads use. */
export const pmtilesFetch: PMTilesFetch = withPMTiles()
