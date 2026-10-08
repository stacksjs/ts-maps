# Self-hosted vector tiles

A basemap needs a tile host. The public ones ([OpenFreeMap](https://openfreemap.org), Carto, MapTiler) are excellent until they rate-limit you, change a URL, or go down during your launch. ts-maps can serve your own from one [PMTiles](https://github.com/protomaps/PMTiles) archive: no tile database, no tile cache to warm, no third party at request time.

```text
OpenStreetMap extract ──planetiler──▶ basemap.pmtiles ──createTileServer──▶ /tiles/{z}/{x}/{y}.pbf
                                       (one file: local disk, S3, R2)         /tiles/tiles.json
```

There are three ways to put the archive in front of a map, from simplest to most cached:

- [`createTileServer`](#serve-it) from `ts-maps/server`: one fetch handler on your own server (Bun), plain `{z}/{x}/{y}` URLs and TileJSON.
- [Straight from a bucket](#straight-from-a-bucket): the browser range-reads the archive itself. No server at all.
- [`createTileWorker`](#edge-cached-on-cloudflare-workers) from `ts-maps/worker`: a Cloudflare Worker in front of an R2 bucket, caching each tile at the edge.

## Build an archive

The bundled styles (`styles.light`, `styles.dark`) are written against the **OpenMapTiles** schema: layers named `water`, `landcover`, `transportation`, `building`, `place`, `poi`, … [planetiler](https://github.com/onthegomap/planetiler) produces exactly that from any OpenStreetMap extract, and `scripts/build-tiles.ts` wraps it:

```bash
cd packages/ts-maps

# Five-second smoke test: Monaco, skipping the 1.4 GB of global side data
bun scripts/build-tiles.ts --area=monaco --lite --fetch-java

# A real region. Without --lite, planetiler also downloads ocean polygons
# Natural Earth and lake centerlines (~1.4 GB, kept in .tiles-build/)
bun scripts/build-tiles.ts --area=california
bun scripts/build-tiles.ts --area=us --memory=16g
```

| Flag | Default | |
| --- | --- | --- |
| `--area` | required | Any [Geofabrik](https://download.geofabrik.de) extract name: `california`, `us-west`, `us`, `europe`, `planet`, … |
| `--out` | `<area>.pmtiles` | |
| `--workdir` | `.tiles-build` | The jar, the downloaded sources and temporary files |
| `--memory` | `4g` | Java heap. California is happy with 4g, the US wants 16g or more, the planet 64g or more (or `-- --storage=mmap` to trade memory for disk) |
| `--java` | `$JAVA_HOME`, then `PATH` | A Java 21+ binary |
| `--fetch-java` | | Download a portable Temurin 21 JRE into the work directory instead of installing Java |
| `--lite` | | Skip the global side sources. The open sea and the low-zoom Natural Earth layers are missing; for smoke tests and CI, not production |
| `-- ARGS` | | Passed straight to planetiler, e.g. `-- --maxzoom=15` |

When planetiler finishes, the script serves the archive in-process, prints its size, zooms, bounds and layers, decodes its densest tile, and fails unless the archive declares the `water`, `transportation` and `place` layers.

::: warning Protomaps planet builds are a different schema
`build.protomaps.com` archives use the Protomaps basemap schema (`earth`, `roads`, `places`, …), not OpenMapTiles. They serve fine through `createTileServer`, but the bundled styles will draw nothing from them.
:::

Rough sizes for OpenMapTiles z0–14. Only the Monaco row is measured; the rest are estimates from planetiler output running at about 0.9–1.2× the OSM `.pbf` it was built from:

| Area | OSM extract | Archive | Build (8-core laptop) |
| ---- | ----------- | ------- | --------------------- |
| Monaco (`--lite`) | 0.7 MB | 0.4 MB | 4 s |
| California | 1.3 GB | ~1.3–1.6 GB | ~5–10 min |
| US | 12 GB | ~11–14 GB | ~45–90 min |
| Planet | 80 GB | ~70–90 GB | several hours; about one on a large many-core machine |

## Serve it

```ts
// server.ts, run with Bun
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

`ts-maps/server` uses Bun's file and S3 APIs, so it runs on Bun.

| Request | Answer |
| ----- | ------ |
| `GET {basePath}/tiles.json` (and `{basePath}`) | TileJSON 3.0: `tiles`, `minzoom`, `maxzoom`, `bounds`, `center`, `name`, `description`, `version`, `attribution`, `format`, and `vector_layers` for a vector archive |
| `GET {basePath}/{z}/{x}/{y}.pbf` | The tile, `application/vnd.mapbox-vector-tile`. `.mvt` works too, and `.png`, `.jpg`, `.webp` or `.avif` for raster archives |
| An empty tile inside the bounds | `204`, drawn blank without a console error |
| Outside the bounds or zoom range | `404`, so clients overzoom from the parent |
| Off the tile grid | `400` |
| The wrong extension for the archive | `404` |
| `HEAD` | As `GET`, without the body |
| `OPTIONS` | CORS preflight |
| Any other method | `405` |

What it does for you:

- **Compression passthrough.** Tiles are stored gzipped. Clients that send `Accept-Encoding: gzip` (every browser) get the stored bytes with `Content-Encoding: gzip`; others get them inflated. `Vary: Accept-Encoding` keeps caches straight.
- **Cache forever, safely.** TileJSON hands out tile URLs carrying the archive's version (`…/{z}/{x}/{y}.pbf?v=3d12dcf782873a2e`), served `Cache-Control: public, max-age=31536000, immutable` with an `ETag` (and `304` on revalidation). Rebuild the archive and the version changes, so no browser or CDN ever holds a stale tile under a live URL. Tiles requested without the current `v` are cached for an hour (`max-age=3600, stale-while-revalidate=86400`). TileJSON is cached for five minutes.
- **Hot swaps.** Replace the archive with `mv new.pmtiles california.pmtiles`; the server notices within five seconds for a local file (a minute for a remote one) and serves the new build, with no restart and no torn reads.
- **CORS** `*` by default (`cors: false` to turn it off, or an origin string).

| Option | Default | |
| --- | --- | --- |
| `archive` | required | A path, an `https://` URL, an `s3://bucket/key`, a `Source`, or an open `PMTiles` |
| `basePath` | `''` | The path the routes live under |
| `publicUrl` | the request's origin + `basePath` | The public URL of `basePath`, for the tile URLs in TileJSON |
| `attribution`, `name`, `description` | the archive's | TileJSON fields |
| `cacheControl` | `public, max-age=31536000, immutable` | For tiles under the current version |
| `unversionedCacheControl` | `public, max-age=3600, stale-while-revalidate=86400` | For tiles without it |
| `tileJSONCacheControl` | `public, max-age=300` | |
| `cors` | `'*'` | An origin, or `false` |
| `headers` | | Extra headers on every response |
| `revalidate` | `5000` local, `60000` remote | Milliseconds between checks for a replaced archive; `false` never checks |
| `open` | | `{ headers }` for an `https://` archive, `{ s3 }` for an `s3://` one |
| `onError` | `console.error` | Called with failures that became a `5xx` |

The server object has `fetch(request)`, which answers `404` for paths it does not own; `handle(request)`, which resolves `undefined` for them, for composing with other routes; `tileJSON()`; `archive`, the open reader; and `close()`. Serve several archives by creating several servers with different `basePath`s.

## Where the archive lives

```ts
import { createTileServer } from 'ts-maps/server'

createTileServer({ archive: '/srv/tiles/us.pmtiles' })                     // local disk
createTileServer({ archive: 'https://pub-123.r2.dev/us-2026-10.pmtiles' }) // public bucket or CDN, HTTP Range
createTileServer({                                                          // private bucket, signed
  archive: 's3://maps/us-2026-10.pmtiles',
  open: {
    s3: {
      endpoint: 'https://<account>.r2.cloudflarestorage.com',
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  },
})
```

- **Local disk** is the fastest: positional reads on one open file descriptor, with the OS page cache keeping hot tiles in memory.
- **S3 or R2 over HTTP Range** keeps the server stateless (any instance, any region, no disk). Each tile is one ranged GET to the bucket, so put a CDN in front of the tile server; with immutable URLs nearly every request is a CDN hit. R2 has no egress fees, which matters at tile volumes.
- For buckets, publish each build under a new key (`us-2026-10.pmtiles`) and point the server at it, rather than overwriting the key it is serving.

## Behind a Stacks app

The handler takes a Web `Request` and returns a `Response`, so it mounts in a route as-is. `basePath` must be the path the request actually arrives with, including any API prefix:

```ts
// routes/api.ts
import { route } from '@stacksjs/router'
import { createTileServer } from 'ts-maps/server'

const tiles = createTileServer({
  archive: process.env.TILES_ARCHIVE ?? 'storage/tiles/basemap.pmtiles',
  basePath: '/tiles',
  publicUrl: 'https://example.com/tiles',
})

route.get('/tiles/tiles.json', request => tiles.fetch(request))
route.get('/tiles/{z}/{x}/{y}', request => tiles.fetch(request))
```

Set `publicUrl` whenever a proxy or CDN sits in front: TileJSON tile URLs must be absolute, and behind a proxy the request carries the internal address. `publicUrl` replaces the base outright, so include the path the tiles are served under (`<https://example.com/tiles>`, not `<https://example.com>`). The tile route must pass the extension through to the handler (`6332.pbf`), which picks the format from it.

## Point a map at it

Anything that reads TileJSON works unchanged. In ts-maps, name it in the style:

```ts
import { Map, styles } from 'ts-maps'

const map = new Map('map', {
  center: [34.05, -118.25],
  zoom: 12,
  style: styles.light({ url: 'https://tiles.example.com/tiles.json' }),
})
```

To keep a public host behind your own, `resolveTileJSON` tries each TileJSON in turn, with a timeout (6 seconds by default), and keeps the answer in `sessionStorage` for the rest of the visit:

```ts
import { Map, resolveTileJSON, styles } from 'ts-maps'

const found = await resolveTileJSON(['https://tiles.example.com/tiles.json', 'https://tiles.openfreemap.org/planet'])
const map = new Map('map', {
  center: [34.05, -118.25],
  zoom: 12,
  style: styles.light({ tiles: found!.tiles, maxzoom: found!.maxzoom, attribution: found!.attribution }),
})
```

See [Styles & theming](./styles-and-theming.md#choosing-a-source). Same schema, same styles; only the host changes.

The [playground](/demos/)'s real-world demos run on exactly this: a weekly planet build in R2 behind the Worker below at `<https://tiles.wildloop.org/tiles.json>`, with OpenFreeMap behind it.

## Straight from a bucket

ts-maps can read the archive itself, in the browser, with HTTP range requests. The whole planet is then one file in a bucket behind a custom domain: no tile server, no per-tile objects, one upload per build. Name the archive in a style source with a `pmtiles://` prefix, either way:

```ts
import { styles } from 'ts-maps'

// As the source's url
const sources = { basemap: { type: 'vector', url: 'pmtiles://https://tiles.example.com/planet/20261005.pmtiles' } }

// Or TileJSON-style, as tiles[0]: what styles.light and styles.dark produce
const style = styles.dark({ tiles: 'pmtiles://https://tiles.example.com/planet/20261005.pmtiles' })
```

`vectorTileLayer({ url: 'pmtiles://…' })` reads one the same way. A published TileJSON whose `tiles[0]` is a `pmtiles://` URL works too, so an app that resolves its basemap through a TileJSON switches by publishing one:

```json
{ "tilejson": "3.0.0", "tiles": ["pmtiles://https://tiles.example.com/planet/20261005.pmtiles"], "minzoom": 0, "maxzoom": 14 }
```

What happens:

- **One reader per archive.** Every map, static render and offline download on the page shares it. Opening costs one request (the first 16 KiB: header and root directory) plus one for the metadata. Leaf directories are fetched once and kept in a bounded cache (64 by default); concurrent tiles needing the same directory share one request. After that, **each tile is one range request**.
- **Zooms, bounds and credit come from the archive** when the source does not set them: `minzoom`, `maxzoom` and `bounds` from the header, `attribution` and `vector_layers` from the metadata. Past the archive's `maxzoom` tiles are overzoomed exactly as for a tile server. A source that does state a `maxzoom` (`styles.light` and `styles.dark` default to 14) keeps it.
- **Empty tiles** (open sea, absent from the archive) draw blank, the same as a `204` from a server, and cost no tile request: the directory already says they are not there.
- **Tiles are gzip-decompressed** in the browser with `DecompressionStream`.
- **Offline works.** Each tile has a stable URL, `pmtiles://<https://…/planet.pmtiles/{z}/{x}/{y}>`, and that is the key the offline cache, `saveOfflineRegion` and downloaded maps (`map.offline.download`) store it under. The archive's TileJSON is stored next to its tiles under `pmtiles://<https://…/planet.pmtiles>`, so a map with no connection still knows the top zoom and can overzoom past it. See [Offline maps](./offline.md).
- **Rebuilds.** Publish each build under a new name (`planet/20261012.pmtiles`) and update the style or TileJSON. If an archive is overwritten in place anyway, an `ETag` change, a `412` or a `416` on a tile read makes the reader re-read the header once and retry; concurrent reads share that one reload.
- **Never a full download.** A host that ignores `Range` and answers `200` with a body over 64 MiB (or of unknown length) is refused and the body cancelled, rather than streaming 90 GB into a tab.

### Bucket CORS

The browser reads the archive cross-origin with a `Range` header, so the bucket must allow it and expose the headers the reader checks. For R2 (bucket → Settings → CORS policy):

```json
[
  {
    "AllowedOrigins": ["https://example.com", "http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Content-Range", "ETag", "Content-Length"],
    "MaxAgeSeconds": 86400
  }
]
```

S3 and GCS take the same four fields under their own names. Without `ETag` in `ExposeHeaders` the reader cannot see that an archive was replaced in place; without `Range` in `AllowedHeaders` every request fails its preflight. Serve the archive from a custom domain (`tiles.example.com`) rather than `r2.dev`, which is rate limited and not cached by Cloudflare's CDN; a long `Cache-Control` (`public, max-age=31536000, immutable`) suits a dated file name.

### Reading it yourself

The protocol helpers are exported from `ts-maps` and `ts-maps/pmtiles`; the reader itself (`PMTiles`, `FetchSource`, `writePMTiles`, …) from `ts-maps/pmtiles` only:

```ts
import { FetchSource, pmtilesFetch, pmtilesTileJSON, readPMTilesTile, setPMTilesArchive } from 'ts-maps/pmtiles'

const archive = 'pmtiles://https://tiles.example.com/planet/20261005.pmtiles'

const tilejson = await pmtilesTileJSON(archive)
const bytes = await readPMTilesTile(`${archive}/14/2620/6332`)
const response = await pmtilesFetch(`${archive}/14/2620/6332`) // 200, or 204 when empty

// An archive that needs credentials: register a source for its URL.
const url = 'https://tiles.example.com/private.pmtiles'
const token = 'your-token'
setPMTilesArchive(url, new FetchSource(url, { headers: { Authorization: `Bearer ${token}` } }))
```

`setPMTilesArchive(url, null)` forgets one, and `clearPMTilesArchives()` all of them. To check an archive before publishing it, read a tile and decode it with `new VectorTile(new Pbf(bytes))` from `ts-maps`.

## Edge-cached on Cloudflare Workers

Reading the archive straight from R2 means every tile is a ranged GET that travels to the bucket: nothing in front of it caches a byte range, so a tile costs 160–600 ms every time. `ts-maps/worker` puts a Cloudflare Worker on the bucket's hostname that turns the archive into plain tile URLs and caches each tile in the data centre that first asked for it. A repeat tile never leaves the edge, and every existing URL on the hostname keeps working.

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
bucket_name = "my-tiles"

routes = [{ pattern = "tiles.example.com/*", zone_name = "example.com" }]
```

The bundle is plain ESM for the Web platform: no `node:*`, no Bun APIs, no dependencies, and the R2 and Cache API types it needs are declared locally (no `@cloudflare/workers-types` required).

| Request | Answer |
| ------- | ------ |
| `GET /tiles.json` | The bucket's own `tiles.json`, with its `pmtiles://https://<host>/planet/20261006.pmtiles` rewritten to `https://<this host>/planet/20261006/{z}/{x}/{y}.pbf`. Every other field is kept. `Cache-Control: public, max-age=60` |
| `GET /planet/20261006/{z}/{x}/{y}.pbf` | A tile from `planet/20261006.pmtiles`: the stored gzip bytes as-is (`Content-Encoding: gzip`), `application/vnd.mapbox-vector-tile`, `ETag`, `Cache-Control: public, max-age=31536000, immutable` |
| An empty tile inside the bounds / outside the bounds or zoom range / off the grid | `204` / `404` / `400`, the same as `createTileServer` |
| `GET` or `HEAD` any other key | The R2 object, as the bucket served it: `Range` (`206` + `Content-Range`), `ETag` / `If-None-Match`, its stored `Content-Type` |
| `OPTIONS` | CORS preflight. Every answer carries `Access-Control-Allow-Origin: *` and exposes `ETag`, `Content-Range`, `Content-Length`, `Content-Encoding` and `Accept-Ranges` |

How a tile is answered, cheapest first:

1. **`caches.default`**, keyed on the tile's URL path (a query string cannot bypass it). Hits never touch R2. Because the tile URL names the archive build, the answer can never go stale, so `204`s and `404`s are cached as well (except the `404` for an archive that does not exist).
2. **The isolate's open reader** for that archive (up to eight per isolate): header and root directory read once, leaf directories decoded and kept in a bounded cache. A miss here costs one R2 read: the tile's own byte range.
3. **Leaf directories in the Cache API**, keyed on the archive's ETag, so a freshly started isolate rarely has to read one from R2 either.

All R2 reads go through the binding (`bucket.get(key, { range, onlyIf: { etagMatches } })`), not HTTP, so there is no public request and no egress. An archive overwritten in place fails the ETag precondition and is re-read rather than mixed with the old build, but the rule above stands: publish each build under a new key, then update `tiles.json`. Clients pick up the new tile URLs within the TileJSON's minute; a page that resolved its basemap with `resolveTileJSON` keeps its answer until the next visit.

Nothing that already points at the hostname breaks. `pmtiles://<https://tiles.example.com/planet/20261006.pmtiles>` readers still range-read the archive (now through the Worker), and other files in the bucket are served unchanged. Offline regions saved earlier under `pmtiles://` tile URLs stay in their cache under those keys, so download new regions after the switch.

| Option | Default | |
| --- | --- | --- |
| `binding` | `'TILES'` | The R2 bucket binding |
| `tilejsonKey` | `'tiles.json'` | |
| `tileCacheControl` | `public, max-age=31536000, immutable` | |
| `tilejsonCacheControl` | `public, max-age=60` | |
| `tileStore` | | `{ origin, prefix }`: a second cache tier shared by every data centre |

`caches.default` belongs to one data centre, so without `tileStore` each city cuts each tile out of the archive itself. With it, a tile cut once is written back to the bucket as its own small object under `prefix` (default `_tiles/`), and other data centres fetch that object from `origin`, a public hostname of the same bucket, through Cloudflare's CDN, where tiered caching applies:

```ts
import { createTileWorker } from 'ts-maps/worker'

export default createTileWorker({ tileStore: { origin: 'https://tiles-origin.example.com' } })
```

`R2Source` is exported too, for reading an R2 archive with `PMTiles` in a Worker of your own.
