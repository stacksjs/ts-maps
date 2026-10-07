# Controls

Controls are the small pieces of UI the map draws over itself. Each one is
added the same way, and each takes a `position` of `'topleft'`, `'topright'`,
`'bottomleft'` or `'bottomright'`:

```ts
import { control } from 'ts-maps'

control.navigation({ position: 'topright' }).addTo(map)
```

Every control's colours come from the theme tokens described in
[Styles & theming](./styles-and-theming.md), so they follow `map.setTheme()`
without any per-control configuration.

## Accessibility

The panels follow WAI-ARIA's patterns, so a screen reader and a keyboard can
use them:

- **Search** is a combobox: the field names the highlighted row with
  `aria-activedescendant` as the arrow keys move, and a live region says how
  many results a search found and which place was chosen. Closing a place's
  card puts the keyboard back in the field.
- **Offline Maps** and the **map type picker** are dialogs: opening one from
  its button moves the keyboard into it, Escape closes it and returns to the
  button. Each map's buttons name it ("Pause San Francisco download"), and a
  download is a `progressbar` with its value. The area picker's corners take
  focus with Tab and move with the arrow keys (Shift for bigger steps), and
  the area is described in words: "About 2.1 × 1.4 km · Estimated size: 312 MB".
- **Turn-by-turn**'s banner is a polite live region, so the next maneuver is
  read out as it changes; End and mute say what they do.
- **Motion:** with `prefers-reduced-motion`, `flyTo` and `easeTo` jump rather
  than fly (pass `essential: true` where the animation is the point), and pins
  and cards appear without moving.
- **Contrast:** text on the panels is at 4.5:1 or better in both themes.
  Action blue is `#0066cc` in light and `#5eb0ff` in dark rather than Apple's
  `#0a84ff`, which is 3.6:1 on white.

## Zoom and navigation

`control.zoom()` is the plain `+`/`−` pair, and is added automatically unless
you pass `zoomControl: false` when creating the map.

`control.navigation()` is the Mapbox-shaped control: the zoom pair plus a
compass that shows the current bearing and returns the map to north when
pressed.

```ts
control.navigation({
  showZoom: true,
  showCompass: true,
  // Tilt the needle to reflect pitch, and reset pitch along with bearing.
  visualizePitch: false,
  // Milliseconds for the swing back to north; 0 snaps.
  resetDuration: 300,
}).addTo(map)
```

The compass is the only always-visible indication that the map is rotated at
all, which is why it is worth having as soon as rotation is enabled. When the
viewer has asked for reduced motion the reset always snaps, whatever
`resetDuration` says.

## Locate

`control.locate()` centres the map on the device's position and, unless told
otherwise, follows it — drawing a blue dot with a pulsing halo and a circle
showing the reported accuracy.

```ts
control.locate({
  // null keeps the current zoom on the first fix.
  zoom: 16,
  follow: true,
  showMarker: true,
}).addTo(map)
```

Geolocation is requested **on click and never on load**. A permission prompt
that appears unasked is the fastest way to be denied for the rest of the
session, and a denied permission cannot be re-requested from script.

Following stops the moment the user pans or zooms by hand; the dot stays where
it is. The map fires `locatefound` and `locateerror`.

## Search

Search as in Apple Maps: one "Search Maps" field for places, addresses and
kinds of place.

```ts
const nav = turnByTurn(map)
control.search({ turnByTurn: nav }).addTo(map)
```

- **Focused and empty:** it offers **Find Nearby** (Restaurants, Coffee, Bars,
  Groceries, Gas Stations…) and your **Recents**, which are kept in
  `localStorage`.
- **As you type:** suggestions appear straight away. Each shows its icon (the
  same badge the map draws), what kind of place it is, how far away, and its
  street, e.g. "Café · 0.3 mi · Market Street". The typed part is in bold.
- **A category, or Enter on a query:** a pin drops for every result and they
  are listed, nearest first. Move the map, and **Search This Area** runs the
  search again there. Where pins would overlap, they gather into a bubble
  with how many, in the colour of their kind, and come apart as the map
  zooms in; tapping one zooms to what is in it. The chosen result always
  has a pin of its own.
- **Choosing a place:** the map flies to it and opens its card: kind, distance,
  address, coordinates, and **Directions**. Directions previews the route on
  the `TurnByTurn` you pass, from `origin` (the device's position by default)
  and calls `onDirections`.
- **Its details:** the card shows at once from what search knows, then fills
  in as OpenStreetMap answers: whether it is open ("Open · Closes 9 PM",
  "Closed · Opens tomorrow 8 AM", read from `opening_hours`), its phone and
  website, with **Call** and **Website** buttons. **Share** opens the system
  share sheet, or copies a link where there is none.
- **Saving:** **Save** on a place's card adds it to Favorites. Favorites are
  stars on the map and chips above Recents; **Guides**, named collections,
  are listed between, and open as results. See below.
- **Keyboard:** arrow keys move through the rows, Enter picks, and Escape goes
  back one step.

Answers come from three places at once, merged so the same café is one result:

- **The map's own vector tiles:** instant, and needs no network. OpenMapTiles, Protomaps, Shortbread and Mapbox Streets tiles are all read, told apart by their layer names; `schema` names one.
- **Downloaded [offline maps](./offline.md).**
- **An online geocoder:** Photon by default, which is built for
  search-as-you-type (Nominatim's usage policy forbids autocomplete). Pass
  `provider: null` to stay off the network. The online geocoder is skipped
  when the browser is offline or "Only Use Offline Maps" is on.

| Option | Default | |
| --- | --- | --- |
| `provider` | Photon | Any `GeocoderProvider`, or `null`. |
| `offline` | the page's | Downloaded maps to search, or `null`. |
| `categories` | first eight of `SEARCH_CATEGORIES` | The Find Nearby buttons. |
| `recents` | `true` | |
| `units` | from the locale | `'metric'` or `'imperial'`. |
| `location` | map centre | Where distances are measured from. |
| `turnByTurn`, `origin`, `onDirections` | — | What Directions does. |
| `details` | OpenStreetMap, through Overpass | A `PlaceDetailsProvider` for hours, phone and website, or `null`. None by default with `provider: null`. |
| `shareUrl` | the place on openstreetmap.org | `(place) => string`: the link Share sends. |
| `saved` | the page's `savedPlaces()` | Where Save keeps Favorites and Guides, or `null`. |
| `showSaved` | `true` | Favorites as stars on the map. |

Every framework binding has it as `<Search>`, with `query` followed as a prop —
see [framework bindings](../guide/framework-bindings.md#search).

### Favorites and Guides

Saved places live in a `SavedPlaces` store: the page's own, in `localStorage`,
unless `saved` names another (`null` turns saving off). Its backend is
anything with `load()` and `save(data)`, so it can sync to a server:

```ts
import { SavedPlaces, setSavedPlaces } from 'ts-maps'

setSavedPlaces(new SavedPlaces({
  backend: {
    load: () => fetch('/api/saved').then(r => r.json()),
    save: data => fetch('/api/saved', { method: 'PUT', body: JSON.stringify(data) }).then(() => {}),
  },
}))

const saved = savedPlaces()
await saved.favorite(place)
const guide = await saved.createGuide('Coffee to try', [place])
const geojson = saved.toGeoJSON(guide.id)         // share it
await saved.importGeoJSON(geojson, 'From a friend') // and take one in
```

Each place is kept once, however many guides it is in, and dropped when it
is in none. `search.toggleSaved(place)` and `search.showGuide(id)` do what the
card's Save and a tap on a guide do; `save` and `unsave` events say so.
`showSaved: false` keeps the stars off the map.

### In production: rate limits and your own geocoder

The map's own places answer instantly and offline, but typing still asks the
online geocoder once per pause. Photon's public instance at
`photon.komoot.io` is free and shared, with a fair-use limit and no
guarantee; it is right for development and small sites. When it answers
`429 Too Many Requests`:

- a short `Retry-After` (2 s or less) is waited out and the request retried
  once;
- a longer one, or a second 429, puts the provider in a back-off of 30 s,
  doubling for each limit in a row up to five minutes (or the `Retry-After`,
  if longer). It asks nothing while it backs off;
- search carries on with the map's own places and downloaded maps, as it does
  with no network. The user sees fewer addresses, not an error.

Tune it with `rateLimit: { retries, maxRetryDelay, cooldown }` on
`PhotonGeocoder` or `NominatimGeocoder`. A rate-limited call throws
`RateLimitError`, with `retryAfter` in milliseconds, for code of your own.

For a production app, use a geocoder you control or pay for:

| Provider | | Cost |
| --- | --- | --- |
| **Photon, self-hosted** | `new PhotonGeocoder({ baseUrl: 'https://geo.example.com' })` | A server. Photon runs from one Java process over a prebuilt index; GraphHopper publishes planet and country indexes, and a country is far smaller than the planet. Same answers as the public instance, no limit but your hardware. |
| **MapTiler** | `new MaptilerGeocoder({ apiKey })` | A key. A free tier, then paid plans by requests. See [maptiler.com/cloud/pricing](https://www.maptiler.com/cloud/pricing/). |
| **Mapbox** | `new MapboxGeocoder({ accessToken })` | A token. Free up to a monthly request allowance, then per request. See [mapbox.com/pricing](https://www.mapbox.com/pricing#search). |
| **Google** | `new GoogleGeocoder({ apiKey })` | A key with billing on. Per request after the monthly credit; autocomplete is billed by session. See [Google Maps Platform pricing](https://mapsplatform.google.com/pricing/). |

Nominatim's public instance is not on that list for search: its usage policy
forbids autocomplete. A self-hosted Nominatim is fine.

Prices change; check the provider's page before you choose. Whichever you
pick, keep its attribution in the map's credits.

To try one and then another, chain them. The next provider is asked when one
fails, and a provider that is backing off is skipped without being asked:

```ts
import { control, services } from 'ts-maps'

control.search({
  provider: services.geocoderChain([
    new services.PhotonGeocoder({ baseUrl: 'https://geo.example.com' }), // yours
    new services.MaptilerGeocoder({ apiKey }), // when yours is down or busy
  ]),
}).addTo(map)
```

An empty answer is an answer: the chain stops there. Pass
`{ fallThroughOnEmpty: true }` to go on to the next provider, which suits a
regional instance in front of a global one, at the cost of a second request
for every query the first cannot answer.

`search.search('coffee')`, `search.searchCategory(category)`,
`search.select(place)` and `search.cancel()` drive it from code.
`search.listen((type, e) => …)` hears `results`, `select`, `details` (with
`{ place, details }`), `directions`, `save`, `unsave` and `clear`. The engine underneath is `SearchEngine`, with `suggest`, `search` and
`nearby`. Use it on its own to build a search UI of your own.

## Geocoder

The simpler search box, for a single provider and no more.

A search box over the geocoding providers in `services/`. The default provider
is Nominatim, which needs no key, so this works out of the box:

```ts
control.geocoder({
  placeholder: 'Search for a place',
  // Any GeocoderProvider — Photon, MapTiler, Mapbox, Google.
  provider: services.defaultGeocoder(),
  limit: 5,
  debounce: 300,
  minLength: 3,
  collapsed: false,
  flyTo: true,
  marker: true,
  // Bias results towards what is on screen.
  proximity: true,
}).addTo(map)
```

Requests are debounced, and the in-flight request is aborted on each keystroke —
politeness towards a shared public endpoint, and also correctness: without the
abort a slow early response can land after a fast later one and repopulate the
list for a query the user has moved past.

Arrow keys walk the results, Enter picks one (the top hit if none is
highlighted), Escape clears. A result with a bounding box fits those bounds;
one without uses `zoom`. The map fires `geocoderesults`, `geocodeselect` and
`geocodeerror`.

## Map type

The map type picker, as in Apple Maps: a card of Explore, Driving, Transit
and Satellite that sets the map's style.

```ts
control.mapType({ types: mapTypes({ tiles, imagery }) }).addTo(map)
```

`mapTypes()` builds the four from one vector source and one imagery source
(see [Satellite, hybrid and Driving](./styles-and-theming.md#satellite-hybrid-and-driving));
pass `labels: false` for imagery without names, or any list of
`{ id, label, style, theme }` of your own. Choosing one keeps the camera, the
markers and the routes, which are not part of a style, and carries over the
layers the page added to the style itself: those drawing a GeoJSON, image,
video or canvas source, or added since the picker last set a style (`keep`
decides otherwise). Satellite turns the chrome dark, as Apple does.

`picker.select('satellite')` chooses from code; `listen` hears `change`
(`{ value }`) and `openchange`. Every framework binding has it as `<MapType>`.

### Traffic

Roads coloured by how freely traffic moves, green, yellow, red and dark red
as Apple's are, and the incidents slowing it, each with a card:

```ts
const traffic = trafficLayer({
  source: trafficSources.tomtom(key),            // or trafficSources.mapbox(token)
  incidents: new TomTomIncidents({ key }),
})
traffic.addTo(map)
control.mapType({ types: mapTypes({ tiles, imagery }), traffic }).addTo(map) // a Traffic switch in the card
```

Flow is drawn under the labels and fetched again every two minutes
(`refresh`). Any vector traffic service works as a `TrafficSourceSpec`: its
tile URLs, its layer, and an expression reading its congestion into `low`,
`moderate`, `heavy`, `severe` or `closed`. The layer is an overlay, so the
map type picker carries it from one map type to the next. Both services need
their own key; neither has a keyless tier.

## Indoor maps

Inside an airport or a mall, as Apple Maps shows them: the floor plan over
the basemap, one level at a time, a level picker beside the map, and the
shops and gates in search.

```ts
const terminal = await indoorMap({ venue: '/imdf/terminal-2.zip' }).addTo(map).ready()
terminal.connect(search) // "Gate D12" finds the gate, and goes to its level
terminal.setLevel(1)
```

The venue is IMDF, Apple's Indoor Mapping Data Format: a `.zip` URL, a URL
of a folder of its `.geojson` files, the zip's bytes, or the files already
parsed. Its units are filled by category (walkways white, restrooms blue,
food and shops warm), doors are gaps in the walls, and names come in at a
zoom closer. The plan and the picker appear from zoom 16 (`minZoom`) when
the venue is in view; `language` picks which of IMDF's names to show.
`listen` hears `load`, `levelchange` (`{ level, name }`) and
`visibilitychange`. Every framework binding has it as `<IndoorMap>`.

## Look Around

Street-level pictures you can turn in and walk through, as Apple Maps'
Look Around:

```ts
const look = lookAround().addTo(map) // Panoramax: open, no key
control.search({ lookAround: look }).addTo(map)
```

The binoculars button shows the streets with pictures in blue; tap one and
the map gives way to the picture taken there, full-bleed. Drag to look
round, scroll or pinch to zoom, and tap ahead (or use the arrows, or the
arrow keys) to move along the street. Each step zooms into the picture you
leave as the next fades in. A small map in the corner shows where you stand
and which way you look. A place card with pictures near it shows one, and
tapping it looks from there toward the place.

- `provider`: where pictures come from.
  - `new PanoramaxImagery()` (the default) uses the open Panoramax
    federation; `endpoint` picks one instance.
  - `new MapillaryImagery({ accessToken })` uses Mapillary.
  - Both keep to 360° pictures unless `panoramasOnly: false`, credit the
    imagery in the viewer, and keep to their rate limits. Any object with
    `near`, `get` and optional `coverage` will do.
- `open(placeOrPicture, { heading, lookAt })`, `close()`, `step('forward')`,
  `setView({ heading, pitch, fov })` and `setChoosing(true)`, from code.
- `listen` hears `open`, `close`, `imagechange` (`{ image }`), `viewchange`,
  `choosingchange` and `notfound` (a tap with no picture near).
- `miniMap: false` leaves out the small map, and `locale` sets the language
  its words are in.

Pictures are drawn with WebGL, by ray from the camera into the 360° picture,
so straight lines stay straight at any zoom. A sharper copy replaces the
first when it arrives. Without WebGL the picture scrolls as a background.
Every framework binding has it as `<LookAround>`.

## Fullscreen

```ts
control.fullscreen({ position: 'topright' }).addTo(map)
```

Uses the Fullscreen API where it exists and falls back to a fixed,
full-viewport class where it does not — which is more often than it looks: the
API is blocked in cross-origin iframes without `allowfullscreen`, and iPhone
Safari has never implemented it. Both are exactly where maps get embedded. The
fallback is not true fullscreen (browser chrome stays) but it does what the
button was pressed for.

Either way the map re-measures itself, and fires `fullscreenstart` /
`fullscreenend`. Pass `container` to expand a wrapper element instead of the
map.

## Offline maps

```ts
control.offlineMaps().addTo(map)
```

Apple Maps' Offline Maps: a list of downloaded areas with size, date, progress,
pause, update and delete; an area picker that dims the map around a frame you
resize by its corners, with an estimated size before downloading; and a pill
when the connection drops. See [Offline maps](./offline.md).

## Scale, layers, attribution

`control.scale()` draws a metric and/or imperial scale bar. Pass
`{ transient: true }` to show it only while the zoom changes, fading out
`transientDelay` ms (default 1200) after, as Apple Maps does.

`control.layers(baseLayers, overlays)` is the collapsible base-layer and overlay
switcher.

`control.attribution()` renders layer credits and is added automatically. Tile
services generally require attribution as a licence condition, so prefer moving
it over hiding it. To drop the library's own prefix while keeping the credits:

```ts
map.attributionControl?.setPrefix(false)
```
