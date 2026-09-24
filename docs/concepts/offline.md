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
- **Style files.** The style's sprite sheets, the common glyph ranges, and the style document (when it was loaded from a URL) are kept too.
- **Without a map.** Download from URL templates by passing `sources: [{ url, type, tileSize, maxZoom }]`.
- **Size limit.** An area over `maxTiles` (150,000 by default) is refused; `estimate()` reports it as `tooLarge`.

Downloads are kept in IndexedDB and survive a reload. A download interrupted by a reload comes back paused. Tiles that two areas share are stored once, and deleting one area keeps whatever the other still needs. Events on the manager: `change`, `progress`, `complete`, `error` and `delete`.

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

Search, reverse geocoding and routing read the OpenMapTiles schema used by the built-in styles.

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

The playground's **14. Offline maps** page has the whole flow. Pick an area, download it, then either switch on "Only Use Offline Maps" or take the browser offline; the downloaded area keeps drawing. The older [offline example](../examples/11-offline.md) shows the lower-level `TileCache` and region prefetcher on their own.
