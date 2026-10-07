import type { OfflineIndex, OfflinePlan, OfflineRegionRecord, OfflineStore, StoredTile, TileRefs } from './OfflineStore'

/**
 * Downloaded maps kept in any store of strings by key: a React Native app's
 * files, a Capacitor or Electron store, a server's KV.
 *
 * On React Native the map runs in a WebView, and the WebView's IndexedDB is
 * storage the OS may clear under pressure and the app cannot see. With this
 * store the WebView keeps nothing itself: every read and write goes across
 * to the app, which keeps them in its own files (see `@ts-maps/react-native`'s
 * `offlineStore`).
 *
 * Three calls are all it asks of the storage: get, set and delete. Nothing
 * is listed: the regions and the space used are kept under keys of their
 * own and kept up to date as tiles come and go, so a storage with no way to
 * list its keys, or a slow one, will do.
 */
export interface KeyValueStorage {
  get: (key: string) => Promise<string | null | undefined>
  set: (key: string, value: string) => Promise<void>
  delete: (key: string) => Promise<void>
}

export interface KeyValueOfflineStoreOptions {
  /** Put before every key, to share a storage with other things. Default `ts-maps/`. */
  prefix?: string
}

/** Bytes as base64, in chunks: a whole tile through `String.fromCharCode` overflows the stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
    out[i] = binary.charCodeAt(i)
  return out
}

export class KeyValueOfflineStore implements OfflineStore {
  storage: KeyValueStorage
  prefix: string
  _usage?: Promise<{ bytes: number, entries: number }>
  /** Writes to one key, one at a time: a tile's refs are read, changed and written back. */
  _queues: Map<string, Promise<unknown>> = new Map()

  constructor(storage: KeyValueStorage, options: KeyValueOfflineStoreOptions = {}) {
    this.storage = storage
    this.prefix = options.prefix ?? 'ts-maps/'
  }

  _key(kind: string, id: string): string {
    return `${this.prefix}${kind}/${id}`
  }

  async _json<T>(key: string): Promise<T | undefined> {
    const text = await this.storage.get(key)
    if (text === null || text === undefined)
      return undefined
    return JSON.parse(text) as T
  }

  /** Run `fn` after whatever else is changing `key`. */
  _serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const before = this._queues.get(key) ?? Promise.resolve()
    const run = before.then(fn, fn)
    const settled = run.catch(() => {})
    this._queues.set(key, settled)
    void settled.then(() => {
      if (this._queues.get(key) === settled)
        this._queues.delete(key)
    })
    return run
  }

  // --- Tiles: the MIME type, a newline, then the bytes as base64. ---

  async getTile(key: string): Promise<StoredTile | undefined> {
    const text = await this.storage.get(this._key('tile', key))
    if (text === null || text === undefined)
      return undefined
    const split = text.indexOf('\n')
    return { mime: text.slice(0, split), data: base64ToBytes(text.slice(split + 1)) }
  }

  async putTile(key: string, tile: StoredTile): Promise<void> {
    await this.storage.set(this._key('tile', key), `${tile.mime}\n${bytesToBase64(tile.data)}`)
  }

  async deleteTile(key: string): Promise<void> {
    await this.storage.delete(this._key('tile', key))
  }

  // --- Refs, with the space used kept beside them. ---

  getRefs(key: string): Promise<TileRefs | undefined> {
    return this._json<TileRefs>(this._key('refs', key))
  }

  putRefs(key: string, refs: TileRefs): Promise<void> {
    const at = this._key('refs', key)
    return this._serial(at, async () => {
      const old = await this._json<TileRefs>(at)
      await this.storage.set(at, JSON.stringify({ regions: [...refs.regions], bytes: refs.bytes }))
      await this._count(refs.bytes - (old?.bytes ?? 0), old ? 0 : 1)
    })
  }

  deleteRefs(key: string): Promise<void> {
    const at = this._key('refs', key)
    return this._serial(at, async () => {
      const old = await this._json<TileRefs>(at)
      if (!old)
        return
      await this.storage.delete(at)
      await this._count(-old.bytes, -1)
    })
  }

  usage(): Promise<{ bytes: number, entries: number }> {
    this._usage ??= this._json<{ bytes: number, entries: number }>(this._key('meta', 'usage')).then(u => u ?? { bytes: 0, entries: 0 })
    return this._usage.then(u => ({ ...u }))
  }

  _count(bytes: number, entries: number): Promise<void> {
    const at = this._key('meta', 'usage')
    return this._serial(at, async () => {
      const usage = await this.usage()
      const next = { bytes: Math.max(0, usage.bytes + bytes), entries: Math.max(0, usage.entries + entries) }
      this._usage = Promise.resolve(next)
      await this.storage.set(at, JSON.stringify(next))
    })
  }

  // --- Regions, and the list of them. ---

  getRegion(id: string): Promise<OfflineRegionRecord | undefined> {
    return this._json<OfflineRegionRecord>(this._key('region', id))
  }

  async putRegion(region: OfflineRegionRecord): Promise<void> {
    await this.storage.set(this._key('region', region.id), JSON.stringify(region))
    await this._list(ids => (ids.includes(region.id) ? ids : [...ids, region.id]))
  }

  async deleteRegion(id: string): Promise<void> {
    await this.storage.delete(this._key('region', id))
    await this._list(ids => ids.filter(i => i !== id))
  }

  async listRegions(): Promise<OfflineRegionRecord[]> {
    const ids = await this._json<string[]>(this._key('meta', 'regions')) ?? []
    const regions = await Promise.all(ids.map(id => this.getRegion(id)))
    return regions.filter((r): r is OfflineRegionRecord => !!r)
  }

  _list(change: (ids: string[]) => string[]): Promise<void> {
    const at = this._key('meta', 'regions')
    return this._serial(at, async () => {
      const ids = await this._json<string[]>(at) ?? []
      const next = change(ids)
      if (next !== ids)
        await this.storage.set(at, JSON.stringify(next))
    })
  }

  // --- Plans and indexes. ---

  getPlan(id: string): Promise<OfflinePlan | undefined> {
    return this._json<OfflinePlan>(this._key('plan', id))
  }

  async putPlan(id: string, plan: OfflinePlan): Promise<void> {
    await this.storage.set(this._key('plan', id), JSON.stringify(plan))
  }

  async deletePlan(id: string): Promise<void> {
    await this.storage.delete(this._key('plan', id))
  }

  getIndex(id: string): Promise<OfflineIndex | undefined> {
    return this._json<OfflineIndex>(this._key('index', id))
  }

  async putIndex(id: string, index: OfflineIndex): Promise<void> {
    await this.storage.set(this._key('index', id), JSON.stringify(index))
  }

  async deleteIndex(id: string): Promise<void> {
    await this.storage.delete(this._key('index', id))
  }
}
