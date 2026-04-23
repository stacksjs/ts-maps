// OSRM — Open-Source Routing Machine directions (keyless default).
//
// API reference: https://project-osrm.org/docs/v5.24.0/api/
// The public demo server at router.project-osrm.org is best-effort and
// rate-limited; production deployments should host their own OSRM.

import type {
  DirectionsOptions,
  DirectionsProvider,
  LatLngLike,
  Route,
  RouteStep,
  TransportProfile,
} from '../types'

export interface OSRMOptions {
  baseUrl?: string
}

interface OSRMGeometry {
  type: 'LineString'
  coordinates: [number, number][] // [lng, lat]
}

interface OSRMStep {
  distance: number
  duration: number
  geometry: OSRMGeometry
  name?: string
  maneuver?: {
    type?: string
    modifier?: string
    instruction?: string
  }
}

interface OSRMLeg {
  distance: number
  duration: number
  steps: OSRMStep[]
  summary?: string
}

interface OSRMRoute {
  distance: number
  duration: number
  geometry: OSRMGeometry
  legs: OSRMLeg[]
}

interface OSRMResponse {
  code: string
  routes?: OSRMRoute[]
  message?: string
}

const profileMap: Record<TransportProfile, string> = {
  driving: 'driving',
  walking: 'foot',
  cycling: 'bike',
}

function coordsToLatLng(coords: [number, number][]): LatLngLike[] {
  return coords.map(([lng, lat]) => ({ lat, lng }))
}

function stepInstruction(step: OSRMStep): string {
  if (step.maneuver?.instruction)
    return step.maneuver.instruction
  const parts: string[] = []
  if (step.maneuver?.type)
    parts.push(step.maneuver.type)
  if (step.maneuver?.modifier)
    parts.push(step.maneuver.modifier)
  if (step.name)
    parts.push(`onto ${step.name}`)
  return parts.join(' ').trim() || 'continue'
}

function stepManeuver(step: OSRMStep): string | undefined {
  if (!step.maneuver?.type)
    return undefined
  if (step.maneuver.modifier)
    return `${step.maneuver.type}-${step.maneuver.modifier}`.replace(/\s+/g, '-')
  return step.maneuver.type
}

function parseStep(step: OSRMStep): RouteStep {
  const out: RouteStep = {
    distance: step.distance,
    duration: step.duration,
    instruction: stepInstruction(step),
    geometry: coordsToLatLng(step.geometry?.coordinates ?? []),
  }
  const m = stepManeuver(step)
  if (m)
    out.maneuver = m
  return out
}

function parseLeg(leg: OSRMLeg): Route {
  const steps = (leg.steps ?? []).map(parseStep)
  const geometry = steps.flatMap(s => s.geometry)
  return {
    distance: leg.distance,
    duration: leg.duration,
    geometry,
    steps,
  }
}

function parseRoute(route: OSRMRoute): Route {
  const steps = (route.legs ?? []).flatMap(leg => (leg.steps ?? []).map(parseStep))
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: coordsToLatLng(route.geometry?.coordinates ?? []),
    steps,
    legs: (route.legs ?? []).map(parseLeg),
  }
}

export class OSRMDirections implements DirectionsProvider {
  name: string = 'osrm'
  private baseUrl: string

  constructor(opts: OSRMOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://router.project-osrm.org').replace(/\/$/, '')
  }

  async getDirections(waypoints: LatLngLike[], opts?: DirectionsOptions): Promise<Route[]> {
    if (waypoints.length < 2)
      throw new Error('OSRM requires at least two waypoints')
    const profile = profileMap[opts?.profile ?? 'driving'] ?? 'driving'
    const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';')
    const params = new URLSearchParams()
    params.set('overview', 'full')
    params.set('geometries', 'geojson')
    params.set('steps', 'true')
    params.set('alternatives', opts?.alternatives ? 'true' : 'false')
    const url = `${this.baseUrl}/route/v1/${profile}/${coords}?${params.toString()}`
    const res = await fetch(url, { signal: opts?.signal })
    if (!res.ok)
      throw new Error(`OSRM request failed: ${res.status} ${res.statusText}`)
    const body = (await res.json()) as OSRMResponse
    if (body.code !== 'Ok')
      throw new Error(`OSRM error: ${body.code}${body.message ? ` — ${body.message}` : ''}`)
    return (body.routes ?? []).map(parseRoute)
  }
}
