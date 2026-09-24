# Services

ts-maps includes a small adapter layer for external geo services. The adapters target a common interface so you can swap providers without rewriting your call sites. Defaults are all keyless and open-source.

## Provider matrix

| Capability | Default | Alternatives |
| ---------- | ------- | ------------ |
| Geocoding | `NominatimGeocoder` | `GazetteerGeocoder` (self-hosted), `PhotonGeocoder`, `MapboxGeocoder`, `MaptilerGeocoder`, `GoogleGeocoder` |
| Directions | `OSRMDirections` | `ValhallaDirections`, `MapboxDirections`, `GoogleDirections` |
| Isochrones | `ValhallaIsochrone` | `MapboxIsochrone` |
| Elevation | — | `ValhallaElevation` |
| Matrix | `ValhallaMatrix` | `MapboxMatrix` |

## Geocoding

```ts
import { services } from 'ts-maps'

const geocoder = services.defaultGeocoder() // NominatimGeocoder

const results = await geocoder.search('Tower Bridge, London')
// → [{ text, center: { lat, lng }, bbox, placeType, properties }, …]

const reverse = await geocoder.reverse({ lat: 51.5055, lng: -0.0754 })
```

For Apple Maps–style search — suggestions from the map itself as you type,
Find Nearby, result pins and place cards — see the
[search control](./controls.md#search), which merges any provider with what is
on the map and in downloaded offline maps.

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

## Drawing a route

`RouteBuilder` is the logic behind "tap the map to draw a route", with no UI attached: waypoints, the line between each pair (along real paths through a router, or straight), undo, closing the loop and out-and-back.

```ts
import { climb, directionsRouter, RouteBuilder, resamplePath, ValhallaDirections, ValhallaElevation } from 'ts-maps/services'

const builder = new RouteBuilder({ router: directionsRouter(new ValhallaDirections(), 'walking') })
builder.onChange(() => line.setLatLngs(builder.path.map(p => [p.lat, p.lng])))
map.on('click', e => builder.add(e.latlng))

await builder.closeLoop()      // or builder.outAndBack()
await builder.undo()
builder.distanceMeters         // along the drawn line
builder.isLoop                 // ends within 50 m

const heights = await new ValhallaElevation().getElevations(resamplePath(builder.path, 200))
climb(heights)                 // { gain, loss } in metres, DEM noise filtered out
```

Taps made while a segment is still routing are queued, so fast tapping draws in order. A segment the router cannot do (no path, offline, rate-limited) is drawn straight and `lastError` says why — pass `fallbackToStraight: false` to refuse it instead. `straightRouter` draws every segment straight; `setRouter` switches between the two mid-route. `load(path)` starts from an existing line, such as a catalog trail.

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

## Turn-by-turn navigation

`turnByTurn(map)` is navigation after Apple Maps: route options, then guidance
with a banner, a voice, and a camera that follows from behind.

```ts
import { turnByTurn } from 'ts-maps'

const nav = turnByTurn(map, { destinationName: 'Ferry Building' })
await nav.preview(from, to)   // routes drawn, card with each option and Go
nav.start()                   // or the user taps Go
```

**Preview** draws every route the provider offers — the chosen one in blue,
alternatives in grey, all tappable — frames them, and shows a card with the time
and distance of each.

**Guidance** shows:

- a banner with the next maneuver's arrow, the distance to it and the road it
  leads onto ("400 ft · Market St"), and a *Then* row when a second maneuver
  follows closely;
- a card with arrival time, minutes and distance left, mute, and End;
- the route ahead in blue and the road already driven in grey;
- a camera that follows heading-up from behind and above, closer in at low
  speed and pulled back at speed, gliding between GPS fixes rather than
  jumping once a second — pan it and a *Resume* button brings it back.

**Lane guidance** appears under the banner as a maneuver draws near — within
800 m driving, 250 m cycling — when the road has lanes and a choice to make
between them: every lane approaching the maneuver, the ones to be in bright
with the arrow they use, the rest dimmed. The early and get-ready prompts say
which to be in: "In 400 feet, use the left 2 lanes to turn left onto
Broadway". Lanes come from OSRM and Mapbox, which describe them; `laneHint`,
`laneIcon` and `lanesMatter` in `services` word and draw them for your own UI.

Spoken prompts come early, to get ready, and at the turn ("In a quarter mile,
turn right onto Market Street"), each once. A few seconds off the route
fetches a new one from where you are; arriving says so.

Positions come from the Geolocation API. To try it at a desk, `simulate: true`
drives the route instead, slowing for turns — or pass `{ speed, timeScale }`.
Feed positions from anywhere else with `nav.update(fix)`.

| Option | Default | |
| --- | --- | --- |
| `directions` | OSRM | Any `DirectionsProvider` |
| `profile` | `'driving'` | `'walking'` and `'cycling'` change the camera and prompt distances |
| `units` | from the locale | `'metric'` or `'imperial'` |
| `voice` | `true` | Speech synthesis, where the browser has it |
| `simulate` | — | Drive the route instead of following the device |
| `alternatives` | `true` | Offer alternative routes in preview |

Events: `preview`, `routeselect`, `start`, `progress`, `instruction`, `reroute`,
`arrive`, `end`, `error`.

The guidance itself has no map or DOM in it. `services.Navigator` takes a route
and positions and produces progress, instructions, off-route and arrival
events; `services.formatInstruction`, `formatDistance` and `maneuverIcon` word
and draw a maneuver from any provider, whose maneuver codes are folded into one
vocabulary by `parseManeuver`. Steps now carry the road's `name` and a
roundabout's `exit` where the provider gives them.

### With no connection

Downloaded offline maps carry their own place index and road network:
`map.offline.geocoder()` and `map.offline.directions()` are providers like
any other, and `withOfflineFallback(online, offline)` puts one behind an
online provider. See [Offline maps](./offline.md#search-and-directions-offline).

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
