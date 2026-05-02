/**
 * Offline-region downloader. `computeTileCoords` enumerates the tile pyramid
 * for a bbox × zoom range; `saveOfflineRegion` walks that set with bounded
 * concurrency, populating a `TileCache` and emitting progress events.
 */
import type { TileCache } from './TileCache'
import { cachedFetch } from './cachedFetch'
import { getDefaultCache } from './defaultCache'

export type Bounds =
  | { west: number, south: number, east: number, north: number }
  | readonly [west: number, south: number, east: number, north: number]

export interface TileCoord {
  x: number
  y: number
  z: number
}

export interface ProgressEmitter {
  fire: (type: string, data?: Record<string, unknown>) => unknown
}

export interface OfflineRegionOptions {
  bounds: Bounds
  zoomRange: readonly [number, number]
  /** URL template containing `{z}`, `{x}`, `{y}` placeholders. */
  tileUrl: string
  /** Cache to populate. Defaults to the shared `getDefaultCache()`. */
  cache?: TileCache
  /** Concurrent in-flight requests. Default: 4. */
  concurrency?: number
  /** Optional AbortSignal — propagated into per-tile fetches. */
  signal?: AbortSignal
}

export interface OfflineRegionResult {
  saved: number
  failed: number
  skipped: number
}

function normalizeBounds(b: Bounds): { west: number, south: number, east: number, north: number } {
  if (Array.isArray(b))
    return { west: b[0], south: b[1], east: b[2], north: b[3] }
  return b as { west: number, south: number, east: number, north: number }
}

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z)
}

function clampTile(v: number, z: number): number {
  const max = 2 ** z - 1
  if (v < 0) return 0
  if (v > max) return max
  return v
}

export function computeTileCoords(
  bounds: Bounds,
  zoomRange: readonly [number, number],
): TileCoord[] {
  const { west, south, east, north } = normalizeBounds(bounds)
  const [zMin, zMax] = zoomRange
  const out: TileCoord[] = []
  for (let z = zMin; z <= zMax; z++) {
    const x0 = clampTile(lonToTileX(Math.min(west, east), z), z)
    const x1 = clampTile(lonToTileX(Math.max(west, east), z), z)
    // Note: tile-Y is inverted relative to lat — north → smaller Y.
    const y0 = clampTile(latToTileY(Math.max(south, north), z), z)
    const y1 = clampTile(latToTileY(Math.min(south, north), z), z)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        out.push({ x, y, z })
      }
    }
  }
  return out
}

function fillTileUrl(tmpl: string, c: TileCoord): string {
  return tmpl.replace('{z}', String(c.z)).replace('{x}', String(c.x)).replace('{y}', String(c.y))
}

export async function saveOfflineRegion(
  options: OfflineRegionOptions,
  emitter?: ProgressEmitter,
): Promise<OfflineRegionResult> {
  const cache = options.cache ?? getDefaultCache()
  const concurrency = Math.max(1, options.concurrency ?? 4)
  const coords = computeTileCoords(options.bounds, options.zoomRange)
  const total = coords.length
  const result: OfflineRegionResult = { saved: 0, failed: 0, skipped: 0 }

  let cursor = 0
  let completed = 0

  async function worker(): Promise<void> {
    while (cursor < coords.length) {
      const idx = cursor++
      const c = coords[idx]
      const url = fillTileUrl(options.tileUrl, c)
      try {
        const res = await cachedFetch(url, { cache, signal: options.signal })
        if (res.fromCache)
          result.skipped++
        else
          result.saved++
      }
      catch {
        result.failed++
      }
      completed++
      emitter?.fire('offline:progress', { completed, total, coord: c })
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(concurrency, coords.length); i++)
    workers.push(worker())
  await Promise.all(workers)

  return result
}
