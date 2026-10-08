# Services

Geocoding, directions, isochrones, travel-time matrices and elevation come from web services. ts-maps has an adapter for each, all behind a few small interfaces, so you can swap one provider for another without touching the code that calls it. The defaults are open services that need no key; the commercial ones are opt-in.

Everything here is exported from `ts-maps/services`, and also as the `services` namespace of `ts-maps`:

```ts
import { NominatimGeocoder } from 'ts-maps/services'
// or
import { services } from 'ts-maps'
const geocoder = new services.NominatimGeocoder()
```

## Providers

| Capability | Default | Others |
| ---------- | ------- | ------ |
| Geocoding | `NominatimGeocoder` | `PhotonGeocoder`, `GazetteerGeocoder` (self-hosted), `MapboxGeocoder`, `MaptilerGeocoder`, `GoogleGeocoder` |
| Directions | `OSRMDirections` | `ValhallaDirections`, `MapboxDirections`, `GoogleDirections`, `OpenTripPlannerDirections` (transit) |
| Isochrones | `ValhallaIsochrone` | `MapboxIsochrone` |
| Matrix | `OSRMMatrix` | `ValhallaMatrix`, `MapboxMatrix` |
| Elevation | | `ValhallaElevation` |

`defaultGeocoder()`, `defaultDirections()`, `defaultIsochrone()` and `defaultMatrix()` return the defaults; `valhallaDirections()` and `valhallaMatrix()` return Valhalla's.

| Provider | Needs | Public server |
| --- | --- | --- |
| Nominatim, OSRM | nothing | `nominatim.openstreetmap.org`, `router.project-osrm.org` |
| Photon | nothing | `photon.komoot.io` |
| Valhalla | nothing (optional `apiKey`) | `valhalla1.openstreetmap.de` |
| Gazetteer | `baseUrl` of your server | none: you run it |
| OpenTripPlanner | `url` of an instance | none built in |
| Mapbox | `accessToken` | |
| MapTiler | `apiKey` | |
| Google | `apiKey` | |

Every provider takes a `baseUrl`, so any of them can point at your own deployment. The public servers are shared, best-effort services with usage policies. They are fine for trying things and for light use; an app with real traffic should run its own or pay for one.

## Geocoding

```ts
import { NominatimGeocoder } from 'ts-maps/services'

const geocoder = new NominatimGeocoder()

const results = await geocoder.search('Tower Bridge, London', { limit: 5 })
// [{ text, center: { lat, lng }, bbox, placeType, properties, relevance }, …]

const [here] = await geocoder.reverse({ lat: 51.5055, lng: -0.0754 })
```

Both take `{ limit, language, proximity, bbox, countries, signal }`. `bbox` is `[west, south, east, north]` and `countries` a list of ISO codes. Not every provider can use every option: Nominatim and Google ignore `proximity`, Photon ignores `countries`. `placeType` is one of `country`, `region`, `district`, `postcode`, `place`, `address` or `poi`.

### Rate limits and fallbacks

Nominatim and Photon go through a `RateLimiter`. When the server answers `429`, or `503` with `Retry-After`, the request is retried once, then the provider backs off for 30 seconds (doubling, up to five minutes) and throws `RateLimitError` meanwhile. Pass `rateLimit` to either to change that.

`geocoderChain([...providers])` tries providers in order and skips one while it is rate-limited, so a busy public server falls through to the next:

```ts
import { geocoderChain, NominatimGeocoder, PhotonGeocoder } from 'ts-maps/services'

const geocoder = geocoderChain([new PhotonGeocoder(), new NominatimGeocoder()], { fallThroughOnEmpty: true })
```

Nominatim's policy forbids search-as-you-type, so suggestions as someone types should come from Photon, your own gazetteer, or a paid provider. `NominatimGeocoder` says so: its `autocomplete` is `false` for the public server, and the geocoder control then searches on Enter. It also spaces its requests to the public server a second apart, in order, as the policy asks (`interval` changes that; your own server has none).

### Self-hosted place search

`ts-maps/gazetteer` runs place search on your own server: GeoNames populated places in SQLite with a full-text index, ranked by name match, population and nearness. `cities1000` (every place of 1,000 or more people, about 150,000) builds in seconds. It uses `bun:sqlite`, so the server side runs on Bun.

```ts
// server.ts, run with Bun
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
await geocoder.search('st george')    // Saint George, Utah: abbreviations match
await geocoder.search('München')      // Munich, Bavaria, Germany: alternate names match
```

The handler answers `GET /geo/search` and `GET /geo/reverse`. Text after a comma favours places in that region or country (`San Diego, TX`, `Paris, France`). `countries` and `bbox` filter results, and `proximity` ranks nearer places higher. `Gazetteer` itself implements the geocoder interface, so server code can call `search` and `reverse` directly. The GeoNames licence (CC BY 4.0) asks for credit; `GEONAMES_ATTRIBUTION` holds the line to show.

### The search control

For search the way Apple Maps does it (suggestions from the map itself as you type, Find Nearby, result pins and place cards), use the [search control](./controls.md#search). It merges a provider with what is on the map and in downloaded offline maps. Its engine, `SearchEngine`, is exported from `ts-maps` too, and uses Photon unless given another provider. The [search example](../examples/09-search.md) has it running.

## Directions

```ts
import { OSRMDirections } from 'ts-maps/services'

const directions = new OSRMDirections()

const routes = await directions.getDirections([
  { lat: 51.5055, lng: -0.0754 },
  { lat: 51.5074, lng: -0.1278 },
], { profile: 'driving', alternatives: true })

const best = routes[0]
best.distance  // metres
best.duration  // seconds
best.geometry  // [{ lat, lng }, …]
best.steps     // [{ instruction, distance, duration, geometry, maneuver, name, … }, …]
```

Options are `profile` (`'driving'`, `'walking'`, `'cycling'` or `'transit'`), `alternatives`, `language`, `departAt`, `arriveBy` and `signal`. A route has `distance`, `duration`, `geometry` and `steps`. OSRM and Valhalla also fill `legs`, one per pair of waypoints. Steps carry the road's `name` and a roundabout's `exit` where the provider gives them; OSRM and Mapbox add `lanes`.

The public OSRM server only routes cars; whatever profile you ask for, the route is a driving one. For walking and cycling, use `ValhallaDirections` or an OSRM of your own built with those profiles.

### In traffic

Where a provider knows today's traffic, routes say so: `duration` is the time in traffic, `typicalDuration` the time on a clear road, and `traffic` is true. The turn-by-turn preview shows the difference, "4 min delay", orange as it grows and red when it is heavy, or "Light traffic".

```ts
import { GoogleDirections, MapboxDirections } from 'ts-maps/services'

new MapboxDirections({ accessToken, traffic: true }) // the driving-traffic profile
new GoogleDirections({ apiKey, traffic: true })      // leaving now, duration_in_traffic
```

OSRM and Valhalla report no traffic.

### By transit

Walk, ride, change, walk, as Apple plans it. Transit needs timetables, so it comes from a provider that has them:

```ts
import { OpenTripPlannerDirections } from 'ts-maps/services'

const transit = new OpenTripPlannerDirections({ url: 'https://otp.example.com/otp/gtfs/v1' })
const [route] = await transit.getDirections([from, to], { profile: 'transit', departAt: new Date() })

route.steps.map(s => s.instruction)
// ['Walk to Embarcadero Station', 'Take the N Judah toward Ocean Beach, 6 stops', 'Walk to your destination']
route.steps[1].transit // { vehicle: 'tram', line: 'N', lineName: 'Judah', color: '#005B95', headsign, stops, departure, arrival, … }
```

[OpenTripPlanner](https://www.opentripplanner.org) is open source and plans from GTFS feeds and OpenStreetMap; run your own, or use an agency's or a region's public instance (Entur, Digitransit). It takes `url`, `headers` and `itineraries` (default `3`), and plans transit only. `GoogleDirections` plans transit too, with `profile: 'transit'`. `departAt` and `arriveBy` choose the time. Providers without transit (OSRM, Valhalla, Mapbox, offline routing) throw rather than answering by car.

`TurnByTurn` with `profile: 'transit'` previews each route as its rides, the line names on their colours, with when it leaves and arrives, and speaks each step in its own words. `styles.transit({ tiles })` is the Transit map: streets quietened, rail and tram lines drawn strong, stations named.

Encoded polylines, as these providers send shapes, are `decodePolyline(encoded, precision)` and `encodePolyline(points, precision)`, with `precision` defaulting to `5`.

## Isochrones

How far you can get in a given time, as polygons:

```ts
import { ValhallaIsochrone } from 'ts-maps/services'

const polygons = await new ValhallaIsochrone().getIsochrones(
  { lat: 51.5074, lng: -0.1278 },
  { contours: [5, 10, 15], profile: 'walking' }, // minutes
)
// [{ contour: 5, geometry: [{ lat, lng }, …], holes }, …]
```

`contourMetric: 'distance'` asks for distances instead. Each provider reads those in its own API's unit: kilometres for Valhalla, metres for Mapbox. `denoise` and `generalize` are passed to the provider.

## Matrix

Travel times (or distances) from every origin to every destination:

```ts
import { OSRMMatrix } from 'ts-maps/services'

const { durations } = await new OSRMMatrix().getMatrix(origins, destinations, { profile: 'driving' })
durations![0][1] // seconds from origins[0] to destinations[1]
```

`metric` is `'time'` (default) or `'distance'`. OSRM returns one of `durations` or `distances`, whichever `metric` asks for, with `Infinity` where there is no route. Valhalla and Mapbox return both.

## Elevation

```ts
import { ValhallaElevation } from 'ts-maps/services'

const heights = await new ValhallaElevation().getElevations([
  { lat: 46.0, lng: 7.65 },
  { lat: 45.98, lng: 7.66 },
]) // metres, null where there is no data
```

Elevation tiles on the map itself are in [Terrain](./terrain.md).

## Drawing a route

`RouteBuilder` is the logic behind "tap the map to draw a route", with no UI attached: waypoints, the line between each pair (along real paths through a router, or straight), undo, closing the loop and out-and-back.

```ts
import { polyline, TsMap } from 'ts-maps'
import { climb, directionsRouter, resamplePath, RouteBuilder, ValhallaDirections, ValhallaElevation } from 'ts-maps/services'

const map = new TsMap('map', { center: [37.7749, -122.4194], zoom: 14 })
const line = polyline([], { color: '#2563eb', weight: 4 }).addTo(map)

const builder = new RouteBuilder({ router: directionsRouter(new ValhallaDirections(), 'walking') })
builder.onChange(() => line.setLatLngs(builder.path.map(p => [p.lat, p.lng])))
map.on('click', e => builder.add(e.latlng))

await builder.closeLoop()      // or builder.outAndBack()
await builder.undo()
builder.distanceMeters         // along the drawn line
builder.isLoop                 // ends within 50 m, and longer than 100 m

const heights = await new ValhallaElevation().getElevations(resamplePath(builder.path, 200))
climb(heights)                 // { gain, loss } in metres, DEM noise filtered out
```

Taps made while a segment is still routing are queued, so fast tapping draws in order. A segment the router cannot do (no path, offline, rate-limited) is drawn straight and `lastError` says why; pass `fallbackToStraight: false` to refuse it instead. `straightRouter` draws every segment straight, and `setRouter` switches between the two mid-route. `move`, `insert`, `remove` and `clear` edit it; `load(path)` starts from an existing line, such as a catalog trail; `toJSON()` saves it.

`RouteEditor` puts a builder on the map with draggable waypoints and handles: `new RouteEditor(builder).addTo(map)`. See [Layers](./layers.md).

## Turn-by-turn navigation

`turnByTurn(map)` is navigation after Apple Maps: route options, then guidance with a banner, a voice, and a camera that follows from behind.

```ts
import { styles, TsMap, turnByTurn } from 'ts-maps'

const map = new TsMap('map', {
  center: [37.7993, -122.4219],
  zoom: 13,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

const nav = turnByTurn(map, { destinationName: 'Palace of Fine Arts', simulate: true })
await nav.preview({ lat: 37.7955, lng: -122.3937 }, { lat: 37.8029, lng: -122.4484 })
nav.start() // or the user taps Go
```

**Preview** draws every route the provider offers (the chosen one in blue, alternatives in grey, all tappable), frames them, and shows a card with the time and distance of each.

**Guidance** shows:

- a banner with the next maneuver's arrow, the distance to it and the road it leads onto ("400 ft · Market St"), and a *Then* row when a second maneuver follows closely;
- a card with arrival time, minutes and distance left, mute, and End;
- the route ahead in blue and the road already driven in grey;
- a camera that follows heading-up from behind and above, closer in at low speed and pulled back at speed, gliding between GPS fixes rather than jumping once a second. Pan it and a *Resume* button brings it back.

**Lane guidance** appears under the banner as a maneuver draws near (within 800 m driving, 250 m cycling) when the road has lanes and a choice to make between them: every lane approaching the maneuver, the ones to be in bright with the arrow they use, the rest dimmed. The early and get-ready prompts say which to be in: "In 400 feet, use the left 2 lanes to turn left onto Broadway". Lanes come from OSRM and Mapbox, which describe them; `laneHint`, `laneIcon` and `lanesMatter` word and draw them for your own UI.

Spoken prompts come early, to get ready, and at the turn ("In a quarter mile, turn right onto Market Street"), each once. A few seconds off the route fetches a new one from where you are; arriving says so.

Positions come from the Geolocation API. To try it at a desk, `simulate: true` drives the route instead, slowing for turns, or pass `{ speed, timeScale }` (metres a second, default `13.4`). Feed positions from anywhere else with `nav.update(fix)`.

| Option | Default | |
| --- | --- | --- |
| `directions` | `new OSRMDirections()` | Any directions provider |
| `profile` | `'driving'` | `'walking'` changes the camera; `'walking'` and `'cycling'` change prompt and lane distances |
| `destinationName` | | Named in the card and on arrival |
| `units` | from the locale | `'metric'` or `'imperial'` |
| `locale` | the map's | |
| `voice` | `true` | Speech synthesis, where the browser has it |
| `simulate` | | `true`, or `{ speed, interval, timeScale }`: drive the route instead of following the device |
| `alternatives` | `true` | Offer alternative routes in preview |

Methods: `preview(from, to)` (resolves to the routes), `selectRoute(index)`, `start()`, `stop()`, `update(fix)` and `recenter()`. Events: `preview`, `routeselect`, `start`, `progress`, `instruction`, `reroute`, `arrive`, `end`, `error`. The [turn-by-turn example](../examples/10-turn-by-turn.md) runs it with `simulate`.

The guidance itself has no map or DOM in it. `Navigator` takes a route and positions and produces `progress`, `step`, `instruction`, `offroute` and `arrive` events. `formatInstruction`, `formatDistance` and `maneuverIcon` word and draw a maneuver from any provider, whose maneuver codes are folded into one vocabulary by `parseManeuver`. `RouteSimulator` is the simulated drive on its own.

### With no connection

Downloaded offline maps carry their own place index and road network: `map.offline.geocoder()` and `map.offline.directions()` are providers like any other, and `withOfflineFallback(online, offline)` (from `ts-maps`) puts one behind an online provider. See [Offline maps](./offline.md#search-and-directions-offline).

## Handing off to a navigation app

Sometimes turn-by-turn belongs in the app the person already drives with. `directionsLinks` builds https links that open Apple Maps, and the Google Maps app when it is installed:

```ts
import { directionsLinks } from 'ts-maps/services'

const { apple, google } = directionsLinks({ lat: 32.8894, lng: -117.2519 }, { mode: 'driving' })
// apple:  https://maps.apple.com/?daddr=32.8894%2C-117.2519&dirflg=d
// google: https://www.google.com/maps/dir/?api=1&destination=32.8894%2C-117.2519&travelmode=driving
```

Modes are `driving` (default), `walking`, `cycling` and `transit`; pass `origin` to start somewhere other than the device's location. `appleMapsDirectionsUrl` and `googleMapsDirectionsUrl` build one link each.

## Writing a provider

A provider is any object with a `name` and the method its interface asks for, so it can go anywhere a built-in one goes:

```ts
import type { GeocoderOptions, GeocoderProvider, GeocodingResult, LatLngLike } from 'ts-maps/services'

class MyGeocoder implements GeocoderProvider {
  name = 'my-geocoder'

  async search(query: string, opts?: GeocoderOptions): Promise<GeocodingResult[]> {
    const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal: opts?.signal })
    const places: Array<{ name: string, lat: number, lng: number }> = await response.json()
    return places.map(p => ({ text: p.name, center: { lat: p.lat, lng: p.lng }, placeType: 'poi' }))
  }

  async reverse(center: LatLngLike): Promise<GeocodingResult[]> {
    return []
  }
}
```

The interfaces are `GeocoderProvider` (`search`, `reverse`), `DirectionsProvider` (`getDirections`), `IsochroneProvider` (`getIsochrones`), `MatrixProvider` (`getMatrix`) and `ElevationProvider` (`getElevations`), all exported as types from `ts-maps/services`.
