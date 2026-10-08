/**
 * The tile URL for a basemap, read from a TileJSON with fallbacks.
 *
 * Tile services that rebuild their tiles put the build in the tile URL
 * (`/planet/20261006/{z}/{x}/{y}.pbf`), so the URL cannot be hard-coded: it is
 * read from the service's TileJSON. Every app with a basemap needs the same
 * few things around that fetch: a timeout so a hanging service falls through
 * to the next, a second service behind the first, and a session cache so only
 * the first page of a visit waits for it.
 *
 * ```ts
 * const found = await resolveTileJSON([
 *   'https://tiles.wildloop.org/tiles.json',
 *   'https://tiles.openfreemap.org/planet',
 * ])
 * map.setStyle(found
 *   ? styles.light({ tiles: found.tiles, maxzoom: found.maxzoom, attribution: found.attribution })
 *   : styles.light({ mode: 'raster', tiles: RASTER }))
 * ```
 */

export interface ResolveTileJSONOptions {
  /** Per source, in milliseconds. A hanging source falls through to the next. Default 6000. */
  timeoutMs?: number
  /**
   * Session storage key the answer is kept under, so only the first page of a
   * session waits for it. `false` turns the cache off.
   */
  cacheKey?: string | false
  /** Injectable for tests and for runtimes without a global `fetch`. */
  fetch?: typeof fetch
  /** Where the answer is cached. Defaults to `sessionStorage`; `null` for none. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
}

export interface ResolvedTileJSON {
  /** The tile URL template, `{z}/{x}/{y}`. */
  tiles: string
  /** The TileJSON it came from. */
  source: string
  /** The TileJSON's own `attribution`, when it has one. */
  attribution?: string
  minzoom?: number
  /** The top zoom the service builds; past it the map overzooms. */
  maxzoom?: number
  bounds?: [number, number, number, number]
}

const DEFAULT_CACHE_KEY = 'ts-maps:tilejson:v1'

function sessionStore(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  }
  catch {
    // Storage access throws outright in some locked-down WebViews.
    return null
  }
}

function readBody(url: string, body: Record<string, unknown>): ResolvedTileJSON | null {
  const tiles = Array.isArray(body.tiles) && typeof body.tiles[0] === 'string' ? body.tiles[0] : null
  if (!tiles)
    return null
  const found: ResolvedTileJSON = { tiles, source: url }
  if (typeof body.attribution === 'string')
    found.attribution = body.attribution
  if (typeof body.minzoom === 'number')
    found.minzoom = body.minzoom
  if (typeof body.maxzoom === 'number')
    found.maxzoom = body.maxzoom
  if (Array.isArray(body.bounds) && body.bounds.length === 4 && body.bounds.every(n => typeof n === 'number'))
    found.bounds = body.bounds as [number, number, number, number]
  return found
}

async function readTileJSON(url: string, fetcher: typeof fetch, timeoutMs: number): Promise<ResolvedTileJSON | null> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController()
  const timer = setTimeout(() => controller?.abort(), timeoutMs)
  try {
    // Revalidated rather than served from the HTTP cache as is: a rebuild
    // changes which build the TileJSON names, and last week's copy would
    // keep asking for last week's tiles.
    const response = await fetcher(url, { signal: controller?.signal, cache: 'no-cache' })
    if (!response.ok)
      return null
    const body = await response.json() as unknown
    return body && typeof body === 'object' ? readBody(url, body as Record<string, unknown>) : null
  }
  catch {
    return null
  }
  finally {
    clearTimeout(timer)
  }
}

/**
 * The tiles from the first TileJSON in `sources` that answers, or null when
 * none does (offline, blocked); the caller then draws a raster fallback rather
 * than an empty map.
 *
 * Sources are tried in order, each raced against `timeoutMs`. A comma-separated
 * string works as a list, which suits a value read from an environment
 * variable. The answer is cached under `cacheKey` plus the source list, so a
 * different list never reads another's answer.
 */
export async function resolveTileJSON(sources: string | readonly string[], options: ResolveTileJSONOptions = {}): Promise<ResolvedTileJSON | null> {
  const list = (typeof sources === 'string' ? sources.split(',') : [...sources]).map(s => s.trim()).filter(Boolean)
  const fetcher = options.fetch ?? (typeof fetch === 'function' ? fetch : null)
  if (!list.length || !fetcher)
    return null

  const storage = options.storage === undefined ? sessionStore() : options.storage
  const key = options.cacheKey === false ? null : `${options.cacheKey ?? DEFAULT_CACHE_KEY}:${list.join('|')}`
  if (key && storage) {
    try {
      const cached = storage.getItem(key)
      const parsed = cached ? JSON.parse(cached) as ResolvedTileJSON : null
      if (parsed && typeof parsed.tiles === 'string')
        return parsed
    }
    catch {}
  }

  for (const source of list) {
    const found = await readTileJSON(source, fetcher, options.timeoutMs ?? 6000)
    if (!found)
      continue
    if (key && storage) {
      try {
        storage.setItem(key, JSON.stringify(found))
      }
      catch {}
    }
    return found
  }
  return null
}

/** The style's sources that name a TileJSON (`url`) and no tiles of their own. */
export function tileJSONSources(style: { sources?: Record<string, unknown> }): string[] {
  return Object.entries(style.sources ?? {})
    .filter(([, source]) => {
      const s = source as { type?: string, url?: unknown, tiles?: unknown }
      return (s.type === 'vector' || s.type === 'raster' || s.type === 'raster-dem')
        && typeof s.url === 'string' && !s.url.startsWith('pmtiles://')
        && !(Array.isArray(s.tiles) && s.tiles.length)
    })
    .map(([id]) => id)
}

/**
 * A style with every TileJSON source read: `{ type: 'vector', url }` becomes
 * `{ type: 'vector', tiles, minzoom, maxzoom, attribution }`, as Mapbox and
 * MapLibre styles are written and as `setStyle` needs them. What the source
 * says itself wins over the TileJSON. A TileJSON that cannot be read is an
 * error naming the source.
 */
export async function resolveStyleSources<T extends { sources?: Record<string, unknown> }>(style: T, fetcher: (url: string) => Promise<Response>, timeoutMs: number = 10000): Promise<T> {
  const ids = tileJSONSources(style)
  if (!ids.length)
    return style
  const sources = { ...style.sources }
  await Promise.all(ids.map(async (id) => {
    const source = sources[id] as Record<string, unknown>
    const url = source.url as string
    const response = await Promise.race([
      fetcher(url),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`TileJSON for source "${id}" timed out: ${url}`)), timeoutMs)),
    ])
    if (!response.ok)
      throw new Error(`HTTP ${response.status} fetching TileJSON for source "${id}": ${url}`)
    const json = await response.json() as { tiles?: string[], minzoom?: number, maxzoom?: number, attribution?: string, bounds?: number[], scheme?: string, encoding?: string }
    if (!Array.isArray(json.tiles) || !json.tiles.length)
      throw new Error(`TileJSON for source "${id}" has no tiles: ${url}`)
    // Relative tile URLs are relative to the TileJSON.
    const tiles = json.tiles.map(t => new URL(t, new URL(url, globalThis.location?.href ?? 'http://localhost/')).href.replace(/%7B/g, '{').replace(/%7D/g, '}'))
    sources[id] = {
      ...(json.minzoom !== undefined ? { minzoom: json.minzoom } : {}),
      ...(json.maxzoom !== undefined ? { maxzoom: json.maxzoom } : {}),
      ...(json.attribution ? { attribution: json.attribution } : {}),
      ...(json.bounds ? { bounds: json.bounds } : {}),
      ...(json.encoding ? { encoding: json.encoding } : {}),
      ...source,
      tiles,
    }
  }))
  return { ...style, sources }
}
