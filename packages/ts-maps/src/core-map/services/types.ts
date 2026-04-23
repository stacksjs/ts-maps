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

export interface RouteStep {
  distance: number // meters
  duration: number // seconds
  instruction: string // turn-by-turn text
  geometry: LatLngLike[] // polyline for this step
  maneuver?: string // e.g., 'turn-left', 'arrive'
}

export interface Route {
  distance: number // meters
  duration: number // seconds
  geometry: LatLngLike[] // full polyline
  steps: RouteStep[]
  legs?: Route[] // when there are via points
}

export interface DirectionsOptions {
  profile?: TransportProfile
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
