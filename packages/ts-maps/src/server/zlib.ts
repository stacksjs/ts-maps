// A `Decompressor` backed by `node:zlib`, which Bun implements natively. Unlike
// the browser-safe default (gzip only, via DecompressionStream) it covers every
// codec the PMTiles spec names: gzip, brotli and — where the runtime has it —
// zstd. Synchronous on purpose: a tile is tens to hundreds of KB and inflates
// in well under a millisecond, cheaper than a round trip through a stream.

import type { Decompressor } from '../core-map/pmtiles/compression'
import * as zlib from 'node:zlib'
import { compressionName } from '../core-map/pmtiles/compression'
import { Compression } from '../core-map/pmtiles/header'

// eslint-disable-next-line no-unused-vars
type SyncCodec = (bytes: Uint8Array) => Uint8Array

// `zstdDecompressSync` is recent (Node 22.15 / Bun 1.2); reach for it by name
// so older type definitions and runtimes degrade to a clear error.
const zstdDecompressSync = (zlib as unknown as { zstdDecompressSync?: SyncCodec }).zstdDecompressSync

export const nodeDecompress: Decompressor = (bytes, compression) => {
  switch (compression) {
    case Compression.None:
    case Compression.Unknown:
      return bytes
    case Compression.Gzip:
      return zlib.gunzipSync(bytes)
    case Compression.Brotli:
      return zlib.brotliDecompressSync(bytes)
    case Compression.Zstd:
      if (zstdDecompressSync)
        return zstdDecompressSync(bytes)
      break
  }
  throw new Error(`PMTiles: this runtime cannot decompress ${compressionName(compression)}`)
}
