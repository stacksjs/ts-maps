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
  TravelMode,
} from '../types'
import { decodePolyline } from '../polyline'
import { transitInstruction, transitVehicle } from '../transit'

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

const profileMap: Record<TravelMode, string> = {
  driving: 'driving',
  walking: 'walking',
  cycling: 'bicycling',
  transit: 'transit',
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

interface GoogleTransitDetails {
  line?: { short_name?: string, name?: string, color?: string, text_color?: string, vehicle?: { type?: string }, agencies?: Array<{ name?: string }> }
  headsign?: string
  num_stops?: number
  departure_stop?: { name?: string, location?: { lat: number, lng: number } }
  arrival_stop?: { name?: string, location?: { lat: number, lng: number } }
  departure_time?: { value?: number }
  arrival_time?: { value?: number }
}

interface GoogleDirectionsStep {
  distance?: { value?: number }
  duration?: { value?: number }
  html_instructions?: string
  maneuver?: string
  polyline?: { points: string }
  travel_mode?: string
  transit_details?: GoogleTransitDetails
}

interface GoogleDirectionsLeg {
  departure_time?: { value?: number }
  arrival_time?: { value?: number }
  distance?: { value?: number }
  duration?: { value?: number }
  /** With a departure time: the leg in today's traffic. */
  duration_in_traffic?: { value?: number }
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
  const t = step.transit_details
  if (step.travel_mode === 'TRANSIT' && t) {
    const transit = {
      vehicle: transitVehicle(t.line?.vehicle?.type),
      line: t.line?.short_name || t.line?.name || 'Transit',
      ...(t.line?.name ? { lineName: t.line.name } : {}),
      ...(t.line?.color ? { color: t.line.color } : {}),
      ...(t.line?.text_color ? { textColor: t.line.text_color } : {}),
      ...(t.headsign ? { headsign: t.headsign } : {}),
      ...(t.line?.agencies?.[0]?.name ? { agency: t.line.agencies[0].name } : {}),
      from: { name: t.departure_stop?.name ?? '', ...(t.departure_stop?.location ? { location: t.departure_stop.location } : {}) },
      to: { name: t.arrival_stop?.name ?? '', ...(t.arrival_stop?.location ? { location: t.arrival_stop.location } : {}) },
      departure: new Date((t.departure_time?.value ?? 0) * 1000),
      arrival: new Date((t.arrival_time?.value ?? 0) * 1000),
      stops: t.num_stops ?? 0,
    }
    out.transit = transit
    out.maneuver = 'transit'
    out.name = transit.line
    out.instruction = transitInstruction(transit)
  }
  else if (step.travel_mode === 'WALKING' && !step.maneuver) {
    out.maneuver = 'walk'
  }
  return out
}

function routeToRoute(r: GoogleDirectionsRoute): Route {
  const legs = r.legs ?? []
  const steps = legs.flatMap(l => (l.steps ?? []).map(stepToStep))
  const distance = legs.reduce((sum, l) => sum + (l.distance?.value ?? 0), 0)
  const duration = legs.reduce((sum, l) => sum + (l.duration?.value ?? 0), 0)
  const geometry = r.overview_polyline ? decodePolyline(r.overview_polyline.points) : steps.flatMap(s => s.geometry)
  // In traffic where Google says, against its time on a typical day.
  if (legs.length && legs.every(l => typeof l.duration_in_traffic?.value === 'number')) {
    const inTraffic = legs.reduce((sum, l) => sum + l.duration_in_traffic!.value!, 0)
    return { distance, duration: inTraffic, typicalDuration: duration, traffic: true, geometry, steps }
  }
  const first = legs[0]?.departure_time?.value
  const last = legs[legs.length - 1]?.arrival_time?.value
  return { distance, duration, geometry, steps, ...(first ? { departure: new Date(first * 1000) } : {}), ...(last ? { arrival: new Date(last * 1000) } : {}) }
}

export class GoogleDirections implements DirectionsProvider {
  name: string = 'google'
  private apiKey: string
  private baseUrl: string
  private traffic: boolean

  /** `traffic: true` asks for driving times leaving now, in today's traffic. */
  constructor(opts: GoogleOptions & { traffic?: boolean }) {
    this.apiKey = requireKey(opts.apiKey)
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
    this.traffic = opts.traffic ?? false
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
    if (this.traffic && (opts?.profile ?? 'driving') === 'driving')
      params.set('departure_time', 'now')
    if (opts?.arriveBy)
      params.set('arrival_time', String(Math.round(opts.arriveBy.getTime() / 1000)))
    else if (opts?.departAt)
      params.set('departure_time', String(Math.round(opts.departAt.getTime() / 1000)))
    const url = `${this.baseUrl}/directions/json?${params.toString()}`
    const raw = (await fetchJson(url, opts?.signal)) as GoogleDirectionsResponse
    if (raw.status !== 'OK' && raw.status !== 'ZERO_RESULTS')
      throw new Error(`Google directions error: ${raw.status}${raw.error_message ? ` — ${raw.error_message}` : ''}`)
    return (raw.routes ?? []).map(routeToRoute)
  }
}
