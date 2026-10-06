// PMTiles v3 header — in-house, zero-dep.
// Independent TypeScript implementation of the 127-byte header described in
// https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md.
//
// An archive is five sections laid end to end, and the header is the map:
//
//   ┌────────┬──────────────┬──────────┬─────────────────┬───────────┐
//   │ header │ root         │ metadata │ leaf            │ tile data │
//   │ 127 B  │ directory    │ (JSON)   │ directories     │           │
//   └────────┴──────────────┴──────────┴─────────────────┴───────────┘
//
// The spec requires header + root directory to fit in the first 16 KiB, so a
// reader can open an archive with a single ranged request and already know
// where every other section lives. Every offset is a little-endian uint64 from
// the start of the file; we read them as two uint32 halves and recombine, which
// is exact up to 2^53 bytes (8 PiB — the planet is ~120 GB).

export const PMTILES_HEADER_LENGTH = 127

/** How much a reader fetches up front: the header plus the whole root directory. */
export const PMTILES_ROOT_FETCH_LENGTH = 16_384

/** Compression applied to directories / metadata (internal) or to tile bodies. */
export const Compression = {
  Unknown: 0,
  None: 1,
  Gzip: 2,
  Brotli: 3,
  Zstd: 4,
} as const
export type CompressionCode = typeof Compression[keyof typeof Compression]

/** What the tile bodies are. */
export const TileType = {
  Unknown: 0,
  Mvt: 1,
  Png: 2,
  Jpeg: 3,
  Webp: 4,
  Avif: 5,
} as const
export type TileTypeCode = typeof TileType[keyof typeof TileType]

export interface PMTilesHeader {
  specVersion: number
  rootDirectoryOffset: number
  rootDirectoryLength: number
  metadataOffset: number
  metadataLength: number
  leafDirectoryOffset: number
  leafDirectoryLength: number
  tileDataOffset: number
  tileDataLength: number
  /** Tiles a client can ask for (a run of N identical ocean tiles counts N). */
  numAddressedTiles: number
  /** Directory entries pointing at tile data (a run counts 1). */
  numTileEntries: number
  /** Distinct tile bodies actually stored (deduplicated). */
  numTileContents: number
  /** Tile data is written in tile-id order, so neighbours share byte ranges. */
  clustered: boolean
  internalCompression: CompressionCode
  tileCompression: CompressionCode
  tileType: TileTypeCode
  minZoom: number
  maxZoom: number
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
  centerZoom: number
  centerLon: number
  centerLat: number
}

const MAGIC = [0x50, 0x4D, 0x54, 0x69, 0x6C, 0x65, 0x73] // "PMTiles"
const TWO_32 = 2 ** 32

function getUint64(view: DataView, pos: number): number {
  const lo = view.getUint32(pos, true)
  const hi = view.getUint32(pos + 4, true)
  const value = hi * TWO_32 + lo
  if (value > Number.MAX_SAFE_INTEGER)
    throw new RangeError('PMTiles: 64-bit header field exceeds 2^53')
  return value
}

function setUint64(view: DataView, pos: number, value: number): void {
  view.setUint32(pos, value % TWO_32, true)
  view.setUint32(pos + 4, Math.floor(value / TWO_32), true)
}

/** Thrown for bytes that are not a PMTiles v3 archive. */
export class PMTilesFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PMTilesFormatError'
  }
}

/**
 * Parse the 127-byte header at the start of `bytes`. Positions are absolute,
 * as laid out in the spec's header table. Rejects v1/v2 archives (a different
 * layout entirely) with a message that says so instead of returning garbage.
 */
export function parseHeader(bytes: Uint8Array): PMTilesHeader {
  if (bytes.length < PMTILES_HEADER_LENGTH)
    throw new PMTilesFormatError(`PMTiles: header needs ${PMTILES_HEADER_LENGTH} bytes, got ${bytes.length}`)
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) {
      // v1/v2 archives start with "PM" + a uint16 version instead.
      if (bytes[0] === 0x50 && bytes[1] === 0x4D && bytes[2] < 3)
        throw new PMTilesFormatError(`PMTiles: spec version ${bytes[2]} archives are not supported, convert with \`pmtiles convert\``)
      throw new PMTilesFormatError('PMTiles: missing "PMTiles" magic, this is not a PMTiles archive')
    }
  }
  const specVersion = bytes[7]!
  if (specVersion !== 3)
    throw new PMTilesFormatError(`PMTiles: spec version ${specVersion} is not supported (expected 3)`)

  const view = new DataView(bytes.buffer, bytes.byteOffset, PMTILES_HEADER_LENGTH)
  const e7 = (pos: number): number => view.getInt32(pos, true) / 1e7

  return {
    specVersion,
    rootDirectoryOffset: getUint64(view, 8),
    rootDirectoryLength: getUint64(view, 16),
    metadataOffset: getUint64(view, 24),
    metadataLength: getUint64(view, 32),
    leafDirectoryOffset: getUint64(view, 40),
    leafDirectoryLength: getUint64(view, 48),
    tileDataOffset: getUint64(view, 56),
    tileDataLength: getUint64(view, 64),
    numAddressedTiles: getUint64(view, 72),
    numTileEntries: getUint64(view, 80),
    numTileContents: getUint64(view, 88),
    clustered: view.getUint8(96) === 1,
    internalCompression: view.getUint8(97) as CompressionCode,
    tileCompression: view.getUint8(98) as CompressionCode,
    tileType: view.getUint8(99) as TileTypeCode,
    minZoom: view.getUint8(100),
    maxZoom: view.getUint8(101),
    minLon: e7(102),
    minLat: e7(106),
    maxLon: e7(110),
    maxLat: e7(114),
    centerZoom: view.getUint8(118),
    centerLon: e7(119),
    centerLat: e7(123),
  }
}

/** Inverse of `parseHeader`; used by the writer. */
export function serializeHeader(header: PMTilesHeader): Uint8Array {
  const bytes = new Uint8Array(PMTILES_HEADER_LENGTH)
  bytes.set(MAGIC, 0)
  bytes[7] = 3
  const view = new DataView(bytes.buffer)
  const e7 = (pos: number, deg: number): void => view.setInt32(pos, Math.round(deg * 1e7), true)

  setUint64(view, 8, header.rootDirectoryOffset)
  setUint64(view, 16, header.rootDirectoryLength)
  setUint64(view, 24, header.metadataOffset)
  setUint64(view, 32, header.metadataLength)
  setUint64(view, 40, header.leafDirectoryOffset)
  setUint64(view, 48, header.leafDirectoryLength)
  setUint64(view, 56, header.tileDataOffset)
  setUint64(view, 64, header.tileDataLength)
  setUint64(view, 72, header.numAddressedTiles)
  setUint64(view, 80, header.numTileEntries)
  setUint64(view, 88, header.numTileContents)
  view.setUint8(96, header.clustered ? 1 : 0)
  view.setUint8(97, header.internalCompression)
  view.setUint8(98, header.tileCompression)
  view.setUint8(99, header.tileType)
  view.setUint8(100, header.minZoom)
  view.setUint8(101, header.maxZoom)
  e7(102, header.minLon)
  e7(106, header.minLat)
  e7(110, header.maxLon)
  e7(114, header.maxLat)
  view.setUint8(118, header.centerZoom)
  e7(119, header.centerLon)
  e7(123, header.centerLat)
  return bytes
}

/** File extension a tile of this type is served under. */
export function tileTypeExtension(type: TileTypeCode): string | undefined {
  switch (type) {
    case TileType.Mvt: return 'pbf'
    case TileType.Png: return 'png'
    case TileType.Jpeg: return 'jpg'
    case TileType.Webp: return 'webp'
    case TileType.Avif: return 'avif'
    default: return undefined
  }
}

/** `Content-Type` for a tile of this type. */
export function tileTypeContentType(type: TileTypeCode): string {
  switch (type) {
    case TileType.Mvt: return 'application/vnd.mapbox-vector-tile'
    case TileType.Png: return 'image/png'
    case TileType.Jpeg: return 'image/jpeg'
    case TileType.Webp: return 'image/webp'
    case TileType.Avif: return 'image/avif'
    default: return 'application/octet-stream'
  }
}
