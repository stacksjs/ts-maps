/**
 * Cache-first fetch helper for tile bytes. Returns cached entries when
 * available; on cache miss, fetches and writes through (unless `noStore`).
 * `forceNetwork` opts back into a network round-trip but still falls back
 * to the cache if the network attempt rejects (offline mode).
 */
import type { TileCache } from './TileCache'

export interface CachedFetchOptions {
  cache: TileCache
  signal?: AbortSignal
  /** Skip writing the response to the cache. */
  noStore?: boolean
  /** Bypass the cache lookup; still falls back on network failure. */
  forceNetwork?: boolean
}

export interface CachedFetchResult {
  data: Uint8Array
  mime: string
  fromCache: boolean
}

function abortError(): Error {
  const err = new Error('The operation was aborted.')
  err.name = 'AbortError'
  return err
}

export async function cachedFetch(
  url: string,
  options: CachedFetchOptions,
): Promise<CachedFetchResult> {
  const { cache, signal, noStore, forceNetwork } = options

  if (signal?.aborted)
    throw abortError()

  if (!forceNetwork) {
    const cached = await cache.get(url)
    if (cached) {
      return { data: cached.data, mime: cached.mime, fromCache: true }
    }
  }

  try {
    const res = await fetch(url, { signal })
    const buf = new Uint8Array(await res.arrayBuffer())
    const mime = res.headers.get('content-type') ?? 'application/octet-stream'
    if (!noStore)
      await cache.put(url, buf, mime)
    return { data: buf, mime, fromCache: false }
  }
  catch (err) {
    // Honour aborts immediately — fetch's AbortError already has the right
    // shape, but tests may stub fetch with a generic rejection while
    // pre-aborting the signal. Surface AbortError consistently.
    if (signal?.aborted)
      throw abortError()
    // Network failed: fall back to whatever's already in the cache.
    const cached = await cache.get(url)
    if (cached)
      return { data: cached.data, mime: cached.mime, fromCache: true }
    throw err
  }
}
