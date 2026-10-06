// PMTiles v3 reader — in-house, zero-dep.
// Independent TypeScript implementation of
// https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md. The API is
// shaped like the reference `pmtiles` package (getHeader / getMetadata /
// getZxy-style lookups) so it reads familiarly, but no code was copied.
//
// Looking up a tile is at most a few range reads, most of them cached:
//
//   1. open      read bytes [0, 16 KiB): header + root directory   (once)
//   2. descend   root entry → leaf directory → …                  (cached)
//   3. fetch     the tile's own byte range                        (every time)
//
// Steps 1 and 2 are memoised as *promises*, not values, so a burst of
// concurrent tile requests — a map opening fires dozens at once — shares one
// in-flight read of each directory instead of racing to fetch it N times.

import type { Decompressor } from './compression'
import type { Entry } from './directory'
import type { CompressionCode, PMTilesHeader } from './header'
import type { RangeResponse, Source } from './sources'
import { defaultDecompress } from './compression'
import { decodeDirectory, findTile } from './directory'
import { parseHeader, PMTILES_HEADER_LENGTH, PMTILES_ROOT_FETCH_LENGTH, PMTilesFormatError } from './header'
import { FetchSource, PMTilesChangedError } from './sources'
import { zxyToTileId } from './tileid'

export interface PMTilesOptions {
  /** Decompressor for non-gzip archives. Default handles none + gzip. */
  decompress?: Decompressor
  /** Leaf directories kept decoded in memory. Default 64 (a few MB at most). */
  directoryCacheSize?: number
}

/** A tile exactly as stored in the archive. */
export interface PMTilesTile {
  /** The stored bytes — still compressed with `compression`. */
  data: Uint8Array
  compression: CompressionCode
  tileId: number
  /** Absolute byte offset of the tile in the archive; stable per content. */
  offset: number
}

/** Everything learned from the first 16 KiB. */
interface Opened {
  header: PMTilesHeader
  root: Entry[]
  etag?: string
  /** Short hash of header + root directory + source etag. */
  version: string
}

// The spec caps directory depth (root → leaf → leaf → leaf); anything deeper
// is a corrupt archive looping on itself.
const MAX_DEPTH = 4

async function shortHash(parts: Array<Uint8Array | string | undefined>): Promise<string> {
  const encoder = new TextEncoder()
  const chunks = parts.map(p => p === undefined ? new Uint8Array(0) : typeof p === 'string' ? encoder.encode(p) : p)
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const joined = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    joined.set(chunk, at)
    at += chunk.length
  }
  if (globalThis.crypto?.subtle) {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', joined))
    return Array.from(digest.subarray(0, 8), b => b.toString(16).padStart(2, '0')).join('')
  }
  // FNV-1a fallback for runtimes without WebCrypto.
  let h = 0x811C9DC5
  for (let i = 0; i < joined.length; i++)
    h = Math.imul(h ^ joined[i]!, 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

export class PMTiles {
  readonly source: Source
  private readonly decompress: Decompressor
  private readonly cacheSize: number
  private opened?: Promise<Opened>
  private metadata?: Promise<Record<string, unknown>>
  // Keyed by absolute byte offset; Map iteration order doubles as LRU order.
  private readonly directories = new Map<number, Promise<Entry[]>>()

  constructor(source: Source | string, options: PMTilesOptions = {}) {
    this.source = typeof source === 'string' ? new FetchSource(source) : source
    this.decompress = options.decompress ?? defaultDecompress
    this.cacheSize = options.directoryCacheSize ?? 64
  }

  /** Forget the header, metadata and every cached directory. */
  clearCache(): void {
    this.opened = undefined
    this.metadata = undefined
    this.directories.clear()
  }

  async getHeader(signal?: AbortSignal): Promise<PMTilesHeader> {
    return (await this.open(signal)).header
  }

  /**
   * A short fingerprint of this archive build: changes whenever the archive is
   * rewritten, so it can version tile URLs that are cached forever.
   */
  async getVersion(signal?: AbortSignal): Promise<string> {
    return (await this.open(signal)).version
  }

  /** The archive's JSON metadata (`name`, `attribution`, `vector_layers`, …). */
  async getMetadata(signal?: AbortSignal): Promise<Record<string, unknown>> {
    this.metadata ??= this.loadMetadata(signal).catch((error) => {
      this.metadata = undefined
      throw error
    })
    return this.metadata
  }

  /**
   * The stored bytes for `z/x/y`, still compressed, or `undefined` when the
   * archive has no tile there. Use `getTileData` for decompressed bytes.
   */
  async getTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<PMTilesTile | undefined> {
    const tileId = zxyToTileId(z, x, y)
    try {
      return await this.readTile(tileId, signal)
    }
    catch (error) {
      // The archive was swapped for a new build mid-read. Drop everything
      // learned about the old one and try once more against the new one.
      if (!(error instanceof PMTilesChangedError))
        throw error
      this.clearCache()
      return this.readTile(tileId, signal)
    }
  }

  /** Decompressed bytes for `z/x/y`, or `undefined`. */
  async getTileData(z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array | undefined> {
    const tile = await this.getTile(z, x, y, signal)
    if (!tile)
      return undefined
    return this.decompress(tile.data, tile.compression)
  }

  /** Undo `compression` with this reader's decompressor. */
  async decompressBytes(bytes: Uint8Array, compression: CompressionCode): Promise<Uint8Array> {
    return this.decompress(bytes, compression)
  }

  async close(): Promise<void> {
    this.clearCache()
    await this.source.close?.()
  }

  // ---------- internals ----------

  private open(signal?: AbortSignal): Promise<Opened> {
    this.opened ??= this.readRoot(signal).catch((error) => {
      // Never memoise a failure: a flaky network on first open must not
      // poison the reader for the life of the process.
      this.opened = undefined
      throw error
    })
    return this.opened
  }

  private async readRoot(signal?: AbortSignal): Promise<Opened> {
    const first = await this.source.getBytes(0, PMTILES_ROOT_FETCH_LENGTH, signal)
    const bytes = first.data
    const header = parseHeader(bytes)

    const rootEnd = header.rootDirectoryOffset + header.rootDirectoryLength
    let rootBytes: Uint8Array
    if (rootEnd <= bytes.length) {
      rootBytes = bytes.subarray(header.rootDirectoryOffset, rootEnd)
    }
    else {
      // Out of spec (root must sit in the first 16 KiB), but cheap to tolerate.
      rootBytes = (await this.read(header.rootDirectoryOffset, header.rootDirectoryLength, first.etag, signal)).data
    }
    const root = decodeDirectory(await this.decompress(rootBytes, header.internalCompression))
    const version = await shortHash([bytes.subarray(0, PMTILES_HEADER_LENGTH), rootBytes, first.etag])
    return { header, root, etag: first.etag, version }
  }

  private async read(offset: number, length: number, etag: string | undefined, signal?: AbortSignal): Promise<RangeResponse> {
    const result = await this.source.getBytes(offset, length, signal, etag)
    if (result.data.length < length)
      throw new PMTilesFormatError(`PMTiles: ${this.source.getKey()} is truncated (wanted ${length} bytes at ${offset}, got ${result.data.length})`)
    return result
  }

  private async loadMetadata(signal?: AbortSignal): Promise<Record<string, unknown>> {
    const { header, etag } = await this.open(signal)
    if (header.metadataLength === 0)
      return {}
    const { data } = await this.read(header.metadataOffset, header.metadataLength, etag, signal)
    const text = new TextDecoder().decode(await this.decompress(data, header.internalCompression))
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new PMTilesFormatError('PMTiles: metadata is not a JSON object')
    return parsed as Record<string, unknown>
  }

  private leaf(opened: Opened, offset: number, length: number, signal?: AbortSignal): Promise<Entry[]> {
    const cached = this.directories.get(offset)
    if (cached) {
      // Refresh LRU position.
      this.directories.delete(offset)
      this.directories.set(offset, cached)
      return cached
    }
    const loading = (async () => {
      const { data } = await this.read(offset, length, opened.etag, signal)
      return decodeDirectory(await this.decompress(data, opened.header.internalCompression))
    })()
    loading.catch(() => this.directories.delete(offset))
    this.directories.set(offset, loading)
    while (this.directories.size > this.cacheSize)
      this.directories.delete(this.directories.keys().next().value!)
    return loading
  }

  private async readTile(tileId: number, signal?: AbortSignal): Promise<PMTilesTile | undefined> {
    const opened = await this.open(signal)
    const { header } = opened
    let entries = opened.root

    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const entry = findTile(entries, tileId)
      if (!entry)
        return undefined
      if (entry.runLength > 0) {
        const offset = header.tileDataOffset + entry.offset
        const { data } = await this.read(offset, entry.length, opened.etag, signal)
        return { data, compression: header.tileCompression, tileId, offset }
      }
      entries = await this.leaf(opened, header.leafDirectoryOffset + entry.offset, entry.length, signal)
    }
    throw new PMTilesFormatError(`PMTiles: directory nesting deeper than ${MAX_DEPTH} levels in ${this.source.getKey()}`)
  }
}
