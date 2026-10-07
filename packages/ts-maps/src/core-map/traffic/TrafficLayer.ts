/**
 * Live traffic, after Apple Maps: roads coloured by how freely traffic moves
 * on them, and the incidents slowing it, with a card for each.
 *
 * Flow comes from a traffic provider's vector tiles, whose congestion
 * attribute is read into Apple's four colours. Mapbox Traffic and TomTom's
 * flow tiles are built in (`trafficSources`); any other is a
 * `TrafficSourceSpec` saying where its congestion is. Incidents come from an
 * `IncidentProvider`; TomTom's is built in.
 *
 * The layers are added to the map's style, marked as an overlay, so the map
 * type picker carries them from one map type to the next.
 */

import type { LatLngLike } from '../services/types'
import type { RateLimitOptions } from '../services/rate-limit'
import { DivIcon } from '../layer/marker/DivIcon'
import { Marker } from '../layer/marker/Marker'
import { RateLimiter } from '../services/rate-limit'

/** How freely traffic moves, in Apple's four colours, and closed. */
export type Congestion = 'low' | 'moderate' | 'heavy' | 'severe' | 'closed'

export interface TrafficSourceSpec {
  /** Vector tile URL template(s). */
  tiles: string[]
  /** The layer in those tiles with the road segments. */
  sourceLayer: string
  /**
   * An expression evaluating to a `Congestion` for a segment, from the
   * provider's own attributes.
   */
  congestion: unknown
  attribution?: string
  minzoom?: number
  maxzoom?: number
  tileSize?: number
}

/** The traffic providers built in. Each needs the provider's own key. */
export const trafficSources: {
  mapbox: (accessToken: string) => TrafficSourceSpec
  tomtom: (key: string) => TrafficSourceSpec
} = {
  /** Mapbox Traffic v1: `congestion` is already `low` … `severe`. */
  mapbox: accessToken => ({
    tiles: [`https://api.mapbox.com/v4/mapbox.mapbox-traffic-v1/{z}/{x}/{y}.vector.pbf?access_token=${encodeURIComponent(accessToken)}`],
    sourceLayer: 'traffic',
    congestion: ['get', 'congestion'],
    attribution: '© Mapbox',
    maxzoom: 16,
    tileSize: 512,
  }),
  /**
   * TomTom's relative flow tiles: `traffic_level` is the speed against the
   * free-flow speed, 0 to 1, and `road_closure` marks a closed road.
   */
  tomtom: key => ({
    tiles: [`https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.pbf?key=${encodeURIComponent(key)}`],
    sourceLayer: 'Traffic flow',
    congestion: ['case', ['to-boolean', ['get', 'road_closure']], 'closed', ['step', ['coalesce', ['get', 'traffic_level'], 1], 'severe', 0.25, 'heavy', 0.5, 'moderate', 0.8, 'low']],
    attribution: '© TomTom',
    maxzoom: 22,
    tileSize: 512,
  }),
}

/** Apple's colours: green flowing, yellow slow, red heavy, dark red standing still. */
export const CONGESTION_COLORS: Record<Congestion, string> = {
  low: '#30c85a',
  moderate: '#ffcc00',
  heavy: '#ff3b30',
  severe: '#a1171f',
  closed: '#3a3a3c',
}

export interface TrafficIncident {
  id: string
  type: 'accident' | 'closure' | 'roadworks' | 'congestion' | 'hazard' | 'weather' | 'other'
  center: LatLngLike
  /** "Accident", "Road closed", with where where the provider says. */
  description: string
  /** The road, where known. */
  road?: string
  /** Seconds of delay it causes, where known. */
  delay?: number
  /** When it is expected to end. */
  until?: Date
}

export interface IncidentProvider {
  name: string
  incidents: (bounds: [number, number, number, number], options?: { signal?: AbortSignal }) => Promise<TrafficIncident[]>
}

/** TomTom's incident categories, by `iconCategory`. */
const TOMTOM_TYPES: Record<number, TrafficIncident['type']> = {
  1: 'accident',
  2: 'weather',
  3: 'hazard',
  4: 'weather',
  5: 'weather',
  6: 'congestion',
  7: 'closure',
  8: 'closure',
  9: 'roadworks',
  10: 'weather',
  11: 'weather',
  14: 'hazard',
}

export interface TomTomIncidentsOptions {
  key: string
  baseUrl?: string
  language?: string
  rateLimit?: RateLimitOptions
  fetch?: typeof fetch
}

/** Incidents from TomTom's Traffic Incident Details API (v5). */
export class TomTomIncidents implements IncidentProvider {
  name: string = 'tomtom'
  private key: string
  private baseUrl: string
  private language: string
  private limiter: RateLimiter
  private fetcher?: typeof fetch

  constructor(options: TomTomIncidentsOptions) {
    if (!options.key)
      throw new Error('TomTom incidents need a key')
    this.key = options.key
    this.baseUrl = (options.baseUrl ?? 'https://api.tomtom.com').replace(/\/$/, '')
    this.language = options.language ?? 'en-US'
    this.limiter = new RateLimiter(this.name, options.rateLimit)
    this.fetcher = options.fetch
  }

  async incidents([w, s, e, n]: [number, number, number, number], options: { signal?: AbortSignal } = {}): Promise<TrafficIncident[]> {
    const fields = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},from,to,delay,endTime,roadNumbers}}}'
    const url = `${this.baseUrl}/traffic/services/5/incidentDetails?key=${encodeURIComponent(this.key)}&bbox=${w},${s},${e},${n}&fields=${encodeURIComponent(fields)}&language=${this.language}&timeValidityFilter=present`
    const response = await this.limiter.fetch(url, { signal: options.signal }, this.fetcher ?? fetch)
    if (!response.ok)
      throw new Error(`TomTom incidents failed: ${response.status} ${response.statusText}`)
    const body = await response.json() as { incidents?: Array<{ geometry?: { type: string, coordinates: any }, properties?: Record<string, any> }> }
    const out: TrafficIncident[] = []
    for (const incident of body.incidents ?? []) {
      const p = incident.properties ?? {}
      const coords = incident.geometry?.type === 'Point' ? [incident.geometry.coordinates] : incident.geometry?.coordinates ?? []
      // A line incident is shown where it starts: where the driver meets it.
      const first = coords[0] as [number, number] | undefined
      if (!first)
        continue
      const what = (p.events as Array<{ description?: string }> | undefined)?.map(ev => ev.description).filter(Boolean).join(', ')
      out.push({
        id: String(p.id ?? `${first[0]},${first[1]}`),
        type: TOMTOM_TYPES[p.iconCategory as number] ?? 'other',
        center: { lat: first[1], lng: first[0] },
        description: what || 'Traffic incident',
        ...(p.from || p.roadNumbers?.length ? { road: [p.roadNumbers?.join(', '), p.from && p.to ? `${p.from} to ${p.to}` : p.from].filter(Boolean).join(' · ') } : {}),
        ...(typeof p.delay === 'number' ? { delay: p.delay } : {}),
        ...(p.endTime ? { until: new Date(p.endTime) } : {}),
      })
    }
    return out
  }
}

export interface TrafficLayerOptions {
  /** Where flow comes from. Without one, only incidents are shown. */
  source?: TrafficSourceSpec
  /** Where incidents come from. */
  incidents?: IncidentProvider
  /** How often flow and incidents are fetched again, in ms. Default 120000; 0 never. */
  refresh?: number
  /** Draw flow beneath this layer. Default the style's first label layer, so names stay on top. */
  before?: string
  /** Line opacity. Default 0.9. */
  opacity?: number
}

const SOURCE = 'ts-maps-traffic'
const LAYER = 'ts-maps-traffic'

const INCIDENT_GLYPH: Record<TrafficIncident['type'], string> = {
  accident: '!',
  closure: '⛔',
  roadworks: '🚧',
  congestion: '≡',
  hazard: '⚠',
  weather: '☂',
  other: '!',
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

/** "12 min", "1 h 5 min". */
function minutes(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`
}

/** The traffic layer: flow on the roads, incidents as markers, kept fresh. */
export class TrafficLayer {
  options: TrafficLayerOptions
  map: any = null
  incidents: TrafficIncident[] = []
  _markers: Marker[] = []
  _timer: ReturnType<typeof setInterval> | null = null
  _abort: AbortController | null = null
  _generation = 0

  constructor(options: TrafficLayerOptions = {}) {
    this.options = options
  }

  get active(): boolean {
    return !!this.map
  }

  addTo(map: any): this {
    if (this.map === map)
      return this
    this.remove()
    this.map = map
    this._addFlow()
    void this._loadIncidents()
    map.on('moveend', this._loadIncidents, this)
    const every = this.options.refresh ?? 120_000
    if (every > 0)
      this._timer = setInterval(() => this.refresh(), every)
    map.fire('trafficchange', { active: true })
    return this
  }

  remove(): this {
    const map = this.map
    if (!map)
      return this
    if (this._timer)
      clearInterval(this._timer)
    this._timer = null
    this._abort?.abort()
    map.off('moveend', this._loadIncidents, this)
    this._removeFlow()
    for (const marker of this._markers)
      marker.remove()
    this._markers = []
    this.incidents = []
    this.map = null
    map.fire('trafficchange', { active: false })
    return this
  }

  /** On if off, off if on. */
  toggle(map: any): this {
    return this.active ? this.remove() : this.addTo(map)
  }

  /** Fetch flow and incidents again now. */
  refresh(): this {
    if (!this.map)
      return this
    this._generation++
    this._removeFlow()
    this._addFlow()
    void this._loadIncidents()
    return this
  }

  _addFlow(): void {
    const map = this.map
    const source = this.options.source
    if (!map || !source || typeof map.addSource !== 'function')
      return
    // A new generation each refresh, so tiles are fetched again rather than
    // served from the HTTP cache: traffic of two minutes ago is not traffic.
    const bust = (url: string): string => `${url}${url.includes('?') ? '&' : '?'}ts=${this._generation}`
    map.addSource(SOURCE, {
      type: 'vector',
      tiles: source.tiles.map(bust),
      minzoom: source.minzoom ?? 0,
      maxzoom: source.maxzoom ?? 16,
      ...(source.tileSize ? { tileSize: source.tileSize } : {}),
      ...(source.attribution ? { attribution: source.attribution } : {}),
    })
    const layers = map.getStyle?.()?.layers ?? []
    const before = this.options.before ?? layers.find((l: any) => l.type === 'symbol')?.id
    map.addStyleLayer({
      id: LAYER,
      type: 'line',
      source: SOURCE,
      'source-layer': source.sourceLayer,
      minzoom: 6,
      metadata: { 'ts-maps:overlay': true },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', source.congestion, 'low', CONGESTION_COLORS.low, 'moderate', CONGESTION_COLORS.moderate, 'heavy', CONGESTION_COLORS.heavy, 'severe', CONGESTION_COLORS.severe, 'closed', CONGESTION_COLORS.closed, 'rgba(0, 0, 0, 0)'],
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 1.5, 12, 2.5, 16, 6, 20, 14],
        'line-opacity': this.options.opacity ?? 0.9,
      },
    }, before)
  }

  _removeFlow(): void {
    const map = this.map
    if (!map?.getStyleLayer)
      return
    if (map.getStyleLayer(LAYER))
      map.removeStyleLayer(LAYER)
    if (map.getSource?.(SOURCE))
      map.removeSource(SOURCE)
  }

  async _loadIncidents(): Promise<void> {
    const map = this.map
    const provider = this.options.incidents
    if (!map || !provider)
      return
    this._abort?.abort()
    const abort = this._abort = new AbortController()
    const b = map.getBounds()
    let found: TrafficIncident[]
    try {
      found = await provider.incidents([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], { signal: abort.signal })
    }
    catch {
      // Offline or rate-limited: last known incidents stay.
      return
    }
    if (abort.signal.aborted || this.map !== map)
      return
    this.incidents = found
    for (const marker of this._markers)
      marker.remove()
    this._markers = found.map((incident) => {
      const html = `<div class="tsmap-traffic-incident tsmap-traffic-${incident.type}" role="img" aria-label="${escape(incident.description)}">${INCIDENT_GLYPH[incident.type]}</div>`
      const marker = new Marker([incident.center.lat, incident.center.lng], {
        icon: new DivIcon({ className: 'tsmap-traffic-incident-icon', html, iconSize: [26, 26], iconAnchor: [13, 13] }),
        title: incident.description,
        zIndexOffset: 400,
      })
      const card = [
        `<div class="tsmap-traffic-card-title">${escape(incident.description)}</div>`,
        incident.road ? `<div class="tsmap-traffic-card-road">${escape(incident.road)}</div>` : '',
        incident.delay ? `<div class="tsmap-traffic-card-delay">${minutes(incident.delay)} delay</div>` : '',
        incident.until ? `<div class="tsmap-traffic-card-until">Until ${escape(incident.until.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</div>` : '',
      ].join('')
      const popup = marker as Marker & { bindPopup?: (html: string) => unknown }
      popup.bindPopup?.(`<div class="tsmap-traffic-card">${card}</div>`)
      marker.addTo(map)
      return marker
    })
    map.fire('trafficincidents', { incidents: found })
  }
}

export function trafficLayer(options?: TrafficLayerOptions): TrafficLayer {
  return new TrafficLayer(options)
}
