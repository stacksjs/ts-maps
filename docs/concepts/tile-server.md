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

You can also skip the server entirely and let browsers range-read the archive from a CDN with `new PMTiles(url)` from `ts-maps/pmtiles`; the server exists so clients get plain `{z}/{x}/{y}` URLs and TileJSON that MapLibre, Leaflet and every other client already understand.

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
const tilejson = await (await fetch('https://tiles.example.com/tiles.json')).json()
const style = styles.light({ tiles: tilejson.tiles[0], attribution: tilejson.attribution })
```

An app that resolves its basemap through a TileJSON URL (Wildloop's `VECTOR_TILEJSON`, which today points at `https://tiles.openfreemap.org/planet`) switches by changing that one constant to `https://tiles.example.com/tiles.json` (or the bare base path; both answer TileJSON) and its attribution to the OpenMapTiles / OpenStreetMap credit. Same schema, same styles; only the host changes.
