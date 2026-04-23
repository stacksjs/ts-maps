// MapTiler — key-required geocoder.
//
// Docs: https://docs.maptiler.com/cloud/api/geocoding/
// Endpoints follow a Mapbox-compatible shape:
//   GET /geocoding/{query}.json?key=...
//   GET /geocoding/{lng},{lat}.json?key=...

import type {
  GeocoderOptions,
  GeocoderProvider,
  GeocodingResult,
  LatLngLike,
} from '../types'

export interface MaptilerOptions {
  apiKey: string
  baseUrl?: string
}

const DEFAULT_BASE = 'https://api.maptiler.com'

interface MaptilerFeature {
  id?: string
  text?: string
  place_name?: string
  place_type?: string[]
  center?: [number, number]
  bbox?: [number, number, number, number]
  relevance?: number
  properties?: Record<string, unknown>
}

interface MaptilerResponse {
  features?: MaptilerFeature[]
}

function mapPlaceType(types?: string[]): GeocodingResult['placeType'] {
  if (!types || types.length === 0)
    return undefined
  const t = types[0]
  switch (t) {
    case 'country':
    case 'region':
    case 'district':
    case 'postcode':
    case 'place':
    case 'address':
    case 'poi':
      return t
    default:
      return undefined
  }
}

function toResult(f: MaptilerFeature): GeocodingResult {
  const center = f.center ?? [0, 0]
  const out: GeocodingResult = {
    text: f.place_name ?? f.text ?? '',
    center: { lat: center[1], lng: center[0] },
    properties: f.properties,
  }
  if (f.bbox)
    out.bbox = f.bbox
  const pt = mapPlaceType(f.place_type)
  if (pt)
    out.placeType = pt
  if (typeof f.relevance === 'number')
    out.relevance = f.relevance
  return out
}

export class MaptilerGeocoder implements GeocoderProvider {
  name: string = 'maptiler'
  private apiKey: string
  private baseUrl: string

  constructor(opts: MaptilerOptions) {
    if (!opts.apiKey)
      throw new Error('Maptiler provider requires an apiKey')
    this.apiKey = opts.apiKey
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
  }

  private buildParams(opts?: GeocoderOptions): URLSearchParams {
    const params = new URLSearchParams()
    params.set('key', this.apiKey)
    if (opts?.limit)
      params.set('limit', String(opts.limit))
    if (opts?.language)
      params.set('language', opts.language)
    if (opts?.proximity)
      params.set('proximity', `${opts.proximity.lng},${opts.proximity.lat}`)
    if (opts?.bbox)
      params.set('bbox', opts.bbox.join(','))
    if (opts?.countries && opts.countries.length > 0)
      params.set('country', opts.countries.join(','))
    return params
  }

  private async fetch(url: string, signal?: AbortSignal): Promise<MaptilerResponse> {
    const res = await fetch(url, { signal })
    if (!res.ok)
      throw new Error(`Maptiler request failed: ${res.status} ${res.statusText}`)
    return (await res.json()) as MaptilerResponse
  }

  async search(query: string, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const params = this.buildParams(opts)
    const url = `${this.baseUrl}/geocoding/${encodeURIComponent(query)}.json?${params.toString()}`
    const raw = await this.fetch(url, opts?.signal)
    return (raw.features ?? []).map(toResult)
  }

  async reverse(center: LatLngLike, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const params = this.buildParams(opts)
    const url = `${this.baseUrl}/geocoding/${center.lng},${center.lat}.json?${params.toString()}`
    const raw = await this.fetch(url, opts?.signal)
    return (raw.features ?? []).map(toResult)
  }
}
