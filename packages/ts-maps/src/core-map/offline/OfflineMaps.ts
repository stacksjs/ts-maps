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
import type { RouteOptions } from './router'
import { Evented } from '../core/Events'
import { saveOfflineRegion } from '../storage/offlineRegion'
import { extractTile, mergePlaces } from './extract'
import { IndexedDBOfflineStore, MemoryOfflineStore } from './OfflineStore'
import { normalizeBounds, planArea } from './plan'
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
}

/** A typical vector or image tile, before this device has measured any. */
const TYPICAL_TILE_BYTES = 32_000

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
  /** Never go to the network for map data, as Apple's "Only Use Offline Maps". */
  onlyOffline: boolean = false

  _fetch: (url: string, init?: RequestInit) => Promise<Response>
  _regions: Map<string, OfflineRegionRecord> = new Map()
  _ready: Promise<void> | null = null
  _loaded: boolean = false
  _jobs: Map<string, Job> = new Map()
  /** Bytes and tiles measured so far, for estimates. */
  _measured: { bytes: number, tiles: number } = { bytes: 0, tiles: 0 }
  _places: Promise<OfflinePlace[]> | null = null
  _graphs: Map<string, Promise<RoadGraph>> = new Map()
  _geocoder?: OfflineGeocoder
  _directions?: OfflineDirections

  constructor(options: OfflineMapsOptions = {}) {
    super()
    this.store = options.store ?? (IndexedDBOfflineStore.available() ? new IndexedDBOfflineStore() : new MemoryOfflineStore())
    this.concurrency = Math.max(1, options.concurrency ?? 6)
    this.maxTiles = options.maxTiles ?? 150_000
    this._fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init))
  }

  /**
   * Load the list of downloaded maps. Downloads a reload interrupted come
   * back paused, to be resumed.
   */
  ready(): Promise<void> {
    this._ready ??= (async () => {
      for (const region of await this.store.listRegions()) {
        if (region.status === 'downloading' && !this._jobs.has(region.id)) {
          region.status = 'paused'
          await this.store.putRegion(region)
        }
        this._regions.set(region.id, region)
        if (region.status === 'complete')
          this._learn(region.bytes, region.downloaded)
      }
      this._loaded = true
    })()
    return this._ready
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
    const planned = this.plan(area)
    const tooLarge = planned.count > this.maxTiles
    if (!tooLarge && options.sample !== false && this._measured.tiles < 8)
      await this._sample(planned)
    return { tiles: planned.count, bytes: Math.round(planned.count * this._averageTile()), tooLarge }
  }

  /** The same estimate, from what has been measured already: for updating as a selection is dragged. */
  quickEstimate(area: OfflineArea): OfflineEstimate {
    const planned = this.plan(area)
    return { tiles: planned.count, bytes: Math.round(planned.count * this._averageTile()), tooLarge: planned.count > this.maxTiles }
  }

  _averageTile(): number {
    return this._measured.tiles ? this._measured.bytes / this._measured.tiles : TYPICAL_TILE_BYTES
  }

  _learn(bytes: number, tiles: number): void {
    if (tiles > 0 && bytes > 0) {
      this._measured.bytes += bytes
      this._measured.tiles += tiles
    }
  }

  async _sample(planned: PlannedArea): Promise<void> {
    const { urls } = planned.build()
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
    if (!job)
      return this.get(id)
    job.stop = 'pause'
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
  async route(waypoints: LatLngLike[], options: DirectionsOptions & RouteOptions = {}): Promise<Route[]> {
    const profile = options.profile ?? 'driving'
    let graph = this._graphs.get(profile)
    if (!graph) {
      graph = (async () => {
        const roads = []
        for (const index of await this._indexes())
          roads.push(...index.roads)
        return new RoadGraph(roads, { profile })
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
    region.status = 'downloading'
    region.downloaded = 0
    region.bytes = 0
    delete region.error
    await this._save(region)
    this._changed()

    let cursor = 0
    let failed = 0
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
        }
        catch (err) {
          if (job.stop)
            return
          if ((err as Error)?.name !== 'AbortError')
            failed++
        }
        await progress()
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.concurrency, plan.urls.length) }, worker))

    if (job.stop === 'cancel')
      return { ...region }

    if (job.stop === 'pause') {
      region.status = 'paused'
    }
    else if (failed) {
      region.status = 'error'
      region.error = `${failed} of ${region.tiles} tiles could not be downloaded`
    }
    else {
      await this.store.putIndex(region.id, await this._buildIndex(plan))
      region.status = 'complete'
      this._learn(region.bytes, region.downloaded)
    }
    region.updatedAt = Date.now()
    await this._save(region)
    this._invalidate()
    this._changed()
    if (region.status === 'complete')
      this.fire('complete', { region: { ...region } })
    else if (region.status === 'error')
      this.fire('error', { region: { ...region }, error: new Error(region.error) })
    return { ...region }
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
    const mime = response.headers.get('content-type') ?? 'application/octet-stream'
    await this.store.putTile(url, { data, mime })
    await this.store.putRefs(url, { regions: holders.includes(id) ? holders : [...holders, id], bytes: data.byteLength })
    return data.byteLength
  }

  async _buildIndex(plan: OfflinePlan): Promise<OfflineIndex> {
    const places: OfflinePlace[] = []
    const roads: OfflineIndex['roads'] = []
    for (const { url, x, y, z } of plan.index) {
      const tile = await this.store.getTile(url)
      if (!tile?.data.byteLength)
        continue
      const index = extractTile(tile.data, x, y, z)
      places.push(...index.places)
      roads.push(...index.roads)
    }
    return { places: mergePlaces(places), roads }
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
    return fetch(url, init)
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
  return fetch(url, init)
}
