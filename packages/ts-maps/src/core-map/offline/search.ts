/**
 * Search, reverse geocoding and directions over downloaded maps, as the same
 * provider interfaces the online services implement — so a geocoder control
 * or turn-by-turn works unchanged, and `withOfflineFallback` can put the
 * offline provider behind an online one.
 */

import type {
  DirectionsOptions,
  DirectionsProvider,
  GeocoderOptions,
  GeocoderProvider,
  GeocodingResult,
  LatLngLike,
  Route,
} from '../services/types'
import type { OfflinePlace } from './OfflineStore'

export interface OfflineData {
  places: () => Promise<OfflinePlace[]>
  /** The named road nearest a point, within `radius` metres. */
  nearestStreet?: (point: LatLngLike, radius: number) => Promise<OfflinePlace & { distance: number } | undefined>
  route: (waypoints: LatLngLike[], options?: DirectionsOptions) => Promise<Route[]>
}

function fold(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036F]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

const PLACE_TYPES: Record<string, GeocodingResult['placeType']> = {
  country: 'country',
  state: 'region',
  province: 'region',
  city: 'place',
  town: 'place',
  village: 'place',
  hamlet: 'place',
  suburb: 'district',
  quarter: 'district',
  neighbourhood: 'district',
  street: 'address',
}

function distance(a: LatLngLike, b: LatLngLike): number {
  const kx = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
  const dx = (a.lng - b.lng) * kx
  const dy = a.lat - b.lat
  return Math.sqrt(dx * dx + dy * dy) * 111_320
}

function toResult(place: OfflinePlace, relevance: number): GeocodingResult {
  return {
    text: place.name,
    center: { lat: place.lat, lng: place.lng },
    placeType: PLACE_TYPES[place.kind] ?? 'poi',
    properties: { kind: place.kind, offline: true },
    relevance,
  }
}

/**
 * How well `name` answers `query`: 1 for the whole name, less for a prefix,
 * less again for a later word, nothing if a word of the query is missing.
 */
export function matchScore(name: string, query: string): number {
  const n = fold(name)
  const q = fold(query)
  if (!q)
    return 0
  if (n === q)
    return 1
  if (n.startsWith(q))
    return 0.9 - Math.min(0.2, (n.length - q.length) / 100)
  const words = n.split(' ')
  const terms = q.split(' ')
  let score = 0
  for (const term of terms) {
    const at = words.findIndex(w => w.startsWith(term))
    if (at < 0)
      return n.includes(q) ? 0.3 : 0
    score += at === 0 ? 0.75 : 0.6
  }
  return score / terms.length
}

/** Geocoding over the places named in downloaded maps. */
export class OfflineGeocoder implements GeocoderProvider {
  name: string = 'offline'
  data: OfflineData

  constructor(data: OfflineData) {
    this.data = data
  }

  async search(query: string, opts: GeocoderOptions = {}): Promise<GeocodingResult[]> {
    const places = await this.data.places()
    const limit = opts.limit ?? 5
    const scored: Array<{ place: OfflinePlace, score: number }> = []
    for (const place of places) {
      if (opts.bbox) {
        const [w, s, e, n] = opts.bbox
        if (place.lng < w || place.lng > e || place.lat < s || place.lat > n)
          continue
      }
      const match = matchScore(place.name, query)
      if (match <= 0)
        continue
      // Prominent places first, then the nearer of two equal matches.
      let score = match * 10 - place.rank * 0.25
      if (opts.proximity)
        score -= Math.log10(1 + distance(opts.proximity, place) / 1000)
      scored.push({ place, score })
    }
    scored.sort((a, b) => b.score - a.score)
    const top = scored[0]?.score ?? 1
    return scored.slice(0, limit).map(({ place, score }) => toResult(place, Math.max(0, Math.min(1, score / Math.max(top, 1e-6)))))
  }

  async reverse(center: LatLngLike, opts: GeocoderOptions = {}): Promise<GeocodingResult[]> {
    const places = await this.data.places()
    const limit = opts.limit ?? 1
    // What is here, then the street you are on, then the place you are in.
    const near = places
      .filter(place => place.kind !== 'street')
      .map(place => ({ place, d: distance(center, place) }))
      .filter(({ place, d }) => d < (PLACE_TYPES[place.kind] ? 5000 : 30))
    const street = await this.data.nearestStreet?.(center, 60)
    if (street)
      near.push({ place: street, d: street.distance })
    // A place's own spot counts for more than the area it names.
    const weight = (p: OfflinePlace, d: number): number => PLACE_TYPES[p.kind] && p.kind !== 'street' ? d + 100 : d
    near.sort((a, b) => weight(a.place, a.d) - weight(b.place, b.d))
    return near.slice(0, limit).map(({ place, d }) => toResult(place, 1 / (1 + d / 100)))
  }
}

/** Directions over the roads in downloaded maps. */
export class OfflineDirections implements DirectionsProvider {
  name: string = 'offline'
  data: OfflineData

  constructor(data: OfflineData) {
    this.data = data
  }

  getDirections(waypoints: LatLngLike[], opts?: DirectionsOptions): Promise<Route[]> {
    return this.data.route(waypoints, opts)
  }
}

function isAbort(err: unknown): boolean {
  return (err as { name?: string })?.name === 'AbortError'
}

function offlineNow(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * An online provider that falls back to an offline one: straight away when
 * the browser knows it has no connection, and whenever the online request
 * fails for any reason but being cancelled. An offline search that finds
 * nothing does not hide an online error — the error is rethrown.
 */
export function withOfflineFallback<T extends GeocoderProvider | DirectionsProvider>(online: T, offline: T): T {
  const wrap = <A extends unknown[], R>(primary: (...args: A) => Promise<R>, backup: (...args: A) => Promise<R>, empty: (r: R) => boolean) =>
    async (...args: A): Promise<R> => {
      if (offlineNow())
        return backup(...args)
      try {
        return await primary(...args)
      }
      catch (err) {
        if (isAbort(err))
          throw err
        const result = await backup(...args).catch(() => undefined)
        if (result === undefined || empty(result))
          throw err
        return result
      }
    }

  const isEmpty = (r: unknown[]): boolean => r.length === 0
  if ('getDirections' in online) {
    const on = online as DirectionsProvider
    const off = offline as DirectionsProvider
    return {
      name: `${on.name}+offline`,
      getDirections: wrap(on.getDirections.bind(on), off.getDirections.bind(off), isEmpty),
    } as DirectionsProvider as T
  }
  const on = online as GeocoderProvider
  const off = offline as GeocoderProvider
  return {
    name: `${on.name}+offline`,
    search: wrap(on.search.bind(on), off.search.bind(off), isEmpty),
    reverse: wrap(on.reverse.bind(on), off.reverse.bind(off), isEmpty),
  } as GeocoderProvider as T
}
