// ts-maps/pmtiles — read (and write) PMTiles v3 archives, zero dependencies.
//
//   const archive = new PMTiles('https://cdn.example.com/basemap.pmtiles')
//   const header = await archive.getHeader()
//   const bytes = await archive.getTileData(14, 2620, 6332)
//
// In a style, `pmtiles://https://…/planet.pmtiles` as a vector source's `url`
// (or `tiles[0]`) reads the archive directly; see `protocol.ts`.
//
// Runs anywhere `fetch` does. Local files, private S3 / R2 buckets and the
// HTTP tile server live in `ts-maps/server`.

export { compressionName, defaultDecompress, gzip, isGzipped } from './compression'
export type { Decompressor } from './compression'
export { decodeDirectory, encodeDirectory, findTile } from './directory'
export type { Entry } from './directory'
export {
  Compression,
  parseHeader,
  PMTILES_HEADER_LENGTH,
  PMTILES_ROOT_FETCH_LENGTH,
  PMTilesFormatError,
  serializeHeader,
  TileType,
  tileTypeContentType,
  tileTypeExtension,
} from './header'
export type { CompressionCode, PMTilesHeader, TileTypeCode } from './header'
export { PMTiles } from './PMTiles'
export type { PMTilesOptions, PMTilesTile } from './PMTiles'
export {
  clearPMTilesArchives,
  getPMTilesArchive,
  isPMTilesUrl,
  parsePMTilesTileUrl,
  PMTILES_PROTOCOL,
  pmtilesArchiveUrl,
  pmtilesFetch,
  pmtilesSourceUrl,
  pmtilesTileJSON,
  pmtilesTileUrl,
  readPMTilesTile,
  setPMTilesArchive,
  withPMTiles,
} from './protocol'
export type { PMTilesArchiveOptions, PMTilesFetch, PMTilesTileJSON } from './protocol'
export { BytesSource, FetchSource, PMTilesChangedError } from './sources'
export type { FetchLike, FetchSourceOptions, RangeResponse, Source } from './sources'
export { PMTILES_MAX_ZOOM, tileBounds, tileIdToZxy, zxyToTileId } from './tileid'
export { writePMTiles } from './writer'
export type { PMTilesWriteTile, WritePMTilesOptions } from './writer'
