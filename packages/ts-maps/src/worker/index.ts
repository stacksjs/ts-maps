// ts-maps/worker — edge-cached vector tiles on Cloudflare Workers, zero deps.
//
//   // src/index.ts of a Worker with an R2 bucket bound as TILES
//   import { createTileWorker } from 'ts-maps/worker'
//   export default createTileWorker()
//
// Serves `GET /tiles.json` (the bucket's TileJSON, rewritten to tile URLs on
// this host), `GET /<archive>/{z}/{x}/{y}.pbf` (tiles out of
// `<archive>.pmtiles`, cached per tile in `caches.default`) and every other
// key of the bucket as-is, Range included. Worker-safe: no `node:*`, no Bun
// APIs; see `docs/concepts/tile-server.md`.

export { ArchiveNotFoundError, R2Source } from './r2'
export type { R2SourceOptions } from './r2'
export { archiveKeyFromTileUrl, createTileWorker, parseRange } from './tile-worker'
export type { TileWorker, TileWorkerEnv, TileWorkerOptions } from './tile-worker'
export type {
  ExecutionContext,
  R2Bucket,
  R2Conditional,
  R2GetOptions,
  R2HTTPMetadata,
  R2Object,
  R2ObjectBody,
  R2PutOptions,
  R2Range,
  WorkerCache,
} from './types'
