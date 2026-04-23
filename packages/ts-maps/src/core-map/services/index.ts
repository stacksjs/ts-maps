// Services layer — pluggable providers for geocoding, reverse geocoding,
// directions, isochrones, and travel-time matrices. Defaults are keyless
// open-source endpoints (Nominatim, OSRM, Valhalla). Key-required providers
// (Mapbox, Google, MapTiler) are opt-in.

export * from './types'

export { GoogleDirections, GoogleGeocoder } from './providers/Google'
export { MapboxDirections, MapboxGeocoder, MapboxIsochrone, MapboxMatrix } from './providers/Mapbox'
export { MaptilerGeocoder } from './providers/Maptiler'
export { NominatimGeocoder } from './providers/Nominatim'
export { OSRMDirections, OSRMMatrix } from './providers/OSRM'
export { PhotonGeocoder } from './providers/Photon'
export { ValhallaDirections, ValhallaIsochrone, ValhallaMatrix } from './providers/Valhalla'

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
