// Photon — keyless geocoder by Komoot. Useful as a Nominatim fallback when
// that service is rate-limited.
//
// Docs: https://photon.komoot.io
//   GET /api?q=...&limit=...&lang=...
//   GET /reverse?lat=...&lon=...&lang=...

import type {
  GeocoderOptions,
  GeocoderProvider,
  GeocodingResult,
  LatLngLike,
} from '../types'

export interface PhotonOptions {
  baseUrl?: string
}

interface PhotonFeature {
  geometry?: { type: 'Point', coordinates: [number, number] }
  properties?: {
    name?: string
    street?: string
    housenumber?: string
    postcode?: string
    city?: string
    state?: string
    country?: string
    countrycode?: string
    osm_key?: string
    osm_value?: string
    osm_type?: string
    osm_id?: number
    extent?: [number, number, number, number] // [w, n, e, s]
    type?: string
  }
}

interface PhotonResponse {
  features?: PhotonFeature[]
}

function mapType(props?: PhotonFeature['properties']): GeocodingResult['placeType'] {
  if (!props)
    return undefined
  if (props.osm_value === 'country' || props.type === 'country')
    return 'country'
  if (props.osm_value === 'state' || props.type === 'state')
    return 'region'
  if (props.type === 'county')
    return 'district'
  if (props.osm_key === 'place' && (props.osm_value === 'city' || props.osm_value === 'town' || props.osm_value === 'village'))
    return 'place'
  if (props.osm_key === 'highway' || props.housenumber)
    return 'address'
  if (props.postcode && props.type === 'postcode')
    return 'postcode'
  if (props.osm_key === 'amenity' || props.osm_key === 'shop' || props.osm_key === 'tourism')
    return 'poi'
  return undefined
}

function buildLabel(props?: PhotonFeature['properties']): string {
  if (!props)
    return ''
  const parts: string[] = []
  if (props.name)
    parts.push(props.name)
  if (props.street) {
    const street = props.housenumber ? `${props.street} ${props.housenumber}` : props.street
    if (!parts.length || parts[0] !== street)
      parts.push(street)
  }
  if (props.postcode || props.city) {
    parts.push([props.postcode, props.city].filter(Boolean).join(' '))
  }
  if (props.country)
    parts.push(props.country)
  return parts.filter(Boolean).join(', ')
}

function toResult(f: PhotonFeature): GeocodingResult {
  const coords = f.geometry?.coordinates ?? [0, 0]
  const out: GeocodingResult = {
    text: buildLabel(f.properties),
    center: { lat: coords[1], lng: coords[0] },
    properties: f.properties,
  }
  if (f.properties?.extent) {
    const [w, n, e, s] = f.properties.extent
    out.bbox = [w, s, e, n]
  }
  const pt = mapType(f.properties)
  if (pt)
    out.placeType = pt
  return out
}

export class PhotonGeocoder implements GeocoderProvider {
  name: string = 'photon'
  private baseUrl: string

  constructor(opts: PhotonOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://photon.komoot.io').replace(/\/$/, '')
  }

  async search(query: string, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    if (!query)
      return []
    const params = new URLSearchParams()
    params.set('q', query)
    params.set('limit', String(opts?.limit ?? 5))
    if (opts?.language)
      params.set('lang', opts.language)
    if (opts?.proximity) {
      params.set('lat', String(opts.proximity.lat))
      params.set('lon', String(opts.proximity.lng))
    }
    if (opts?.bbox)
      params.set('bbox', opts.bbox.join(','))
    const url = `${this.baseUrl}/api?${params.toString()}`
    const res = await fetch(url, { signal: opts?.signal })
    if (!res.ok)
      throw new Error(`Photon request failed: ${res.status} ${res.statusText}`)
    const raw = (await res.json()) as PhotonResponse
    return (raw.features ?? []).map(toResult)
  }

  async reverse(center: LatLngLike, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const params = new URLSearchParams()
    params.set('lat', String(center.lat))
    params.set('lon', String(center.lng))
    if (opts?.limit)
      params.set('limit', String(opts.limit))
    if (opts?.language)
      params.set('lang', opts.language)
    const url = `${this.baseUrl}/reverse?${params.toString()}`
    const res = await fetch(url, { signal: opts?.signal })
    if (!res.ok)
      throw new Error(`Photon reverse request failed: ${res.status} ${res.statusText}`)
    const raw = (await res.json()) as PhotonResponse
    return (raw.features ?? []).map(toResult)
  }
}
