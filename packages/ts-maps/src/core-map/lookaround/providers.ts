/**
 * Where street-level imagery comes from, for Look Around.
 *
 * Apple drives its own cars; an open map uses imagery people share. A
 * `StreetImageryProvider` finds the pictures near a point, one picture by
 * id, and the coverage to draw on the map while choosing where to look.
 * Two are built in: Panoramax, the open federation (no key), and
 * Mapillary (a client token). Each carries its own attribution, shown in
 * the viewer, and its own rate limit.
 */

import type { RateLimitOptions } from '../services/rate-limit'
import type { LatLngLike } from '../geo/LatLng'
import { RateLimiter } from '../services/rate-limit'

export interface StreetImage {
  id: string
  provider: string
  lat: number
  lng: number
  /** Compass degrees the middle of the picture faces. */
  heading: number
  /** 360 for a panorama; a flat photo's horizontal field of view otherwise. */
  fov: number
  /** The picture, at a size to show at once. */
  url: string
  /** A sharper one to swap in when it arrives. */
  hdUrl?: string
  /** A small one, for a place card. */
  thumbUrl?: string
  /** Milliseconds since 1970. */
  capturedAt?: number
  /** The sequence (one drive or walk) it was taken in. */
  sequence?: string
  /** The pictures before and after it in its sequence, where the provider says. */
  prev?: string
  next?: string
  /** Whose picture it is, as the viewer credits it. */
  attribution?: string
}

/** Coverage to draw on the map: a vector tile source and its layers. */
export interface StreetImageryCoverage {
  tiles: string
  minzoom: number
  maxzoom: number
  /** The layer of lines along the streets with imagery. */
  lines: string
  /** The layer of single pictures, drawn as dots closer in. */
  points?: string
  /** Shown only for these, as a style filter on both layers: panoramas, say. */
  filter?: unknown[]
}

export interface StreetImageryProvider {
  name: string
  /** Credit for the imagery, shown in the viewer. */
  attribution: string
  /** Pictures within `radius` metres, nearest first. */
  near: (at: LatLngLike, options?: { radius?: number, limit?: number, signal?: AbortSignal }) => Promise<StreetImage[]>
  /** One picture by id. */
  get: (id: string, options?: { signal?: AbortSignal }) => Promise<StreetImage | undefined>
  coverage?: () => StreetImageryCoverage
}

/** The nearest picture within `radius` metres (default 50). */
export async function nearestImage(provider: StreetImageryProvider, at: LatLngLike, radius: number = 50, signal?: AbortSignal): Promise<StreetImage | undefined> {
  return (await provider.near(at, { radius, limit: 1, signal }))[0]
}

function latLngOf(at: LatLngLike): { lat: number, lng: number } {
  if (Array.isArray(at))
    return { lat: at[0], lng: at[1] }
  if (typeof at === 'object' && at)
    return { lat: (at as any).lat, lng: (at as any).lng ?? (at as any).lon }
  throw new TypeError('expected a position')
}

/** Metres between two points. */
export function metresBetween(a: { lat: number, lng: number }, b: { lat: number, lng: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** A box `radius` metres round a point: `[west, south, east, north]`. */
function box(at: { lat: number, lng: number }, radius: number): [number, number, number, number] {
  const dLat = radius / 111320
  const dLng = radius / (111320 * Math.max(0.01, Math.cos((at.lat * Math.PI) / 180)))
  return [at.lng - dLng, at.lat - dLat, at.lng + dLng, at.lat + dLat]
}

// ---------------------------------------------------------------------------
// Panoramax
// ---------------------------------------------------------------------------

export interface PanoramaxOptions {
  /** A Panoramax instance's API, or the federation's meta-catalogue. Default `https://api.panoramax.xyz/api`. */
  endpoint?: string
  /** Only 360° pictures, as Look Around shows. Default true. */
  panoramasOnly?: boolean
  rateLimit?: RateLimitOptions
  fetch?: typeof fetch
}

interface PanoramaxItem {
  id: string
  collection?: string
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, any>
  assets?: Record<string, { href?: string }>
  links?: Array<{ rel?: string, id?: string }>
}

/** Panoramax: open street-level imagery, federated across instances. No key. */
export class PanoramaxImagery implements StreetImageryProvider {
  name: string = 'panoramax'
  attribution: string = '© Panoramax contributors'
  endpoint: string
  panoramasOnly: boolean
  limiter: RateLimiter
  fetcher?: typeof fetch

  constructor(options: PanoramaxOptions = {}) {
    this.endpoint = (options.endpoint ?? 'https://api.panoramax.xyz/api').replace(/\/$/, '')
    this.panoramasOnly = options.panoramasOnly !== false
    this.limiter = new RateLimiter(this.name, options.rateLimit)
    this.fetcher = options.fetch
  }

  async _get(url: string, signal?: AbortSignal): Promise<any> {
    const response = await this.limiter.fetch(url, { signal }, this.fetcher ?? fetch)
    if (!response.ok)
      throw new Error(`Panoramax request failed: ${response.status} ${response.statusText}`)
    return response.json()
  }

  async near(at: LatLngLike, options: { radius?: number, limit?: number, signal?: AbortSignal } = {}): Promise<StreetImage[]> {
    const p = latLngOf(at)
    const radius = Math.max(1, Math.round(options.radius ?? 50))
    // More than asked for when flat photos will be left out.
    const limit = Math.min(100, (options.limit ?? 20) * (this.panoramasOnly ? 3 : 1))
    const url = `${this.endpoint}/search?place_position=${p.lng.toFixed(7)},${p.lat.toFixed(7)}&place_distance=0-${radius}&limit=${limit}`
    const body = await this._get(url, options.signal)
    const images = ((body?.features ?? []) as PanoramaxItem[]).map(item => this._image(item)).filter((i): i is StreetImage => !!i)
    return images
      .filter(i => !this.panoramasOnly || i.fov >= 360)
      .sort((a, b) => metresBetween(p, a) - metresBetween(p, b))
      .slice(0, options.limit ?? 20)
  }

  async get(id: string, options: { signal?: AbortSignal } = {}): Promise<StreetImage | undefined> {
    const body = await this._get(`${this.endpoint}/search?ids=${encodeURIComponent(id)}&limit=1`, options.signal)
    const item = (body?.features as PanoramaxItem[] | undefined)?.[0]
    return item ? this._image(item) : undefined
  }

  _image(item: PanoramaxItem): StreetImage | undefined {
    const [lng, lat] = item.geometry?.coordinates ?? []
    const props = item.properties ?? {}
    const url = item.assets?.sd?.href ?? item.assets?.hd?.href
    if (typeof lat !== 'number' || typeof lng !== 'number' || !url)
      return undefined
    const link = (rel: string): string | undefined => item.links?.find(l => l.rel === rel)?.id
    const producer = props['geovisio:producer']
    const captured = Date.parse(props.datetime ?? '')
    return {
      id: item.id,
      provider: this.name,
      lat,
      lng,
      heading: Number(props['view:azimuth'] ?? 0),
      fov: Number(props['pers:interior_orientation']?.field_of_view ?? 70),
      url,
      hdUrl: item.assets?.hd?.href,
      thumbUrl: item.assets?.thumb?.href,
      capturedAt: Number.isFinite(captured) ? captured : undefined,
      sequence: item.collection ?? props.collection,
      prev: link('prev'),
      next: link('next'),
      attribution: producer ? `${producer}, ${this.attribution}` : this.attribution,
    }
  }

  coverage(): StreetImageryCoverage {
    return { tiles: `${this.endpoint}/map/{z}/{x}/{y}.mvt`, minzoom: 0, maxzoom: 15, lines: 'sequences', points: 'pictures' }
  }
}

// ---------------------------------------------------------------------------
// Mapillary
// ---------------------------------------------------------------------------

export interface MapillaryOptions {
  /** A client token from mapillary.com/dashboard/developers. */
  accessToken: string
  /** Only 360° pictures. Default true. */
  panoramasOnly?: boolean
  rateLimit?: RateLimitOptions
  fetch?: typeof fetch
}

const MAPILLARY_FIELDS = 'id,geometry,computed_geometry,compass_angle,computed_compass_angle,is_pano,thumb_256_url,thumb_1024_url,thumb_2048_url,captured_at,sequence'

interface MapillaryImage {
  id: string
  geometry?: { coordinates?: [number, number] }
  computed_geometry?: { coordinates?: [number, number] }
  compass_angle?: number
  computed_compass_angle?: number
  is_pano?: boolean
  thumb_256_url?: string
  thumb_1024_url?: string
  thumb_2048_url?: string
  captured_at?: number
  sequence?: string
}

/** Mapillary: street-level imagery shared by its contributors. Needs a client token. */
export class MapillaryImagery implements StreetImageryProvider {
  name: string = 'mapillary'
  attribution: string = '© Mapillary'
  accessToken: string
  panoramasOnly: boolean
  limiter: RateLimiter
  fetcher?: typeof fetch

  constructor(options: MapillaryOptions) {
    this.accessToken = options.accessToken
    this.panoramasOnly = options.panoramasOnly !== false
    this.limiter = new RateLimiter(this.name, options.rateLimit)
    this.fetcher = options.fetch
  }

  async _get(url: string, signal?: AbortSignal): Promise<any> {
    const response = await this.limiter.fetch(url, { signal }, this.fetcher ?? fetch)
    if (!response.ok)
      throw new Error(`Mapillary request failed: ${response.status} ${response.statusText}`)
    return response.json()
  }

  async near(at: LatLngLike, options: { radius?: number, limit?: number, signal?: AbortSignal } = {}): Promise<StreetImage[]> {
    const p = latLngOf(at)
    const radius = options.radius ?? 50
    const [w, s, e, n] = box(p, radius)
    const pano = this.panoramasOnly ? '&is_pano=true' : ''
    const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(this.accessToken)}&fields=${MAPILLARY_FIELDS}&bbox=${w.toFixed(7)},${s.toFixed(7)},${e.toFixed(7)},${n.toFixed(7)}&limit=${Math.min(100, (options.limit ?? 20) * 3)}${pano}`
    const body = await this._get(url, options.signal)
    return ((body?.data ?? []) as MapillaryImage[])
      .map(i => this._image(i))
      .filter((i): i is StreetImage => !!i && metresBetween(p, i) <= radius)
      .sort((a, b) => metresBetween(p, a) - metresBetween(p, b))
      .slice(0, options.limit ?? 20)
  }

  async get(id: string, options: { signal?: AbortSignal } = {}): Promise<StreetImage | undefined> {
    const body = await this._get(`https://graph.mapillary.com/${encodeURIComponent(id)}?access_token=${encodeURIComponent(this.accessToken)}&fields=${MAPILLARY_FIELDS}`, options.signal)
    return body?.id ? this._image(body as MapillaryImage) : undefined
  }

  _image(image: MapillaryImage): StreetImage | undefined {
    // The position and heading after Mapillary's own alignment, where it has one.
    const [lng, lat] = image.computed_geometry?.coordinates ?? image.geometry?.coordinates ?? []
    const url = image.thumb_2048_url ?? image.thumb_1024_url
    if (typeof lat !== 'number' || typeof lng !== 'number' || !url)
      return undefined
    return {
      id: String(image.id),
      provider: this.name,
      lat,
      lng,
      heading: Number(image.computed_compass_angle ?? image.compass_angle ?? 0),
      fov: image.is_pano ? 360 : 70,
      url: image.thumb_1024_url ?? url,
      hdUrl: image.thumb_2048_url,
      thumbUrl: image.thumb_256_url,
      capturedAt: image.captured_at,
      sequence: image.sequence,
      attribution: this.attribution,
    }
  }

  coverage(): StreetImageryCoverage {
    return {
      tiles: `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${encodeURIComponent(this.accessToken)}`,
      minzoom: 6,
      maxzoom: 14,
      lines: 'sequence',
      points: 'image',
      filter: this.panoramasOnly ? ['==', ['get', 'is_pano'], true] : undefined,
    }
  }
}
