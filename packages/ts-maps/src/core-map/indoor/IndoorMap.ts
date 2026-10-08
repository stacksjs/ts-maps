import type { LocalPlaceSource, SearchPlace } from '../search/SearchEngine'
import type { IMDFSource, IndoorLevel, IndoorPlace, IndoorVenue, LoadIMDFOptions } from './imdf'
import { Control } from '../control/Control'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { controlLocale, message } from '../i18n'
import { clearGround } from '../landmarks/scene'
import { iconForKind } from '../search/categories'
import { label, loadIMDF, searchIndoor } from './imdf'

/**
 * An indoor map, after Apple Maps: zoomed in on an airport or a mall, its
 * floor plan is drawn over the basemap, one level at a time, with a level
 * picker beside the map. Its shops and gates are found by search, and
 * choosing one goes to its level.
 *
 * ```ts
 * const sfo = await indoorMap({ venue: '/imdf/sfo.zip' }).addTo(map).ready()
 * sfo.connect(search) // gates and shops in search
 * ```
 */
export interface IndoorMapOptions extends LoadIMDFOptions {
  /** The venue, loaded or to load: an IMDF `.zip` URL, a folder URL, its bytes, or its files. */
  venue: IndoorVenue | IMDFSource
  /** The level to show first, by ordinal. Default the ground floor, 0, or the lowest above it. */
  level?: number
  /** Zoom below which the plan is hidden and the picker with it. Default 16. */
  minZoom?: number
  position?: string
  /** The language of the level picker. Default the venue's `language`, else the map's, else the browser's. */
  locale?: string
}

/** Every event an indoor map reports, with the callback-prop name bindings give it. */
export const INDOOR_EVENTS: {
  readonly load: 'onLoad'
  readonly levelchange: 'onLevelChange'
  readonly visibilitychange: 'onVisibilityChange'
} = {
  load: 'onLoad',
  levelchange: 'onLevelChange',
  visibilitychange: 'onVisibilityChange',
}

export type IndoorEvent = keyof typeof INDOOR_EVENTS

const SOURCE = 'ts-maps-indoor'
const CLASS = 'tsmap-indoor'

/** Unit fills by IMDF category: rooms warm, circulation white, facilities tinted. */
const UNIT_COLORS: Array<[string[], string]> = [
  [['walkway', 'footbridge', 'ramp', 'opentobelow'], '#ffffff'],
  [['restroom', 'restroom.female', 'restroom.male', 'restroom.unisex', 'restroom.family', 'restroom.transgender', 'restroom.wheelchair', 'shower', 'lactation'], '#dbe8f6'],
  [['elevator', 'escalator', 'stairs', 'steps', 'movingwalkway'], '#e7e1f2'],
  [['foodservice', 'restaurant', 'café', 'cafe'], '#fde4c8'],
  [['retail', 'shop'], '#fbe8d6'],
  [['parking', 'road', 'driveway'], '#e3e3e3'],
  [['nonpublic', 'unspecified', 'structure', 'column', 'shaft', 'unenclosedarea'], '#e6e3dd'],
]

function unitColor(): unknown {
  const match: unknown[] = ['match', ['get', 'category']]
  for (const [categories, color] of UNIT_COLORS)
    match.push(categories, color)
  match.push('#f3f1ec')
  return match
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

/** An indoor place as search returns places: its level in its properties. */
function asSearchPlace(venue: IndoorVenue, place: IndoorPlace): Omit<SearchPlace, 'source' | 'distance'> {
  return {
    id: `indoor:${venue.id}:${place.id}`,
    name: place.name,
    center: place.center,
    kind: place.category,
    icon: iconForKind(place.category.split('.')[0]!, place.category),
    address: `${venue.name} · ${place.levelName}`,
    rank: 6,
    properties: { indoor: { venue: venue.id, level: place.level } },
  }
}

export class IndoorMap extends Control {
  declare options: IndoorMapOptions & Record<string, any>
  declare venue?: IndoorVenue
  declare level: number
  declare _loading: Promise<IndoorVenue>
  declare _visible: boolean
  declare _listeners?: Set<(type: IndoorEvent, event: any) => void>
  declare _list?: HTMLElement
  declare _syncedLevel?: number

  initialize(options: IndoorMapOptions): void {
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined))
    super.initialize({ position: 'topright', minZoom: 16, ...given })
    this._visible = false
    const venue = options.venue as IndoorVenue
    this._loading = venue && typeof venue === 'object' && 'levels' in venue && Array.isArray(venue.levels)
      ? Promise.resolve(venue)
      : loadIMDF(options.venue as IMDFSource, options)
    this._loading.then((loaded) => {
      this.venue = loaded
      this.level = this._firstLevel(loaded)
      this._emit('load', { venue: loaded })
      this._draw()
    }, () => {})
  }

  /** The venue, once loaded. */
  ready(): Promise<this> {
    return this._loading.then(() => this)
  }

  _firstLevel(venue: IndoorVenue): number {
    if (this.options.level !== undefined)
      return this.options.level
    const ordinals = venue.levels.map(l => l.ordinal)
    return ordinals.includes(0) ? 0 : ordinals.find(o => o > 0) ?? ordinals[0] ?? 0
  }

  _locale(): string {
    return controlLocale({ options: { locale: this.options.locale ?? this.options.language }, _map: this._map })
  }

  get levels(): IndoorLevel[] {
    return this.venue?.levels ?? []
  }

  onAdd(map: any): HTMLElement {
    const container = DomUtil.create('div', `${CLASS}-control tsmap-bar`)
    container.setAttribute('role', 'group')
    container.setAttribute('aria-label', message(this._locale(), 'indoor.levels'))
    container.style.display = 'none'
    this._list = container
    DomEvent.disableClickPropagation(container)
    container.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-level]')
      if (button)
        this.setLevel(Number(button.dataset.level))
    })
    map.on('moveend zoomend', this._draw, this)
    // Added after the map's style, so a style set later does not drop it:
    // the plan is drawn again whenever the style changes.
    map.on('styledata', this._ensureLayers, this)
    this._ensureLayers()
    return container
  }

  onRemove(map: any): void {
    clearGround(map, this, null)
    this._visible = false
    map.off('moveend zoomend', this._draw, this)
    map.off('styledata', this._ensureLayers, this)
    for (const id of ['ts-maps-indoor-labels', 'ts-maps-indoor-openings', 'ts-maps-indoor-walls', 'ts-maps-indoor-units']) {
      if (map.getStyleLayer?.(id))
        map.removeStyleLayer(id)
    }
    if (map.getSource?.(SOURCE))
      map.removeSource(SOURCE)
  }

  _ensureLayers(): void {
    const map = this._map
    if (!map?.addSource || map.getSource?.(SOURCE) || !map.getStyle?.())
      return
    map.addSource(SOURCE, { type: 'geojson', data: this._data() })
    const minzoom = this.options.minZoom ?? 16
    const overlay = { 'ts-maps:overlay': true }
    map.addStyleLayer({ id: 'ts-maps-indoor-units', type: 'fill', source: SOURCE, minzoom, metadata: overlay, filter: ['==', ['get', 'feature_type'], 'unit'], paint: { 'fill-color': unitColor(), 'fill-opacity': 0.95 } })
    map.addStyleLayer({ id: 'ts-maps-indoor-walls', type: 'line', source: SOURCE, minzoom, metadata: overlay, filter: ['==', ['get', 'feature_type'], 'unit'], paint: { 'line-color': '#b8b2a7', 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.5, 20, 2] } })
    // Doors: a gap in the wall, in the floor's own white.
    map.addStyleLayer({ id: 'ts-maps-indoor-openings', type: 'line', source: SOURCE, minzoom, metadata: overlay, filter: ['==', ['get', 'feature_type'], 'opening'], paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 1, 20, 4] } })
    map.addStyleLayer({
      id: 'ts-maps-indoor-labels',
      type: 'symbol',
      source: SOURCE,
      minzoom: minzoom + 1,
      metadata: overlay,
      filter: ['has', 'name'],
      layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-max-width': 7, 'text-padding': 2 },
      paint: { 'text-color': '#3a3a3c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
    })
  }

  /** The current level's features, with their names in the language asked for. */
  _data(): { type: 'FeatureCollection', features: unknown[] } {
    const features = this.venue?.features.get(this.level) ?? []
    return {
      type: 'FeatureCollection',
      features: features.filter(f => f.geometry).map(f => ({
        type: 'Feature',
        id: f.id,
        geometry: f.geometry,
        properties: {
          feature_type: f.feature_type,
          category: f.properties.category ?? '',
          ...(label(f.properties.name, this.options.language) ? { name: label(f.properties.name, this.options.language) } : {}),
        },
      })),
    }
  }

  /** Whether the venue is in view, close enough to see inside. */
  get visible(): boolean {
    return this._visible
  }

  _draw(): void {
    const map = this._map
    const venue = this.venue
    if (!map || !venue)
      return
    const [w, s, e, n] = venue.bounds
    const view = map.getBounds()
    const visible = map.getZoom() >= (this.options.minZoom ?? 16)
      && w <= view.getEast() && e >= view.getWest() && s <= view.getNorth() && n >= view.getSouth()
    if (visible !== this._visible) {
      this._visible = visible
      // The plan stands in for the building's 3D shape, as in Apple Maps.
      clearGround(map, this, visible ? venue.bounds : null)
      this._emit('visibilitychange', { visible })
    }
    if (!this._list)
      return
    this._list.style.display = visible && venue.levels.length > 1 ? '' : 'none'
    // Highest level at the top, as a building is drawn.
    const html = [...venue.levels].reverse().map(level => `<button type="button" class="${CLASS}-level${level.ordinal === this.level ? ` ${CLASS}-active` : ''}" data-level="${level.ordinal}" aria-pressed="${level.ordinal === this.level}" aria-label="${escape(level.name)}" title="${escape(level.name)}">${escape(level.shortName)}</button>`).join('')
    if (this._list.dataset.html !== html) {
      this._list.dataset.html = html
      this._list.innerHTML = html
    }
  }

  /** Show a level, by ordinal. */
  setLevel(ordinal: number): this {
    if (!this.venue?.levels.some(l => l.ordinal === ordinal) || ordinal === this.level)
      return this
    this.level = ordinal
    if (this._map?.getSource?.(SOURCE))
      this._map.setSourceData(SOURCE, this._data())
    this._draw()
    this._emit('levelchange', { level: ordinal, name: this.venue.levels.find(l => l.ordinal === ordinal)!.name })
    return this
  }

  /** The venue's places matching `query`: its shops, gates and facilities. */
  search(query: string, limit?: number): IndoorPlace[] {
    return this.venue ? searchIndoor(this.venue, query, limit) : []
  }

  /** The venue's places, as a source for search. */
  placeSource(): LocalPlaceSource {
    return { places: query => this.venue ? this.search(query, 20).map(p => asSearchPlace(this.venue!, p)) : [] }
  }

  /**
   * Have `search` find the venue's places, and go to a place's level when it
   * is chosen. Returns the way to stop.
   */
  connect(search: { engine: { addSource: (source: LocalPlaceSource) => () => void }, listen: (fn: (type: any, event: any) => void) => () => void }): () => void {
    const removeSource = search.engine.addSource(this.placeSource())
    const stop = search.listen((type, e) => {
      const indoor = type === 'select' ? e?.place?.properties?.indoor : undefined
      if (indoor && indoor.venue === this.venue?.id)
        this.setLevel(indoor.level)
    })
    return () => {
      removeSource()
      stop()
    }
  }

  /** Bring the map into line with a declarative description: what bindings call as props change. */
  sync(target: { level?: number, position?: string }): this {
    // Followed when it changes, so a re-render keeps the level picked on the map.
    if (target.level !== undefined && target.level !== this._syncedLevel) {
      this._syncedLevel = target.level
      if (this.venue)
        this.setLevel(target.level)
      else
        this.options.level = target.level
    }
    if ('position' in target && (target.position ?? 'topright') !== this.options.position)
      this.setPosition(target.position ?? 'topright')
    return this
  }

  listen(fn: (type: IndoorEvent, event: any) => void): () => void {
    this._listeners ??= new Set()
    this._listeners.add(fn)
    return () => this._listeners?.delete(fn)
  }

  _emit(type: IndoorEvent, event: any): void {
    for (const fn of this._listeners ?? [])
      fn(type, event)
  }
}

export function indoorMap(options: IndoorMapOptions): IndoorMap {
  return new IndoorMap(options)
}
