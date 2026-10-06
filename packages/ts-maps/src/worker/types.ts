// The slice of the Cloudflare Workers runtime `ts-maps/worker` touches: the R2
// binding, the Cache API and the execution context.
//
// Declared here rather than taken from `@cloudflare/workers-types`, so the
// entry has no dependency to install and pulls no ambient globals into an
// app's type check. They are structurally compatible with the real ones: pass
// `env.TILES`, `caches.default` and `ctx` as they come.

/** A byte range of an R2 object: `{ offset, length }`, `{ offset }` or `{ suffix }`. */
export interface R2Range {
  offset?: number
  length?: number
  suffix?: number
}

/** Preconditions for an R2 read. A failed one returns the object without a body. */
export interface R2Conditional {
  etagMatches?: string
  etagDoesNotMatch?: string
  uploadedBefore?: Date
  uploadedAfter?: Date
}

export interface R2GetOptions {
  range?: R2Range
  onlyIf?: R2Conditional
}

export interface R2HTTPMetadata {
  contentType?: string
  contentLanguage?: string
  contentDisposition?: string
  contentEncoding?: string
  cacheControl?: string
  cacheExpiry?: Date
}

/** An object's metadata, as `head` (or a `get` whose precondition failed) returns it. */
export interface R2Object {
  key: string
  size: number
  /** The bare ETag, `abc123`. */
  etag: string
  /** The ETag as an HTTP header value, `"abc123"`. */
  httpEtag: string
  uploaded: Date
  httpMetadata?: R2HTTPMetadata
  /** The range that was read, when the `get` asked for one. */
  range?: R2Range
  /** Copy `httpMetadata` onto response headers (`Content-Type`, `Cache-Control`, …). */
  // eslint-disable-next-line no-unused-vars
  writeHttpMetadata?: (headers: Headers) => void
}

/** An object with its bytes. */
export interface R2ObjectBody extends R2Object {
  body: ReadableStream<Uint8Array>
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
}

/** The R2 binding a Worker sees as `env.<BINDING>`. */
export interface R2Bucket {
  // eslint-disable-next-line no-unused-vars
  get: (key: string, options?: R2GetOptions) => Promise<R2ObjectBody | R2Object | null>
  // eslint-disable-next-line no-unused-vars
  head: (key: string) => Promise<R2Object | null>
}

/** The Cache API cache (`caches.default`). */
export interface WorkerCache {
  // eslint-disable-next-line no-unused-vars
  match: (request: Request | string) => Promise<Response | undefined>
  // eslint-disable-next-line no-unused-vars
  put: (request: Request | string, response: Response) => Promise<void>
}

/** The `ctx` a module Worker's `fetch` receives. */
export interface ExecutionContext {
  // eslint-disable-next-line no-unused-vars
  waitUntil: (promise: Promise<unknown>) => void
  passThroughOnException?: () => void
}
