# Offline maps & workers

Download an area once and the map, search and directions keep working there with no connection — the way Apple Maps does it. Underneath sit a lower-level tile cache and a worker pool for decoding tiles off the main thread.

## Offline maps

The quickest route is the control. It adds a download button to the map:

```ts
import { control } from 'ts-maps'

control.offlineMaps().addTo(map)
```

The button opens **Offline Maps**, a list of what has been downloaded, each with its size, date, and a progress bar while it downloads. Each row has Pause/Resume, Update and Delete; Delete asks once more before it deletes. Tapping a name flies to the area and outlines it.

**Download New Map** dims the map around a rounded frame. Drag its corners, or move the map beneath it, to choose the area. The card below names the area after the most important place labelled inside it (pass `geocoder` to name it by reverse geocoding instead), and shows an estimated size before anything is fetched. The estimate comes from sampling a few of the area's own tiles.

When the browser goes offline, a pill at the top says so, and says whether a downloaded map covers the view. The **Only Use Offline Maps** switch keeps the map off the network entirely.

| Option | Default | |
| --- | --- | --- |
| `position` | `'topright'` | |
| `maps` | `offlineMaps()` | The manager to show. |
| `geocoder` | — | Names a new area by reverse geocoding its centre. |
| `resources` | — | Other URLs to keep with every download, such as a TileJSON your page fetches itself. |
| `showStatus` | `true` | The offline pill. |

Every framework binding has it as `<OfflineMaps>`, with `open` and
`onlyOffline` followed as props — see
[framework bindings](../guide/framework-bindings.md#offline-maps).

### From code

`map.offline` is the manager behind the control, and `offlineMaps()` returns the same object:

```ts
// What an area would cost, before downloading it.
const { tiles, bytes, tooLarge } = await map.offline.estimate({ bounds: [-122.45, 37.76, -122.39, 37.81] })

// Download it. Resolves when it is complete, paused or cancelled.
map.offline.on('progress', ({ region }) => console.log(region.downloaded, '/', region.tiles))
const region = await map.offline.download({ bounds: [-122.45, 37.76, -122.39, 37.81], name: 'San Francisco' })

await map.offline.list()          // every downloaded map, newest first
await map.offline.pause(region.id)
await map.offline.resume(region.id) // carries on from where it stopped
await map.offline.update(region.id) // fetches every tile again
await map.offline.rename(region.id, 'Home')
await map.offline.delete(region.id)
await map.offline.usage()         // { bytes, entries } on this device
```

- **Which tiles are downloaded.** An area is downloaded for every tile layer on the map. Each layer is asked for its URLs exactly as it asks while drawing: subdomain, retina suffix and 512px zoom shift included. What is stored is therefore exactly what the map later requests.
- **Zoom range.** A vector source is kept to its top zoom by default; past that, its tiles are drawn sharply by overzooming. Image layers stop at zoom 16 unless `maxZoom` says otherwise.
- **Terrain.** With `map.setTerrain({ source })` on, the DEM tiles terrain draws from are downloaded too, to zoom 12 by default (`terrainMaxZoom` to change it): a DEM tile is several times the size of a vector tile, and the estimate counts it that way. Past the deepest DEM tile kept, terrain is drawn from a part of it, as it is past the DEM's own top zoom online.
- **Style files.** The style's sprite sheets, its glyphs, and the style document (when it was loaded from a URL) are kept too. Glyphs are kept for the Latin ranges up front, then for every script the area's names are written in: once the tiles are in, the names the style labels with (`name`, usually, read from its `text-field`) are scanned, and the ranges they need, Cyrillic in Sofia or Arabic in Cairo, are added to the download. `glyphRanges: [1024]` asks for more up front, by the first code point of each range. Styles drawn with local fonts, as the built-in ones are, need no glyph server and download none.
- **Without a map.** Download from URL templates by passing `sources: [{ url, type, tileSize, maxZoom }]`.
- **Size limit.** An area over `maxTiles` (150,000 by default) is refused; `estimate()` reports it as `tooLarge`.

Downloads are kept in IndexedDB and survive a reload. A download interrupted by a reload comes back paused. Tiles that two areas share are stored once, and deleting one area keeps whatever the other still needs. Events on the manager: `change`, `progress`, `complete`, `error`, `delete`, `settingchange` and `persist`.

### Keeping them fresh, and the space they take

Apple keeps downloaded maps up to date and says when storage runs low. So do these, when asked:

```ts
setOfflineMaps(new OfflineMaps({
  autoUpdate: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // or true
  autoResume: true,
}))
```

- **Automatic updates.** With `autoUpdate`, once the manager is ready and online, maps older than `maxAge` (30 days by default) are fetched again, one at a time, oldest first. It waits for a connection the browser does not report as cellular or data-saving, unless `unmeteredOnly: false`. The panel has an **Automatic Updates** switch, as Apple's does; what it is set to is remembered on the device. `updateStale()` runs the same check from code.
- **Interrupted downloads.** A download a reload stopped comes back paused, and one running when the connection drops is paused rather than failing tile by tile. With `autoResume`, both carry on as soon as the page is ready and online. A download the user paused stays paused.
- **Persistent storage.** On the first download the manager asks the browser to keep the maps under storage pressure (`navigator.storage.persist()`); `persist: false` leaves that to you. When the browser has not agreed, the panel says the maps may be removed if space runs low.
- **Quota.** `storage()` says how much the origin uses, may use and has free, and whether it is persisted. The area picker warns when an estimate is more than the space free, and a download that does run out stops with the error "Not enough storage on this device" rather than failing every tile after.

### How the map uses them

Every tile, style, sprite, glyph and terrain request checks the downloaded maps first. A hit costs no network and no data. A miss goes to the network as usual, or fails straight away when `onlyOffline` is set:

```ts
map.offline.onlyOffline = true   // Apple's "Only Use Offline Maps"
map.offline.enabled = false      // ignore downloads altogether
```

A page that has never downloaded anything never opens a database: where the browser can say none exists, none is created.

### Search and directions offline

Downloading reads each vector tile at its top zoom for:

- the places, streets and points of interest named in it;
- its road network, with one-way streets, ramps, bridges and tunnels.

Both are available as ordinary providers:

```ts
import { withOfflineFallback } from 'ts-maps'
import { NominatimGeocoder, OSRMDirections } from 'ts-maps/services'

const geocoder = withOfflineFallback(new NominatimGeocoder(), map.offline.geocoder())
const directions = withOfflineFallback(new OSRMDirections(), map.offline.directions())
```

`withOfflineFallback` uses the online provider when it can. It switches to the offline one when the browser reports no connection, or when the online request fails for any reason other than being cancelled.

The offline router runs A* over the downloaded roads for driving, walking or cycling, with alternatives. Its steps use the same maneuver codes as the online providers, so `turnByTurn`, the banner and the voice work unchanged: "Turn left onto Broadway", "Turn right onto Van Ness Avenue".

Tiles are simplified when they are made, which drops junction vertices along straight streets. The graph finds those junctions again: at every crossing, and wherever a road ends on another. Roads at different levels are never joined, so a bridge does not connect to the street below it.

- **Turns cost time.** The search runs over road segments rather than junctions, so it knows which way it arrived: going straight costs nothing, a turn with the traffic a few seconds, a turn across it more, and turning round most of all. Of two routes as long, the one with fewer, easier turns wins, as Apple's do. `drivingSide: 'left'` on `RoadGraph` flips which turns cross traffic.
- **Junctions cost what meets there.** Carrying straight on along the bigger road costs next to nothing; joining or crossing a bigger one costs a stop or a light, more the bigger it is. On foot, crossing a main road is a wait for the lights.
- **Who may use a road.** `access`, `foot` and `bicycle` are read from the tiles: a street closed to traffic is driven round and walked through, a footway marked `foot=no` is not walked. Driveways and parking aisles are slow, so they are used to reach a door rather than to cut through.
- **Walking directions** fold a corner's sidewalks, crosswalks and the street itself into one step: crossing a side street to stay on the same one is not a turn.
- **A waypoint by a scrap of network** cut off from everything else, a plaza's paths or a car park, snaps to the connected street a short walk away instead.

OpenMapTiles tiles carry no turn restrictions ("no left turn", "only straight on"), no lanes and no traffic signals, so offline routes ignore them unless told. Restrictions can be downloaded with an area, from OpenStreetMap:

```ts
import { restrictionsFromOverpass } from 'ts-maps'

const [w, s, e, n] = bounds
const query = `[out:json];relation["type"="restriction"](${s},${w},${n},${e});out geom;`
const answer = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`).then(r => r.json())
await map.offline.download({ bounds, restrictions: restrictionsFromOverpass(answer) })
```

They bind driving and cycling, not walking. Lane guidance is an online provider's: offline steps carry no `lanes`.

Search, reverse geocoding and routing read the tiles' schema, found from their layer names: **OpenMapTiles** (what OpenFreeMap, MapTiler and planetiler publish, and what the built-in styles draw), **Protomaps**, **Shortbread** (VersaTiles, Geofabrik) and **Mapbox Streets v8**. Each is read into one vocabulary, OpenMapTiles' place kinds and road classes, so a café is a `cafe` and a residential street a `minor` road whichever schema it came in. A schema of your own is a `TileSchema` object passed as `new OfflineMaps({ schema })`; the four built in are exported as `OPENMAPTILES`, `PROTOMAPS`, `SHORTBREAD` and `MAPBOX_STREETS`, and `renamedOpenMapTiles({ transportation: 'road' })` matches a style built with `sourceLayers`.

### Opening the page with no connection

Downloaded maps keep the map, search and directions working with no connection. Opening the page with none also needs the page itself, its HTML, scripts and styles, and keeping those is a service worker's job, outside the library. `ts-maps/offline-sw` is one to build yours from:

```ts
// sw.ts, bundled for the browser into /sw.js
import { offlineServiceWorker } from 'ts-maps/offline-sw'

offlineServiceWorker({
  shell: ['/', '/app.js', '/app.css', '/ts-maps.css'],
  cache: 'my-app-shell-v3', // change it with each release
})
```

```ts
// in the page
navigator.serviceWorker.register('/sw.js')
```

- **The app shell.** `shell` is cached on install. A navigation tries the network first, since HTML can carry a session, and falls back to the page cached for it, or to `fallback` (the first of `shell`). On activate, older caches named the same up to the last `-` are deleted. `runtime: true` (or a function choosing by URL) also caches same-origin files as they are fetched, which suits a build that splits its scripts into hashed chunks.
- **Map data the library does not fetch itself.** The map reads downloaded tiles on its own, but an `<img>` in a popup or a raster drawn by hand does not. Those go to the network first, and to the downloaded maps when it fails. `maps: false` leaves them alone.
- **Downloads in the background.** See below.

Wildloop's worker is the same recipe written by hand: its shell is a static `/offline` page plus the ts-maps script and stylesheet, and it never caches HTML that might carry a session.

### Downloading in the background

A download made by the page stops when the tab closes or the device sleeps, and comes back paused (or, with `autoResume`, carries on when the page is next opened). With `background: true` it goes to [Background Fetch](https://developer.mozilla.org/docs/Web/API/Background_Fetch_API) instead, where the browser has it and a service worker built with `ts-maps/offline-sw` controls the page:

```ts
setOfflineMaps(new OfflineMaps({ background: true, autoResume: true }))
```

- The browser fetches the area's files whether the page is open or not, and shows its own progress. Files already downloaded for another area are not fetched again.
- The worker stores them where the page reads them, indexes the area for search and routing, adds the glyphs its names need, and tells open pages, whose list updates. The browser's notification says when it is ready.
- A page opened while one is running follows it, with its progress in the list, rather than calling it paused. Pausing from the list aborts it; resuming starts a new one for what is still missing.
- Background Fetch counts bytes, not files, so progress is an estimate until the worker has stored them.
- Without Background Fetch (Firefox and Safari today), without a service worker in control, or for a `pmtiles://` archive, which is read in ranges, the page downloads as before.

## Tile cache

`TileCache` is a lower-level, promise-based key/value store of tile bytes keyed by URL, with optional TTL and LRU limits. It is in memory unless you give it a backend. `cachedFetch` reads through it: a hit returns immediately, and a miss goes to the network and is stored. If the network fails, it falls back to whatever the cache holds.

```ts
import { cachedFetch, TileCache } from 'ts-maps'

const cache = new TileCache({ maxBytes: 200 * 1024 * 1024 })
const { data, fromCache } = await cachedFetch('https://tile.openstreetmap.org/10/301/384.png', { cache })
```

Tile layers accept `offlineCache: cache` (or `true` for the shared `getDefaultCache()`) to read through one. Downloaded offline maps are always consulted first.

### Lifecycle

`close()` releases the backend. It is idempotent, and the cache stays usable: the next `get` / `put` reopens it. For the shared singleton, use `resetDefaultCache()`.

### Pluggable backends

`new TileCache({ backend })` accepts any object implementing `get` / `put` / `delete` / `clear` / `all` / optional `close`. This is how `@craft-native/ts-maps` stores tiles in the Craft sandbox filesystem. Offline maps have their own store contract, `OfflineStore`, with an IndexedDB and an in-memory implementation; pass one as `new OfflineMaps({ store })`.

### One-shot prefetch

`saveOfflineRegion({ bounds, zoomRange, tileUrl, cache })` fills a `TileCache` with every tile of one URL template in a bounding box. It predates offline maps: it keeps no record of the area, and the area cannot be paused, resumed, updated or deleted. Prefer `map.offline.download()`.

## Worker pool

`WorkerPool` round-robins jobs across a fixed number of Web Workers. Vector tile decode, heatmap rasterisation, and hillshade computation all route through it by default.

```ts
import { WorkerPool } from 'ts-maps'

const pool = new WorkerPool({ size: navigator.hardwareConcurrency ?? 4 })
const decoded = await pool.run('decodeMvt', { bytes, extent: 4096 })
```

## Try it

The playground's **14. Offline maps** page has the whole flow. Pick an area, download it, then either switch on "Only Use Offline Maps" or take the browser offline; the downloaded area keeps drawing. Its service worker (`playground/core-map/sw.ts`) keeps the page too, so after one visit it opens again with the network off, and its downloads go to Background Fetch where the browser has it. The older [offline example](../examples/11-offline.md) shows the lower-level `TileCache` and region prefetcher on their own.
