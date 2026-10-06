// Compression for PMTiles directories, metadata and tile bodies.
//
// The spec allows none / gzip / brotli / zstd. In practice almost every archive
// in the wild is gzip throughout (planetiler, tippecanoe and `pmtiles convert`
// all default to it), and gzip is the one codec every runtime can undo without
// a library: `DecompressionStream('gzip')` exists in browsers, Bun, Deno and
// Node 18+. So that is the built-in path, and the rest is pluggable — pass a
// `Decompressor` (the server entry point supplies one backed by `node:zlib`,
// which also speaks brotli and zstd) and the reader uses it instead.

import type { CompressionCode } from './header'
import { Compression } from './header'

/**
 * Undo `compression` on `bytes`. Must return the input untouched for
 * `Compression.None`. May be async; the reader always awaits it.
 */
// eslint-disable-next-line no-unused-vars
export type Decompressor = (bytes: Uint8Array, compression: CompressionCode) => Uint8Array | Promise<Uint8Array>

/** Human name of a compression code, for errors and `Content-Encoding`. */
export function compressionName(compression: CompressionCode): 'none' | 'gzip' | 'br' | 'zstd' | 'unknown' {
  switch (compression) {
    case Compression.None: return 'none'
    case Compression.Gzip: return 'gzip'
    case Compression.Brotli: return 'br'
    case Compression.Zstd: return 'zstd'
    default: return 'unknown'
  }
}

async function pipeThrough(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array> }): Promise<Uint8Array> {
  // `new Response(readable).arrayBuffer()` drains the stream in one call and
  // is faster than a manual reader loop in every engine we run on.
  const writer = stream.writable.getWriter()
  void writer.write(bytes).then(() => writer.close()).catch(() => {})
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

/**
 * Default decompressor: identity for `None`, `DecompressionStream` for gzip,
 * and a clear error for anything else.
 */
export const defaultDecompress: Decompressor = (bytes, compression) => {
  if (compression === Compression.None)
    return bytes
  if (compression === Compression.Gzip) {
    if (typeof DecompressionStream === 'undefined')
      throw new Error('PMTiles: gzip needs DecompressionStream, which this runtime lacks; pass a `decompress` option')
    return pipeThrough(bytes, new DecompressionStream('gzip'))
  }
  throw new Error(`PMTiles: ${compressionName(compression)} compression needs a \`decompress\` option (the ts-maps/server entry provides one)`)
}

/** gzip `bytes` with `CompressionStream`. Used by the writer. */
export function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined')
    throw new Error('PMTiles: gzip needs CompressionStream, which this runtime lacks')
  return pipeThrough(bytes, new CompressionStream('gzip'))
}

/** True when `bytes` starts with the gzip magic (1f 8b). */
export function isGzipped(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1F && bytes[1] === 0x8B
}
