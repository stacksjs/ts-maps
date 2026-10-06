// Reading a PMTiles archive out of an R2 bucket from inside a Cloudflare Worker.
//
// A Worker reaches R2 through a *binding*, not HTTP: `env.TILES.get(key, {
// range })` is a call into the same data centre, with no TLS, no public URL and
// no egress. `R2Source` wraps one archive in that binding as a pmtiles
// `Source`, so the ordinary `PMTiles` reader (header, directories, tiles) runs
// on top of it unchanged.
//
// The R2 types come from `./types`: the slice of `@cloudflare/workers-types`
// this entry touches, declared locally.

import type { RangeResponse, Source } from '../core-map/pmtiles/sources'
import type { R2Bucket, R2Object, R2ObjectBody, WorkerCache } from './types'
import { parseHeader, PMTILES_HEADER_LENGTH } from '../core-map/pmtiles/header'
import { PMTilesChangedError } from '../core-map/pmtiles/sources'

/** The bucket has no object under the archive's key. */
export class ArchiveNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`PMTiles: no archive at ${key}`)
    this.name = 'ArchiveNotFoundError'
  }
}

/** True when an R2 `get` came back with bytes (its precondition, if any, held). */
export function hasBody(object: R2Object | R2ObjectBody): object is R2ObjectBody {
  return 'body' in object && object.body != null
}

export interface R2SourceOptions {
  /**
   * Cache API cache to keep leaf directories in, so a fresh isolate (Workers
   * start many, and each forgets everything) finds them at the edge instead
   * of in R2. Default: none.
   */
  cache?: WorkerCache
  /**
   * URL prefix for those cache entries. Cache API keys are URLs, and should
   * sit on the zone the Worker serves, e.g. `https://tiles.example.com/__pmtiles`.
   */
  cacheKeyPrefix?: string
}

/** Leaf directories are immutable for an archive build: keep them a year. */
const DIRECTORY_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/**
 * One PMTiles archive in an R2 bucket, read through the Worker binding.
 *
 * Each `getBytes` is one ranged `bucket.get`. Reads made against a known
 * archive identity carry `onlyIf: { etagMatches }`, so an archive overwritten
 * in place answers without a body instead of with bytes from the wrong build,
 * which surfaces as `PMTilesChangedError` and makes the reader reload.
 *
 * With a `cache`, reads inside the archive's leaf-directory section are also
 * stored in the Cache API, keyed on the archive's ETag (so a rebuilt archive
 * can never be answered from an old build's directories). The section's
 * bounds come from the header, which this source parses as it passes through
 * on the first read. Tile reads are not stored here: the Worker caches whole
 * tile responses, which is the cheaper hit.
 */
export class R2Source implements Source {
  readonly key: string
  private readonly bucket: R2Bucket
  private readonly cache?: WorkerCache
  private readonly cacheKeyPrefix: string
  private leafSection?: { start: number, end: number }
  // Cache writes not yet handed to a request's `ctx.waitUntil`. A Worker may
  // cancel promises left floating after its response is sent, so the request
  // that triggered a write collects it with `takePending()`.
  private pending: Promise<unknown>[] = []

  constructor(bucket: R2Bucket, key: string, options: R2SourceOptions = {}) {
    this.bucket = bucket
    this.key = key
    this.cache = options.cache
    this.cacheKeyPrefix = (options.cacheKeyPrefix ?? 'https://ts-maps.invalid/__pmtiles').replace(/\/+$/, '')
  }

  getKey(): string {
    return this.key
  }

  /** Cache writes started since the last call, for `ctx.waitUntil`. */
  takePending(): Promise<unknown>[] {
    const pending = this.pending
    this.pending = []
    return pending
  }

  // R2 reads cannot be aborted, so the signal is accepted and not used.
  // eslint-disable-next-line no-unused-vars
  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    const cacheKey = etag && this.cache && this.isLeafDirectory(offset, length)
      ? `${this.cacheKeyPrefix}/${encodeURIComponent(this.key)}/${encodeURIComponent(etag)}/${offset}-${length}`
      : undefined

    if (cacheKey) {
      const hit = await this.cache!.match(cacheKey)
      if (hit)
        return { data: new Uint8Array(await hit.arrayBuffer()), etag }
    }

    const object = await this.bucket.get(this.key, {
      range: { offset, length },
      onlyIf: etag ? { etagMatches: etag } : undefined,
    })
    if (!object)
      throw new ArchiveNotFoundError(this.key)
    // No body means the precondition failed: the archive is not the build
    // the caller's header came from.
    if (!hasBody(object) || (etag && object.etag !== etag)) {
      if (hasBody(object))
        await object.body.cancel()
      throw new PMTilesChangedError(this.key)
    }

    const data = new Uint8Array(await object.arrayBuffer())
    if (offset === 0)
      this.learnLayout(data)
    if (cacheKey) {
      const response = new Response(data, {
        headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': DIRECTORY_CACHE_CONTROL },
      })
      this.pending.push(this.cache!.put(cacheKey, response).catch(() => {}))
    }
    return { data, etag: object.etag }
  }

  private learnLayout(bytes: Uint8Array): void {
    if (bytes.length < PMTILES_HEADER_LENGTH)
      return
    try {
      const header = parseHeader(bytes)
      this.leafSection = { start: header.leafDirectoryOffset, end: header.leafDirectoryOffset + header.leafDirectoryLength }
    }
    catch {
      // Not a PMTiles header; the reader will report that itself.
      this.leafSection = undefined
    }
  }

  private isLeafDirectory(offset: number, length: number): boolean {
    const section = this.leafSection
    return !!section && section.end > section.start && offset >= section.start && offset + length <= section.end
  }
}
