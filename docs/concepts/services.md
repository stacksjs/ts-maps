# Services

ts-maps includes a small adapter layer for external geo services. The adapters target a common interface so you can swap providers without rewriting your call sites. Defaults are all keyless and open-source.

## Provider matrix

| Capability | Default | Alternatives |
| ---------- | ------- | ------------ |
| Geocoding | `NominatimGeocoder` | `GazetteerGeocoder` (self-hosted), `PhotonGeocoder`, `MapboxGeocoder`, `MaptilerGeocoder`, `GoogleGeocoder` |
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

### Self-hosted place search

The public geocoders are shared services with usage policies — Nominatim's forbids search-as-you-type outright. `ts-maps/gazetteer` runs place search on your own server instead: GeoNames populated places in SQLite with a full-text index, ranked by name match, population and nearness. `cities1000` (every place of 1,000+ people, ~170k) builds in a few seconds into a ~60 MB file and answers in about a millisecond.

```ts
// server (Bun)
import { buildGazetteerFile, createGazetteerHandler, downloadGeoNames, Gazetteer } from 'ts-maps/gazetteer'

buildGazetteerFile('places.sqlite', await downloadGeoNames({ dataset: 'cities1000' }))
const handle = createGazetteerHandler(new Gazetteer('places.sqlite'), { basePath: '/geo' })
Bun.serve({ fetch: async req => (await handle(req)) ?? new Response('Not found', { status: 404 }) })
```

```ts
// browser
import { GazetteerGeocoder } from 'ts-maps/services'

const geocoder = new GazetteerGeocoder({ baseUrl: '/geo' })
await geocoder.search('Portland, ME') // Portland, Maine, United States
await geocoder.search('st george')    // Saint George, Utah — abbreviations match
await geocoder.search('Munich')       // München, Bavaria, Germany — any alternate name
```

Text after a comma qualifies the place (`San Diego, TX`, `Paris, France`); `proximity`, `countries` and `bbox` narrow it further. `Gazetteer` itself implements `GeocoderProvider`, so server code can call `search` / `reverse` directly. The GeoNames licence (CC BY 4.0) asks for credit — `GEONAMES_ATTRIBUTION` holds the line to show.

## Handing off to a navigation app

Turn-by-turn belongs in the app the person already drives with. `directionsLinks` builds https links that open Apple Maps, and the Google Maps app when it is installed:

```ts
import { directionsLinks } from 'ts-maps/services'

const { apple, google } = directionsLinks({ lat: 32.8894, lng: -117.2519 }, { mode: 'driving' })
// apple:  https://maps.apple.com/?daddr=32.8894%2C-117.2519&dirflg=d
// google: https://www.google.com/maps/dir/?api=1&destination=32.8894%2C-117.2519&travelmode=driving
```

Modes are `driving` (default), `walking`, `cycling` and `transit`; pass `origin` to start somewhere other than the device's location. `appleMapsDirectionsUrl` and `googleMapsDirectionsUrl` build one link each.

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
