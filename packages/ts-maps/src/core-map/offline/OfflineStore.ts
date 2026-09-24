/**
 * Where downloaded maps live: tiles, the regions that own them, and what each
 * region needs to work with no network at all.
 *
 * A tile's bytes are stored once, and beside them the list of regions holding
 * it. Two regions that overlap share their tiles rather than storing them
 * twice, and deleting one removes only what the other no longer needs. The
 * list is kept apart from the bytes so that adding or dropping a region never
 * rewrites a tile.
 *
 * `IndexedDBOfflineStore` is what a browser gets, and survives a reload;
 * `MemoryOfflineStore` is what everything else gets, and what tests use.
 */

export interface StoredTile {
  data: Uint8Array
  mime: string
}

export interface TileRefs {
  /** Regions holding this tile. */
  regions: string[]
  bytes: number
}

export interface OfflineRegionRecord {
  id: string
  name: string
  /** `[west, south, east, north]`. */
  bounds: [number, number, number, number]
  minZoom: number
  maxZoom: number
  /** Tile URL templates the region was downloaded from. */
  sources: string[]
  status: 'downloading' | 'paused' | 'complete' | 'error'
  /** Everything the region covers: tiles, and the style's own files. */
  tiles: number
  /** How many of those are stored. */
  downloaded: number
  /** Bytes stored for this region, counting shared tiles in full. */
  bytes: number
  createdAt: number
  updatedAt: number
  error?: string
}

/** Every URL a region stores, kept so it can be resumed, updated or deleted without the map that drew it. */
export interface OfflinePlan {
  urls: string[]
  /** Vector tiles at their source's top zoom: what search and routing read. */
  index: Array<{ url: string, z: number, x: number, y: number }>
}

/** A named place found in a region's tiles, for offline search. */
export interface OfflinePlace {
  name: string
  lat: number
  lng: number
  /** `city`, `suburb`, `street`, `cafe`, `river`… */
  kind: string
  /** Lower is more important. */
  rank: number
}

/** One stretch of road, as the offline router needs it. */
export interface OfflineRoad {
  /** `[lat, lng, lat, lng, …]`. */
  coords: number[]
  /** OpenMapTiles `class`: motorway, primary, minor, path… */
  kind: string
  /** 1 one-way along the coordinates, -1 against, 0 both ways. */
  oneway: 0 | 1 | -1
  ramp?: boolean
  /** Above or below the ground: bridges 1 and up, tunnels -1 and down. Roads only meet at the same level. */
  level?: number
  name?: string
}

export interface OfflineIndex {
  places: OfflinePlace[]
  roads: OfflineRoad[]
}

export interface OfflineStore {
  getTile: (key: string) => Promise<StoredTile | undefined>
  putTile: (key: string, tile: StoredTile) => Promise<void>
  deleteTile: (key: string) => Promise<void>
  getRefs: (key: string) => Promise<TileRefs | undefined>
  putRefs: (key: string, refs: TileRefs) => Promise<void>
  deleteRefs: (key: string) => Promise<void>
  /** Totals across every stored tile, shared ones counted once. */
  usage: () => Promise<{ bytes: number, entries: number }>
  getRegion: (id: string) => Promise<OfflineRegionRecord | undefined>
  putRegion: (region: OfflineRegionRecord) => Promise<void>
  deleteRegion: (id: string) => Promise<void>
  listRegions: () => Promise<OfflineRegionRecord[]>
  getPlan: (id: string) => Promise<OfflinePlan | undefined>
  putPlan: (id: string, plan: OfflinePlan) => Promise<void>
  deletePlan: (id: string) => Promise<void>
  getIndex: (id: string) => Promise<OfflineIndex | undefined>
  putIndex: (id: string, index: OfflineIndex) => Promise<void>
  deleteIndex: (id: string) => Promise<void>
}

export class MemoryOfflineStore implements OfflineStore {
  tiles: Map<string, StoredTile> = new Map()
  refs: Map<string, TileRefs> = new Map()
  regions: Map<string, OfflineRegionRecord> = new Map()
  plans: Map<string, OfflinePlan> = new Map()
  indexes: Map<string, OfflineIndex> = new Map()

  async getTile(key: string): Promise<StoredTile | undefined> { return this.tiles.get(key) }
  async putTile(key: string, tile: StoredTile): Promise<void> { this.tiles.set(key, tile) }
  async deleteTile(key: string): Promise<void> { this.tiles.delete(key) }
  async getRefs(key: string): Promise<TileRefs | undefined> {
    const refs = this.refs.get(key)
    return refs ? { regions: [...refs.regions], bytes: refs.bytes } : undefined
  }

  async putRefs(key: string, refs: TileRefs): Promise<void> { this.refs.set(key, { regions: [...refs.regions], bytes: refs.bytes }) }
  async deleteRefs(key: string): Promise<void> { this.refs.delete(key) }
  async usage(): Promise<{ bytes: number, entries: number }> {
    let bytes = 0
    for (const refs of this.refs.values())
      bytes += refs.bytes
    return { bytes, entries: this.refs.size }
  }

  async getRegion(id: string): Promise<OfflineRegionRecord | undefined> {
    const region = this.regions.get(id)
    return region ? { ...region } : undefined
  }

  async putRegion(region: OfflineRegionRecord): Promise<void> { this.regions.set(region.id, { ...region }) }
  async deleteRegion(id: string): Promise<void> { this.regions.delete(id) }
  async listRegions(): Promise<OfflineRegionRecord[]> { return [...this.regions.values()].map(r => ({ ...r })) }
  async getPlan(id: string): Promise<OfflinePlan | undefined> { return this.plans.get(id) }
  async putPlan(id: string, plan: OfflinePlan): Promise<void> { this.plans.set(id, plan) }
  async deletePlan(id: string): Promise<void> { this.plans.delete(id) }
  async getIndex(id: string): Promise<OfflineIndex | undefined> { return this.indexes.get(id) }
  async putIndex(id: string, index: OfflineIndex): Promise<void> { this.indexes.set(id, index) }
  async deleteIndex(id: string): Promise<void> { this.indexes.delete(id) }
}

const STORES = ['tiles', 'refs', 'regions', 'plans', 'indexes'] as const
type StoreName = typeof STORES[number]

/**
 * IndexedDB-backed store. One database, one object store per kind of record;
 * every call is its own short transaction, so a long download never holds one
 * open.
 */
export class IndexedDBOfflineStore implements OfflineStore {
  name: string
  _db: Promise<IDBDatabase> | null = null

  constructor(name: string = 'ts-maps-offline') {
    this.name = name
  }

  static available(): boolean {
    return typeof indexedDB !== 'undefined' && typeof indexedDB?.open === 'function'
  }

  /**
   * Whether a database of this name has been created — asked without creating
   * one, so a page that never downloads a map never gets an empty database.
   * Undefined where the browser cannot say.
   */
  static async exists(name: string = 'ts-maps-offline'): Promise<boolean | undefined> {
    if (!IndexedDBOfflineStore.available() || typeof indexedDB.databases !== 'function')
      return undefined
    try {
      return (await indexedDB.databases()).some(db => db.name === name)
    }
    catch {
      return undefined
    }
  }

  _open(): Promise<IDBDatabase> {
    this._db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        const existing = Array.from(db.objectStoreNames as unknown as ArrayLike<string>)
        for (const store of STORES) {
          if (!existing.includes(store))
            db.createObjectStore(store)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this._db
  }

  async _run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
    const db = await this._open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = fn(tx.objectStore(store))
      tx.oncomplete = () => resolve((request ? request.result : undefined) as T)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  _get<T>(store: StoreName, key: string): Promise<T | undefined> { return this._run(store, 'readonly', s => s.get(key)) }
  _put(store: StoreName, key: string, value: unknown): Promise<void> { return this._run(store, 'readwrite', (s) => { s.put(value, key) }) }
  _delete(store: StoreName, key: string): Promise<void> { return this._run(store, 'readwrite', (s) => { s.delete(key) }) }

  getTile(key: string): Promise<StoredTile | undefined> { return this._get('tiles', key) }
  putTile(key: string, tile: StoredTile): Promise<void> { return this._put('tiles', key, tile) }
  deleteTile(key: string): Promise<void> { return this._delete('tiles', key) }
  getRefs(key: string): Promise<TileRefs | undefined> { return this._get('refs', key) }
  putRefs(key: string, refs: TileRefs): Promise<void> { return this._put('refs', key, refs) }
  deleteRefs(key: string): Promise<void> { return this._delete('refs', key) }
  async usage(): Promise<{ bytes: number, entries: number }> {
    const all = (await this._run<TileRefs[]>('refs', 'readonly', s => s.getAll())) ?? []
    let bytes = 0
    for (const refs of all)
      bytes += refs.bytes
    return { bytes, entries: all.length }
  }

  getRegion(id: string): Promise<OfflineRegionRecord | undefined> { return this._get('regions', id) }
  putRegion(region: OfflineRegionRecord): Promise<void> { return this._put('regions', region.id, region) }
  deleteRegion(id: string): Promise<void> { return this._delete('regions', id) }
  async listRegions(): Promise<OfflineRegionRecord[]> { return (await this._run<OfflineRegionRecord[]>('regions', 'readonly', s => s.getAll())) ?? [] }
  getPlan(id: string): Promise<OfflinePlan | undefined> { return this._get('plans', id) }
  putPlan(id: string, plan: OfflinePlan): Promise<void> { return this._put('plans', id, plan) }
  deletePlan(id: string): Promise<void> { return this._delete('plans', id) }
  getIndex(id: string): Promise<OfflineIndex | undefined> { return this._get('indexes', id) }
  putIndex(id: string, index: OfflineIndex): Promise<void> { return this._put('indexes', id, index) }
  deleteIndex(id: string): Promise<void> { return this._delete('indexes', id) }

  close(): void {
    this._db?.then(db => db.close()).catch(() => {})
    this._db = null
  }
}
