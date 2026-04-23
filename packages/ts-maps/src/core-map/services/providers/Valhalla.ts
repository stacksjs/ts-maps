// Valhalla — one backend, three APIs: directions, isochrone, matrix.
//
// Docs: https://valhalla.github.io/valhalla/api/
// The default base URL points at a free public instance (valhalla1.openstreetmap.de)
// which is rate-limited — for production, self-host or use a commercial
// provider such as Stadia Maps or Mapbox (the Mapbox provider in this
// package wraps Mapbox's own APIs).
//
// Quirks accommodated here:
//   * Valhalla's isochrone endpoint returns a GeoJSON FeatureCollection — not
//     raw coordinate arrays. Polygons arrive as `Polygon` features with
//     `[outer, ...holes]` ring arrays; LineString fallbacks are possible but
//     rare when `polygons: true` is set.
//   * Directions returns `trip.legs[].shape` as an encoded polyline (Google
//     polyline-5 precision 6). We decode it natively — no runtime deps.
//   * Contour time values in Valhalla's request body are in minutes; the
//     `contours` array in `IsochroneOptions` is passed through verbatim.

import type {
  DirectionsOptions,
  DirectionsProvider,
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

export interface ValhallaOptions {
  baseUrl?: string
  apiKey?: string
}

const DEFAULT_BASE_URL = 'https://valhalla1.openstreetmap.de'

const costingMap: Record<TransportProfile, string> = {
  driving: 'auto',
  walking: 'pedestrian',
  cycling: 'bicycle',
}

// Decode a Google encoded polyline at precision 6 (Valhalla's default for v2).
function decodePolyline(encoded: string, precision: number = 6): LatLngLike[] {
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

interface ValhallaManeuver {
  length?: number // km
  time?: number // seconds
  instruction?: string
  type?: number
  begin_shape_index?: number
  end_shape_index?: number
}

interface ValhallaLeg {
  summary?: { length?: number, time?: number }
  shape?: string
  maneuvers?: ValhallaManeuver[]
}

interface ValhallaTrip {
  summary?: { length?: number, time?: number }
  legs?: ValhallaLeg[]
  language?: string
  status?: number
  status_message?: string
}

interface ValhallaDirectionsResponse {
  trip?: ValhallaTrip
  alternates?: { trip: ValhallaTrip }[]
}

function legToRoute(leg: ValhallaLeg): Route {
  const shape = leg.shape ? decodePolyline(leg.shape) : []
  const steps: RouteStep[] = (leg.maneuvers ?? []).map((m) => {
    const start = m.begin_shape_index ?? 0
    const end = m.end_shape_index ?? start
    return {
      distance: (m.length ?? 0) * 1000, // km → m
      duration: m.time ?? 0,
      instruction: m.instruction ?? '',
      geometry: shape.slice(start, end + 1),
    }
  })
  return {
    distance: (leg.summary?.length ?? 0) * 1000,
    duration: leg.summary?.time ?? 0,
    geometry: shape,
    steps,
  }
}

function tripToRoute(trip: ValhallaTrip): Route {
  const legs = (trip.legs ?? []).map(legToRoute)
  const geometry = legs.flatMap(l => l.geometry)
  const steps = legs.flatMap(l => l.steps)
  return {
    distance: (trip.summary?.length ?? 0) * 1000,
    duration: trip.summary?.time ?? 0,
    geometry,
    steps,
    legs,
  }
}

async function postJson(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok)
    throw new Error(`Valhalla request failed: ${res.status} ${res.statusText}`)
  return res.json()
}

function buildUrl(base: string, path: string, apiKey?: string): string {
  const root = base.replace(/\/$/, '')
  const suffix = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : ''
  return `${root}${path}${suffix}`
}

export class ValhallaDirections implements DirectionsProvider {
  name: string = 'valhalla'
  private baseUrl: string
  private apiKey?: string

  constructor(opts: ValhallaOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL
    this.apiKey = opts.apiKey
  }

  async getDirections(waypoints: LatLngLike[], opts?: DirectionsOptions): Promise<Route[]> {
    if (waypoints.length < 2)
      throw new Error('Valhalla requires at least two waypoints')
    const body: Record<string, unknown> = {
      locations: waypoints.map(w => ({ lat: w.lat, lon: w.lng })),
      costing: costingMap[opts?.profile ?? 'driving'] ?? 'auto',
      directions_options: { language: opts?.language ?? 'en-US' },
    }
    if (opts?.alternatives)
      body.alternates = 1
    const url = buildUrl(this.baseUrl, '/route', this.apiKey)
    const raw = (await postJson(url, body, opts?.signal)) as ValhallaDirectionsResponse
    const routes: Route[] = []
    if (raw.trip)
      routes.push(tripToRoute(raw.trip))
    if (raw.alternates) {
      for (const alt of raw.alternates) {
        if (alt.trip)
          routes.push(tripToRoute(alt.trip))
      }
    }
    return routes
  }
}

interface ValhallaIsochroneFeature {
  type: 'Feature'
  geometry: {
    type: 'Polygon' | 'LineString' | 'MultiPolygon'
    coordinates: unknown
  }
  properties?: { contour?: number, metric?: string }
}

interface ValhallaIsochroneResponse {
  type: 'FeatureCollection'
  features: ValhallaIsochroneFeature[]
}

function ringToLatLng(ring: [number, number][]): LatLngLike[] {
  return ring.map(([lng, lat]) => ({ lat, lng }))
}

export class ValhallaIsochrone implements IsochroneProvider {
  name: string = 'valhalla'
  private baseUrl: string
  private apiKey?: string

  constructor(opts: ValhallaOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL
    this.apiKey = opts.apiKey
  }

  async getIsochrones(center: LatLngLike, opts: IsochroneOptions): Promise<IsochronePolygon[]> {
    const metric = opts.contourMetric ?? 'time'
    const body: Record<string, unknown> = {
      locations: [{ lat: center.lat, lon: center.lng }],
      costing: costingMap[opts.profile ?? 'driving'] ?? 'auto',
      contours: opts.contours.map(v => metric === 'distance' ? { distance: v } : { time: v }),
      polygons: true,
    }
    if (typeof opts.denoise === 'number')
      body.denoise = opts.denoise
    if (typeof opts.generalize === 'number')
      body.generalize = opts.generalize
    const url = buildUrl(this.baseUrl, '/isochrone', this.apiKey)
    const raw = (await postJson(url, body, opts.signal)) as ValhallaIsochroneResponse
    const out: IsochronePolygon[] = []
    for (const feature of raw.features ?? []) {
      const contour = feature.properties?.contour ?? 0
      const { geometry } = feature
      if (geometry.type === 'Polygon') {
        const rings = geometry.coordinates as [number, number][][]
        if (rings.length === 0)
          continue
        const polygon: IsochronePolygon = {
          geometry: ringToLatLng(rings[0]),
          contour,
        }
        if (rings.length > 1)
          polygon.holes = rings.slice(1).map(ringToLatLng)
        out.push(polygon)
      }
      else if (geometry.type === 'MultiPolygon') {
        const polys = geometry.coordinates as [number, number][][][]
        for (const rings of polys) {
          if (rings.length === 0)
            continue
          const polygon: IsochronePolygon = {
            geometry: ringToLatLng(rings[0]),
            contour,
          }
          if (rings.length > 1)
            polygon.holes = rings.slice(1).map(ringToLatLng)
          out.push(polygon)
        }
      }
      else if (geometry.type === 'LineString') {
        out.push({
          geometry: ringToLatLng(geometry.coordinates as [number, number][]),
          contour,
        })
      }
    }
    return out
  }
}

interface ValhallaMatrixCell {
  distance?: number // km
  time?: number // seconds
  from_index?: number
  to_index?: number
}

interface ValhallaMatrixResponse {
  sources_to_targets: ValhallaMatrixCell[][]
}

export class ValhallaMatrix implements MatrixProvider {
  name: string = 'valhalla'
  private baseUrl: string
  private apiKey?: string

  constructor(opts: ValhallaOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL
    this.apiKey = opts.apiKey
  }

  async getMatrix(origins: LatLngLike[], destinations: LatLngLike[], opts?: MatrixOptions): Promise<MatrixResult> {
    const body = {
      sources: origins.map(o => ({ lat: o.lat, lon: o.lng })),
      targets: destinations.map(d => ({ lat: d.lat, lon: d.lng })),
      costing: costingMap[opts?.profile ?? 'driving'] ?? 'auto',
    }
    const url = buildUrl(this.baseUrl, '/sources_to_targets', this.apiKey)
    const raw = (await postJson(url, body, opts?.signal)) as ValhallaMatrixResponse
    const durations: number[][] = []
    const distances: number[][] = []
    for (const row of raw.sources_to_targets ?? []) {
      const dRow: number[] = []
      const distRow: number[] = []
      for (const cell of row) {
        dRow.push(cell.time ?? 0)
        distRow.push((cell.distance ?? 0) * 1000) // km → m
      }
      durations.push(dRow)
      distances.push(distRow)
    }
    const metric = opts?.metric ?? 'time'
    const result: MatrixResult = {}
    if (metric === 'time' || metric === 'distance') {
      result.durations = durations
      result.distances = distances
    }
    return result
  }
}
