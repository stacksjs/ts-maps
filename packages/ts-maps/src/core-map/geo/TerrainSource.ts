// TerrainSource — holds decoded DEM tiles for an active `setTerrain()`
// configuration and provides fast elevation queries for arbitrary
// `LatLng`s. Works purely in-memory: tiles are inserted by the loader
// (either the map's raster-dem source adapter or the caller directly for
// tests) and looked up by `zoom` / `x` / `y`.
//
// The class is intentionally decoupled from the tile loader — the map
// integration wires real HTTP/IndexedDB fetches, while tests inject
// synthetic elevation grids.

import { decodeElevationGrid, sampleElevationBilinear, type DEMEncoding } from './elevation'

export interface TerrainSourceOptions {
  /** DEM tile side length in pixels. Default 256. */
  demSize?: number
  /** RGB → metres decoder. Default 'mapbox'. */
  encoding?: DEMEncoding
  /** Mesh resolution passed through to `buildTerrainMesh`. Default 32. */
  meshResolution?: number
  /** Vertical exaggeration. Default 1. */
  exaggeration?: number
}

export interface TileCoord {
  z: number
  x: number
  y: number
}

/**
 * Stores decoded DEM tiles keyed on `"z/x/y"` and serves elevation
 * queries. Thread-safe with respect to async add/remove — the underlying
 * Map is the only mutable state.
 */
export class TerrainSource {
  declare _tiles: Map<string, Float32Array>
  declare _opts: Required<TerrainSourceOptions>

  constructor(opts?: TerrainSourceOptions) {
    this._tiles = new Map()
    this._opts = {
      demSize: opts?.demSize ?? 256,
      encoding: opts?.encoding ?? 'mapbox',
      meshResolution: opts?.meshResolution ?? 32,
      exaggeration: opts?.exaggeration ?? 1,
    }
  }

  get demSize(): number {
    return this._opts.demSize
  }

  get encoding(): DEMEncoding {
    return this._opts.encoding
  }

  get meshResolution(): number {
    return this._opts.meshResolution
  }

  get exaggeration(): number {
    return this._opts.exaggeration
  }

  setExaggeration(v: number): void {
    if (!Number.isFinite(v))
      throw new RangeError('exaggeration must be a finite number')
    this._opts.exaggeration = v
  }

  /**
   * Ingest a raw RGBA pixel buffer for a DEM tile. The buffer is decoded
   * through the configured encoding and stored as a `Float32Array` of
   * elevations in metres.
   */
  addTilePixels(coord: TileCoord, pixels: Uint8Array | Uint8ClampedArray): void {
    const expected = this._opts.demSize * this._opts.demSize * 4
    if (pixels.length < expected)
      throw new RangeError(`pixel buffer too small: got ${pixels.length}, need ${expected}`)
    this._tiles.set(key(coord), decodeElevationGrid(pixels, this._opts.encoding))
  }

  /** Ingest a pre-decoded elevation grid (metres). Used by tests and workers. */
  addTileElevation(coord: TileCoord, elevation: Float32Array): void {
    const expected = this._opts.demSize * this._opts.demSize
    if (elevation.length < expected)
      throw new RangeError(`elevation grid too small: got ${elevation.length}, need ${expected}`)
    this._tiles.set(key(coord), elevation)
  }

  hasTile(coord: TileCoord): boolean {
    return this._tiles.has(key(coord))
  }

  getTile(coord: TileCoord): Float32Array | undefined {
    return this._tiles.get(key(coord))
  }

  deleteTile(coord: TileCoord): void {
    this._tiles.delete(key(coord))
  }

  clear(): void {
    this._tiles.clear()
  }

  size(): number {
    return this._tiles.size
  }

  /**
   * Return elevation in metres at the given lng/lat, preferring the tile
   * whose zoom matches `preferredZoom` and walking up the pyramid if it
   * isn't loaded. Returns `null` when no suitable tile is available.
   *
   * Latitudes above the Web-Mercator cut-off (±85.0511°) clamp to the
   * pole row and return that sample — matches how tile services handle
   * the same input.
   */
  queryElevation(lng: number, lat: number, preferredZoom: number): number | null {
    const latC = clamp(lat, -85.05112878, 85.05112878)
    const startZ = Math.max(0, Math.floor(preferredZoom))
    for (let z = startZ; z >= 0; z--) {
      const tx = lngToTileX(lng, z)
      const ty = latToTileY(latC, z)
      const tile = this._tiles.get(key({ z, x: tx, y: ty }))
      if (!tile)
        continue
      const pxX = lngToPixel(lng, z) - tx * this._opts.demSize
      const pxY = latToPixel(latC, z) - ty * this._opts.demSize
      return sampleElevationBilinear(tile, this._opts.demSize, pxX, pxY)
    }
    return null
  }
}

// ---------------------------------------------------------------------------
// Slippy-map tile math (Web Mercator). Shared conventions with offlineRegion.
// ---------------------------------------------------------------------------

function key(c: TileCoord): string {
  return `${c.z}/${c.x}/${c.y}`
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z)
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z)
}

function lngToPixel(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z * 256
}

function latToPixel(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z * 256
}
