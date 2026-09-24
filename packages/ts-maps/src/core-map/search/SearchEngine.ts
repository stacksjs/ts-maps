/**
 * Search as Apple Maps does it: one box for places, addresses and kinds of
 * place, answering from three places at once.
 *
 * - **The map itself.** The vector tiles on screen already carry the name,
 *   kind and position of every café, park, street and neighbourhood in view,
 *   so those answers are instant and need no network.
 * - **Downloaded offline maps**, for the same with no connection.
 * - **An online geocoder**, for everything else: addresses, and places far
 *   from the view. Photon by default, which is built for search-as-you-type;
 *   Nominatim's usage policy forbids autocomplete.
 *
 * Results are merged — the same café from the map and from Photon is one
 * result, with Photon's address — and ranked by how well the name matches,
 * how prominent the place is, and how near.
 */

import type { OfflineMaps } from '../offline/OfflineMaps'
import type { SearchCategory } from './categories'
import type { GeocoderProvider, GeocodingResult, LatLngLike } from '../services/types'
import { activeOfflineMaps, offlineMapsNow } from '../offline/OfflineMaps'
import { unitToLat, unitToLng } from '../offline/plan'
import { matchScore } from '../offline/search'
import { PhotonGeocoder } from '../services/providers/Photon'
import { iconForKind, kindLabel } from './categories'

export interface SearchPlace {
  /** Stable for the same place from the same source. */
  id: string
  name: string
  center: LatLngLike
  /** OpenMapTiles `subclass` or `class` — `cafe`, `restaurant`, `city`, `street` — or the provider's own. */
  kind: string
  /** The badge it wears: a `POI_CATEGORIES` name. */
  icon: string
  /** Street address, or the town it is in, where known. */
  address?: string
  bbox?: [number, number, number, number]
  /** Metres from where the search was made from. */
  distance?: number
  source: 'map' | 'offline' | 'online'
  /** Lower is more prominent. */
  rank: number
  properties?: Record<string, unknown>
}

export interface SearchQueryOptions {
  /** Where "near" is: the device, or the middle of the map. */
  near?: LatLngLike
  /** The area in view, `[west, south, east, north]`. */
  bounds?: [number, number, number, number]
  limit?: number
  signal?: AbortSignal
  /** Ask the online provider too. Default true. */
  online?: boolean
}

export interface SearchEngineOptions {
  /** The map whose tiles are searched. */
  map?: any
  /** Online geocoder. Default Photon; `null` for none. */
  provider?: GeocoderProvider | null
  /** Downloaded maps to search. Default: the page's, when it has any. */
  offline?: OfflineMaps | null
  language?: string
}

/** Tile layers read for places, and what kind of place each holds. */
const LAYERS = ['poi', 'place', 'transportation_name', 'water_name', 'park', 'aerodrome_label', 'mountain_peak'] as const

const PLACE_RANK: Record<string, number> = {
  country: 1,
  state: 2,
  city: 3,
  town: 5,
  village: 7,
  suburb: 7,
  quarter: 8,
  neighbourhood: 8,
  hamlet: 9,
}

const M = 111_320

export function distanceMeters(a: LatLngLike, b: LatLngLike): number {
  const kx = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
  return Math.hypot((a.lng - b.lng) * kx, a.lat - b.lat) * M
}

function fold(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036F]/g, '').toLowerCase().trim()
}

function inBounds(p: LatLngLike, b: [number, number, number, number] | undefined): boolean {
  return !b || (p.lng >= b[0] && p.lng <= b[2] && p.lat >= b[1] && p.lat <= b[3])
}

interface MapFeature {
  name: string
  kind: string
  cls: string
  layer: string
  rank: number
  /** Only decoded for features that are wanted. */
  center: () => LatLngLike | undefined
  lines: () => LatLngLike[][]
}

/**
 * Every named feature in the vector tiles the map has loaded, with its
 * position worked out only when asked for.
 */
function* mapFeatures(map: any): Generator<MapFeature> {
  for (const host of map?._style?.sourceLayers?.values?.() ?? []) {
    if (typeof host.querySourceFeatures !== 'function' || typeof host._subTile !== 'function')
      continue
    for (const layer of LAYERS) {
      for (const { feature, tile } of host.querySourceFeatures({ sourceLayer: layer })) {
        const props = feature.properties ?? {}
        const name = props['name:latin'] ?? props.name ?? (layer === 'transportation_name' ? props.ref : undefined)
        if (typeof name !== 'string' || !name.trim())
          continue
        const cls = String(props.class ?? layer)
        const kind = layer === 'transportation_name'
          ? 'street'
          : layer === 'mountain_peak' ? 'peak' : layer === 'aerodrome_label' ? 'airport' : String(props.subclass ?? cls)
        const rank = typeof props.rank === 'number' ? props.rank : 10
        let geometry: LatLngLike[][] | undefined
        const lines = (): LatLngLike[][] => {
          if (geometry)
            return geometry
          const sub = host._subTile(tile)
          const z = host._getZoomForUrl(sub.z)
          const n = 2 ** z
          geometry = (feature.loadGeometry() as Array<Array<{ x: number, y: number }>>).map(ring => ring.map(p => ({
            lat: unitToLat((sub.y + p.y / feature.extent) / n),
            lng: unitToLng((sub.x + p.x / feature.extent) / n),
          })))
          return geometry
        }
        const center = (): LatLngLike | undefined => {
          const ring = lines()[0]
          if (!ring?.length)
            return undefined
          if (feature.type === 3) {
            let lat = 0
            let lng = 0
            for (const p of ring) {
              lat += p.lat
              lng += p.lng
            }
            return { lat: lat / ring.length, lng: lng / ring.length }
          }
          return ring[Math.floor(ring.length / 2)]
        }
        yield { name: name.trim(), kind, cls, layer, rank, center, lines }
      }
    }
  }
}

function prominence(kind: string, rank: number, layer: string): number {
  if (layer === 'place')
    return PLACE_RANK[kind] ?? 9
  if (layer === 'poi')
    return 11 + Math.min(rank, 60) / 12
  if (layer === 'transportation_name')
    return 12
  return 10
}

/**
 * Street names on the map, to give a place from the tiles — which carry no
 * address — the street it is on.
 */
export class StreetIndex {
  _cells: Map<string, Array<{ name: string, a: LatLngLike, b: LatLngLike }>> = new Map()

  constructor(map: any, bounds?: [number, number, number, number]) {
    for (const feature of mapFeatures(map)) {
      if (feature.layer !== 'transportation_name')
        continue
      for (const line of feature.lines()) {
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1]!
          const b = line[i]!
          if (bounds && !inBounds(a, bounds) && !inBounds(b, bounds))
            continue
          // Every cell the segment's box touches: a long straight street is
          // one long segment.
          const segment = { name: feature.name, a, b }
          for (let cx = Math.floor(Math.min(a.lat, b.lat) * 500); cx <= Math.floor(Math.max(a.lat, b.lat) * 500); cx++) {
            for (let cy = Math.floor(Math.min(a.lng, b.lng) * 500); cy <= Math.floor(Math.max(a.lng, b.lng) * 500); cy++) {
              const key = `${cx},${cy}`
              const list = this._cells.get(key)
              if (list)
                list.push(segment)
              else
                this._cells.set(key, [segment])
            }
          }
        }
      }
    }
  }

  /** The named street within `radius` metres, nearest first. */
  nearest(p: LatLngLike, radius: number = 60): string | undefined {
    const cx = Math.floor(p.lat * 500)
    const cy = Math.floor(p.lng * 500)
    const kx = Math.cos((p.lat * Math.PI) / 180)
    let best: string | undefined
    let bestD = radius
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const { name, a, b } of this._cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          const ax = (a.lng - p.lng) * kx * M
          const ay = (a.lat - p.lat) * M
          const vx = (b.lng - a.lng) * kx * M
          const vy = (b.lat - a.lat) * M
          const len = vx * vx + vy * vy
          const t = len ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len)) : 0
          const d = Math.hypot(ax + vx * t, ay + vy * t)
          if (d < bestD) {
            bestD = d
            best = name
          }
        }
      }
    }
    return best
  }
}

/** A provider's result as a place: name split from address, and a kind to wear an icon for. */
export function placeFromResult(result: GeocodingResult, index: number): SearchPlace {
  const props = (result.properties ?? {}) as Record<string, any>
  const [first, ...rest] = result.text.split(',').map(s => s.trim())
  const name = (typeof props.name === 'string' && props.name) || first || result.text
  const street = props.street ? [props.housenumber, props.street].filter(Boolean).join(' ') : undefined
  const address = street
    ? [street, props.city].filter(Boolean).join(', ')
    : rest.filter(part => part !== name).slice(0, 2).join(', ')
      || [props.city, props.state].filter(v => typeof v === 'string' && v !== name).join(', ')
      || undefined
  const kind = typeof props.osm_value === 'string'
    ? props.osm_value
    : typeof props.type === 'string' ? props.type : (result.placeType ?? 'place')
  return {
    id: `online:${props.osm_type ?? ''}${props.osm_id ?? `${result.center.lat.toFixed(5)},${result.center.lng.toFixed(5)}:${index}`}`,
    name,
    center: result.center,
    kind: kind === 'house' ? 'address' : kind,
    icon: iconForKind(kind, props.osm_key),
    address,
    bbox: result.bbox,
    source: 'online',
    rank: result.placeType === 'country' ? 1 : result.placeType === 'region' ? 2 : result.placeType === 'place' ? 4 : 11,
    properties: props,
  }
}

export class SearchEngine {
  map?: any
  provider: GeocoderProvider | null
  offline?: OfflineMaps | null
  language?: string

  constructor(options: SearchEngineOptions = {}) {
    this.map = options.map
    this.provider = options.provider === undefined ? new PhotonGeocoder() : options.provider
    this.offline = options.offline
    this.language = options.language
  }

  /** Where "near" is when the caller does not say: the middle of the map. */
  _near(options: SearchQueryOptions): LatLngLike | undefined {
    if (options.near)
      return options.near
    const c = this.map?.getCenter?.()
    return c ? { lat: c.lat, lng: c.lng } : undefined
  }

  async _offline(): Promise<OfflineMaps | undefined> {
    if (this.offline === null)
      return undefined
    const maps = this.offline ?? await activeOfflineMaps()
    if (!maps)
      return undefined
    await maps.ready()
    return maps.hasRegions ? maps : undefined
  }

  _online(options: SearchQueryOptions): boolean {
    if (!this.provider || options.online === false)
      return false
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      return false
    // "Only Use Offline Maps" keeps search off the network too.
    const shared = offlineMapsNow()
    const maps = this.offline ?? (typeof shared === 'object' ? shared : undefined)
    return !maps?.onlyOffline
  }

  /** Places on the map and in downloaded maps whose names match: instant, no network. */
  async local(query: string, options: SearchQueryOptions = {}): Promise<SearchPlace[]> {
    const near = this._near(options)
    const out: SearchPlace[] = []
    const q = fold(query)
    if (!q)
      return out
    for (const f of mapFeatures(this.map)) {
      const match = matchScore(f.name, query)
      if (match <= 0)
        continue
      const center = f.center()
      if (!center)
        continue
      out.push(this._score({
        id: `map:${f.layer}:${fold(f.name)}:${center.lat.toFixed(4)},${center.lng.toFixed(4)}`,
        name: f.name,
        center,
        kind: f.kind,
        icon: f.layer === 'place' || f.layer === 'transportation_name' ? 'place' : iconForKind(f.kind, f.cls),
        source: 'map',
        rank: prominence(f.kind, f.rank, f.layer),
      }, match, near))
    }
    const maps = await this._offline()
    for (const p of (await maps?.places()) ?? []) {
      const match = matchScore(p.name, query)
      if (match <= 0)
        continue
      out.push(this._score({
        id: `offline:${fold(p.name)}:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`,
        name: p.name,
        center: { lat: p.lat, lng: p.lng },
        kind: p.kind,
        icon: PLACE_RANK[p.kind] || p.kind === 'street' ? 'place' : iconForKind(p.kind),
        source: 'offline',
        rank: p.rank,
      }, match, near))
    }
    return out
  }

  /** How well a place answers the query here: the name, its prominence, and how near. */
  _score(place: SearchPlace, match: number, near: LatLngLike | undefined): SearchPlace & { score: number } {
    const distance = near ? distanceMeters(near, place.center) : undefined
    let score = match * 10 - place.rank * 0.3
    if (distance !== undefined)
      score -= Math.log10(1 + distance / 400) * 1.6
    return { ...place, distance, score }
  }

  /**
   * Suggestions as the query is typed: what is on the map straight away, and
   * the online geocoder's answers merged in when they arrive. `onLocal`, if
   * given, hears the instant answers before the network's.
   */
  async suggest(query: string, options: SearchQueryOptions & { onLocal?: (places: SearchPlace[]) => void } = {}): Promise<SearchPlace[]> {
    const limit = options.limit ?? 8
    const local = await this.local(query, options)
    const ranked = merge(local).slice(0, limit)
    options.onLocal?.(ranked)
    if (!this._online(options) || query.trim().length < 2)
      return ranked
    const near = this._near(options)
    let online: SearchPlace[] = []
    try {
      const results = await this.provider!.search(query, { limit: Math.max(5, limit), proximity: near, signal: options.signal, language: this.language })
      online = results.map((r, i) => {
        const place = placeFromResult(r, i)
        // The provider found it for a reason, even where the name alone
        // does not say why — an address, a postcode.
        return this._score(place, Math.max(matchScore(place.name, query), 0.5), near)
      })
    }
    catch (err) {
      if ((err as Error)?.name === 'AbortError')
        throw err
      // Offline, or the service is down: what the map knows still stands.
    }
    return merge([...local, ...online]).slice(0, limit)
  }

  /** Everything matching a query, for a results list with pins. */
  search(query: string, options: SearchQueryOptions = {}): Promise<SearchPlace[]> {
    return this.suggest(query, { ...options, limit: options.limit ?? 25 })
  }

  /**
   * Places of a kind in an area — "Coffee" near here — read from the map's
   * tiles and downloaded maps, and from the online geocoder when those have
   * little to offer (zoomed out, where tiles carry only the best-known places).
   */
  async nearby(category: SearchCategory, options: SearchQueryOptions = {}): Promise<SearchPlace[]> {
    const near = this._near(options)
    const bounds = options.bounds ?? this._viewBounds()
    const limit = options.limit ?? 25
    const kinds = new Set(category.kinds)
    const out: SearchPlace[] = []
    for (const f of mapFeatures(this.map)) {
      if (f.layer !== 'poi' || !(kinds.has(f.kind) || kinds.has(f.cls)))
        continue
      const center = f.center()
      if (!center || !inBounds(center, bounds))
        continue
      out.push(this._score({
        id: `map:${f.layer}:${fold(f.name)}:${center.lat.toFixed(4)},${center.lng.toFixed(4)}`,
        name: f.name,
        center,
        kind: f.kind,
        icon: iconForKind(f.kind, f.cls),
        source: 'map',
        rank: prominence(f.kind, f.rank, f.layer),
      }, 1, near))
    }
    const maps = await this._offline()
    for (const p of (await maps?.places()) ?? []) {
      if (!kinds.has(p.kind) || !inBounds({ lat: p.lat, lng: p.lng }, bounds))
        continue
      out.push(this._score({
        id: `offline:${fold(p.name)}:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`,
        name: p.name,
        center: { lat: p.lat, lng: p.lng },
        kind: p.kind,
        icon: category.icon,
        source: 'offline',
        rank: p.rank,
      }, 1, near))
    }
    if (out.length < 3 && this._online(options)) {
      try {
        const results = await this.provider!.search(category.label, { limit, proximity: near, bbox: bounds, signal: options.signal, language: this.language })
        results.forEach((r, i) => {
          const place = placeFromResult(r, i)
          if (inBounds(place.center, bounds))
            out.push(this._score({ ...place, icon: category.icon }, 1, near))
        })
      }
      catch (err) {
        if ((err as Error)?.name === 'AbortError')
          throw err
      }
    }
    // Nearest first, as Apple lists them.
    return merge(out).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, limit)
  }

  _viewBounds(): [number, number, number, number] | undefined {
    const b = this.map?.getBounds?.()
    return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : undefined
  }

  _streets?: { key: string, index: StreetIndex }

  /** Give places from the tiles, which carry no address, the street they are on. */
  addStreets(places: SearchPlace[]): SearchPlace[] {
    const needs = places.filter(p => !p.address && p.source !== 'online' && p.kind !== 'street' && !PLACE_RANK[p.kind])
    if (!needs.length || !this.map)
      return places
    // Built once per view: typing a query asks many times over the same map.
    const c = this.map.getCenter?.()
    const key = `${c?.lat.toFixed(3)},${c?.lng.toFixed(3)},${this.map.getZoom?.()?.toFixed(1)}`
    if (this._streets?.key !== key)
      this._streets = { key, index: new StreetIndex(this.map) }
    const index = this._streets.index
    for (const place of needs) {
      const street = index.nearest(place.center)
      if (street)
        place.address = street
    }
    return places
  }
}

/**
 * One result per place: the same name within a couple of hundred metres is
 * the same place, and a street the tiles cut into pieces is one street. The
 * best-scored copy stands, with an address from whichever copy had one.
 */
export function merge<T extends SearchPlace & { score?: number }>(places: T[]): T[] {
  const sorted = [...places].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const kept: T[] = []
  for (const place of sorted) {
    const name = fold(place.name)
    const reach = place.kind === 'street' || PLACE_RANK[place.kind] ? 2000 : 200
    const same = kept.find(k => fold(k.name) === name && distanceMeters(k.center, place.center) < reach)
    if (same) {
      same.address ??= place.address
      same.bbox ??= place.bbox
      continue
    }
    kept.push({ ...place })
  }
  return kept
}

/** The second line of a result: "Café · 0.3 mi · Market Street". */
export function describePlace(place: SearchPlace, formatDistance?: (meters: number) => string): string {
  return [
    kindLabel(place.kind),
    place.distance !== undefined && formatDistance ? formatDistance(place.distance) : undefined,
    place.address,
  ].filter(Boolean).join(' · ')
}

export interface SearchHistoryEntry {
  query?: string
  place?: SearchPlace
  time: number
}

/**
 * Recent searches and places, kept in the browser as Apple keeps Recents.
 * Storage that is missing or refuses is not an error: the list just starts
 * empty each time.
 */
export class SearchHistory {
  key: string
  max: number
  _memory: SearchHistoryEntry[] = []

  constructor(key: string = 'ts-maps-search-recents', max: number = 8) {
    this.key = key
    this.max = max
  }

  list(): SearchHistoryEntry[] {
    try {
      const raw = globalThis.localStorage?.getItem(this.key)
      if (raw)
        return JSON.parse(raw) as SearchHistoryEntry[]
    }
    catch {}
    return [...this._memory]
  }

  add(entry: { query?: string, place?: SearchPlace }): void {
    const same = (e: SearchHistoryEntry): boolean => entry.place
      ? !!e.place && e.place.name === entry.place.name && distanceMeters(e.place.center, entry.place.center) < 200
      : !!e.query && fold(e.query) === fold(entry.query ?? '')
    const place = entry.place ? { ...entry.place, distance: undefined } : undefined
    const next = [{ query: entry.query, place, time: Date.now() }, ...this.list().filter(e => !same(e))].slice(0, this.max)
    this._memory = next
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify(next))
    }
    catch {}
  }

  clear(): void {
    this._memory = []
    try {
      globalThis.localStorage?.removeItem(this.key)
    }
    catch {}
  }
}
