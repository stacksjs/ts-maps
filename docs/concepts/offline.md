# Offline & workers

ts-maps bundles an IndexedDB-backed tile cache, a region pre-fetcher, and a worker pool for off-main-thread tile decoding. Together they let a map keep working on a flaky or fully offline connection.

## Tile cache

`TileCache` is a promise-based key/value store keyed by tile URL. It sits in front of every tile fetch — a cache hit returns immediately, a miss goes to the network and is then persisted.

```ts
import { TileCache, cachedFetch } from 'ts-maps'

const cache = new TileCache({ name: 'ts-maps-tiles', maxBytes: 200 * 1024 * 1024 })
const response = await cachedFetch('https://tile.openstreetmap.org/10/301/384.png', { cache })
```

### Lifecycle

`TileCache` holds an IndexedDB connection (or an in-memory map when IDB isn't available). Close it when you tear down the owning map so the connection returns to the browser pool:

```ts
await cache.close()
```

`close()` is idempotent and leaves the cache usable — the next `get` / `put` call will lazily re-open a fresh backend.

For the shared singleton returned by `getDefaultCache()`, use `resetDefaultCache()`:

```ts
import { resetDefaultCache } from 'ts-maps'

await resetDefaultCache()
// getDefaultCache() now returns a fresh instance
```

`map.remove()` cleans up its own terrain + atmosphere overlays and any pending DEM fetches, but does **not** close caches you passed in via `OfflineRegionOptions.cache` or `TileLayer({ cache })` — you own those and close them yourself.

### Pluggable backends

`new TileCache({ backend })` accepts any object implementing the `Backend` contract (`get` / `put` / `delete` / `clear` / `all` / optional `close`). This is how `@craft-native/ts-maps` plugs the Craft sandbox filesystem into the cache — the IndexedDB default is bypassed entirely and tiles land in an app-sandboxed directory. Full interface lives at `core-map/storage/TileCache.ts`.

## Offline regions

`saveOfflineRegion` pre-fetches every tile inside a `LatLngBounds` across a zoom range into the cache so the area stays interactive offline.

```ts
import { saveOfflineRegion, TileCache } from 'ts-maps'

const cache = new TileCache({ name: 'ts-maps-tiles' })

const result = await saveOfflineRegion({
  bounds: [-0.20, 51.50, -0.05, 51.53],  // [west, south, east, north]
  zoomRange: [10, 14],
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  cache,
  concurrency: 4,
})
// result: { saved, skipped, failed }
```

## Worker pool

`WorkerPool` round-robins jobs across a fixed number of Web Workers. Vector tile decode, heatmap rasterisation, and hillshade computation all route through it by default.

```ts
import { WorkerPool } from 'ts-maps'

const pool = new WorkerPool({ size: navigator.hardwareConcurrency ?? 4 })
const decoded = await pool.run('decodeMvt', { bytes, extent: 4096 })
```

## Putting it together

The [offline example](../examples/11-offline.md) wires a `TileLayer`, a tile cache, and a region pre-fetcher into a single demo: download a small bounding box, toggle the network off, and watch the tiles continue to render from cache.
