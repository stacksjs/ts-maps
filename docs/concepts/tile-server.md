# Self-hosted vector tiles

A basemap needs a tile host. The public ones ([OpenFreeMap](https://openfreemap.org), Carto, MapTiler) are excellent until they rate-limit you, change a URL, or go down during your launch. `ts-maps/server` serves your own: one [PMTiles](https://github.com/protomaps/PMTiles) archive, one fetch handler, no tile database, no tile cache to warm, no third party at request time.

```text
OpenStreetMap extract ──planetiler──▶ basemap.pmtiles ──createTileServer──▶ /tiles/{z}/{x}/{y}.pbf
                                       (one file: local disk, S3, R2)         /tiles/tiles.json
```

## 1. Build an archive

The bundled styles (`styles.light`, `styles.dark`, `styles/basemap.ts`) are written against the **OpenMapTiles** schema: layers named `water`, `landcover`, `transportation`, `building`, `place`, `poi`, … [planetiler](https://github.com/onthegomap/planetiler) produces exactly that from any OpenStreetMap extract, and `scripts/build-tiles.ts` wraps it:

```bash
cd packages/ts-maps

# Five-second smoke test: Monaco, skipping the 1.4 GB of global side data.
bun scripts/build-tiles.ts --area=monaco --lite --fetch-java

# A real region. --download pulls the OSM extract plus ocean polygons,
# Natural Earth and lake centerlines (~1.4 GB, cached in .tiles-build/).
bun scripts/build-tiles.ts --area=california --memory=8g
bun scripts/build-tiles.ts --area=us --memory=24g
```

`--area` is any [Geofabrik](https://download.geofabrik.de) extract name (`california`, `us-west`, `us`, `europe`, `planet`, …). The script needs Java 21+; `--fetch-java` downloads a portable JRE into the work directory instead of installing one. When planetiler finishes, the script serves the archive in-process, decodes its densest tile and fails unless the OpenMapTiles layers are present.

::: warning Protomaps planet builds are a different schema
`build.protomaps.com` archives use the Protomaps basemap schema (`earth`, `roads`, `places`, …), not OpenMapTiles. They serve fine through `createTileServer`, but the bundled styles will draw nothing from them.
:::

Rough sizes for OpenMapTiles z0–14. Only the Monaco row is measured; the rest are estimates from planetiler output running at about 0.9–1.2× the OSM `.pbf` it was built from:

| Area | OSM extract | Archive | Build (8-core laptop) | Heap |
| ---- | ----------- | ------- | --------------------- | ---- |
| Monaco (`--lite`) | 0.7 MB | 0.4 MB | 4 s | 1 GB |
| California | 1.3 GB | ~1.3–1.6 GB | ~5–10 min | 8 GB |
| US | 12 GB | ~11–14 GB | ~45–90 min | 24 GB |
| Planet | 80 GB | ~70–90 GB | several hours; about one on a large many-core machine | 64 GB+, or `-- --storage=mmap` |

## 2. Serve it

```ts
import { createTileServer } from 'ts-maps/server'

const tiles = createTileServer({
  archive: './california.pmtiles',
  basePath: '/tiles',
  attribution: '© OpenMapTiles © OpenStreetMap contributors',
})

Bun.serve({ port: 8080, fetch: tiles.fetch })
// http://localhost:8080/tiles/tiles.json
// http://localhost:8080/tiles/14/2620/6332.pbf
```

| Route | Answer |
| ----- | ------ |
| `GET {basePath}/tiles.json` (and `{basePath}`) | TileJSON 3.0: `tiles`, `minzoom`, `maxzoom`, `bounds`, `center`, `vector_layers`, `attribution` |
| `GET {basePath}/{z}/{x}/{y}.pbf` | The tile, `application/vnd.mapbox-vector-tile` (`.png` / `.jpg` / `.webp` / `.avif` for raster archives) |
| An empty tile inside the bounds | `204`, rendered blank without a console error |
| Outside the bounds or zoom range | `404`, so clients overzoom from the parent |
| `OPTIONS` | CORS preflight |

What it does for you:

- **Compression passthrough.** Tiles are stored gzipped. Clients that send `Accept-Encoding: gzip` (every browser) get the stored bytes with `Content-Encoding: gzip`; others get them inflated. `Vary: Accept-Encoding` keeps caches straight.
- **Cache forever, safely.** TileJSON hands out tile URLs carrying the archive's version (`…/{z}/{x}/{y}.pbf?v=3d12dcf782873a2e`), served `Cache-Control: public, max-age=31536000, immutable` with an `ETag` (and `304` on revalidation). Rebuild the archive and the version changes, so no browser or CDN ever holds a stale tile under a live URL. Tiles requested without the current `v` are cached for an hour. TileJSON itself is cached for five minutes.
- **Hot swaps.** Replace the archive with `mv new.pmtiles california.pmtiles`; the server notices within five seconds (`revalidate`) and serves the new build, with no restart and no torn reads.
- **CORS** `*` by default (`cors: false` to turn it off, or an origin string).

`tiles.handle(request)` is the same handler but resolves `undefined` for paths it does not own, for composing with other routes. Serve several archives by creating several servers with different `basePath`s.

## 3. Where the archive lives

The `archive` option takes a path or a URL:

```ts
createTileServer({ archive: '/srv/tiles/us.pmtiles' })                         // local disk
createTileServer({ archive: 'https://pub-123.r2.dev/us-2026-10.pmtiles' })     // public bucket / CDN, HTTP Range
createTileServer({ archive: 's3://maps/us-2026-10.pmtiles', open: { s3: {      // private bucket, signed
  endpoint: 'https://<account>.r2.cloudflarestorage.com',
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
} } })
```

- **Local disk** is the fastest: positional reads on one open file descriptor, with the OS page cache keeping hot tiles in memory.
- **S3 / R2 over HTTP Range** keeps the server stateless (any instance, any region, no disk). Each tile is one ranged GET to the bucket, so put a CDN in front of the tile server; with immutable URLs nearly every request is a CDN hit. R2 has no egress fees, which matters at tile volumes.
- For buckets, publish each build under a new key (`us-2026-10.pmtiles`) and point the server at it, rather than overwriting the key it is serving.

You can also skip the server entirely and let browsers range-read the archive from the bucket: see section 6 below. The server exists so clients get plain `{z}/{x}/{y}` URLs and TileJSON that MapLibre, Leaflet and every other client already understand.

## 4. Behind a Stacks app

The handler takes a Web `Request` and returns a `Response`, so it mounts in a route as-is. `basePath` must be the path the request actually arrives with, including any API prefix:

```ts
// routes/api.ts
import { route } from '@stacksjs/router'
import { createTileServer } from 'ts-maps/server'

const tiles = createTileServer({
  archive: process.env.TILES_ARCHIVE ?? 'storage/tiles/basemap.pmtiles',
  basePath: '/tiles',
  publicUrl: 'https://tiles.example.com',
})

route.get('/tiles/tiles.json', request => tiles.fetch(request))
route.get('/tiles/{z}/{x}/{y}', request => tiles.fetch(request))
```

Set `publicUrl` whenever a proxy or CDN sits in front: TileJSON tile URLs must be absolute, and behind a proxy the request carries the internal address.

## 5. Point a map at it

Anything that reads TileJSON works unchanged. In ts-maps:

```ts
const found = await resolveTileJSON(['https://tiles.example.com/tiles.json', 'https://tiles.openfreemap.org/planet'])
const style = styles.light({ tiles: found!.tiles, maxzoom: found!.maxzoom, attribution: found!.attribution })
```

`resolveTileJSON` tries each TileJSON in turn with a timeout and keeps the answer for the session; see [Styles & theming](./styles-and-theming.md#choosing-a-source). An app that resolves its basemap through a list like that (Wildloop's `VECTOR_TILEJSON_SOURCES`) switches by putting its own `https://tiles.example.com/tiles.json` (or the bare base path; both answer TileJSON) first. Same schema, same styles; only the host changes.

The [playground](/demos/)'s real-world demos run on exactly this: Wildloop's weekly planet build, a PMTiles archive in R2 behind the Worker in section 7 at `https://tiles.wildloop.org/tiles.json`, with OpenFreeMap behind it.

## 6. Serving straight from R2 / a bucket, no server

ts-maps can read the archive itself, in the browser, with HTTP range requests. The whole planet is then one file in a bucket behind a custom domain: no tile server, no per-tile objects, one upload per build. Name the archive in a style source with a `pmtiles://` prefix, either way:

```ts
// As the source's url
sources: { basemap: { type: 'vector', url: 'pmtiles://https://tiles.example.com/planet/20261005.pmtiles' } }

// Or TileJSON-style, as tiles[0]: what styles.light / styles.dark produce
const style = styles.dark({ tiles: 'pmtiles://https://tiles.example.com/planet/20261005.pmtiles' })
```

A published TileJSON whose `tiles[0]` is a `pmtiles://` URL works the same way, so an app that resolves its basemap through a TileJSON switches by publishing one:

```json
{ "tilejson": "3.0.0", "tiles": ["pmtiles://https://tiles.example.com/planet/20261005.pmtiles"], "minzoom": 0, "maxzoom": 14 }
```

What happens:

- **One reader per archive.** Every map, static render and offline download on the page shares it. Opening costs one request (the first 16 KiB: header and root directory) plus one for the metadata. Leaf directories are fetched once and kept in a bounded LRU (64 by default); concurrent tiles needing the same directory share one request. After that, **each tile is one range request**.
- **Zooms, bounds and credit come from the archive** when the source does not set them: `minzoom`, `maxzoom`, `bounds` from the header, `attribution` and `vector_layers` from the metadata. Past the archive's `maxzoom` tiles are overzoomed exactly as for a tile server. A source that does state a `maxzoom` (`styles.light` / `styles.dark` default to 14) keeps it.
- **Empty tiles** (open sea, absent from the archive) draw blank, the same as a `204` from a server, and cost no tile request: the directory already says they are not there.
- **Tiles are gzip-decompressed** in the browser with `DecompressionStream`.
- **Offline works.** Each tile has a stable synthetic URL, `pmtiles://https://…/planet.pmtiles/{z}/{x}/{y}`, and that is the key the offline cache, `saveOfflineRegion` and downloaded maps (`map.offline.download`) store it under. The archive's TileJSON is stored next to its tiles under `pmtiles://https://…/planet.pmtiles`, so a map with no connection still knows the top zoom and can overzoom past it.

  ```ts
  // Wildloop's "download for offline": tileUrl is the TileJSON's tiles[0].
  await saveOfflineRegion({ bounds, zoomRange: [10, 14], tileUrl: 'pmtiles://https://tiles.example.com/planet/20261005.pmtiles', concurrency: 4 })
  ```

- **Rebuilds.** Publish each build under a new name (`planet/20261012.pmtiles`) and update the style or TileJSON. If an archive is overwritten in place anyway, an `ETag` change, a `412` or a `416` on a tile read makes the reader re-read the header once and retry; concurrent reads share that one reload.
- **Never a full download.** A host that ignores `Range` and answers `200` with a body over 64 MiB (or of unknown length) is refused and the body cancelled, rather than streaming 90 GB into a tab.

### Bucket CORS

The browser reads the archive cross-origin with a `Range` header, so the bucket must allow it and expose the headers the reader checks. For R2 (bucket → Settings → CORS policy):

```json
[
  {
    "AllowedOrigins": ["https://wildloop.org", "http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Content-Range", "ETag", "Content-Length"],
    "MaxAgeSeconds": 86400
  }
]
```

S3 and GCS take the same four fields under their own names. Without `ETag` in `ExposeHeaders` the reader cannot see that an archive was replaced in place; without `Range` in `AllowedHeaders` every request fails its preflight. Serve the archive from a custom domain (`tiles.example.com`) rather than `r2.dev`, which is rate limited and not cached by Cloudflare's CDN; a long `Cache-Control` (`public, max-age=31536000, immutable`) suits a dated file name.

### Reading it yourself

The same pieces are exported for tooling (`ts-maps` and `ts-maps/pmtiles`):

```ts
import { pmtilesFetch, pmtilesTileJSON, readPMTilesTile, setPMTilesArchive } from 'ts-maps/pmtiles'

const tilejson = await pmtilesTileJSON('pmtiles://https://tiles.example.com/planet/20261005.pmtiles')
const bytes = await readPMTilesTile('pmtiles://https://tiles.example.com/planet/20261005.pmtiles/14/2620/6332')
const response = await pmtilesFetch('pmtiles://https://tiles.example.com/planet/20261005.pmtiles/14/2620/6332') // 200, or 204 when empty
setPMTilesArchive('https://tiles.example.com/private.pmtiles', new FetchSource(url, { headers: { Authorization } }))
```

To check an archive before publishing it, read a tile with `PMTiles` from `ts-maps/pmtiles` and decode it with `new VectorTile(new Pbf(bytes))` from `ts-maps`.

## 7. Edge-cached on Cloudflare Workers

Reading the archive straight from R2 (section 6) means every tile is a ranged GET that travels to the bucket: nothing in front of it caches a byte range, so a tile costs 160-600 ms every time. `ts-maps/worker` puts a Cloudflare Worker on the bucket's hostname that turns the archive into plain tile URLs and caches each tile in the colo that first asked for it. A repeat tile never leaves the edge, and every existing URL on the hostname keeps working.

```ts
// src/index.ts
import { createTileWorker } from 'ts-maps/worker'

export default createTileWorker()
```

```toml
# wrangler.toml
name = "tiles"
main = "src/index.ts"
compatibility_date = "2026-10-01"

[[r2_buckets]]
binding = "TILES"              # createTileWorker({ binding }) if you name it differently
bucket_name = "wildloop-tiles"

routes = [{ pattern = "tiles.wildloop.org/*", zone_name = "wildloop.org" }]
```

The bundle is plain ESM for the Web platform: no `node:*`, no Bun APIs, no dependencies, and the R2 / Cache API types it needs are declared locally (no `@cloudflare/workers-types` required).

| Request | Answer |
| ------- | ------ |
| `GET /tiles.json` | The bucket's own `tiles.json`, with its `pmtiles://https://<host>/planet/20261006.pmtiles` rewritten to `https://<this host>/planet/20261006/{z}/{x}/{y}.pbf`. Every other field is kept. `Cache-Control: public, max-age=60` |
| `GET /planet/20261006/{z}/{x}/{y}.pbf` | A tile from `planet/20261006.pmtiles`: the stored gzip bytes as-is (`Content-Encoding: gzip`), `application/vnd.mapbox-vector-tile`, `ETag`, `Cache-Control: public, max-age=31536000, immutable` |
| An empty tile inside the bounds / outside the bounds or zoom range / off the grid | `204` / `404` / `400`, the same semantics as `createTileServer` |
| `GET` / `HEAD` any other key | The R2 object, as the bucket served it: `Range` (`206` + `Content-Range`), `ETag` / `If-None-Match`, its stored `Content-Type` |
| `OPTIONS` | CORS preflight. Every answer carries `Access-Control-Allow-Origin: *` and exposes `ETag`, `Content-Range`, `Content-Length`, `Accept-Ranges` |

How a tile is answered, cheapest first:

1. **`caches.default`**, keyed on the tile's URL path (a query string cannot bypass it). Hits never touch R2. Because the tile URL names the archive build, the answer can never go stale, so `204`s and `404`s are cached as well.
2. **The isolate's open reader** for that archive: header and root directory read once, leaf directories decoded and kept in a bounded LRU. A miss here costs one R2 read: the tile's own byte range.
3. **Leaf directories in the Cache API**, keyed on the archive's ETag, so a freshly started isolate rarely has to read one from R2 either.

All R2 reads go through the binding (`bucket.get(key, { range, onlyIf: { etagMatches } })`), not HTTP, so there is no public request and no egress. An archive overwritten in place fails the ETag precondition and is re-read rather than mixed with the old build, but the rule from section 3 stands: publish each build under a new key, then update `tiles.json`. Clients pick up the new tile URLs within the TileJSON's minute.

Nothing that already points at the hostname breaks. `pmtiles://https://tiles.wildloop.org/planet/20261006.pmtiles` readers still range-read the archive (now through the Worker), and files such as `_builds/20261006/status.json` are served unchanged. Apps that resolve their basemap through `https://tiles.wildloop.org/tiles.json` move to the cached tile URLs on their next load with no code change. Offline regions saved earlier under `pmtiles://` tile URLs stay in their cache under those keys, so download new regions after the switch.

Options: `binding` (default `TILES`), `tilejsonKey` (default `tiles.json`), `tileCacheControl` and `tilejsonCacheControl`. `R2Source` is exported too, for reading an R2 archive with `PMTiles` in a Worker of your own.
