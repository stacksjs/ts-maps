# `pmtiles/` — in-house PMTiles v3 reader and writer

A zero-dependency TypeScript implementation of the [PMTiles v3
specification][spec]: a single-file archive of map tiles that a client can
read with HTTP range requests, no tile server required. It is the storage
layer under [`ts-maps/server`][server], and runs on its own anywhere
`fetch` does.

## What PMTiles is

A whole tileset — every `z/x/y` of a basemap — in one file:

```text
┌────────┬──────────────┬──────────┬─────────────────┬───────────┐
│ header │ root         │ metadata │ leaf            │ tile data │
│ 127 B  │ directory    │ (JSON)   │ directories     │           │
└────────┴──────────────┴──────────┴─────────────────┴───────────┘
```

- **Tile ids.** Tiles are keyed by one integer: the count of tiles in every

  lower zoom plus the tile's position along a Hilbert curve. Nearby tiles get
  nearby ids, so a viewport is a few contiguous byte ranges (`tileid.ts`).

- **Directories.** Sorted `(tileId, offset, length, runLength)` entries,

  stored column-wise as varints and compressed. A run of identical tiles (the
  open ocean) is one entry; `runLength = 0` points at a leaf directory instead
  of tile data (`directory.ts`).

- **The first 16 KiB** hold the header and the root directory, so opening an

  archive is one request.

## Reading

```ts
import { PMTiles } from 'ts-maps/pmtiles'

const archive = new PMTiles('https://cdn.example.com/basemap.pmtiles')
const header = await archive.getHeader()      // zooms, bounds, tile type, …
const metadata = await archive.getMetadata()  // vector_layers, attribution, …
const tile = await archive.getTile(14, 2620, 6332)       // stored bytes (gzipped)
const bytes = await archive.getTileData(14, 2620, 6332)  // decompressed
```

A lookup costs one range read for the tile itself; the root directory arrives
with the header, and leaf directories are cached (LRU, 64 by default). Cached
reads are shared promises, so a map firing thirty tile requests at once makes
one read of each directory, not thirty.

Sources (`sources.ts`):

| Source | Reads from |
| ------ | ---------- |
| `FetchSource(url)` | Any HTTP host that honours `Range`: a CDN, S3 / R2 / GCS public or presigned URLs |
| `BytesSource(bytes)` | An archive in memory |
| `FileSource(path)` (`ts-maps/server`) | Local disk, positional reads on one file descriptor |
| `S3Source('s3://bucket/key')` (`ts-maps/server`) | A private bucket, signed with Bun's S3 client |

### Archives that change

Archives get rebuilt and republished under the same name. Sources report an
identity with every read (an HTTP ETag, a file's inode + size + mtime); when it
changes, the reader throws away everything cached from the old build and
retries. With `revalidate: ms` it also re-reads the header periodically, which
catches the one case no tile read can: asking for a tile the *old* directory
says does not exist.

### Compression

Gzip is built in via `DecompressionStream`. Brotli / zstd archives need a
`decompress` option; `ts-maps/server` passes one backed by `node:zlib`.

## Writing

```ts
import { TileType, writePMTiles } from 'ts-maps/pmtiles'

const bytes = await writePMTiles(
  [{ z: 0, x: 0, y: 0, data: mvtBytes }, /* … */],
  { tileType: TileType.Mvt, metadata: { name: 'Overlay', vector_layers: [/* … */] } },
)
await Bun.write('overlay.pmtiles', bytes)
```

The writer clusters tiles in id order, deduplicates identical bodies,
run-length encodes neighbours that share one, and spills into leaf
directories when the root would pass 16 KiB. It holds everything in memory —
right for tests and generated overlays; planet-scale archives come from
[planetiler][planetiler] (see
`scripts/build-tiles.ts`).

## Error handling

- `PMTilesFormatError` — not a v3 archive (v1/v2 are named as such), a

  truncated file, or directories nested past the spec's depth.

- `PMTilesChangedError` — the archive was replaced mid-read. The reader

  handles it; a custom `Source` should throw it on an identity mismatch.

- `RangeError` — tile coordinates outside the grid, or corrupt directory bytes.

A failed open is never cached: a flaky first request does not poison the
reader.

## Acknowledgement

An independent implementation of the [PMTiles v3 spec][spec] by Protomaps
(BSD-3-Clause reference implementation at [protomaps/PMTiles][ref]). No code
was copied; method names follow the reference reader where it made sense, so
the mental model carries over.

[spec]: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
[server]: ../../server/
[planetiler]: https://github.com/onthegomap/planetiler
[ref]: https://github.com/protomaps/PMTiles
