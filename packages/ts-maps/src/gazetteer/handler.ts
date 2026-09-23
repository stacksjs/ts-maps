// The HTTP face of a Gazetteer: the two routes GazetteerGeocoder calls.
// Framework-neutral — a Web `Request` in, a `Response` out — so it mounts in
// Bun.serve, a Stacks action or any fetch-style router.

import type { GeocodingResult } from '../core-map/services/types'
import type { Gazetteer, GazetteerSearchOptions } from './gazetteer'

export interface GazetteerHandlerOptions {
  /** Path prefix the routes live under, e.g. `/api/geo`. Default: none. */
  basePath?: string
  /** Extra response headers, e.g. `Cache-Control` or CORS. */
  headers?: Record<string, string>
}

export interface GazetteerQuery {
  query: string
  options: GazetteerSearchOptions
}

/**
 * Read search parameters the way the handler does, for frameworks that hand
 * an action its query string rather than a Request. Unusable values are
 * dropped rather than rejected: a stray `lat=abc` should not cost the person
 * their results.
 */
export function parseGazetteerQuery(get: (key: string) => string | null | undefined): GazetteerQuery {
  const num = (key: string): number | undefined => {
    const raw = get(key)
    if (raw === null || raw === undefined || raw === '')
      return undefined
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  }

  const options: GazetteerSearchOptions = {}
  const limit = num('limit')
  if (limit !== undefined)
    options.limit = limit
  const lat = num('lat')
  const lng = num('lng')
  if (lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
    options.proximity = { lat, lng }
  const countries = (get('countries') ?? '')
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(c => /^[A-Z]{2}$/.test(c))
  if (countries.length)
    options.countries = countries
  const bbox = (get('bbox') ?? '').split(',').map(Number)
  if (bbox.length === 4 && bbox.every(Number.isFinite))
    options.bbox = bbox as [number, number, number, number]

  return { query: String(get('q') ?? '').slice(0, 200), options }
}

/**
 * `GET {basePath}/search` and `GET {basePath}/reverse`, answering
 * `{ results }`. Any other request resolves to `undefined` so the caller can
 * fall through to its own routes.
 */
export function createGazetteerHandler(
  gazetteer: Gazetteer,
  opts: GazetteerHandlerOptions = {},
): (request: Request) => Promise<Response | undefined> {
  const base = (opts.basePath ?? '').replace(/\/$/, '')

  const json = (body: { results: GeocodingResult[] } | { error: string }, status = 200): Response =>
    Response.json(body, { status, headers: opts.headers })

  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url)
    const route = url.pathname === `${base}/search`
      ? 'search'
      : url.pathname === `${base}/reverse` ? 'reverse' : null
    if (!route)
      return undefined
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return json({ error: 'Method not allowed' }, 405)

    const { query, options } = parseGazetteerQuery(key => url.searchParams.get(key))
    if (route === 'search')
      return json({ results: gazetteer.searchSync(query, options) })

    if (!options.proximity)
      return json({ error: 'lat and lng are required' }, 422)
    return json({ results: gazetteer.reverseSync(options.proximity, { limit: options.limit }) })
  }
}
