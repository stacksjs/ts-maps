# Offline maps

Download an area once and the map, search and directions keep working there with no connection, the way Apple Maps does it. A service worker can keep the page itself, so it opens with the network off. Underneath sits a lower-level tile cache, for apps that want to manage tiles by hand.

## The control

The quickest route is the control. It adds a download button to the map:

```ts
import { control, Map, styles } from 'ts-maps'

const TILEJSON = 'https://tiles.openfreemap.org/planet'

const map = new Map('map', {
  center: [48.8566, 2.3522], // Paris
  zoom: 13,
  style: styles.light({ url: TILEJSON }),
})

// The style reads its TileJSON on load, so keep that with every download too.
control.offlineMaps({ resources: [TILEJSON] }).addTo(map)
```

The button opens **Offline Maps**, a list of what has been downloaded, each with its size, date, and a progress bar while it downloads. Each row has Pause/Resume, Update and Delete; Delete asks once more before it deletes. Tapping a name flies to the area and outlines it.

**Download New Map** dims the map around a rounded frame. Drag its corners, or move the map beneath it, to choose the area. The card below names the area after the most important place labelled inside it (or, failing that, by reverse geocoding with `geocoder`), and shows an estimated size before anything is fetched.

When the browser goes offline, a pill at the top says so, and says whether a downloaded map covers the view. The **Only Use Offline Maps** switch keeps the map off the network entirely.

| Option | Default | |
| --- | --- | --- |
| `position` | `'topright'` | |
| `maps` | `offlineMaps()` | The manager to show |
| `geocoder` | | Names a new area by reverse geocoding its centre, when no label inside it will do |
| `resources` | | Other URLs to keep with every download, such as a TileJSON your page fetches |
| `showStatus` | `true` | The offline pill |
| `title` | "Offline Maps" | In the map's language |
| `locale` | the map's | |

The control also has `open()`, `close()` and `selectArea()`, and fires `offline:download` (`{ bounds, name }`) and `offline:mode` on the map. Every framework binding has it as `<OfflineMaps>`, with `open` and `onlyOffline` followed as props; see [Framework bindings](../guide/framework-bindings.md#offline-maps).

## From code

`map.offline` is the manager behind the control. It is one object for the whole page, the same one `offlineMaps()` returns, and reaching it through a map makes that map the one whose layers a download covers.

```ts
const bounds: [number, number, number, number] = [2.29, 48.84, 2.37, 48.88] // west, south, east, north

// What an area would cost, before downloading it.
const { tiles, bytes, tooLarge } = await map.offline.estimate({ bounds })

// Download it. Resolves when it is complete, paused, cancelled or failed.
map.offline.on('progress', ({ region }) => console.log(`${region.downloaded} / ${region.tiles}`))
const region = await map.offline.download({ bounds, name: 'Central Paris' })
console.log(region.status) // 'complete', 'paused' or 'error'

await map.offline.list()             // every downloaded map, newest first
await map.offline.pause(region.id)
await map.offline.resume(region.id)  // carries on from where it stopped
await map.offline.update(region.id)  // fetches every tile again
await map.offline.rename(region.id, 'Home')
await map.offline.delete(region.id)
await map.offline.usage()            // { bytes, entries } on this device
```

`download` rejects only when the area is empty or too large. A download that fails part way resolves with `status: 'error'` and the reason in `region.error`, and fires `error`.

| Area option | Default | |
| --- | --- | --- |
| `bounds` | | `[west, south, east, north]`, `{ west, south, east, north }` or a `LatLngBounds` |
| `name` | "Offline Map" | What the list calls it (`download` only) |
| `minZoom` | `0` | |
| `maxZoom` | per layer | A vector source's top zoom; `16` for image tiles |
| `terrainMaxZoom` | `12` | Deepest DEM tile kept, when terrain is on |
| `glyphRanges` | | More glyph ranges up front, by the first code point of each (`[1024]` for Cyrillic) |
| `resources` | | Other URLs to keep with it |
| `sources` | | Tile templates to download without a map: `[{ url, type, tileSize, minZoom, maxZoom }]` |
| `restrictions` | | Turn restrictions for offline routing; see below |

What a download keeps:

- **Tiles.** An area is downloaded for every tile layer on the map. Each layer is asked for its URLs exactly as it asks while drawing: subdomain, retina suffix and 512px zoom shift included. What is stored is therefore exactly what the map later requests.
- **Zoom range.** A vector source is kept to its top zoom by default; past that its tiles are drawn sharply by overzooming. Image layers stop at zoom 16.
- **Terrain.** With [terrain](./terrain.md) on, the DEM tiles it draws from are downloaded too, to zoom 12 by default. A DEM tile is several times the size of a vector tile, and the estimate counts it that way.
- **Style files.** The style's sprite sheets, its glyphs, and the style document when it was loaded from a URL. Glyphs are kept for the Latin ranges up front, then for every script the area's names are written in: once the tiles are in, the names the style labels with are scanned, and the ranges they need (Cyrillic in Sofia, Arabic in Cairo) are added. Styles drawn with local fonts, as the built-in ones are, need no glyph server and download none.
- **Size limit.** An area over `maxTiles` (150,000 by default) is refused; `estimate()` reports it as `tooLarge`.

Downloads are kept in IndexedDB and survive a reload. A download interrupted by a reload comes back paused. Tiles that two areas share are stored once, and deleting one area keeps whatever the other still needs.

The estimate samples a few of the area's own tiles until the device has measured enough of them, then uses their running average.

Events on the manager:

| Event | Payload |
| --- | --- |
| `change` | `{ regions }` |
| `progress` | `{ region }` |
| `complete` | `{ region }` |
| `error` | `{ region, error }` |
| `delete` | `{ id }` |
| `modechange` | `{ onlyOffline }` |
| `settingchange` | `{ autoUpdate }` |
| `persist` | `{ persisted }` |

### Configuring the manager

`offlineMaps()` makes the page's manager the first time it is called. To configure it, set your own before anything else reaches for it:

```ts
import { OfflineMaps, setOfflineMaps } from 'ts-maps'

setOfflineMaps(new OfflineMaps({
  autoUpdate: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // or true
  autoResume: true,
}))
```

| Option | Default | |
| --- | --- | --- |
| `store` | IndexedDB, else memory | Where downloads are kept; see [Where they are kept](#where-they-are-kept) |
| `concurrency` | `6` | Downloads in flight at once |
| `maxTiles` | `150000` | Largest area allowed |
| `autoUpdate` | `false` | `true`, or `{ maxAge, unmeteredOnly }` |
| `autoResume` | `false` | |
| `persist` | `true` | Ask the browser to keep the maps under storage pressure |
| `background` | `false` | Download with Background Fetch where there is one |
| `schema` | detected | How to read the tiles for search and routing |
| `fetch` | `fetch` | |

### Keeping them fresh, and the space they take

- **Automatic updates.** With `autoUpdate`, once the manager is ready and online, maps older than `maxAge` (30 days by default) are fetched again, one at a time, oldest first. On a connection the browser reports as cellular or data-saving it skips them and tries again next time it comes online, unless `unmeteredOnly: false`. The panel has an **Automatic Updates** switch, as Apple's does, and what it is set to is remembered on the device; an `autoUpdate` passed to the constructor wins over it. `updateStale()` runs the same check from code.
- **Interrupted downloads.** A download a reload stopped comes back paused, and one running when the connection drops is paused rather than failing tile by tile. With `autoResume`, both carry on as soon as the page is ready and online. A download the user paused stays paused.
- **Persistent storage.** On the first download the manager asks the browser to keep the maps under storage pressure (`navigator.storage.persist()`); `persist: false` leaves that to you. When the browser has not agreed, the panel says the maps may be removed if space runs low.
- **Quota.** `storage()` says how much the origin uses, may use and has free, and whether it is persisted. The area picker warns when an estimate is more than the space free, and a download that runs out stops with the error "Not enough storage on this device".

## How the map uses them

Every tile, style, sprite, glyph and terrain request checks the downloaded maps first. A hit costs no network and no data. A miss goes to the network as usual, or fails straight away when `onlyOffline` is set:

```ts
map.offline.onlyOffline = true   // Apple's "Only Use Offline Maps"
map.offline.enabled = false      // ignore downloads altogether
```

`offlineFetch(url, init)` is that same lookup for your own requests: a downloaded copy when there is one, the network otherwise.

Until something has been downloaded, the manager stays out of the way: the map checks whether a downloads database exists and, where none does, goes straight to the network without creating one. The control opens it, since it lists what is there.

## Search and directions offline

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

`withOfflineFallback` uses the online provider when it can. It switches to the offline one when the browser reports no connection, or when the online request fails for any reason other than being cancelled. If the offline one finds nothing either, the online error is thrown.

The offline router runs A* over the downloaded roads for driving, walking or cycling, with up to three alternatives between two points. Its steps use the same maneuver codes as the online providers, so `turnByTurn`, the banner and the voice work unchanged: "Turn left onto Broadway", "Turn right onto Van Ness Avenue".

Tiles are simplified when they are made, which drops junction vertices along straight streets. The graph finds those junctions again: at every crossing, and wherever a road ends on another. Roads at different levels are never joined, so a bridge does not connect to the street below it.

- **Turns cost time.** The search runs over road segments rather than junctions, so it knows which way it arrived: going straight costs nothing, a turn with the traffic a few seconds, a turn across it more, and turning round most of all. Of two routes as long, the one with fewer, easier turns wins. The graph assumes traffic drives on the right; a `RoadGraph` you build yourself takes `drivingSide: 'left'`.
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

Search, reverse geocoding and routing read the tiles' schema, found from their layer names: **OpenMapTiles** (what OpenFreeMap, MapTiler and planetiler publish, and what the built-in styles draw), **Protomaps**, **Shortbread** (VersaTiles, Geofabrik) and **Mapbox Streets v8**. Each is read into one vocabulary, OpenMapTiles' place kinds and road classes, so a café is a `cafe` and a residential street a `minor` road whichever schema it came in. A schema of your own is a `TileSchema` object passed as `new OfflineMaps({ schema })`. The four built in are exported as `OPENMAPTILES`, `PROTOMAPS`, `SHORTBREAD` and `MAPBOX_STREETS`, and `renamedOpenMapTiles({ transportation: 'road' })` matches tiles whose layers were renamed.

For the online providers these stand in for, see [Services](./services.md).

## Opening the page with no connection

Downloaded maps keep the map, search and directions working with no connection. Opening the page with none also needs the page itself (its HTML, scripts and styles), and keeping those is a service worker's job. `ts-maps/offline-sw` is one to build yours from:

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

| Option | Default | |
| --- | --- | --- |
| `shell` | `[]` | Files cached on install |
| `fallback` | `shell[0]` | The page a navigation falls back to |
| `cache` | `'ts-maps-shell-v1'` | The cache's name |
| `runtime` | `false` | `true`, or a function choosing by URL, to keep same-origin files as they are fetched |
| `maps` | `true` | Serve other requests from the downloaded maps when the network fails |
| `backgroundFetch` | `true` | Store Background Fetch downloads |
| `takeOver` | `true` | Take control of open pages at once (`skipWaiting` and `clients.claim`) |
| `store` | IndexedDB | The offline store the page uses |

- **The app shell.** A navigation tries the network first, since HTML can carry a session, and falls back to the page cached for it, or to `fallback`. Files in `shell` are served from the cache, so change `cache` with each release; on activate, older caches named the same up to the last `-` are deleted.
- **Runtime caching.** With `runtime`, same-origin files go to the network first while there is one, so a new build is picked up at once, and to the cache when there is not. This suits a build that splits its scripts into hashed chunks. Responses that are errors, `no-store`, `private` or set a cookie are never kept.
- **Map data the library does not fetch itself.** The map reads downloaded tiles on its own, but an `<img>` in a popup or a raster drawn by hand does not. Those go to the network first, and to the downloaded maps when it fails.

## Downloading in the background

A download made by the page stops when the tab closes or the device sleeps, and comes back paused (or, with `autoResume`, carries on when the page is next opened). With `background: true` it goes to [Background Fetch](https://developer.mozilla.org/docs/Web/API/Background_Fetch_API) instead, where the browser has it and a service worker built with `ts-maps/offline-sw` controls the page:

```ts
setOfflineMaps(new OfflineMaps({ background: true, autoResume: true }))
```

- The browser fetches the area's files whether the page is open or not, and shows its own progress. Files already downloaded for another area are not fetched again.
- The worker stores them where the page reads them, indexes the area for search and routing, adds the glyphs its names need, and tells open pages, whose list updates. The browser's notification says when it is ready.
- A page opened while one is running, whose manager also has `background: true`, follows it with its progress in the list rather than calling it paused. Pausing from the list aborts it; resuming starts a new one for what is still missing.
- Background Fetch counts bytes, not files, so progress is an estimate until the worker has stored them.
- Without Background Fetch (Firefox and Safari today), without a service worker in control, or for a `pmtiles://` archive, which is read in ranges, the page downloads as before.

## Where they are kept

A browser keeps downloaded maps in IndexedDB (`IndexedDBOfflineStore`, database `ts-maps-offline`), and anything without it keeps them in memory (`MemoryOfflineStore`). `KeyValueOfflineStore` keeps them in any store of strings, given async `get`, `set` and `delete`:

```ts
import { KeyValueOfflineStore, OfflineMaps, setOfflineMaps } from 'ts-maps'

const myStorage = {
  get: async (key: string) => localStorage.getItem(key) ?? undefined,
  set: async (key: string, value: string) => localStorage.setItem(key, value),
  delete: async (key: string) => localStorage.removeItem(key),
}

setOfflineMaps(new OfflineMaps({ store: new KeyValueOfflineStore(myStorage) }))
```

Tiles are stored as base64 next to their MIME type, and everything else as JSON, under keys starting `ts-maps/` (`{ prefix }` to change it). The list of regions and the space used are kept under keys of their own, so the storage never has to list its keys. This is what React Native uses for `MapView`'s `offlineStore`, which keeps downloaded maps in the app's files rather than the WebView's IndexedDB.

## PMTiles archives

A basemap read from a `pmtiles://` archive downloads like any other. Each tile is stored under a stable URL, `pmtiles://<https://…/planet.pmtiles/{z}/{x}/{y}>`, and the archive's TileJSON next to them, so a map with no connection still knows the top zoom and can overzoom past it. See [Self-hosted vector tiles](./tile-server.md#straight-from-a-bucket).

## Tile cache

`TileCache` is a lower-level, promise-based store of tile bytes keyed by URL. It keeps no record of areas: it is a cache, not a list of downloads. Tile layers accept `offlineCache: cache` (or `true` for the shared `getDefaultCache()`) to read through one; downloaded offline maps are still consulted first.

```ts
import { cachedFetch, TileCache } from 'ts-maps'

const cache = new TileCache({ maxBytes: 200 * 1024 * 1024, ttlMs: 7 * 24 * 60 * 60 * 1000 })

const { data, mime, fromCache } = await cachedFetch('https://tiles.openfreemap.org/planet', { cache })
await cache.prune() // apply ttlMs, maxEntries and maxBytes
```

| Option | Default | |
| --- | --- | --- |
| `ttlMs` | `0` | Age past which an entry is ignored. `0` keeps entries forever |
| `maxEntries` | no limit | Applied by `prune()` |
| `maxBytes` | no limit | Applied by `prune()` |
| `backend` | in memory | Any object with `get`, `put`, `delete`, `clear`, `all` and optionally `close` |

The cache has `get(key)`, `put(key, data, mime)`, `delete`, `clear`, `size()` (`{ entries, bytes }`), `prune()` and `close()`. Expired entries are skipped on `get`. The size limits are applied only when you call `prune()`, which removes the oldest-added entries first.

`cachedFetch(url, { cache, signal, noStore, forceNetwork })` reads through a cache: a hit returns at once, a miss goes to the network and is stored, and a network failure falls back to whatever the cache holds. `noStore` skips the write, and `forceNetwork` skips the read.

`close()` releases the backend; the cache stays usable afterwards, in memory. For the shared cache, `resetDefaultCache()` closes it and the next `getDefaultCache()` makes a new one. All of these are exported from `ts-maps` and `ts-maps/storage`.

### One-shot prefetch

`saveOfflineRegion` fills a `TileCache` with every tile of one URL template in a bounding box:

```ts
import { getDefaultCache, resolveTileJSON, saveOfflineRegion } from 'ts-maps'

const found = await resolveTileJSON('https://tiles.openfreemap.org/planet')
const result = await saveOfflineRegion({
  bounds: [2.29, 48.84, 2.37, 48.88],
  zoomRange: [10, 14],
  tileUrl: found!.tiles,
  cache: getDefaultCache(),
  concurrency: 4,
})
// { saved, failed, skipped }
```

`tileUrl` may also be a `pmtiles://` archive. Pass an `Evented` (the map will do) as a second argument to get `offline:progress` events with `{ completed, total, coord }`, and `signal` to cancel. It predates offline maps: it keeps no record of the area, and the area cannot be paused, resumed, updated or deleted. Prefer `map.offline.download()`.

## Try it

- The [offline example](../examples/11-offline.md) is the control over Paris: pick an area, download it, then go offline.
- The playground's [offline maps demo](../demos/14-offline.md) has the whole flow, with a service worker (`playground/core-map/sw.ts`) that keeps the page, so after one visit it opens again with the network off, and downloads that go to Background Fetch where the browser has it.
