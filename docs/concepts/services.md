# Services

ts-maps includes a small adapter layer for external geo services. The adapters target a common interface so you can swap providers without rewriting your call sites. Defaults are all keyless and open-source.

## Provider matrix

| Capability | Default | Alternatives |
| ---------- | ------- | ------------ |
| Geocoding | `NominatimGeocoder` | `PhotonGeocoder`, `MapboxGeocoder`, `MaptilerGeocoder`, `GoogleGeocoder` |
| Directions | `OSRMDirections` | `ValhallaDirections`, `MapboxDirections`, `GoogleDirections` |
| Isochrones | `ValhallaIsochrone` | `MapboxIsochrone` |
| Matrix | `ValhallaMatrix` | `MapboxMatrix` |

## Geocoding

```ts
import { services } from 'ts-maps'

const geocoder = services.defaultGeocoder() // NominatimGeocoder

const results = await geocoder.search('Tower Bridge, London')
// → [{ text, center: { lat, lng }, bbox, placeType, properties }, …]

const reverse = await geocoder.reverse({ lat: 51.5055, lng: -0.0754 })
```

## Directions

```ts
import { services } from 'ts-maps'

const d = services.defaultDirections() // OSRMDirections

const routes = await d.getDirections([
  { lat: 51.5055, lng: -0.0754 },
  { lat: 51.5074, lng: -0.1278 },
], { profile: 'driving', overview: 'full' })

// routes[0] = { distance, duration, geometry: LatLng[], legs, steps }
```

## Isochrones

```ts
import { services } from 'ts-maps'

const iso = services.defaultIsochrone() // ValhallaIsochrone

const polys = await iso.getIsochrones(
  { lat: 51.5074, lng: -0.1278 },
  { contours: [5, 10, 15], profile: 'walking' }, // minutes
)
```

## Matrix

```ts
const mtx = services.defaultMatrix()
const { durations, distances } = await mtx.getMatrix(origins, destinations, { profile: 'driving' })
```

## Writing a custom provider

Any object implementing `GeocoderProvider` (or the corresponding interface for directions / isochrones / matrix) can be passed anywhere a default provider is expected. See `services/types.ts` in the source for the contracts.
