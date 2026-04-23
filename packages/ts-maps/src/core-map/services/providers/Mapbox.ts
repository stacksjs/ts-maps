// Mapbox — optional, key-required.
//
// * Geocoding v6: https://docs.mapbox.com/api/search/geocoding/
// * Directions v5: https://docs.mapbox.com/api/navigation/directions/
// * Matrix v1: https://docs.mapbox.com/api/navigation/matrix/
// * Isochrone v1: https://docs.mapbox.com/api/navigation/isochrone/

import type {
  DirectionsOptions,
  DirectionsProvider,
  GeocoderOptions,
  GeocoderProvider,
  GeocodingResult,
  IsochroneOptions,
  IsochronePolygon,
  IsochroneProvider,
  LatLngLike,
  MatrixOptions,
  MatrixProvider,
  MatrixResult,
  Route,
  RouteStep,
  TransportProfile,
} from '../types'

export interface MapboxOptions {
  accessToken: string
  baseUrl?: string
}

const DEFAULT_BASE = 'https://api.mapbox.com'

function requireToken(token: string | undefined): string {
  if (!token)
    throw new Error('Mapbox provider requires an accessToken')
  return token
}

const profileMap: Record<TransportProfile, string> = {
  driving: 'mapbox/driving',
  walking: 'mapbox/walking',
  cycling: 'mapbox/cycling',
}

const isochroneProfileMap: Record<TransportProfile, string> = {
  driving: 'mapbox/driving',
  walking: 'mapbox/walking',
  cycling: 'mapbox/cycling',
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal })
  if (!res.ok)
    throw new Error(`Mapbox request failed: ${res.status} ${res.statusText}`)
  return res.json()
}

interface MapboxFeatureV6 {
  id?: string
  type?: string
  geometry?: { type: 'Point', coordinates: [number, number] }
  properties?: {
    name?: string
    full_address?: string
    feature_type?: string
    bbox?: [number, number, number, number]
    context?: Record<string, unknown>
  }
  relevance?: number
}

interface MapboxGeocodingV6Response {
  features?: MapboxFeatureV6[]
}

function mapFeatureType(t?: string): GeocodingResult['placeType'] {
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

function featureToResult(f: MapboxFeatureV6): GeocodingResult {
  const coords = f.geometry?.coordinates ?? [0, 0]
  const result: GeocodingResult = {
    text: f.properties?.full_address ?? f.properties?.name ?? '',
    center: { lat: coords[1], lng: coords[0] },
    properties: f.properties,
  }
  if (f.properties?.bbox)
    result.bbox = f.properties.bbox
  const pt = mapFeatureType(f.properties?.feature_type)
  if (pt)
    result.placeType = pt
  if (typeof f.relevance === 'number')
    result.relevance = f.relevance
  return result
}

export class MapboxGeocoder implements GeocoderProvider {
  name: string = 'mapbox'
  private accessToken: string
  private baseUrl: string

  constructor(opts: MapboxOptions) {
    this.accessToken = requireToken(opts.accessToken)
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
  }

  async search(query: string, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const params = new URLSearchParams()
    params.set('q', query)
    params.set('access_token', this.accessToken)
    params.set('limit', String(opts?.limit ?? 5))
    if (opts?.language)
      params.set('language', opts.language)
    if (opts?.proximity)
      params.set('proximity', `${opts.proximity.lng},${opts.proximity.lat}`)
    if (opts?.bbox)
      params.set('bbox', opts.bbox.join(','))
    if (opts?.countries && opts.countries.length > 0)
      params.set('country', opts.countries.join(','))
    const url = `${this.baseUrl}/search/geocode/v6/forward?${params.toString()}`
    const raw = (await fetchJson(url, opts?.signal)) as MapboxGeocodingV6Response
    return (raw.features ?? []).map(featureToResult)
  }

  async reverse(center: LatLngLike, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const params = new URLSearchParams()
    params.set('longitude', String(center.lng))
    params.set('latitude', String(center.lat))
    params.set('access_token', this.accessToken)
    params.set('limit', String(opts?.limit ?? 1))
    if (opts?.language)
      params.set('language', opts.language)
    const url = `${this.baseUrl}/search/geocode/v6/reverse?${params.toString()}`
    const raw = (await fetchJson(url, opts?.signal)) as MapboxGeocodingV6Response
    return (raw.features ?? []).map(featureToResult)
  }
}

interface MapboxDirectionsStep {
  distance: number
  duration: number
  geometry: { type: 'LineString', coordinates: [number, number][] }
  maneuver?: { type?: string, modifier?: string, instruction?: string }
  name?: string
}

interface MapboxDirectionsLeg {
  distance: number
  duration: number
  steps?: MapboxDirectionsStep[]
}

interface MapboxDirectionsRoute {
  distance: number
  duration: number
  geometry: { type: 'LineString', coordinates: [number, number][] }
  legs?: MapboxDirectionsLeg[]
}

interface MapboxDirectionsResponse {
  code: string
  routes?: MapboxDirectionsRoute[]
  message?: string
}

function coords(arr: [number, number][]): LatLngLike[] {
  return arr.map(([lng, lat]) => ({ lat, lng }))
}

function mbStepToStep(s: MapboxDirectionsStep): RouteStep {
  const out: RouteStep = {
    distance: s.distance,
    duration: s.duration,
    instruction: s.maneuver?.instruction ?? s.name ?? '',
    geometry: coords(s.geometry?.coordinates ?? []),
  }
  if (s.maneuver?.type) {
    out.maneuver = s.maneuver.modifier
      ? `${s.maneuver.type}-${s.maneuver.modifier}`.replace(/\s+/g, '-')
      : s.maneuver.type
  }
  return out
}

function mbRouteToRoute(r: MapboxDirectionsRoute): Route {
  const steps = (r.legs ?? []).flatMap(l => (l.steps ?? []).map(mbStepToStep))
  return {
    distance: r.distance,
    duration: r.duration,
    geometry: coords(r.geometry?.coordinates ?? []),
    steps,
  }
}

export class MapboxDirections implements DirectionsProvider {
  name: string = 'mapbox'
  private accessToken: string
  private baseUrl: string

  constructor(opts: MapboxOptions) {
    this.accessToken = requireToken(opts.accessToken)
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
  }

  async getDirections(waypoints: LatLngLike[], opts?: DirectionsOptions): Promise<Route[]> {
    if (waypoints.length < 2)
      throw new Error('Mapbox directions requires at least two waypoints')
    const profile = profileMap[opts?.profile ?? 'driving']
    const coordStr = waypoints.map(w => `${w.lng},${w.lat}`).join(';')
    const params = new URLSearchParams()
    params.set('access_token', this.accessToken)
    params.set('geometries', 'geojson')
    params.set('overview', 'full')
    params.set('steps', 'true')
    params.set('alternatives', opts?.alternatives ? 'true' : 'false')
    if (opts?.language)
      params.set('language', opts.language)
    const url = `${this.baseUrl}/directions/v5/${profile}/${coordStr}?${params.toString()}`
    const raw = (await fetchJson(url, opts?.signal)) as MapboxDirectionsResponse
    if (raw.code !== 'Ok')
      throw new Error(`Mapbox directions error: ${raw.code}${raw.message ? ` — ${raw.message}` : ''}`)
    return (raw.routes ?? []).map(mbRouteToRoute)
  }
}

interface MapboxIsochroneFeature {
  type: 'Feature'
  geometry: { type: 'Polygon' | 'LineString', coordinates: unknown }
  properties?: { contour?: number }
}
interface MapboxIsochroneResponse {
  features?: MapboxIsochroneFeature[]
}

export class MapboxIsochrone implements IsochroneProvider {
  name: string = 'mapbox'
  private accessToken: string
  private baseUrl: string

  constructor(opts: MapboxOptions) {
    this.accessToken = requireToken(opts.accessToken)
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
  }

  async getIsochrones(center: LatLngLike, opts: IsochroneOptions): Promise<IsochronePolygon[]> {
    const profile = isochroneProfileMap[opts.profile ?? 'driving']
    const metric = opts.contourMetric ?? 'time'
    const params = new URLSearchParams()
    params.set('access_token', this.accessToken)
    if (metric === 'distance')
      params.set('contours_meters', opts.contours.join(','))
    else
      params.set('contours_minutes', opts.contours.join(','))
    params.set('polygons', 'true')
    if (typeof opts.denoise === 'number')
      params.set('denoise', String(opts.denoise))
    if (typeof opts.generalize === 'number')
      params.set('generalize', String(opts.generalize))
    const url = `${this.baseUrl}/isochrone/v1/${profile}/${center.lng},${center.lat}?${params.toString()}`
    const raw = (await fetchJson(url, opts.signal)) as MapboxIsochroneResponse
    const out: IsochronePolygon[] = []
    for (const f of raw.features ?? []) {
      const contour = f.properties?.contour ?? 0
      if (f.geometry.type === 'Polygon') {
        const rings = f.geometry.coordinates as [number, number][][]
        if (rings.length === 0)
          continue
        const p: IsochronePolygon = {
          geometry: coords(rings[0]),
          contour,
        }
        if (rings.length > 1)
          p.holes = rings.slice(1).map(r => coords(r))
        out.push(p)
      }
      else if (f.geometry.type === 'LineString') {
        out.push({
          geometry: coords(f.geometry.coordinates as [number, number][]),
          contour,
        })
      }
    }
    return out
  }
}

interface MapboxMatrixResponse {
  code: string
  durations?: number[][]
  distances?: number[][]
  message?: string
}

export class MapboxMatrix implements MatrixProvider {
  name: string = 'mapbox'
  private accessToken: string
  private baseUrl: string

  constructor(opts: MapboxOptions) {
    this.accessToken = requireToken(opts.accessToken)
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
  }

  async getMatrix(origins: LatLngLike[], destinations: LatLngLike[], opts?: MatrixOptions): Promise<MatrixResult> {
    const profile = profileMap[opts?.profile ?? 'driving']
    const all = [...origins, ...destinations]
    const coordStr = all.map(w => `${w.lng},${w.lat}`).join(';')
    const sources = origins.map((_, i) => i).join(';')
    const destinations_ = destinations.map((_, i) => i + origins.length).join(';')
    const params = new URLSearchParams()
    params.set('access_token', this.accessToken)
    params.set('sources', sources)
    params.set('destinations', destinations_)
    const annotations: string[] = []
    const metric = opts?.metric ?? 'time'
    if (metric === 'distance' || metric === 'time') {
      annotations.push('duration', 'distance')
    }
    params.set('annotations', annotations.join(','))
    const url = `${this.baseUrl}/directions-matrix/v1/${profile}/${coordStr}?${params.toString()}`
    const raw = (await fetchJson(url, opts?.signal)) as MapboxMatrixResponse
    if (raw.code !== 'Ok')
      throw new Error(`Mapbox matrix error: ${raw.code}${raw.message ? ` — ${raw.message}` : ''}`)
    const result: MatrixResult = {}
    if (raw.durations)
      result.durations = raw.durations
    if (raw.distances)
      result.distances = raw.distances
    return result
  }
}
