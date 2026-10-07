// OpenTripPlanner: open-source transit routing from GTFS timetables and
// OpenStreetMap. Run your own, or use a public instance (Entur, Digitransit,
// many transit agencies). Talks to OTP 2's GTFS GraphQL API.
//
// Docs: https://docs.opentripplanner.org/en/latest/apis/GTFS-GraphQL-API/

import type { DirectionsOptions, DirectionsProvider, LatLngLike, Route, RouteStep } from '../types'
import { decodePolyline } from '../polyline'
import { transitInstruction, transitVehicle, walkInstruction } from '../transit'

export interface OpenTripPlannerOptions {
  /** The GraphQL endpoint: `https://otp.example.com/otp/gtfs/v1`. */
  url: string
  /** Extra request headers: an API key, a client name. */
  headers?: Record<string, string>
  /** Itineraries to ask for. Default 3. */
  itineraries?: number
  /** Injectable for tests. */
  fetch?: typeof fetch
}

interface OtpPlace {
  name?: string
  lat: number
  lon: number
}

interface OtpLeg {
  mode: string
  startTime: number
  endTime: number
  duration: number
  distance: number
  headsign?: string | null
  from: OtpPlace
  to: OtpPlace
  route?: { shortName?: string | null, longName?: string | null, color?: string | null, textColor?: string | null, agency?: { name?: string } | null } | null
  intermediateStops?: Array<{ name?: string }> | null
  legGeometry?: { points: string } | null
}

interface OtpItinerary {
  startTime: number
  endTime: number
  duration: number
  legs: OtpLeg[]
}

const QUERY = `query Plan($from: InputCoordinates!, $to: InputCoordinates!, $n: Int, $date: String, $time: String, $arriveBy: Boolean) {
  plan(from: $from, to: $to, numItineraries: $n, date: $date, time: $time, arriveBy: $arriveBy, transportModes: [{ mode: TRANSIT }, { mode: WALK }]) {
    itineraries {
      startTime endTime duration
      legs {
        mode startTime endTime duration distance headsign
        from { name lat lon }
        to { name lat lon }
        route { shortName longName color textColor agency { name } }
        intermediateStops { name }
        legGeometry { points }
      }
    }
  }
}`

/** A colour as OTP gives it, without the `#`. */
function hex(color: string | null | undefined): string | undefined {
  return color ? `#${color.replace(/^#/, '')}` : undefined
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function legToStep(leg: OtpLeg, next: OtpLeg | undefined, language?: string): RouteStep {
  const geometry: LatLngLike[] = leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [{ lat: leg.from.lat, lng: leg.from.lon }, { lat: leg.to.lat, lng: leg.to.lon }]
  if (leg.mode === 'WALK' || leg.mode === 'BICYCLE' || !leg.route) {
    // Walking to the next stop, or to the destination at the end.
    return { distance: leg.distance, duration: leg.duration, instruction: walkInstruction(next ? leg.to.name : undefined, language), geometry, maneuver: 'walk' }
  }
  const transit = {
    vehicle: transitVehicle(leg.mode),
    line: leg.route.shortName || leg.route.longName || leg.mode,
    ...(leg.route.longName ? { lineName: leg.route.longName } : {}),
    ...(hex(leg.route.color) ? { color: hex(leg.route.color) } : {}),
    ...(hex(leg.route.textColor) ? { textColor: hex(leg.route.textColor) } : {}),
    ...(leg.headsign ? { headsign: leg.headsign } : {}),
    ...(leg.route.agency?.name ? { agency: leg.route.agency.name } : {}),
    from: { name: leg.from.name ?? '', location: { lat: leg.from.lat, lng: leg.from.lon } },
    to: { name: leg.to.name ?? '', location: { lat: leg.to.lat, lng: leg.to.lon } },
    departure: new Date(leg.startTime),
    arrival: new Date(leg.endTime),
    stops: (leg.intermediateStops?.length ?? 0) + 1,
  }
  return { distance: leg.distance, duration: leg.duration, instruction: transitInstruction(transit, language), geometry, maneuver: 'transit', name: transit.line, transit }
}

export class OpenTripPlannerDirections implements DirectionsProvider {
  name: string = 'opentripplanner'
  private url: string
  private headers: Record<string, string>
  private itineraries: number
  private fetcher?: typeof fetch

  constructor(options: OpenTripPlannerOptions) {
    if (!options.url)
      throw new Error('OpenTripPlanner needs the url of its GraphQL endpoint')
    this.url = options.url
    this.headers = options.headers ?? {}
    this.itineraries = options.itineraries ?? 3
    this.fetcher = options.fetch
  }

  async getDirections(waypoints: LatLngLike[], opts: DirectionsOptions = {}): Promise<Route[]> {
    if (waypoints.length < 2)
      throw new Error('OpenTripPlanner needs two waypoints')
    if (opts.profile && opts.profile !== 'transit')
      throw new Error('OpenTripPlanner here plans transit; use another provider for driving, walking or cycling')
    const from = waypoints[0]!
    const to = waypoints[waypoints.length - 1]!
    const when = opts.arriveBy ?? opts.departAt
    const variables: Record<string, unknown> = {
      from: { lat: from.lat, lon: from.lng },
      to: { lat: to.lat, lon: to.lng },
      n: opts.alternatives === false ? 1 : this.itineraries,
    }
    if (when) {
      variables.date = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
      variables.time = `${pad(when.getHours())}:${pad(when.getMinutes())}`
      variables.arriveBy = !!opts.arriveBy
    }
    const response = await (this.fetcher ?? fetch)(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers },
      body: JSON.stringify({ query: QUERY, variables }),
      signal: opts.signal,
    })
    if (!response.ok)
      throw new Error(`OpenTripPlanner request failed: ${response.status} ${response.statusText}`)
    const body = await response.json() as { data?: { plan?: { itineraries?: OtpItinerary[] } }, errors?: Array<{ message?: string }> }
    if (body.errors?.length)
      throw new Error(`OpenTripPlanner: ${body.errors.map(e => e.message).join('; ')}`)
    return (body.data?.plan?.itineraries ?? []).map((it) => {
      const steps = it.legs.map((leg, i) => legToStep(leg, it.legs[i + 1], opts.language))
      return {
        distance: it.legs.reduce((sum, leg) => sum + leg.distance, 0),
        duration: it.duration,
        geometry: steps.flatMap((s, i) => (i ? s.geometry.slice(1) : s.geometry)),
        steps,
        departure: new Date(it.startTime),
        arrival: new Date(it.endTime),
      }
    })
  }
}
