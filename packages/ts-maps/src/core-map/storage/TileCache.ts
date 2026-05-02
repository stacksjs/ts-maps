/**
 * Async key-value store for tile bytes, with TTL + LRU pruning. The default
 * backend is in-memory; callers may inject their own (e.g. an IndexedDB-backed
 * one in browsers) via the `backend` option.
 */

export interface Tile {
  key: string
  data: Uint8Array
  mime: string
  bytes: number
  addedAt: number
}

export interface TileCacheBackend {
  get: (key: string) => Promise<Tile | undefined>
  put: (tile: Tile) => Promise<void>
  delete: (key: string) => Promise<void>
  clear: () => Promise<void>
  all: () => Promise<Tile[]>
  close?: () => void | Promise<void>
}

export interface TileCacheOptions {
  /** Entry expiration in ms. `0` disables TTL pruning. Default: 0. */
  ttlMs?: number
  /** Soft cap on number of cached entries. Default: Infinity. */
  maxEntries?: number
  /** Soft cap on total bytes. Default: Infinity. */
  maxBytes?: number
  /** Custom backend. Defaults to an in-memory `Map`. */
  backend?: TileCacheBackend
}

export interface TileCacheSize {
  entries: number
  bytes: number
}

function createMemoryBackend(): TileCacheBackend {
  let store = new Map<string, Tile>()
  return {
    get: async key => store.get(key),
    put: async (tile) => { store.set(tile.key, tile) },
    delete: async (key) => { store.delete(key) },
    clear: async () => { store.clear() },
    all: async () => [...store.values()],
    close: () => { store = new Map() },
  }
}

export class TileCache {
  private readonly _ttlMs: number
  private readonly _maxEntries: number
  private readonly _maxBytes: number
  private readonly _customBackend?: TileCacheBackend
  private _backend: TileCacheBackend

  constructor(options: TileCacheOptions = {}) {
    this._ttlMs = options.ttlMs ?? 0
    this._maxEntries = options.maxEntries ?? Number.POSITIVE_INFINITY
    this._maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY
    this._customBackend = options.backend
    this._backend = options.backend ?? createMemoryBackend()
  }

  async get(key: string): Promise<Tile | undefined> {
    const tile = await this._backend.get(key)
    if (!tile)
      return undefined
    if (this._isExpired(tile)) {
      await this._backend.delete(key)
      return undefined
    }
    return tile
  }

  async put(key: string, data: Uint8Array, mime: string): Promise<void> {
    const tile: Tile = {
      key,
      data,
      mime,
      bytes: data.byteLength,
      addedAt: Date.now(),
    }
    await this._backend.put(tile)
  }

  async delete(key: string): Promise<void> {
    await this._backend.delete(key)
  }

  async clear(): Promise<void> {
    await this._backend.clear()
  }

  async size(): Promise<TileCacheSize> {
    const all = await this._backend.all()
    let bytes = 0
    for (const t of all) bytes += t.bytes
    return { entries: all.length, bytes }
  }

  /**
   * Drop expired entries, then enforce `maxEntries` / `maxBytes` by removing
   * least-recently-added tiles first.
   */
  async prune(): Promise<void> {
    const all = await this._backend.all()
    const live: Tile[] = []
    for (const t of all) {
      if (this._isExpired(t))
        await this._backend.delete(t.key)
      else
        live.push(t)
    }

    live.sort((a, b) => a.addedAt - b.addedAt)

    let totalBytes = 0
    for (const t of live) totalBytes += t.bytes

    let entries = live.length
    while (live.length > 0 && (entries > this._maxEntries || totalBytes > this._maxBytes)) {
      const oldest = live.shift()!
      await this._backend.delete(oldest.key)
      totalBytes -= oldest.bytes
      entries -= 1
    }
  }

  /**
   * Tear down the backend. Subsequent operations lazily rebuild a fresh
   * default backend, unless the cache was constructed with a custom one
   * (in which case we leave reconstruction up to the caller).
   */
  async close(): Promise<void> {
    if (this._backend.close)
      await this._backend.close()
    if (this._customBackend) {
      // Custom backends opt out of automatic re-init — but we still need a
      // working backend so further calls don't throw. Fall back to memory.
      this._backend = createMemoryBackend()
    }
    else {
      this._backend = createMemoryBackend()
    }
  }

  private _isExpired(tile: Tile): boolean {
    if (this._ttlMs <= 0)
      return false
    return Date.now() - tile.addedAt > this._ttlMs
  }
}
