// Where a PMTiles archive's bytes come from.
//
// The reader never needs the whole file — only byte ranges: the first 16 KiB
// once, then a leaf directory now and then, then one range per tile. A `Source`
// is anything that can answer "give me bytes [offset, offset + length)". This
// file has the two that work in every runtime:
//
// - `FetchSource` — HTTP `Range` requests. Covers a file on any static host or
//   CDN, and S3 / R2 / GCS buckets through their public or presigned URLs.
// - `BytesSource` — an archive already in memory (tests, small bundled maps).
//
// Local files and private buckets live in the server entry point
// (`ts-maps/server`), which can use `node:fs` and Bun's S3 client.

/** One answered range read. */
export interface RangeResponse {
  data: Uint8Array
  /**
   * Identity of the archive version the bytes came from (an HTTP ETag, a
   * file's size + mtime). When it changes between reads the archive was
   * replaced, and directories cached from the old one are wrong.
   */
  etag?: string
}

export interface Source {
  /** A stable name for the archive (a URL or path), used in errors. */
  getKey: () => string
  /**
   * Read `length` bytes at `offset`. May return fewer bytes at end of file.
   * When `etag` is given and the archive's current identity differs, throw a
   * `PMTilesChangedError` so the reader can reload instead of mixing versions.
   */
  // eslint-disable-next-line no-unused-vars
  getBytes: (offset: number, length: number, signal?: AbortSignal, etag?: string) => Promise<RangeResponse>
  /** Release file handles / sockets. Optional. */
  close?: () => void | Promise<void>
}

/** The archive changed underneath an open reader. */
export class PMTilesChangedError extends Error {
  constructor(key: string) {
    super(`PMTiles: ${key} changed while it was being read`)
    this.name = 'PMTilesChangedError'
  }
}

export interface FetchSourceOptions {
  /** Extra request headers, e.g. `Authorization` for a private origin. */
  headers?: Record<string, string>
  /** Custom fetch (a signing wrapper, a test double). Default: global `fetch`. */
  fetch?: FetchLike
}

/** The slice of `fetch` a `FetchSource` uses. */
// eslint-disable-next-line no-unused-vars
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** Strong-compare two ETags, ignoring the weak `W/` prefix CDNs add. */
function sameEtag(a: string, b: string): boolean {
  return a.replace(/^W\//, '') === b.replace(/^W\//, '')
}

/**
 * Read an archive over HTTP with `Range: bytes=a-b`.
 *
 * Servers answer a range request one of three ways, and all three are handled:
 * `206 Partial Content` (the normal case), `200 OK` with the whole file (a host
 * that ignores `Range` — fine for a small archive, so we slice, and hopeless
 * for a big one, so we say so), or an error status.
 */
export class FetchSource implements Source {
  readonly url: string
  private readonly headers: Record<string, string>
  private readonly fetchImpl: FetchLike

  constructor(url: string, options: FetchSourceOptions = {}) {
    this.url = url
    this.headers = options.headers ?? {}
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
  }

  getKey(): string {
    return this.url
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    const response = await this.fetchImpl(this.url, {
      signal,
      headers: { ...this.headers, Range: `bytes=${offset}-${offset + length - 1}` },
    })

    const responseEtag = response.headers.get('ETag') ?? undefined
    if (etag && responseEtag && !sameEtag(etag, responseEtag)) {
      await response.body?.cancel()
      throw new PMTilesChangedError(this.url)
    }

    if (response.status === 206)
      return { data: new Uint8Array(await response.arrayBuffer()), etag: responseEtag }

    if (response.status === 200) {
      // The host ignored `Range` and is sending the whole archive. Refuse to
      // buffer something enormous on every tile request.
      const size = Number(response.headers.get('Content-Length') ?? Number.NaN)
      if (size > 64 * 1024 * 1024) {
        await response.body?.cancel()
        throw new Error(`PMTiles: ${this.url} ignores HTTP Range requests; serve it from a host that supports them`)
      }
      const whole = new Uint8Array(await response.arrayBuffer())
      return { data: whole.subarray(offset, offset + length), etag: responseEtag }
    }

    await response.body?.cancel()
    throw new Error(`PMTiles: ${this.url} answered HTTP ${response.status} for bytes ${offset}-${offset + length - 1}`)
  }
}

/** An archive held in memory. */
export class BytesSource implements Source {
  constructor(private readonly bytes: Uint8Array, private readonly key = 'memory') {}

  getKey(): string {
    return this.key
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: this.bytes.subarray(offset, offset + length) }
  }
}
