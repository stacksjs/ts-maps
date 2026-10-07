// Provider-interface layer for geocoding, directions, isochrone, and matrix
// services. Consumers program against these interfaces; providers are
// implemented separately so upstream backends can be swapped without touching
// map code.

export interface LatLngLike {
  lat: number
  lng: number
}

export interface GeocodingResult {
  text: string // display label
  center: LatLngLike
  bbox?: [number, number, number, number] // [w, s, e, n]
  placeType?: 'country' | 'region' | 'district' | 'postcode' | 'place' | 'address' | 'poi'
  properties?: Record<string, unknown>
  relevance?: number // 0..1
}

export interface GeocoderOptions {
  limit?: number // default 5
  language?: string // BCP47
  proximity?: LatLngLike
  bbox?: [number, number, number, number]
  countries?: string[] // ISO-3166 codes
  signal?: AbortSignal
}

export interface GeocoderProvider {
  name: string
  search: (query: string, opts?: GeocoderOptions) => Promise<GeocodingResult[]>
  reverse: (center: LatLngLike, opts?: GeocoderOptions) => Promise<GeocodingResult[]>
}

export type TransportProfile = 'driving' | 'walking' | 'cycling'

/** How a trip is made: a street profile, or public transport with walks between. */
export type TravelMode = TransportProfile | 'transit'

/** The kinds of vehicle a transit line runs, as GTFS names them. */
export type TransitVehicle = 'bus' | 'tram' | 'subway' | 'rail' | 'ferry' | 'cable_car' | 'gondola' | 'funicular' | 'trolleybus' | 'monorail' | 'other'

/** A ride on a transit line: one leg of a transit route. */
export interface TransitDetails {
  vehicle: TransitVehicle
  /** What the line is called on the sign: "N", "38R", "BART". */
  line: string
  /** Its full name: "N Judah". */
  lineName?: string
  /** `#rrggbb`, where the agency gives one. */
  color?: string
  textColor?: string
  /** Where it is going: "Ocean Beach". */
  headsign?: string
  agency?: string
  from: { name: string, location?: LatLngLike }
  to: { name: string, location?: LatLngLike }
  departure: Date
  arrival: Date
  /** Stops ridden, the last one counted. */
  stops: number
}

/**
 * One lane of the road approaching a maneuver, left to right as the driver
 * sees them.
 */
export interface LaneInfo {
  /**
   * The arrows painted on the lane: `'left'`, `'slight right'`, `'straight'`,
   * `'uturn'`, … `'none'` for an unmarked lane.
   */
  indications: string[]
  /** Whether this lane can be used for the maneuver. */
  valid: boolean
  /** Whether it is the lane the provider recommends, where it says. */
  active?: boolean
}

export interface RouteStep {
  distance: number // meters
  duration: number // seconds
  instruction: string // turn-by-turn text
  geometry: LatLngLike[] // polyline for this step
  maneuver?: string // e.g., 'turn-left', 'arrive'
  /** The road this step travels on, where the provider names it. */
  name?: string
  /** Which exit to take, at a roundabout. */
  exit?: number
  /** The lanes approaching this step's maneuver, where the provider knows them. */
  lanes?: LaneInfo[]
  /** On a transit route, the ride this step is. A walking step has none. */
  transit?: TransitDetails
}

export interface Route {
  distance: number // meters
  /** Seconds, in today's traffic where the provider knows it (`traffic` is then true). */
  duration: number
  /** Seconds the trip takes with no traffic, where the provider says: `duration` less this is the delay. */
  typicalDuration?: number
  /** Whether `duration` counts live traffic. */
  traffic?: boolean
  geometry: LatLngLike[] // full polyline
  steps: RouteStep[]
  legs?: Route[] // when there are via points
  /** A transit route's departure and arrival: it runs to a timetable. */
  departure?: Date
  arrival?: Date
}

export interface DirectionsOptions {
  profile?: TravelMode
  /** For transit: leave at, or arrive by, this time. Default leaving now. */
  departAt?: Date
  arriveBy?: Date
  alternatives?: boolean
  signal?: AbortSignal
  language?: string
  // the waypoints are the first argument — not repeated here
}

export interface DirectionsProvider {
  name: string
  getDirections: (waypoints: LatLngLike[], opts?: DirectionsOptions) => Promise<Route[]>
}

export interface IsochroneOptions {
  profile?: TransportProfile
  contours: number[] // minutes or meters — see contourMetric
  contourMetric?: 'time' | 'distance' // default 'time'
  denoise?: number // 0..1
  generalize?: number // meters
  signal?: AbortSignal
}

export interface IsochronePolygon {
  geometry: LatLngLike[] // outer ring
  holes?: LatLngLike[][]
  contour: number // the metric value this polygon corresponds to
}

export interface IsochroneProvider {
  name: string
  getIsochrones: (center: LatLngLike, opts: IsochroneOptions) => Promise<IsochronePolygon[]>
}

export interface MatrixOptions {
  profile?: TransportProfile
  metric?: 'time' | 'distance' // default 'time'
  signal?: AbortSignal
}

export interface MatrixResult {
  durations?: number[][] // [origin][destination]
  distances?: number[][]
}

export interface MatrixProvider {
  name: string
  getMatrix: (origins: LatLngLike[], destinations: LatLngLike[], opts?: MatrixOptions) => Promise<MatrixResult>
}

export interface ElevationOptions {
  signal?: AbortSignal
}

/** Ground height, in metres above sea level, at each point given. */
export interface ElevationProvider {
  name: string
  getElevations: (points: LatLngLike[], opts?: ElevationOptions) => Promise<Array<number | null>>
}
