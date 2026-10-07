// Transit directions: walk, ride, change, walk, as Apple writes them.

import type { Route, TransitDetails, TransitVehicle, TransportProfile, TravelMode } from './types'

/** A street profile for a provider that has no transit: an error, said plainly, for transit. */
export function streetProfile(profile: TravelMode | undefined, provider: string): TransportProfile {
  if (profile === 'transit')
    throw new Error(`${provider} has no transit directions; use OpenTripPlannerDirections or GoogleDirections`)
  return profile ?? 'driving'
}

/** A GTFS route type, or an agency's mode name, as a vehicle. */
export function transitVehicle(mode: string | number | undefined): TransitVehicle {
  const value = typeof mode === 'number' ? mode : String(mode ?? '').toLowerCase()
  switch (value) {
    case 0: case 'tram': case 'light_rail': case 'streetcar': return 'tram'
    case 1: case 'subway': case 'metro': case 'metro_rail': return 'subway'
    case 2: case 'rail': case 'heavy_rail': case 'commuter_train': case 'high_speed_train': case 'long_distance_train': case 'train': return 'rail'
    case 3: case 'bus': case 'intercity_bus': case 'share_taxi': return 'bus'
    case 4: case 'ferry': return 'ferry'
    case 5: case 'cable_car': return 'cable_car'
    case 6: case 'gondola': case 'aerial_lift': return 'gondola'
    case 7: case 'funicular': return 'funicular'
    case 11: case 'trolleybus': return 'trolleybus'
    case 12: case 'monorail': return 'monorail'
    default: return 'other'
  }
}

const VEHICLE_NOUN: Record<TransitVehicle, string> = {
  bus: 'bus',
  tram: 'tram',
  subway: 'train',
  rail: 'train',
  ferry: 'ferry',
  cable_car: 'cable car',
  gondola: 'gondola',
  funicular: 'funicular',
  trolleybus: 'bus',
  monorail: 'train',
  other: 'line',
}

/** "Take the N Judah toward Ocean Beach, 6 stops". */
export function transitInstruction(ride: TransitDetails): string {
  // "the N Judah" where the line has a name; "the 38 bus" where it is only a number.
  const named = ride.lineName && ride.lineName !== ride.line
  const what = named
    ? `the ${ride.lineName!.startsWith(ride.line) ? ride.lineName : `${ride.line} ${ride.lineName}`}`
    : /^\d+[A-Z]?$/.test(ride.line) ? `the ${ride.line} ${VEHICLE_NOUN[ride.vehicle]}` : `the ${ride.line}`
  const toward = ride.headsign ? ` toward ${ride.headsign}` : ''
  const stops = ride.stops ? `, ${ride.stops} ${ride.stops === 1 ? 'stop' : 'stops'}` : ''
  return `Take ${what}${toward}${stops}`
}

/** "Walk to Church St & Duboce Ave", or "Walk to your destination". */
export function walkInstruction(to: string | undefined): string {
  return to ? `Walk to ${to}` : 'Walk to your destination'
}

/** The rides of a transit route, in order. */
export function transitRides(route: Route): TransitDetails[] {
  const rides: TransitDetails[] = []
  for (const step of route.steps) {
    if (step.transit)
      rides.push(step.transit)
  }
  return rides
}
