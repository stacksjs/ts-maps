/**
 * Process-wide default `TileCache` singleton. Split into its own module so
 * `cachedFetch` and `offlineRegion` can both rely on the same instance
 * without creating a circular import through the storage barrel.
 */
import { TileCache } from './TileCache'

let _instance: TileCache | undefined

export function getDefaultCache(): TileCache {
  if (!_instance)
    _instance = new TileCache()
  return _instance
}

export async function resetDefaultCache(): Promise<void> {
  if (_instance) {
    await _instance.close()
    _instance = undefined
  }
}
