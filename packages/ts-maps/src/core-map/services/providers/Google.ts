// Google — optional, key-required. Geocoding + Directions only.
//
// Google Distance Matrix is a separately billed product and is intentionally
// left out here. Users wanting a matrix with Google can wrap the Directions
// API themselves (N*M calls) or use Mapbox/Valhalla matrix.

import type {
  DirectionsOptions,
  DirectionsProvider,
  GeocoderOptions,
  GeocoderProvider,
  GeocodingResult,
  LatLngLike,
  Route,
  RouteStep,
  TransportProfile,
} from '../types'

export interface GoogleOptions {
  apiKey: string
  baseUrl?: string
}

const DEFAULT_BASE = 'https://maps.googleapis.com/maps/api'

function requireKey(apiKey: string | undefined): string {
  if (!apiKey)
    throw new Error('Google provider requires an apiKey')
  return apiKey
}

const profileMap: Record<TransportProfile, string> = {
  driving: 'driving',
  walking: 'walking',
  cycling: 'bicycling',
}

// Decode Google polyline (precision 5, the default for Directions API).
function decodePolyline(encoded: string, precision: number = 5): LatLngLike[] {
  const factor = 10 ** precision
  const len = encoded.length
  let index = 0
  let lat = 0
  let lng = 0
  const out: LatLngLike[] = []
  while (index < len) {
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1F) << shift
      shift += 5
    } while (byte >= 0x20)
    const dLat = (result & 1) ? ~(result >> 1) : (result >> 1)
    lat += dLat
    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1F) << shift
      shift += 5
    } while (byte >= 0x20)
    const dLng = (result & 1) ? ~(result >> 1) : (result >> 1)
    lng += dLng
    out.push({ lat: lat / factor, lng: lng / factor })
  }
  return out
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal })
  if (!res.ok)
    throw new Error(`Google request failed: ${res.status} ${res.statusText}`)
  return res.json()
}

interface GoogleGeocodeResult {
  formatted_address: string
  geometry: {
    location: { lat: number, lng: number }
    bounds?: { northeast: { lat: number, lng: number }, southwest: { lat: number, lng: number } }
    viewport?: { northeast: { lat: number, lng: number }, southwest: { lat: number, lng: number } }
  }
  types?: string[]
  place_id?: string
  address_components?: unknown
}

interface GoogleGeocodeResponse {
  status: string
  results?: GoogleGeocodeResult[]
  error_message?: string
}

function mapTypes(types?: string[]): GeocodingResult['placeType'] {
  if (!types)
    return undefined
  if (types.includes('country'))
    return 'country'
  if (types.includes('administrative_area_level_1'))
    return 'region'
  if (types.includes('administrative_area_level_2'))
    return 'district'
  if (types.includes('postal_code'))
    return 'postcode'
  if (types.includes('locality') || types.includes('sublocality'))
    return 'place'
  if (types.includes('street_address') || types.includes('route') || types.includes('premise'))
    return 'address'
  if (types.includes('point_of_interest') || types.includes('establishment'))
    return 'poi'
  return undefined
}

function toResult(r: GoogleGeocodeResult): GeocodingResult {
  const out: GeocodingResult = {
    text: r.formatted_address,
    center: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
    properties: { place_id: r.place_id, types: r.types, address_components: r.address_components },
  }
  const b = r.geometry.bounds ?? r.geometry.viewport
  if (b)
    out.bbox = [b.southwest.lng, b.southwest.lat, b.northeast.lng, b.northeast.lat]
  const pt = mapTypes(r.types)
  if (pt)
    out.placeType = pt
  return out
}

export class GoogleGeocoder implements GeocoderProvider {
  name: string = 'google'
  private apiKey: string
  private baseUrl: string

  constructor(opts: GoogleOptions) {
    this.apiKey = requireKey(opts.apiKey)
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
  }

  async search(query: string, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const params = new URLSearchParams()
    params.set('address', query)
    params.set('key', this.apiKey)
    if (opts?.language)
      params.set('language', opts.language)
    if (opts?.bbox) {
      const [w, s, e, n] = opts.bbox
      params.set('bounds', `${s},${w}|${n},${e}`)
    }
    if (opts?.countries && opts.countries.length > 0)
      params.set('components', opts.countries.map(c => `country:${c}`).join('|'))
    const url = `${this.baseUrl}/geocode/json?${params.toString()}`
    const raw = (await fetchJson(url, opts?.signal)) as GoogleGeocodeResponse
    if (raw.status !== 'OK' && raw.status !== 'ZERO_RESULTS')
      throw new Error(`Google geocoding error: ${raw.status}${raw.error_message ? ` — ${raw.error_message}` : ''}`)
    const results = (raw.results ?? []).map(toResult)
    return typeof opts?.limit === 'number' ? results.slice(0, opts.limit) : results
  }

  async reverse(center: LatLngLike, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const params = new URLSearchParams()
    params.set('latlng', `${center.lat},${center.lng}`)
    params.set('key', this.apiKey)
    if (opts?.language)
      params.set('language', opts.language)
    const url = `${this.baseUrl}/geocode/json?${params.toString()}`
    const raw = (await fetchJson(url, opts?.signal)) as GoogleGeocodeResponse
    if (raw.status !== 'OK' && raw.status !== 'ZERO_RESULTS')
      throw new Error(`Google reverse-geocoding error: ${raw.status}${raw.error_message ? ` — ${raw.error_message}` : ''}`)
    const results = (raw.results ?? []).map(toResult)
    return typeof opts?.limit === 'number' ? results.slice(0, opts.limit) : results
  }
}

interface GoogleDirectionsStep {
  distance?: { value?: number }
  duration?: { value?: number }
  html_instructions?: string
  maneuver?: string
  polyline?: { points: string }
}

interface GoogleDirectionsLeg {
  distance?: { value?: number }
  duration?: { value?: number }
  steps?: GoogleDirectionsStep[]
}

interface GoogleDirectionsRoute {
  overview_polyline?: { points: string }
  legs?: GoogleDirectionsLeg[]
}

interface GoogleDirectionsResponse {
  status: string
  routes?: GoogleDirectionsRoute[]
  error_message?: string
}

function stripHtml(html?: string): string {
  return html ? html.replace(/<[^>]+>/g, '') : ''
}

function stepToStep(step: GoogleDirectionsStep): RouteStep {
  const out: RouteStep = {
    distance: step.distance?.value ?? 0,
    duration: step.duration?.value ?? 0,
    instruction: stripHtml(step.html_instructions),
    geometry: step.polyline ? decodePolyline(step.polyline.points) : [],
  }
  if (step.maneuver)
    out.maneuver = step.maneuver
  return out
}

function routeToRoute(r: GoogleDirectionsRoute): Route {
  const legs = r.legs ?? []
  const steps = legs.flatMap(l => (l.steps ?? []).map(stepToStep))
  const distance = legs.reduce((sum, l) => sum + (l.distance?.value ?? 0), 0)
  const duration = legs.reduce((sum, l) => sum + (l.duration?.value ?? 0), 0)
  const geometry = r.overview_polyline ? decodePolyline(r.overview_polyline.points) : steps.flatMap(s => s.geometry)
  return { distance, duration, geometry, steps }
}

export class GoogleDirections implements DirectionsProvider {
  name: string = 'google'
  private apiKey: string
  private baseUrl: string

  constructor(opts: GoogleOptions) {
    this.apiKey = requireKey(opts.apiKey)
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
  }

  async getDirections(waypoints: LatLngLike[], opts?: DirectionsOptions): Promise<Route[]> {
    if (waypoints.length < 2)
      throw new Error('Google directions requires at least two waypoints')
    const params = new URLSearchParams()
    params.set('key', this.apiKey)
    params.set('mode', profileMap[opts?.profile ?? 'driving'])
    const origin = waypoints[0]
    const destination = waypoints[waypoints.length - 1]
    params.set('origin', `${origin.lat},${origin.lng}`)
    params.set('destination', `${destination.lat},${destination.lng}`)
    if (waypoints.length > 2) {
      const via = waypoints.slice(1, -1).map(p => `${p.lat},${p.lng}`).join('|')
      params.set('waypoints', via)
    }
    if (opts?.alternatives)
      params.set('alternatives', 'true')
    if (opts?.language)
      params.set('language', opts.language)
    const url = `${this.baseUrl}/directions/json?${params.toString()}`
    const raw = (await fetchJson(url, opts?.signal)) as GoogleDirectionsResponse
    if (raw.status !== 'OK' && raw.status !== 'ZERO_RESULTS')
      throw new Error(`Google directions error: ${raw.status}${raw.error_message ? ` — ${raw.error_message}` : ''}`)
    return (raw.routes ?? []).map(routeToRoute)
  }
}
