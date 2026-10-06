// Server-side archive sources: a local file, a private S3 / R2 object, and the
// helper that turns a string into the right one.
//
// These need `node:fs` or Bun's S3 client, which is why they live here and not
// next to the browser-safe `FetchSource` in `core-map/pmtiles`.

import type { S3Options } from 'bun'
import type { FileHandle } from 'node:fs/promises'
import type { RangeResponse, Source } from '../core-map/pmtiles/sources'
import { S3Client } from 'bun'
import { open, stat } from 'node:fs/promises'
import { FetchSource, PMTilesChangedError } from '../core-map/pmtiles/sources'

export interface FileSourceOptions {
  /**
   * How often (ms) to check whether the file was replaced. A rebuilt archive
   * moved into place (`mv new.pmtiles basemap.pmtiles`) is picked up within
   * this window with no restart; readers mid-request finish on the old file.
   * `false` never checks. Default 5000.
   */
  watch?: number | false
}

interface OpenFile {
  handle: FileHandle
  etag: string
  size: number
}

/**
 * Read an archive from local disk with positional reads on one long-lived file
 * descriptor — no per-tile open/close, and the OS page cache does the rest.
 *
 * Replace a live archive by renaming a finished file over it, never by
 * writing into it: a rename swaps the inode atomically, so this source (which
 * keys its identity on inode + size + mtime) sees one consistent file or the
 * other, and never half of each.
 */
export class FileSource implements Source {
  readonly path: string
  private readonly watch: number | false
  private state?: Promise<OpenFile>
  private checkedAt = 0

  constructor(path: string, options: FileSourceOptions = {}) {
    this.path = path
    this.watch = options.watch ?? 5000
  }

  getKey(): string {
    return this.path
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    signal?.throwIfAborted()
    const file = await this.file()
    if (etag && etag !== file.etag)
      throw new PMTilesChangedError(this.path)
    const wanted = Math.max(0, Math.min(length, file.size - offset))
    const buffer = new Uint8Array(wanted)
    let read = 0
    // `read` may return short; loop until the range is filled or EOF.
    while (read < wanted) {
      const { bytesRead } = await file.handle.read(buffer, read, wanted - read, offset + read)
      if (bytesRead === 0)
        break
      read += bytesRead
    }
    return { data: buffer.subarray(0, read), etag: file.etag }
  }

  async close(): Promise<void> {
    const state = this.state
    this.state = undefined
    if (state)
      await (await state.catch(() => undefined))?.handle.close()
  }

  private file(): Promise<OpenFile> {
    const now = Date.now()
    const fresh = this.watch === false || now - this.checkedAt < this.watch
    if (this.state && fresh)
      return this.state

    this.checkedAt = now
    const previous = this.state
    const next = (async (): Promise<OpenFile> => {
      const info = await stat(this.path)
      const etag = `${info.ino.toString(36)}-${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}`
      const prev = previous ? await previous.catch(() => undefined) : undefined
      if (prev && prev.etag === etag)
        return prev
      const handle = await open(this.path, 'r')
      if (prev) {
        // Let requests already reading the old file finish before closing it.
        const timer = setTimeout(() => void prev.handle.close().catch(() => {}), 30_000)
        timer.unref?.()
      }
      return { handle, etag, size: info.size }
    })()
    this.state = next
    next.catch(() => {
      if (this.state === next)
        this.state = undefined
    })
    return next
  }
}

/**
 * Read an archive from a (private) S3-compatible bucket — AWS S3, Cloudflare
 * R2, Backblaze B2, MinIO — with SigV4-signed range requests from Bun's
 * built-in S3 client. Credentials and endpoint come from `options`, or from
 * the usual env vars (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
 * `S3_ENDPOINT`, `S3_BUCKET`, or their `AWS_*` equivalents).
 *
 * Objects are immutable in practice: publish a new build under a new key and
 * point the server at it, rather than overwriting the key it is serving.
 */
export class S3Source implements Source {
  readonly key: string
  private readonly file: ReturnType<S3Client['file']>

  /** `s3://bucket/path/to.pmtiles`, or a key resolved against `options.bucket`. */
  constructor(key: string, options: S3Options = {}) {
    this.key = key
    const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(key)
    const client = new S3Client(match ? { ...options, bucket: match[1] } : options)
    this.file = client.file(match ? match[2]! : key)
  }

  getKey(): string {
    return this.key
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const data = new Uint8Array(await this.file.slice(offset, offset + length).arrayBuffer())
    return { data }
  }
}

/** Options for resolving a string archive location. */
export interface OpenArchiveOptions extends FileSourceOptions {
  /** Request headers for `http(s)://` archives. */
  headers?: Record<string, string>
  /** Client options for `s3://` archives. */
  s3?: S3Options
}

/**
 * `https://…` → `FetchSource`, `s3://bucket/key` → `S3Source`, anything else
 * (`./basemap.pmtiles`, `/srv/tiles/us.pmtiles`, `file:///…`) → `FileSource`.
 */
export function sourceFromLocation(location: string, options: OpenArchiveOptions = {}): Source {
  if (/^https?:\/\//i.test(location))
    return new FetchSource(location, { headers: options.headers })
  if (/^s3:\/\//i.test(location))
    return new S3Source(location, options.s3)
  const path = location.startsWith('file://') ? decodeURIComponent(new URL(location).pathname) : location
  return new FileSource(path, { watch: options.watch })
}
