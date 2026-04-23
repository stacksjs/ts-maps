// Nominatim — OSM-powered geocoder. Default provider (keyless).
//
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/
// The default public instance asks for a meaningful User-Agent header and a
// maximum of 1 request per second. We send a polite default UA and throttle
// outbound requests at 250ms to stay well within their limits even under
// burst usage.

import type {
  GeocoderOptions,
  GeocoderProvider,
  GeocodingResult,
  LatLngLike,
} from '../types'
import { throttle } from '../../core/Util'

export interface NominatimOptions {
  baseUrl?: string
  userAgent?: string
}

interface NominatimAddress {
  country?: string
  country_code?: string
  state?: string
  city?: string
  town?: string
  village?: string
  road?: string
  postcode?: string
  [key: string]: string | undefined
}

interface NominatimRaw {
  place_id?: number
  licence?: string
  osm_type?: string
  osm_id?: number
  lat: string
  lon: string
  display_name: string
  class?: string
  type?: string
  importance?: number
  boundingbox?: [string, string, string, string] // [south, north, west, east]
  address?: NominatimAddress
}

function mapPlaceType(klass?: string, type?: string): GeocodingResult['placeType'] {
  if (klass === 'boundary' && type === 'administrative')
    return 'region'
  if (type === 'country')
    return 'country'
  if (type === 'state' || type === 'province')
    return 'region'
  if (type === 'city' || type === 'town' || type === 'village')
    return 'place'
  if (type === 'postcode')
    return 'postcode'
  if (type === 'administrative')
    return 'district'
  if (klass === 'highway' || klass === 'place' && type === 'house')
    return 'address'
  if (klass === 'amenity' || klass === 'shop' || klass === 'tourism')
    return 'poi'
  return undefined
}

function parseRaw(raw: NominatimRaw): GeocodingResult {
  const lat = Number.parseFloat(raw.lat)
  const lng = Number.parseFloat(raw.lon)
  const result: GeocodingResult = {
    text: raw.display_name,
    center: { lat, lng },
    properties: { ...raw.address, osm_id: raw.osm_id, osm_type: raw.osm_type, class: raw.class, type: raw.type },
  }
  if (raw.boundingbox) {
    const [south, north, west, east] = raw.boundingbox.map(Number.parseFloat)
    result.bbox = [west, south, east, north]
  }
  const placeType = mapPlaceType(raw.class, raw.type)
  if (placeType)
    result.placeType = placeType
  if (typeof raw.importance === 'number')
    result.relevance = Math.max(0, Math.min(1, raw.importance))
  return result
}

export class NominatimGeocoder implements GeocoderProvider {
  name: string = 'nominatim'
  private baseUrl: string
  private userAgent: string
  private scheduleRequest: (run: () => void) => void

  constructor(opts: NominatimOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, '')
    this.userAgent = opts.userAgent ?? 'ts-maps'
    // Wrap `throttle` so each request is queued through a 250ms gate.
    this.scheduleRequest = throttle((run: () => void) => run(), 250)
  }

  private gate<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.scheduleRequest(() => {
        work().then(resolve, reject)
      })
    })
  }

  private buildSearchUrl(query: string, opts?: GeocoderOptions): string {
    const params = new URLSearchParams()
    params.set('q', query)
    params.set('format', 'json')
    params.set('addressdetails', '1')
    params.set('limit', String(opts?.limit ?? 5))
    if (opts?.language)
      params.set('accept-language', opts.language)
    if (opts?.countries && opts.countries.length > 0)
      params.set('countrycodes', opts.countries.join(','))
    if (opts?.bbox) {
      const [w, s, e, n] = opts.bbox
      params.set('viewbox', `${w},${n},${e},${s}`)
      params.set('bounded', '1')
    }
    return `${this.baseUrl}/search?${params.toString()}`
  }

  private buildReverseUrl(center: LatLngLike, opts?: GeocoderOptions): string {
    const params = new URLSearchParams()
    params.set('lat', String(center.lat))
    params.set('lon', String(center.lng))
    params.set('format', 'json')
    params.set('addressdetails', '1')
    if (opts?.language)
      params.set('accept-language', opts.language)
    return `${this.baseUrl}/reverse?${params.toString()}`
  }

  private async fetch(url: string, signal?: AbortSignal): Promise<unknown> {
    const res = await fetch(url, {
      headers: { 'User-Agent': this.userAgent, 'Accept': 'application/json' },
      signal,
    })
    if (!res.ok)
      throw new Error(`Nominatim request failed: ${res.status} ${res.statusText}`)
    return res.json()
  }

  async search(query: string, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    if (!query)
      return []
    const url = this.buildSearchUrl(query, opts)
    return this.gate(async () => {
      const raw = (await this.fetch(url, opts?.signal)) as NominatimRaw[]
      return Array.isArray(raw) ? raw.map(parseRaw) : []
    })
  }

  async reverse(center: LatLngLike, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const url = this.buildReverseUrl(center, opts)
    return this.gate(async () => {
      const raw = (await this.fetch(url, opts?.signal)) as NominatimRaw | { error?: string }
      if (!raw || (raw as { error?: string }).error)
        return []
      return [parseRaw(raw as NominatimRaw)]
    })
  }
}
