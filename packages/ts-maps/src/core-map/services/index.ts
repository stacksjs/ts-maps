// Services layer — pluggable providers for geocoding, reverse geocoding,
// directions, isochrones, and travel-time matrices. Defaults are keyless
// open-source endpoints (Nominatim, OSRM, Valhalla). Key-required providers
// (Mapbox, Google, MapTiler) are opt-in.

export * from './types'

export {
  appleMapsDirectionsUrl,
  directionsLinks,
  formatCoordinate,
  googleMapsDirectionsUrl,
} from './links'
export type { NavigationLinkOptions, NavigationLinks, NavigationMode } from './links'

export { climb, distanceMeters, pathLengthMeters, resamplePath } from './paths'
export type { Climb } from './paths'
export { directionsRouter, RouteBuilder, straightRouter } from './route-builder'
export { abbreviateStreet, formatDistance, formatInstruction, laneHint, laneIcon, laneIndicationFor, lanesMatter, maneuverAngle, maneuverIcon, parseManeuver, prefersImperial, spokenDistance, spokenInstruction } from './instructions'
export type { DistanceUnits, InstructionOptions, Maneuver, ManeuverDegree, ManeuverDirection, ManeuverKind } from './instructions'
export { Navigator } from './navigator'
export type { Instruction, NavigationProgress, NavigatorOptions, PositionFix } from './navigator'
export { RouteSimulator } from './simulator'
export type { RouteSimulatorOptions } from './simulator'
export type { RouteBuilderOptions, RouteBuilderState, SegmentRouter } from './route-builder'

export { GazetteerGeocoder } from './providers/Gazetteer'
export type { GazetteerGeocoderOptions } from './providers/Gazetteer'
export { GoogleDirections, GoogleGeocoder } from './providers/Google'
export { MapboxDirections, MapboxGeocoder, MapboxIsochrone, MapboxMatrix } from './providers/Mapbox'
export { MaptilerGeocoder } from './providers/Maptiler'
export { NominatimGeocoder } from './providers/Nominatim'
export { OSRMDirections, OSRMMatrix } from './providers/OSRM'
export { PhotonGeocoder } from './providers/Photon'
export { ValhallaDirections, ValhallaElevation, ValhallaIsochrone, ValhallaMatrix } from './providers/Valhalla'

import type {
  DirectionsProvider,
  GeocoderProvider,
  IsochroneProvider,
  MatrixProvider,
} from './types'
import { NominatimGeocoder } from './providers/Nominatim'
import { OSRMDirections, OSRMMatrix } from './providers/OSRM'
import { ValhallaDirections, ValhallaIsochrone, ValhallaMatrix } from './providers/Valhalla'

export const defaultGeocoder: () => GeocoderProvider = () => new NominatimGeocoder()
export const defaultDirections: () => DirectionsProvider = () => new OSRMDirections()
export const defaultIsochrone: () => IsochroneProvider = () => new ValhallaIsochrone()
// Prefer OSRM's /table (keyless public demo, aligned with the default
// directions provider) and fall back to Valhalla when callers need it.
export const defaultMatrix: () => MatrixProvider = () => new OSRMMatrix()
export const valhallaMatrix: () => MatrixProvider = () => new ValhallaMatrix()

// Convenience alias: Valhalla can also serve directions. Prefer OSRM by default
// (faster on its own fleet), but expose Valhalla's as a drop-in alternative.
export const valhallaDirections: () => DirectionsProvider = () => new ValhallaDirections()
