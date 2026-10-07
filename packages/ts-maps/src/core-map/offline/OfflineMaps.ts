/**
 * Offline maps, after Apple Maps: pick an area, see how big it will be,
 * download it, and from then on the map, search and directions all work
 * there with no connection.
 *
 * Downloads survive a reload, run in the background with progress, pause,
 * resume where they stopped, and can be updated or deleted. Tiles two areas
 * share are stored once. The map reads downloaded tiles before the network —
 * they are already here, and it saves the data — and with `onlyOffline` does
 * not touch the network for map data at all.
 *
 * One manager serves every map on the page; `offlineMaps()` returns it and
 * `map.offline` is the same object.
 */

import type { DirectionsOptions, LatLngLike, Route } from '../services/types'
import type { OfflineIndex, OfflinePlace, OfflinePlan, OfflineRegionRecord, OfflineStore, StoredTile } from './OfflineStore'
import type { OfflineArea, PlannedArea } from './plan'
import { Evented } from '../core/Events'
import { pmtilesFetch, withPMTiles } from '../pmtiles/protocol'
import { streetProfile } from '../services/transit'
import { saveOfflineRegion } from '../storage/offlineRegion'
import type { BackgroundFetchLike, OfflineChannelMessage } from './background'
import type { TileSchema } from './schema'
import { backgroundFetchRegistration, backgroundId, offlineChannel } from './background'
import { extractTile, labelGlyphRanges, mergePlaces } from './extract'
import { IndexedDBOfflineStore, MemoryOfflineStore } from './OfflineStore'
import { glyphUrls, normalizeBounds, planArea } from './plan'
import { RoadGraph, routeOnGraph } from './router'
import { OfflineDirections, OfflineGeocoder } from './search'

export interface OfflineMapsOptions {
  /** Where downloads are kept. IndexedDB in a browser, memory elsewhere. */
  store?: OfflineStore
  /** Requests in flight at once while downloading. Default 6. */
  concurrency?: number
  /** Largest area, in tiles, that can be downloaded. Default 150,000. */
  maxTiles?: number
  /** Swapped out in tests. */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
  /**
   * Keep downloaded maps up to date, as Apple's "Automatic Updates": once
   * ready and online, maps older than `maxAge` are fetched again, one at a
   * time, and only on an unmetered connection where the browser can tell.
   * `true` is a 30-day `maxAge`. The panel's switch sets it too, and that is
   * remembered on the device. Default off.
   */
  autoUpdate?: boolean | AutoUpdateOptions
  /**
   * Pick up downloads a reload or a lost connection interrupted, as soon as
   * the page is ready and online, rather than leaving them paused for the
   * user to resume. A download the user paused stays paused. Default false.
   */
  autoResume?: boolean
  /**
   * Ask the browser to keep downloads when storage runs low
   * (`navigator.storage.persist()`), on the first download. Default true.
   */
  persist?: boolean
  /**
   * Download with Background Fetch where the browser has it, so a download
   * carries on with the tab closed or the device asleep and finishes by
   * itself. Needs a service worker built with `ts-maps/offline-sw` in
   * control of the page; without one, downloads stay in the page. Default false.
   */
  background?: boolean
  /**
   * The schema of the tiles downloaded, for search and routing. Default:
   * found from each tile's layer names — OpenMapTiles, Protomaps,
   * Shortbread or Mapbox Streets.
   */
  schema?: TileSchema
}

export interface AutoUpdateOptions {
  /** Refresh a map older than this, in milliseconds. Default 30 days. */
  maxAge?: number
  /** Only on a connection the browser does not report as metered or data-saving. Default true. */
  unmeteredOnly?: boolean
}

export interface OfflineStorage {
  /** Bytes the origin uses, everything included. */
  usage: number
  /** Bytes the browser lets it use. */
  quota: number
  /** `quota - usage`. */
  free: number
  /** Whether the browser has agreed to keep it under storage pressure. */
  persisted?: boolean
}

export interface OfflineDownloadOptions extends OfflineArea {
  /** What the list calls it. Default "Offline Map". */
  name?: string
}

export interface OfflineEstimate {
  /** Tiles and other files. */
  tiles: number
  /** Bytes, estimated from a sample of the area's own tiles where possible. */
  bytes: number
  /** More than `maxTiles`: pick a smaller area, or fewer zooms. */
  tooLarge: boolean
}

interface Job {
  stop: false | 'pause' | 'cancel'
  abort: AbortController
  promise: Promise<OfflineRegionRecord>
  /** Paused by the connection dropping rather than by the user. */
  interrupted?: boolean
  /** Stopped because storage ran out. */
  quota?: boolean
}

const DAY = 24 * 60 * 60 * 1000
const AUTO_UPDATE_KEY = 'ts-maps-offline-auto-update'

function isQuotaError(err: unknown): boolean {
  const name = (err as Error)?.name
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/** Whether the connection is one to spend data on: not cellular, not data saver. */
function unmetered(): boolean {
  const connection = typeof navigator === 'undefined' ? undefined : (navigator as any).connection
  if (!connection)
    return true
  return !connection.saveData && connection.type !== 'cellular' && !/^(?:slow-)?2g$/.test(connection.effectiveType ?? '')
}

function savedAutoUpdate(): boolean | undefined {
  try {
    const saved = globalThis.localStorage?.getItem(AUTO_UPDATE_KEY)
    return saved === null || saved === undefined ? undefined : saved === '1'
  }
  catch {
    return undefined
  }
}

/** A typical vector or image tile, before this device has measured any. */
const TYPICAL_TILE_BYTES = 32_000
/** A typical terrain (DEM) tile: a lossless PNG or WebP of encoded heights. */
const TYPICAL_DEM_BYTES = 100_000

function regionId(): string {
  return `region-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function abortError(): Error {
  const err = new Error('The operation was aborted.')
  err.name = 'AbortError'
  return err
}

export class OfflineMaps extends Evented {
  store: OfflineStore
  concurrency: number
  maxTiles: number
  /** The map a bare `download({ bounds })` takes its layers from: the last one to hand this manager out. */
  map?: any
  /** Read downloaded tiles at all. */
  enabled: boolean = true
  _onlyOffline: boolean = false

  _fetch: (url: string, init?: RequestInit) => Promise<Response>
  _regions: Map<string, OfflineRegionRecord> = new Map()
  _ready: Promise<void> | null = null
  _loaded: boolean = false
  _jobs: Map<string, Job> = new Map()
  /** Bytes and tiles measured so far, for estimates. */
  _measured: { bytes: number, tiles: number } = { bytes: 0, tiles: 0 }
  _measuredTerrain: { bytes: number, tiles: number } = { bytes: 0, tiles: 0 }
  _places: Promise<OfflinePlace[]> | null = null
  _graphs: Map<string, Promise<RoadGraph>> = new Map()
  _geocoder?: OfflineGeocoder
  _directions?: OfflineDirections
  _autoUpdate: AutoUpdateOptions | false
  autoResume: boolean
  persist: boolean
  _persistAsked = false
  _updating: Promise<void> | null = null
  _unwatch?: () => void
  background: boolean
  schema?: TileSchema
  _channel?: BroadcastChannel
  /** Background downloads this page follows, by region: called when the service worker says one ended. */
  _waiting: Map<string, (region: OfflineRegionRecord | undefined) => void> = new Map()

  constructor(options: OfflineMapsOptions = {}) {
    super()
    this.store = options.store ?? (IndexedDBOfflineStore.available() ? new IndexedDBOfflineStore() : new MemoryOfflineStore())
    this.concurrency = Math.max(1, options.concurrency ?? 6)
    this.maxTiles = options.maxTiles ?? 150_000
    const auto = options.autoUpdate ?? savedAutoUpdate() ?? false
    this._autoUpdate = auto === false ? false : auto === true ? {} : auto
    this.autoResume = options.autoResume ?? false
    this.persist = options.persist ?? true
    this.background = options.background ?? false
    this.schema = options.schema
    // `pmtiles://` tiles are read from their archive (through this same fetch)
    // and stored under their own URL, which is what the map looks up offline.
    this._fetch = withPMTiles(options.fetch)
  }

  /**
   * Never go to the network for map data, as Apple's "Only Use Offline
   * Maps". Setting it fires `modechange`.
   */
  get onlyOffline(): boolean {
    return this._onlyOffline
  }

  set onlyOffline(value: boolean) {
    if (value === this._onlyOffline)
      return
    this._onlyOffline = value
    this.fire('modechange', { onlyOffline: value })
  }

  /** Whether downloaded maps are kept up to date. Setting it is remembered on this device. */
  get autoUpdate(): boolean {
    return this._autoUpdate !== false
  }

  set autoUpdate(value: boolean) {
    if (value === this.autoUpdate)
      return
    this._autoUpdate = value ? {} : false
    try {
      globalThis.localStorage?.setItem(AUTO_UPDATE_KEY, value ? '1' : '0')
    }
    catch {}
    this.fire('settingchange', { autoUpdate: value })
    if (value)
      void this.updateStale()
  }

  /**
   * Load the list of downloaded maps. Downloads a reload interrupted come
   * back paused, to be resumed — by `autoResume`, once online, or by the
   * user. With `autoUpdate`, maps past their age are refreshed after.
   */
  ready(): Promise<void> {
    this._ready ??= (async () => {
      const manager = this.background ? await backgroundFetchRegistration() : undefined
      for (const region of await this.store.listRegions()) {
        if (region.status === 'downloading' && !this._jobs.has(region.id)) {
          // Still downloading in the background, with the page closed or not:
          // follow it from here, so the list shows its progress again.
          const running = region.background && manager ? await manager.get(backgroundId(region.id)).catch(() => undefined) : undefined
          if (running) {
            this._regions.set(region.id, region)
            this._follow(region, running)
            continue
          }
          region.status = 'paused'
          region.interrupted = true
          delete region.background
          await this.store.putRegion(region)
        }
        this._regions.set(region.id, region)
        if (region.status === 'complete')
          this._learn(region.bytes, region.downloaded)
      }
      this._loaded = true
      this._watchConnection()
      this._listenToWorker()
      this._whenOnline()
    })()
    return this._ready
  }

  /**
   * Follow the connection: a download running when it drops is paused as
   * interrupted rather than failing tile by tile, and when it comes back
   * `autoResume` and `autoUpdate` pick up where they were.
   */
  _watchConnection(): void {
    if (this._unwatch || typeof window === 'undefined' || typeof window.addEventListener !== 'function')
      return
    const lost = (): void => {
      for (const job of this._jobs.values()) {
        if (!job.stop) {
          job.interrupted = true
          job.stop = 'pause'
          job.abort.abort()
        }
      }
    }
    const back = (): void => this._whenOnline()
    window.addEventListener('offline', lost)
    window.addEventListener('online', back)
    this._unwatch = () => {
      window.removeEventListener('offline', lost)
      window.removeEventListener('online', back)
    }
  }

  /** Stop following the connection and the service worker. For a manager that is being thrown away. */
  dispose(): void {
    this._unwatch?.()
    this._unwatch = undefined
    this._channel?.close()
    this._channel = undefined
  }

  // ---------- downloading in the background ----------

  /**
   * Hand a download to Background Fetch: what is already stored is counted,
   * the rest is fetched by the browser and taken in by the service worker.
   * Undefined when it cannot be — no Background Fetch, no service worker, a
   * `pmtiles://` archive, which is read in ranges — and the page downloads.
   */
  async _runInBackground(region: OfflineRegionRecord, plan: OfflinePlan, refresh: boolean, job: Job): Promise<OfflineRegionRecord | undefined> {
    const manager = await backgroundFetchRegistration()
    if (!manager || !plan.urls.every(url => /^https?:\/\//.test(url)))
      return undefined
    region.status = 'downloading'
    region.downloaded = 0
    region.bytes = 0
    delete region.error
    delete region.interrupted
    const missing: string[] = []
    for (const url of plan.urls) {
      const refs = await this.store.getRefs(url)
      if (refs && !refresh) {
        if (!refs.regions.includes(region.id))
          await this.store.putRefs(url, { regions: [...refs.regions, region.id], bytes: refs.bytes })
        region.downloaded++
        region.bytes += refs.bytes
      }
      else {
        missing.push(url)
      }
    }
    if (!missing.length)
      return this._finish(region, plan, refresh, job, 0)
    let running: BackgroundFetchLike
    try {
      running = await manager.fetch(backgroundId(region.id), missing, {
        title: region.name,
        downloadTotal: Math.round(missing.length * this._averageTile()),
      })
    }
    catch {
      // Refused (no permission, a quota, the same id still running): the
      // page downloads it itself.
      return undefined
    }
    region.background = true
    await this._save(region)
    this._changed()
    return this._follow(region, running, job)
  }

  /**
   * Report a background download's progress, and resolve once the service
   * worker says it has been taken in. Pausing aborts it.
   */
  _follow(region: OfflineRegionRecord, running: BackgroundFetchLike, job?: Job): Promise<OfflineRegionRecord> {
    const base = { downloaded: region.downloaded, bytes: region.bytes }
    const left = Math.max(0, region.tiles - region.downloaded)
    const average = this._averageTile()
    const progress = (): void => {
      // Background Fetch counts bytes, not files: the count is an estimate
      // until the worker has stored them.
      region.bytes = base.bytes + running.downloaded
      region.downloaded = base.downloaded + Math.min(left, Math.floor(running.downloaded / average))
      this.fire('progress', { region: { ...region } })
    }
    running.addEventListener('progress', progress)
    if (!job) {
      job = { stop: false, abort: new AbortController(), promise: undefined as unknown as Promise<OfflineRegionRecord> }
      this._jobs.set(region.id, job)
    }
    const own = job
    const ended = new Promise<OfflineRegionRecord>((resolve) => {
      this._waiting.set(region.id, (stored) => {
        running.removeEventListener('progress', progress)
        this._waiting.delete(region.id)
        resolve(stored ? { ...stored } : { ...region })
      })
      own.abort.signal.addEventListener('abort', () => {
        void running.abort().catch(() => false)
        running.removeEventListener('progress', progress)
        this._waiting.delete(region.id)
        if (own.stop === 'cancel') {
          resolve({ ...region })
          return
        }
        region.status = 'paused'
        if (own.interrupted)
          region.interrupted = true
        delete region.background
        void this._save(region).then(() => {
          this._changed()
          resolve({ ...region })
        })
      }, { once: true })
    })
    if (!own.promise)
      own.promise = ended.finally(() => this._jobs.delete(region.id))
    return ended
  }

  /** Hear the service worker say a region changed in the store. */
  _listenToWorker(): void {
    if (this._channel)
      return
    this._channel = offlineChannel()
    if (this._channel)
      this._channel.onmessage = (e: MessageEvent<OfflineChannelMessage>) => {
        if (e.data?.type === 'region' && typeof e.data.id === 'string')
          void this._reload(e.data.id)
      }
  }

  /**
   * Tell other pages, and a page following a background download, that a
   * region changed. Sent on the manager's own channel, which does not hear
   * itself.
   */
  _broadcast(id: string): void {
    this._channel?.postMessage({ type: 'region', id } satisfies OfflineChannelMessage)
  }

  /** Read a region back from the store after the service worker changed it. */
  async _reload(id: string): Promise<void> {
    const region = await this.store.getRegion(id)
    // Another store's region: nothing here changed.
    if (!region && !this._regions.has(id))
      return
    if (region)
      this._regions.set(id, region)
    else
      this._regions.delete(id)
    this._invalidate()
    this._changed()
    // `complete` and `error` are for the page that was following the
    // download; other tabs just see the list change.
    const waiting = this._waiting.get(id)
    if (waiting && region && region.status !== 'downloading') {
      waiting(region)
      this._ended(region)
    }
  }

  /**
   * A background download stopped from outside the page — the browser's own
   * download UI, say: paused, and not something `autoResume` should restart.
   */
  async stopped(id: string): Promise<void> {
    await this.ready()
    const region = this._regions.get(id)
    if (!region || region.status !== 'downloading')
      return
    region.status = 'paused'
    delete region.background
    delete region.interrupted
    await this._save(region)
    this._changed()
    this._broadcast(id)
  }

  /**
   * Take in a background download's files, in a service worker: store each,
   * then settle the region as a page's own download would be. What is missing
   * leaves it in error, to be resumed. `ts-maps/offline-sw` calls this.
   */
  async ingest(id: string, files: Array<{ url: string, response: Promise<Response> | Response }>): Promise<OfflineRegionRecord | undefined> {
    await this.ready()
    const region = this._regions.get(id)
    const plan = await this.store.getPlan(id)
    if (!region || !plan)
      return undefined
    for (const file of files) {
      try {
        const response = await file.response
        // A 404 or 204 is a tile with nothing in it, kept as empty; another
        // failure is left out, and counted below.
        if (!response.ok && response.status !== 404)
          continue
        const refs = await this.store.getRefs(file.url)
        const data = response.ok && response.status !== 204 ? new Uint8Array(await response.arrayBuffer()) : new Uint8Array(0)
        await this._keep(file.url, id, response, data, refs?.regions ?? [])
      }
      catch {}
    }
    // Counted from the store, not from what arrived: the files the page
    // already held were never in the background download.
    region.downloaded = 0
    region.bytes = 0
    for (const url of plan.urls) {
      const refs = await this.store.getRefs(url)
      if (refs?.regions.includes(id)) {
        region.downloaded++
        region.bytes += refs.bytes
      }
    }
    const job: Job = { stop: false, abort: new AbortController(), promise: Promise.resolve(region) }
    return this._finish(region, plan, false, job, plan.urls.length - region.downloaded)
  }

  _whenOnline(): void {
    if (!online())
      return
    if (this.autoResume) {
      for (const region of this._regions.values()) {
        if (region.interrupted && (region.status === 'paused' || region.status === 'error') && !this._jobs.has(region.id))
          this.resume(region.id).catch(() => {})
      }
    }
    if (this.autoUpdate)
      void this.updateStale()
  }

  /**
   * Refresh downloaded maps older than `autoUpdate`'s `maxAge`, one at a
   * time, oldest first. Skipped offline and, unless told otherwise, on a
   * metered connection. Runs once at a time; a second call joins the first.
   */
  updateStale(): Promise<void> {
    this._updating ??= (async () => {
      try {
        await this.ready()
        const auto = this._autoUpdate
        if (!auto || !online() || (auto.unmeteredOnly !== false && !unmetered()))
          return
        const oldest = Date.now() - (auto.maxAge ?? 30 * DAY)
        const stale = [...this._regions.values()]
          .filter(r => r.status === 'complete' && r.updatedAt < oldest)
          .sort((a, b) => a.updatedAt - b.updatedAt)
        for (const region of stale) {
          if (!this._autoUpdate || !online() || this._jobs.has(region.id))
            continue
          await this.update(region.id).catch(() => {})
        }
      }
      finally {
        this._updating = null
      }
    })()
    return this._updating
  }

  /**
   * How much storage the origin uses and may use, and whether the browser
   * keeps it under pressure. Undefined where the browser does not say.
   */
  async storage(): Promise<OfflineStorage | undefined> {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
    if (typeof storage?.estimate !== 'function')
      return undefined
    try {
      const { usage = 0, quota = 0 } = await storage.estimate()
      const persisted = typeof storage.persisted === 'function' ? await storage.persisted() : undefined
      return { usage, quota, free: Math.max(0, quota - usage), ...(persisted === undefined ? {} : { persisted }) }
    }
    catch {
      return undefined
    }
  }

  /** Ask the browser to keep downloads under storage pressure. Whether it agreed. */
  async persistStorage(): Promise<boolean> {
    this._persistAsked = true
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
    if (typeof storage?.persist !== 'function')
      return false
    try {
      const granted = await storage.persist()
      this.fire('persist', { persisted: granted })
      return granted
    }
    catch {
      return false
    }
  }

  /** Downloaded maps, newest first, as of the last `ready()`. */
  get regions(): OfflineRegionRecord[] {
    return [...this._regions.values()].map(r => ({ ...r })).sort((a, b) => b.createdAt - a.createdAt)
  }

  async list(): Promise<OfflineRegionRecord[]> {
    await this.ready()
    return this.regions
  }

  async get(id: string): Promise<OfflineRegionRecord | undefined> {
    await this.ready()
    const region = this._regions.get(id)
    return region ? { ...region } : undefined
  }

  /** Downloaded maps that include a point, complete ones only. */
  covering(point: LatLngLike): OfflineRegionRecord[] {
    return this.regions.filter((region) => {
      const [w, s, e, n] = region.bounds
      return region.status === 'complete' && point.lng >= w && point.lng <= e && point.lat >= s && point.lat <= n
    })
  }

  /** What an area would download. Uses this manager's `map` when the area names none. */
  plan(area: OfflineArea): PlannedArea {
    return planArea({ ...area, map: area.map ?? (area.sources ? undefined : this.map) })
  }

  /**
   * How much an area would download, before downloading it. The size comes
   * from what this device has measured of real tiles, sampling a few of this
   * area's own when there is nothing to go on yet.
   */
  async estimate(area: OfflineArea, options: { sample?: boolean } = {}): Promise<OfflineEstimate> {
    await this._layersReady(area)
    const planned = this.plan(area)
    const tooLarge = planned.count > this.maxTiles
    if (!tooLarge && options.sample !== false && this._measured.tiles < 8)
      await this._sample(planned)
    return { tiles: planned.count, bytes: this._bytesFor(planned), tooLarge }
  }

  /** The same estimate, from what has been measured already: for updating as a selection is dragged. */
  quickEstimate(area: OfflineArea): OfflineEstimate {
    const planned = this.plan(area)
    return { tiles: planned.count, bytes: this._bytesFor(planned), tooLarge: planned.count > this.maxTiles }
  }

  /**
   * Wait for layers that learn their zoom range from their source — a
   * `pmtiles://` archive's header — so the plan walks the real range rather
   * than a default. Immediate for every other layer.
   */
  async _layersReady(area: OfflineArea): Promise<void> {
    const map = area.map ?? (area.sources ? undefined : this.map)
    if (typeof map?.eachLayer !== 'function')
      return
    const waits: Array<Promise<unknown>> = []
    map.eachLayer((layer: any) => {
      const ready = layer?.sourceReady?.()
      if (ready)
        waits.push(ready.catch(() => {}))
    })
    await Promise.all(waits)
  }

  _averageTile(): number {
    return this._measured.tiles ? this._measured.bytes / this._measured.tiles : TYPICAL_TILE_BYTES
  }

  _bytesFor(planned: PlannedArea): number {
    const dem = planned.kinds.terrain
    const demAverage = this._measuredTerrain.tiles ? this._measuredTerrain.bytes / this._measuredTerrain.tiles : TYPICAL_DEM_BYTES
    return Math.round((planned.count - dem) * this._averageTile() + dem * demAverage)
  }

  _learn(bytes: number, tiles: number): void {
    if (tiles > 0 && bytes > 0) {
      this._measured.bytes += bytes
      this._measured.tiles += tiles
    }
  }

  async _sample(planned: PlannedArea): Promise<void> {
    const plan = planned.build()
    const terrain = new Set(plan.terrain)
    const urls = plan.urls.filter(url => !terrain.has(url))
    // The deepest zooms are most of any area, so sample from there.
    const from = Math.floor(urls.length * 0.4)
    const picks = new Set<string>()
    for (let i = 0; i < 6 && from < urls.length; i++)
      picks.add(urls[from + Math.floor(((urls.length - from) * (i + 0.5)) / 6)]!)
    await Promise.all([...picks].map(async (url) => {
      try {
        const stored = await this.store.getTile(url)
        if (stored?.data.byteLength) {
          this._learn(stored.data.byteLength, 1)
          return
        }
        const response = await this._fetch(url)
        if (response.ok)
          this._learn((await response.arrayBuffer()).byteLength, 1)
      }
      catch {
        // An estimate from fewer samples is still an estimate.
      }
    }))
  }

  /**
   * Download an area. Resolves once it is complete, paused or cancelled —
   * `progress` events report on the way, and the region is in `regions` from
   * the moment this is called.
   */
  async download(options: OfflineDownloadOptions): Promise<OfflineRegionRecord> {
    await this.ready()
    await this._layersReady(options)
    const planned = this.plan(options)
    if (planned.count === 0)
      throw new Error('Nothing to download: the area has no tile layers or sources')
    if (planned.count > this.maxTiles)
      throw new Error(`Area too large to download: ${planned.count} tiles, the limit is ${this.maxTiles}`)

    const plan = planned.build()
    const now = Date.now()
    const region: OfflineRegionRecord = {
      id: regionId(),
      name: options.name?.trim() || 'Offline Map',
      bounds: normalizeBounds(options.bounds),
      minZoom: planned.minZoom,
      maxZoom: planned.maxZoom,
      sources: planned.sources,
      status: 'downloading',
      tiles: plan.urls.length,
      downloaded: 0,
      bytes: 0,
      createdAt: now,
      updatedAt: now,
    }
    await this.store.putPlan(region.id, plan)
    await this._save(region)
    this._changed()
    // The first download is the moment to ask: a browser grants persistence
    // more readily to a site the user is visibly saving data for.
    if (this.persist && !this._persistAsked)
      void this.persistStorage()
    return this._start(region, plan, false)
  }

  /** Continue a paused or failed download from where it stopped. */
  async resume(id: string): Promise<OfflineRegionRecord> {
    await this.ready()
    const running = this._jobs.get(id)
    if (running)
      return running.promise
    const region = this._regions.get(id)
    const plan = await this.store.getPlan(id)
    if (!region || !plan)
      throw new Error(`No offline map ${id}`)
    return this._start(region, plan, false)
  }

  /** Fetch every tile of a downloaded map again, for the latest data. */
  async update(id: string): Promise<OfflineRegionRecord> {
    await this.ready()
    if (this._jobs.has(id))
      return this._jobs.get(id)!.promise
    const region = this._regions.get(id)
    const plan = await this.store.getPlan(id)
    if (!region || !plan)
      throw new Error(`No offline map ${id}`)
    return this._start(region, plan, true)
  }

  /** Stop a download, keeping what it has so far. */
  async pause(id: string): Promise<OfflineRegionRecord | undefined> {
    const job = this._jobs.get(id)
    if (!job) {
      // Paused by hand: no longer something `autoResume` should pick up.
      const region = this._regions.get(id)
      if (region?.interrupted) {
        delete region.interrupted
        await this._save(region)
      }
      return this.get(id)
    }
    job.stop = 'pause'
    job.interrupted = false
    job.abort.abort()
    return job.promise
  }

  /** Stop a download and delete it. */
  cancel(id: string): Promise<void> {
    return this.delete(id)
  }

  /** Delete a downloaded map, and every tile no other map holds. */
  async delete(id: string): Promise<void> {
    await this.ready()
    const job = this._jobs.get(id)
    if (job) {
      job.stop = 'cancel'
      job.abort.abort()
      await job.promise.catch(() => {})
    }
    const plan = await this.store.getPlan(id)
    for (const url of plan?.urls ?? []) {
      const refs = await this.store.getRefs(url)
      if (!refs)
        continue
      const regions = refs.regions.filter(r => r !== id)
      if (regions.length) {
        if (regions.length !== refs.regions.length)
          await this.store.putRefs(url, { regions, bytes: refs.bytes })
      }
      else {
        await this.store.deleteTile(url)
        await this.store.deleteRefs(url)
      }
    }
    await this.store.deletePlan(id)
    await this.store.deleteIndex(id)
    await this.store.deleteRegion(id)
    this._regions.delete(id)
    this._invalidate()
    this.fire('delete', { id })
    this._changed()
  }

  async rename(id: string, name: string): Promise<OfflineRegionRecord | undefined> {
    await this.ready()
    const region = this._regions.get(id)
    if (!region)
      return undefined
    region.name = name.trim() || region.name
    await this._save(region)
    this._changed()
    return { ...region }
  }

  /** Space used on this device, shared tiles counted once. */
  usage(): Promise<{ bytes: number, entries: number }> {
    return this.store.usage()
  }

  /** Delete every downloaded map. */
  async clear(): Promise<void> {
    await this.ready()
    for (const id of [...this._regions.keys()])
      await this.delete(id)
  }

  /** The bytes of a downloaded tile or file, if any map holds it. */
  async lookup(url: string): Promise<StoredTile | undefined> {
    if (!this.enabled)
      return undefined
    await this.ready()
    if (!this._regions.size)
      return undefined
    return this.store.getTile(url)
  }

  /** Whether there is anything downloaded to read, without waiting. */
  get hasRegions(): boolean {
    return this._regions.size > 0
  }

  // ---------- search and directions ----------

  /** Every named place in the downloaded maps. */
  places(): Promise<OfflinePlace[]> {
    this._places ??= (async () => {
      const all: OfflinePlace[] = []
      for (const index of await this._indexes())
        all.push(...index.places)
      return mergePlaces(all)
    })()
    return this._places
  }

  /** The named road nearest a point, within `radius` metres: the street you are on. */
  async nearestStreet(point: LatLngLike, radius: number = 60): Promise<(OfflinePlace & { distance: number }) | undefined> {
    const kx = Math.cos((point.lat * Math.PI) / 180)
    const m = 111_320
    let best: (OfflinePlace & { distance: number }) | undefined
    for (const index of await this._indexes()) {
      for (const road of index.roads) {
        if (!road.name)
          continue
        const c = road.coords
        for (let i = 2; i < c.length; i += 2) {
          const ax = (c[i - 1]! - point.lng) * kx * m
          const ay = (c[i - 2]! - point.lat) * m
          const bx = (c[i + 1]! - point.lng) * kx * m
          const by = (c[i]! - point.lat) * m
          const vx = bx - ax
          const vy = by - ay
          const len = vx * vx + vy * vy
          const t = len ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len)) : 0
          const d = Math.hypot(ax + vx * t, ay + vy * t)
          if (d <= radius && (!best || d < best.distance)) {
            best = {
              name: road.name,
              kind: 'street',
              rank: 13,
              lat: point.lat + (ay + vy * t) / m,
              lng: point.lng + (ax + vx * t) / (kx * m),
              distance: d,
            }
          }
        }
      }
    }
    return best
  }

  /** Directions over the roads in the downloaded maps. Empty when the waypoints are not both inside one. */
  async route(waypoints: LatLngLike[], options: DirectionsOptions = {}): Promise<Route[]> {
    // Downloaded tiles carry roads, not timetables.
    const profile = streetProfile(options.profile, 'Offline routing')
    let graph = this._graphs.get(profile)
    if (!graph) {
      graph = (async () => {
        const roads = []
        const restrictions = []
        for (const index of await this._indexes()) {
          roads.push(...index.roads)
          restrictions.push(...index.restrictions ?? [])
        }
        return new RoadGraph(roads, { profile, restrictions })
      })()
      this._graphs.set(profile, graph)
    }
    return routeOnGraph(await graph, waypoints, { profile, alternatives: options.alternatives })
  }

  /** A `GeocoderProvider` searching the downloaded maps. */
  geocoder(): OfflineGeocoder {
    this._geocoder ??= new OfflineGeocoder(this)
    return this._geocoder
  }

  /** A `DirectionsProvider` routing over the downloaded maps. */
  directions(): OfflineDirections {
    this._directions ??= new OfflineDirections(this)
    return this._directions
  }

  async _indexes(): Promise<OfflineIndex[]> {
    await this.ready()
    const out: OfflineIndex[] = []
    for (const region of this._regions.values()) {
      if (region.status !== 'complete')
        continue
      const index = await this.store.getIndex(region.id)
      if (index)
        out.push(index)
    }
    return out
  }

  _invalidate(): void {
    this._places = null
    this._graphs.clear()
  }

  // ---------- the download itself ----------

  _start(region: OfflineRegionRecord, plan: OfflinePlan, refresh: boolean): Promise<OfflineRegionRecord> {
    const job: Job = { stop: false, abort: new AbortController(), promise: undefined as unknown as Promise<OfflineRegionRecord> }
    this._jobs.set(region.id, job)
    job.promise = this._run(region, plan, refresh, job).finally(() => this._jobs.delete(region.id))
    return job.promise
  }

  async _run(region: OfflineRegionRecord, plan: OfflinePlan, refresh: boolean, job: Job): Promise<OfflineRegionRecord> {
    if (this.background) {
      const handed = await this._runInBackground(region, plan, refresh, job)
      if (handed)
        return handed
    }
    region.status = 'downloading'
    region.downloaded = 0
    region.bytes = 0
    delete region.error
    delete region.interrupted
    await this._save(region)
    this._changed()

    let cursor = 0
    let failed = 0
    const terrain = new Set(plan.terrain)
    const dem = { bytes: 0, tiles: 0 }
    let lastFire = 0
    let lastSave = 0
    const progress = async (): Promise<void> => {
      const now = Date.now()
      if (now - lastFire > 100 || region.downloaded === region.tiles) {
        lastFire = now
        this.fire('progress', { region: { ...region } })
      }
      if (now - lastSave > 1000) {
        lastSave = now
        await this._save(region)
      }
    }

    const worker = async (): Promise<void> => {
      while (!job.stop && cursor < plan.urls.length) {
        const url = plan.urls[cursor++]!
        try {
          // Awaited first: `region.bytes += await …` would read the total
          // before the wait and lose what other workers added meanwhile.
          const bytes = await this._fetchInto(url, region.id, refresh, job.abort.signal)
          region.bytes += bytes
          region.downloaded++
          if (terrain.has(url)) {
            dem.bytes += bytes
            dem.tiles++
          }
        }
        catch (err) {
          if (job.stop)
            return
          if (isQuotaError(err)) {
            // Every tile after this one would fail the same way.
            job.quota = true
            job.stop = 'pause'
            job.abort.abort()
            return
          }
          if ((err as Error)?.name !== 'AbortError')
            failed++
        }
        await progress()
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.concurrency, plan.urls.length) }, worker))

    if (job.stop === 'cancel')
      return { ...region }
    return this._finish(region, plan, refresh, job, failed, dem)
  }

  /**
   * Settle a download whose files are in: index it, add the glyphs its names
   * need, and say how it ended. Shared by the page's downloads and the ones
   * a service worker takes in from Background Fetch.
   */
  async _finish(region: OfflineRegionRecord, plan: OfflinePlan, refresh: boolean, job: Job, failed: number, dem: { bytes: number, tiles: number } = { bytes: 0, tiles: 0 }): Promise<OfflineRegionRecord> {
    delete region.background
    if (job.quota) {
      region.status = 'error'
      region.error = 'Not enough storage on this device. Delete a map, or choose a smaller area.'
    }
    else if (job.stop === 'pause') {
      region.status = 'paused'
      if (job.interrupted)
        region.interrupted = true
    }
    else if (failed) {
      region.status = 'error'
      region.error = `${failed} of ${region.tiles} tiles could not be downloaded`
      // Failed for want of a connection: `autoResume` tries again when it returns.
      if (!online())
        region.interrupted = true
    }
    else {
      await this.store.putIndex(region.id, await this._buildIndex(plan))
      // Names in other scripts need their own glyph ranges, which only the
      // tiles can say: Cyrillic in Sofia, Arabic in Cairo.
      if (plan.glyphs && !(await this._fetchGlyphs(region, plan, refresh, job))) {
        // Stopped part way (`job.stop` is set by now, whatever TypeScript
        // narrowed it to above), or a range would not download.
        const stopped = (job as Job).stop
        region.status = stopped ? 'paused' : 'error'
        if (!stopped)
          region.error = 'Some label glyphs could not be downloaded'
      }
      else {
        region.status = 'complete'
        this._learn(region.bytes - dem.bytes, region.downloaded - dem.tiles)
        if (dem.tiles) {
          this._measuredTerrain.bytes += dem.bytes
          this._measuredTerrain.tiles += dem.tiles
        }
      }
    }
    region.updatedAt = Date.now()
    await this._save(region)
    this._invalidate()
    this._changed()
    this._ended(region)
    this._broadcast(region.id)
    return { ...region }
  }

  _ended(region: OfflineRegionRecord): void {
    if (region.status === 'complete')
      this.fire('complete', { region: { ...region } })
    else if (region.status === 'error')
      this.fire('error', { region: { ...region }, error: new Error(region.error) })
  }

  /** Store one URL for a region, fetching it unless it is already held. Returns its size. */
  async _fetchInto(url: string, id: string, refresh: boolean, signal: AbortSignal): Promise<number> {
    const refs = await this.store.getRefs(url)
    const holders = refs?.regions ?? []
    if (refs && !refresh) {
      if (!holders.includes(id))
        await this.store.putRefs(url, { regions: [...holders, id], bytes: refs.bytes })
      return refs.bytes
    }

    let response: Response | undefined
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted)
        throw abortError()
      try {
        response = await this._fetch(url, { signal })
        // A server error or rate limit is worth another try; a 4xx is not.
        if (response.status < 500 && response.status !== 429)
          break
      }
      catch (err) {
        if (signal.aborted || attempt >= 2)
          throw err
      }
      if (attempt >= 2)
        break
      await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt))
    }
    if (!response)
      throw new Error(`Failed to fetch ${url}`)

    let data: Uint8Array
    if (response.status === 404 || response.status === 204) {
      // No tile here — open sea, usually. Kept as an empty tile, so offline
      // it draws as nothing rather than as an error.
      data = new Uint8Array(0)
    }
    else if (!response.ok) {
      // Updating keeps the tile already held rather than losing it.
      if (refs)
        return refs.bytes
      throw new Error(`HTTP ${response.status} fetching ${url}`)
    }
    else {
      data = new Uint8Array(await response.arrayBuffer())
    }
    return this._keep(url, id, response, data, holders)
  }

  /** Store a fetched file for a region, alongside any other region that holds it. */
  async _keep(url: string, id: string, response: Response, data: Uint8Array, holders: string[]): Promise<number> {
    const mime = response.headers.get('content-type') ?? 'application/octet-stream'
    await this.store.putTile(url, { data, mime })
    await this.store.putRefs(url, { regions: holders.includes(id) ? holders : [...holders, id], bytes: data.byteLength })
    return data.byteLength
  }

  /**
   * Download the glyph ranges the area's labels need beyond those planned,
   * and add them to its plan so they are updated and deleted with it.
   * Whether every one arrived.
   */
  async _fetchGlyphs(region: OfflineRegionRecord, plan: OfflinePlan, refresh: boolean, job: Job): Promise<boolean> {
    const glyphs = plan.glyphs!
    const needed = new Set<number>()
    for (const { url } of plan.index) {
      const tile = await this.store.getTile(url)
      if (tile?.data.byteLength)
        labelGlyphRanges(tile.data, glyphs.keys, needed)
    }
    const ranges = [...needed].filter(r => !glyphs.ranges.includes(r)).sort((a, b) => a - b)
    if (!ranges.length)
      return true
    const urls = glyphUrls(glyphs, ranges).filter(url => !plan.urls.includes(url))
    region.tiles += urls.length
    let ok = true
    for (const url of urls) {
      if (job.stop)
        return false
      try {
        region.bytes += await this._fetchInto(url, region.id, refresh, job.abort.signal)
        region.downloaded++
      }
      catch {
        ok = false
      }
    }
    plan.urls.push(...urls)
    plan.glyphs = { ...glyphs, ranges: [...glyphs.ranges, ...ranges].sort((a, b) => a - b) }
    await this.store.putPlan(region.id, plan)
    this.fire('progress', { region: { ...region } })
    return ok
  }

  async _buildIndex(plan: OfflinePlan): Promise<OfflineIndex> {
    const places: OfflinePlace[] = []
    const roads: OfflineIndex['roads'] = []
    for (const { url, x, y, z } of plan.index) {
      const tile = await this.store.getTile(url)
      if (!tile?.data.byteLength)
        continue
      const index = extractTile(tile.data, x, y, z, this.schema)
      places.push(...index.places)
      roads.push(...index.roads)
    }
    return { places: mergePlaces(places), roads, ...(plan.restrictions?.length ? { restrictions: plan.restrictions } : {}) }
  }

  async _save(region: OfflineRegionRecord): Promise<void> {
    this._regions.set(region.id, region)
    await this.store.putRegion({ ...region })
  }

  _changed(): void {
    this.fire('change', { regions: this.regions })
  }

  // ---------- the earlier, one-shot API ----------

  /**
   * Prefetch tiles into a `TileCache`, without making a downloaded map.
   *
   * @deprecated Use `download()`, which the map reads offline, keeps across
   * reloads and can pause, update and delete.
   */
  save(options: Parameters<typeof saveOfflineRegion>[0]): ReturnType<typeof saveOfflineRegion> {
    return saveOfflineRegion(options, this.map)
  }

  /** Space used by downloaded maps. */
  size(): Promise<{ bytes: number, entries: number }> {
    return this.usage()
  }
}

let shared: OfflineMaps | undefined
let probe: Promise<OfflineMaps | undefined> | undefined
let probed = false

/** The page's offline maps. */
export function offlineMaps(options?: OfflineMapsOptions): OfflineMaps {
  shared ??= new OfflineMaps(options)
  return shared
}

/** Replace the page's offline maps — with one on another store, say, or `null` to forget it. */
export function setOfflineMaps(maps: OfflineMaps | null): void {
  shared = maps ?? undefined
  probe = undefined
  probed = false
}

/**
 * The page's offline maps if any may exist, for code that fetches map data.
 * Opening a database on every page that shows a map, just to find it empty,
 * would be a cost for nothing — so where the browser can say no database was
 * ever created, this answers undefined without creating one.
 */
export function activeOfflineMaps(): Promise<OfflineMaps | undefined> {
  if (shared)
    return Promise.resolve(shared)
  probe ??= IndexedDBOfflineStore.exists()
    .catch(() => undefined)
    .then((exists) => {
      probed = true
      return exists ? offlineMaps() : undefined
    })
  return probe
}

/** The same, without waiting: the manager when it is known to have maps, `'pending'` while that is being found out. */
export function offlineMapsNow(): OfflineMaps | 'pending' | undefined {
  if (shared)
    return shared._loaded ? (shared.hasRegions && shared.enabled ? shared : undefined) : 'pending'
  if (!probe)
    activeOfflineMaps()
  return probed ? shared : 'pending'
}

/**
 * `fetch`, reading downloaded maps first. Used for every piece of map data —
 * tiles, the style, sprites, glyphs — so a downloaded area draws the same
 * with no connection. With `onlyOffline`, whatever is not downloaded fails
 * without going to the network.
 */
export async function offlineFetch(url: string, init?: RequestInit): Promise<Response> {
  // Known to have nothing downloaded: straight to the network.
  if (offlineMapsNow() === undefined && !shared?.onlyOffline)
    return pmtilesFetch(url, init)
  const maps = await activeOfflineMaps()
  if (maps?.enabled) {
    const hit = await maps.lookup(url).catch(() => undefined)
    if (hit) {
      const empty = hit.data.byteLength === 0
      return new Response(empty ? null : (hit.data as unknown as BodyInit), {
        status: empty ? 204 : 200,
        headers: { 'content-type': hit.mime },
      })
    }
    if (maps.onlyOffline)
      return new Response(null, { status: 504, statusText: 'Only using offline maps' })
  }
  return pmtilesFetch(url, init)
}
