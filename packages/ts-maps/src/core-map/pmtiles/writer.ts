// PMTiles v3 writer — in-house, zero-dep.
//
// Builds a complete, spec-conformant archive in memory from a list of tiles.
// It exists for tests (a reader is only as trustworthy as the fixtures it was
// tested against, and fixtures you can read in the test file beat binary blobs)
// and for small generated tilesets — an overlay, a region cut, a game board.
// Planet-scale archives come from planetiler / tippecanoe, which stream to
// disk; this holds everything in memory and is meant for megabytes, not
// gigabytes.
//
// What it does that a naive writer would not:
//
// - **Clustered.** Tile bodies are laid out in tile-id order, so the reader's
//   Hilbert locality turns into byte locality.
// - **Deduplicated.** Identical bodies are stored once; repeated ids point at
//   the same bytes, and *consecutive* ids with identical bodies collapse into a
//   single run-length entry.
// - **Leaf directories when needed.** If the directory will not fit in the
//   16 KiB root budget, entries are split into leaves and the root holds
//   pointers, growing the leaf size until the root fits — the same strategy as
//   the reference implementation.

import type { Entry } from './directory'
import type { CompressionCode, PMTilesHeader, TileTypeCode } from './header'
import { gzip, isGzipped } from './compression'
import { encodeDirectory } from './directory'
import { Compression, PMTILES_HEADER_LENGTH, PMTILES_ROOT_FETCH_LENGTH, serializeHeader, TileType } from './header'
import { tileBounds, zxyToTileId } from './tileid'

export interface PMTilesWriteTile {
  z: number
  x: number
  y: number
  /** Uncompressed tile body (already-gzipped bodies are detected and kept). */
  data: Uint8Array
}

export interface WritePMTilesOptions {
  tileType: TileTypeCode
  /** How tile bodies are stored. Default gzip for MVT, none for images. */
  tileCompression?: typeof Compression.None | typeof Compression.Gzip
  /** How directories + metadata are stored. Default gzip. */
  internalCompression?: typeof Compression.None | typeof Compression.Gzip
  /** JSON metadata: `name`, `attribution`, `vector_layers`, … */
  metadata?: Record<string, unknown>
  /** `[west, south, east, north]`. Default: the extent of the highest-zoom tiles. */
  bounds?: [number, number, number, number]
  /** `[lon, lat, zoom]`. Default: middle of `bounds` at the lowest zoom. */
  center?: [number, number, number]
  /**
   * Entries per leaf directory. Default: none while the root fits in 16 KiB,
   * otherwise chosen automatically. Set it to force leaves (tests do).
   */
  leafSize?: number
}

// FNV-1a over the bytes, plus the length: a cheap bucket key. Collisions are
// resolved by a byte comparison, so a bad hash costs speed, never correctness.
function contentKey(bytes: Uint8Array): string {
  let h = 0x811C9DC5
  for (let i = 0; i < bytes.length; i++)
    h = Math.imul(h ^ bytes[i]!, 0x01000193)
  return `${bytes.length}:${h >>> 0}`
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length)
    return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i])
      return false
  }
  return true
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** Encode, then compress, one directory. */
async function packDirectory(entries: readonly Entry[], compression: CompressionCode): Promise<Uint8Array> {
  const raw = encodeDirectory(entries)
  return compression === Compression.Gzip ? gzip(raw) : raw
}

/** Split entries into leaves of `leafSize`; the root points at each leaf. */
async function packWithLeaves(entries: readonly Entry[], leafSize: number, compression: CompressionCode): Promise<{ root: Uint8Array, leaves: Uint8Array }> {
  const rootEntries: Entry[] = []
  const leaves: Uint8Array[] = []
  let offset = 0
  for (let i = 0; i < entries.length; i += leafSize) {
    const chunk = entries.slice(i, i + leafSize)
    const packed = await packDirectory(chunk, compression)
    rootEntries.push({ tileId: chunk[0]!.tileId, offset, length: packed.length, runLength: 0 })
    leaves.push(packed)
    offset += packed.length
  }
  return { root: await packDirectory(rootEntries, compression), leaves: concat(leaves) }
}

/** The root alone if it fits the 16 KiB budget, otherwise root + leaves. */
async function packDirectories(entries: readonly Entry[], compression: CompressionCode, leafSize?: number): Promise<{ root: Uint8Array, leaves: Uint8Array }> {
  if (leafSize)
    return packWithLeaves(entries, leafSize, compression)
  const rootBudget = PMTILES_ROOT_FETCH_LENGTH - PMTILES_HEADER_LENGTH
  const root = await packDirectory(entries, compression)
  if (root.length <= rootBudget)
    return { root, leaves: new Uint8Array(0) }
  for (let size = 4096; ; size *= 2) {
    const packed = await packWithLeaves(entries, size, compression)
    if (packed.root.length <= rootBudget)
      return packed
  }
}

/** Write a PMTiles v3 archive. Resolves to the archive's bytes. */
export async function writePMTiles(tiles: readonly PMTilesWriteTile[], options: WritePMTilesOptions): Promise<Uint8Array> {
  if (tiles.length === 0)
    throw new Error('PMTiles: cannot write an archive with no tiles')

  const internalCompression = options.internalCompression ?? Compression.Gzip
  const tileCompression = options.tileCompression ?? (options.tileType === TileType.Mvt ? Compression.Gzip : Compression.None)

  // 1. Order by tile id; reject duplicates rather than silently picking one.
  const sorted = tiles
    .map(tile => ({ tile, id: zxyToTileId(tile.z, tile.x, tile.y) }))
    .sort((a, b) => a.id - b.id)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.id === sorted[i - 1]!.id) {
      const { z, x, y } = sorted[i]!.tile
      throw new Error(`PMTiles: tile ${z}/${x}/${y} was given twice`)
    }
  }

  // 2. Compress + deduplicate bodies, laying them out in id order, and build
  //    entries, merging consecutive ids that share a body into one run.
  const bodies: Uint8Array[] = []
  const seen = new Map<string, Array<{ bytes: Uint8Array, offset: number }>>()
  const entries: Entry[] = []
  let dataLength = 0
  for (const { tile, id } of sorted) {
    const stored = tileCompression === Compression.Gzip && !isGzipped(tile.data) ? await gzip(tile.data) : tile.data
    const key = contentKey(stored)
    const bucket = seen.get(key) ?? []
    let offset = bucket.find(b => sameBytes(b.bytes, stored))?.offset
    if (offset === undefined) {
      offset = dataLength
      bodies.push(stored)
      dataLength += stored.length
      bucket.push({ bytes: stored, offset })
      seen.set(key, bucket)
    }

    const last = entries[entries.length - 1]
    if (last && last.offset === offset && last.tileId + last.runLength === id)
      last.runLength++
    else
      entries.push({ tileId: id, offset, length: stored.length, runLength: 1 })
  }

  // 3. Directories: everything in the root if it fits, otherwise leaves.
  const { root, leaves } = await packDirectories(entries, internalCompression, options.leafSize)

  const metadataRaw = new TextEncoder().encode(JSON.stringify(options.metadata ?? {}))
  const metadata = internalCompression === Compression.Gzip ? await gzip(metadataRaw) : metadataRaw

  // 4. Bounds / center / zooms, derived from the tiles unless given.
  const zooms = sorted.map(s => s.tile.z)
  const minZoom = Math.min(...zooms)
  const maxZoom = Math.max(...zooms)
  let bounds = options.bounds
  if (!bounds) {
    bounds = [180, 90, -180, -90]
    for (const { tile } of sorted) {
      if (tile.z !== maxZoom)
        continue
      const [w, s, e, n] = tileBounds(tile.z, tile.x, tile.y)
      bounds = [Math.min(bounds[0], w), Math.min(bounds[1], s), Math.max(bounds[2], e), Math.max(bounds[3], n)]
    }
  }
  const center = options.center ?? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2, minZoom]

  // 5. Lay out: header | root | metadata | leaves | tile data.
  const rootOffset = PMTILES_HEADER_LENGTH
  const metadataOffset = rootOffset + root.length
  const leafOffset = metadataOffset + metadata.length
  const dataOffset = leafOffset + leaves.length

  const header: PMTilesHeader = {
    specVersion: 3,
    rootDirectoryOffset: rootOffset,
    rootDirectoryLength: root.length,
    metadataOffset,
    metadataLength: metadata.length,
    leafDirectoryOffset: leafOffset,
    leafDirectoryLength: leaves.length,
    tileDataOffset: dataOffset,
    tileDataLength: dataLength,
    numAddressedTiles: entries.reduce((n, e) => n + e.runLength, 0),
    numTileEntries: entries.length,
    numTileContents: bodies.length,
    clustered: true,
    internalCompression,
    tileCompression,
    tileType: options.tileType,
    minZoom,
    maxZoom,
    minLon: bounds[0],
    minLat: bounds[1],
    maxLon: bounds[2],
    maxLat: bounds[3],
    centerZoom: center[2],
    centerLon: center[0],
    centerLat: center[1],
  }

  return concat([serializeHeader(header), root, metadata, leaves, ...bodies])
}
