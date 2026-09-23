// Gazetteer — a geocoder backed by your own server instead of a shared public
// service. Pair it with `createGazetteerHandler` from `ts-maps/gazetteer`,
// which answers these two routes from a local SQLite copy of GeoNames:
//
//   GET {baseUrl}/search?q=...&limit=...&lat=...&lng=...&countries=US,CA
//   GET {baseUrl}/reverse?lat=...&lng=...&limit=...
//
// Both return `{ results: GeocodingResult[] }`, so nothing is re-mapped here.
// Searches never leave your infrastructure, there is no key or quota, and
// autocomplete is allowed — which Nominatim's usage policy forbids.

import type {
  GeocoderOptions,
  GeocoderProvider,
  GeocodingResult,
  LatLngLike,
} from '../types'

export interface GazetteerGeocoderOptions {
  /** Where the handler is mounted, e.g. `/api/geo` or `https://example.com/geo`. */
  baseUrl: string
  /** Extra request headers, e.g. an auth token for a private deployment. */
  headers?: Record<string, string>
}

interface GazetteerResponse {
  results?: GeocodingResult[]
}

export class GazetteerGeocoder implements GeocoderProvider {
  name: string = 'gazetteer'
  private baseUrl: string
  private headers: Record<string, string> | undefined

  constructor(opts: GazetteerGeocoderOptions) {
    if (!opts?.baseUrl)
      throw new Error('GazetteerGeocoder requires a baseUrl')
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.headers = opts.headers
  }

  async search(query: string, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const q = query.trim()
    if (!q)
      return []
    const params = new URLSearchParams()
    params.set('q', q)
    params.set('limit', String(opts?.limit ?? 5))
    if (opts?.proximity) {
      params.set('lat', String(opts.proximity.lat))
      params.set('lng', String(opts.proximity.lng))
    }
    if (opts?.countries?.length)
      params.set('countries', opts.countries.join(','))
    if (opts?.bbox)
      params.set('bbox', opts.bbox.join(','))
    return this.get('search', params, opts?.signal)
  }

  async reverse(center: LatLngLike, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const params = new URLSearchParams()
    params.set('lat', String(center.lat))
    params.set('lng', String(center.lng))
    if (opts?.limit)
      params.set('limit', String(opts.limit))
    return this.get('reverse', params, opts?.signal)
  }

  private async get(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<GeocodingResult[]> {
    const res = await fetch(`${this.baseUrl}/${path}?${params.toString()}`, { signal, headers: this.headers })
    if (!res.ok)
      throw new Error(`Gazetteer ${path} request failed: ${res.status} ${res.statusText}`)
    const raw = (await res.json()) as GazetteerResponse
    return Array.isArray(raw.results) ? raw.results : []
  }
}
