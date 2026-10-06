// ts-maps/server — your own vector tile server, for Bun.
//
//   const tiles = createTileServer({ archive: './basemap.pmtiles', basePath: '/tiles' })
//   Bun.serve({ fetch: tiles.fetch })
//
// then point any map at `https://your.host/tiles/tiles.json`. The archive can
// be a local file, an `https://` URL (HTTP range requests against S3 / R2 /
// any CDN) or `s3://bucket/key` (signed, via Bun's S3 client). Server-only:
// this entry point uses `node:fs` and Bun's S3 client.

export { BytesSource, Compression, FetchSource, PMTiles, PMTilesChangedError, TileType, tileIdToZxy, writePMTiles, zxyToTileId } from '../core-map/pmtiles'
export type { PMTilesHeader, PMTilesTile, Source } from '../core-map/pmtiles'

export { FileSource, S3Source, sourceFromLocation } from './sources'
export type { FileSourceOptions, OpenArchiveOptions } from './sources'

export { acceptsEncoding } from '../core-map/pmtiles/http'
export { buildTileJSON, createTileServer } from './tile-server'
export type { TileJSON, TileServer, TileServerOptions } from './tile-server'

export { nodeDecompress } from './zlib'
