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
  /**
   * How many decoded tiles to keep. Each is a quarter of a megabyte at 256
   * px; past this many the oldest goes, so a long session of panning does
   * not hold every tile it ever saw. Default 512.
   */
  maxTiles?: number
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
  /**
   * Bumped whenever a tile comes or goes, so whatever caches heights read
   * from here (the terrain mesh, the lift under a label) knows to read again.
   */
  version = 0
  // The last tile `sampleWorld` resolved, by the tile it started from. Heights
  // are asked for in runs over neighbouring points — every vertex of a mesh
  // patch, every point of a street name — so this answers most of them
  // without building a key string or walking the pyramid.
  _memo: { version: number, z: number, x: number, y: number, hit: { tile: Float32Array, z: number, x: number, y: number } | null } | null = null

  constructor(opts?: TerrainSourceOptions) {
    this._tiles = new Map()
    this._opts = {
      demSize: opts?.demSize ?? 256,
      encoding: opts?.encoding ?? 'mapbox',
      meshResolution: opts?.meshResolution ?? 32,
      exaggeration: opts?.exaggeration ?? 1,
      maxTiles: opts?.maxTiles ?? 512,
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
    this._store(coord, decodeElevationGrid(pixels, this._opts.encoding))
  }

  /** Ingest a pre-decoded elevation grid (metres). Used by tests and workers. */
  addTileElevation(coord: TileCoord, elevation: Float32Array): void {
    const expected = this._opts.demSize * this._opts.demSize
    if (elevation.length < expected)
      throw new RangeError(`elevation grid too small: got ${elevation.length}, need ${expected}`)
    this._store(coord, elevation)
  }

  _store(coord: TileCoord, elevation: Float32Array): void {
    const k = key(coord)
    // Re-inserted, so it counts as the newest.
    this._tiles.delete(k)
    this._tiles.set(k, elevation)
    while (this._tiles.size > this._opts.maxTiles) {
      const oldest = this._tiles.keys().next().value as string
      this._tiles.delete(oldest)
    }
    this.version++
  }

  hasTile(coord: TileCoord): boolean {
    return this._tiles.has(key(coord))
  }

  getTile(coord: TileCoord): Float32Array | undefined {
    return this._tiles.get(key(coord))
  }

  deleteTile(coord: TileCoord): void {
    this._tiles.delete(key(coord))
    this.version++
  }

  clear(): void {
    this._tiles.clear()
    this.version++
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
    const fx = (lng + 180) / 360
    const fy = (1 - Math.log(Math.tan(latC * Math.PI / 180) + 1 / Math.cos(latC * Math.PI / 180)) / Math.PI) / 2
    return this.sampleWorld(fx, fy, preferredZoom)
  }

  /**
   * Elevation in metres at a point given as a fraction of the Web Mercator
   * world: `fx` west to east, `fy` north to south, each 0 to 1. The same
   * answer as `queryElevation`, without the trigonometry, for callers that
   * already work in Mercator — the terrain mesh, and the lift under every
   * label.
   *
   * A tile's samples are taken at its pixels' centres, so neighbouring tiles
   * meet halfway between their edge pixels rather than one pixel apart.
   */
  sampleWorld(fx: number, fy: number, preferredZoom: number): number | null {
    const x = fx - Math.floor(fx)
    const y = clamp(fy, 0, 1 - 1e-12)
    const startZ = Math.max(0, Math.floor(preferredZoom))
    const n = 2 ** startZ
    const sx = Math.min(n - 1, Math.floor(x * n))
    const sy = Math.min(n - 1, Math.floor(y * n))

    let memo = this._memo
    if (!memo || memo.version !== this.version || memo.z !== startZ || memo.x !== sx || memo.y !== sy) {
      memo = this._memo = { version: this.version, z: startZ, x: sx, y: sy, hit: null }
      // Walking up from the preferred tile, every ancestor covers it whole,
      // so the one found answers for any point in the starting tile.
      for (let z = startZ; z >= 0; z--) {
        const f = 2 ** (startZ - z)
        const tx = Math.floor(sx / f)
        const ty = Math.floor(sy / f)
        const tile = this._tiles.get(key({ z, x: tx, y: ty }))
        if (tile) {
          memo.hit = { tile, z, x: tx, y: ty }
          break
        }
      }
    }
    const hit = memo.hit
    if (!hit)
      return null
    const size = this._opts.demSize
    const m = 2 ** hit.z
    return sampleElevationBilinear(hit.tile, size, (x * m - hit.x) * size - 0.5, (y * m - hit.y) * size - 0.5)
  }
}

// ---------------------------------------------------------------------------
// Helpers. Tiles are keyed `z/x/y`, the slippy-map convention offlineRegion
// shares.
// ---------------------------------------------------------------------------

function key(c: TileCoord): string {
  return `${c.z}/${c.x}/${c.y}`
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
