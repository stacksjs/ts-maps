import type { OfflineMaps } from '../offline/OfflineMaps'
import type { TileSchema } from '../offline/schema'
import type { SearchCategory } from '../search/categories'
import type { PlaceDetails, PlaceDetailsProvider } from '../search/details'
import type { Guide, SavedPlace, SavedPlaces } from '../search/saved'
import type { SearchHistoryEntry, SearchPlace } from '../search/SearchEngine'
import type { DistanceUnits } from '../services/instructions'
import type { GeocoderProvider, LatLngLike } from '../services/types'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { DivIcon } from '../layer/marker/DivIcon'
import { Marker } from '../layer/marker/Marker'
import { message, resolveLocale } from '../i18n'
import { categoriesMatching, categoryForQuery, categoryLabel, kindLabel, SEARCH_CATEGORIES } from '../search/categories'
import { describeOpening, openingStatus, OverpassPlaceDetails } from '../search/details'
import { clusterPins, PIN_CLUSTER_RADIUS } from '../search/pins'
import { savedPlaces } from '../search/saved'
import { describePlace, distanceMeters, SearchEngine, SearchHistory } from '../search/SearchEngine'
import { PhotonGeocoder } from '../services/providers/Photon'
import { formatDistance, prefersImperial } from '../services/instructions'
import { POI_CATEGORIES } from '../symbols/poiIcons'
import { Control } from './Control'

/**
 * Search, after Apple Maps.
 *
 * "Search Maps" at the top of the map. Focused and empty it offers Find
 * Nearby — Restaurants, Coffee, Gas… — and your Recents. Typed into, it
 * suggests as you go: places on the map at once, the online geocoder's
 * answers as they arrive, each with its badge, kind, distance and street.
 * A category or a search drops pins for every result and lists them, nearest
 * first; move the map and "Search This Area" runs it again there. Choosing a
 * place flies to it and opens its card, with Directions.
 *
 * Answers come from the map's own tiles, downloaded offline maps and an
 * online geocoder together — see `SearchEngine`.
 */
export interface SearchControlOptions {
  position?: string
  placeholder?: string
  /** Online geocoder. Default Photon; `null` to search only the map and offline maps. */
  provider?: GeocoderProvider | null
  /** Downloaded maps to search. Default: the page's. */
  offline?: OfflineMaps | null
  /** Find Nearby buttons. Default the first eight of `SEARCH_CATEGORIES`. */
  categories?: SearchCategory[]
  /** Keep Recents, in `localStorage`. Default true. */
  recents?: boolean
  units?: DistanceUnits
  /** Where distances are measured from. Default the middle of the map. */
  location?: () => LatLngLike | undefined
  /**
   * A `TurnByTurn` for the Directions button to preview routes on, from
   * `origin` — by default the device's position, or the middle of the map
   * where that is not to be had.
   */
  turnByTurn?: { preview: (from: LatLngLike, to: LatLngLike) => Promise<unknown>, options: { destinationName?: string } }
  origin?: () => LatLngLike | Promise<LatLngLike>
  /** Called by Directions instead of, or as well as, `turnByTurn`. */
  onDirections?: (place: SearchPlace) => void
  /** The language results' names are asked for in, and its words when there is no `locale`. */
  language?: string
  /** The language its words are in. Default `language`, else the map's `locale`, else the browser's. */
  locale?: string
  /** The schema of the map's tiles. Default: found from their layer names. */
  schema?: TileSchema
  /**
   * Where a chosen place's hours, phone and website come from. Default
   * OpenStreetMap through Overpass, or none with `provider: null`; `null`
   * for none.
   */
  details?: PlaceDetailsProvider | null
  /** The link Share sends. Default the place on openstreetmap.org. */
  shareUrl?: (place: SearchPlace) => string
  /** Favorites and Guides: Save on the card, and both in Find Nearby's view. Default the page's; `null` for none. */
  saved?: SavedPlaces | null
  /** Show favorites on the map as stars. Default true. */
  showSaved?: boolean
}

/**
 * Every event search reports, with the callback-prop name bindings would give
 * it. `results` carries `{ query?, category?, places }`; `select` and
 * `directions` `{ place }`; `details` `{ place, details }`, once a chosen
 * place's hours, phone and website arrive; `save` and `unsave` `{ place }`
 * when Save on the card adds it to Favorites or takes it out; `clear` nothing.
 */
export const SEARCH_EVENTS: {
  readonly results: 'onResults'
  readonly select: 'onSelect'
  readonly details: 'onDetails'
  readonly directions: 'onDirections'
  readonly save: 'onSave'
  readonly unsave: 'onUnsave'
  readonly clear: 'onClear'
} = {
  results: 'onResults',
  select: 'onSelect',
  details: 'onDetails',
  directions: 'onDirections',
  save: 'onSave',
  unsave: 'onUnsave',
  clear: 'onClear',
}

export type SearchEvent = keyof typeof SEARCH_EVENTS

/**
 * What `sync` brings search into line with: `query`, left alone when
 * undefined, and the options, followed when their key is present, undefined
 * meaning the default. A binding passes every prop; code of your own passes
 * what it changes.
 */
export interface SearchTarget extends SearchControlOptions {
  /**
   * Search for this, as though typed and Search pressed — a category's name
   * runs the category. An empty string clears the search.
   */
  query?: string
}

function sameCategories(a: SearchCategory[] | undefined, b: SearchCategory[] | undefined): boolean {
  if (a === b)
    return true
  if (!a || !b || a.length !== b.length)
    return false
  return a.every((c, i) => c.id === b[i]!.id && c.label === b[i]!.label && c.icon === b[i]!.icon)
}

const CLASS = 'tsmap-search'

/** Search controls on the page, for ids no two share. */
let searchControls = 0

type Row
  = | { type: 'query', query: string }
    | { type: 'category', category: SearchCategory }
    | { type: 'place', place: SearchPlace }
    | { type: 'recent', entry: SearchHistoryEntry }
    | { type: 'saved', place: SavedPlace }
    | { type: 'guide', guide: Guide }

type View = 'idle' | 'home' | 'suggest' | 'results' | 'place'

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

/** The badge a place or category wears: the map's own POI icon, as SVG. */
export function badge(icon: string, size: number = 30): string {
  const category = POI_CATEGORIES[icon] ?? POI_CATEGORIES.place!
  return `<span class="${CLASS}-badge" style="width:${size}px;height:${size}px;background:${category.color}"><svg viewBox="0 0 24 24" width="${Math.round(size * 0.58)}" height="${Math.round(size * 0.58)}" aria-hidden="true"><path fill="#fff" fill-rule="evenodd" d="${category.glyph}"/></svg></span>`
}

const MAGNIFIER = `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13Z M15.3 15.3 20 20"/></svg>`
const STAR = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="m12 3.4 2.6 5.5 6 .7-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6-4.4-4.2 6-.7Z"/></svg>`
const STAR_OUTLINE = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m12 3.4 2.6 5.5 6 .7-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6-4.4-4.2 6-.7Z"/></svg>`
const BOOK = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M5 4.5h10.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2Zm0 13.5a2 2 0 0 1 2-2h10.5"/></svg>`
const CLOCK = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17Z M12 7.5V12l3 2"/></svg>`
const PHONE = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6.6 3.5c.5-.4 1.2-.3 1.6.2l2 2.7c.4.5.3 1.2-.1 1.6l-1.3 1.2a11.4 11.4 0 0 0 5.9 5.9l1.2-1.3c.4-.4 1.1-.5 1.6-.1l2.7 2c.5.4.6 1.1.2 1.6l-1.3 1.8c-.6.8-1.6 1.2-2.6.9C10.3 18.7 5.3 13.7 3.9 7.5c-.3-1 .1-2 .9-2.6Z"/></svg>`
const GLOBE = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17Zm-8.5 8.5h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5Z"/></svg>`
const SHARE = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 14.5V3.5m0 0-3.5 3.5M12 3.5l3.5 3.5M8 10H6.5v10h11V10H16"/></svg>`
const CAR = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6.2 5.5h11.6l2.2 6v7h-2.5v-2H6.5v2H4v-7Zm1.5 1.8-1.4 4.2h11.4l-1.4-4.2ZM7 13.2a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 1 0 0-2.6Zm10 0a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 1 0 0-2.6Z"/></svg>`

/** A name with the typed part in bold, as suggestions show it. */
function highlight(name: string, query: string): string {
  const q = query.trim()
  if (!q)
    return escape(name)
  const at = name.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0)
    return escape(name)
  return `${escape(name.slice(0, at))}<b>${escape(name.slice(at, at + q.length))}</b>${escape(name.slice(at + q.length))}`
}

export class SearchControl extends Control {
  declare options: SearchControlOptions & Record<string, any>
  declare engine: SearchEngine
  declare history: SearchHistory
  declare _container?: HTMLElement
  declare _input?: HTMLInputElement
  declare _body?: HTMLElement
  declare _view: View
  declare _rows: Row[]
  declare _active: number
  declare _results: SearchPlace[]
  declare _resultsFor?: { query?: string, category?: SearchCategory, center: LatLngLike, zoom: number }
  declare _place?: SearchPlace
  declare _pins: Map<string, Marker>
  /** The places with pins, most important first, and the one chosen. */
  declare _pinned: SearchPlace[]
  /** Details fetched for places, by id; null where there were none. */
  declare _details: Map<string, PlaceDetails | null>
  /** Favorites drawn on the map as stars, by place id. */
  declare _stars: Map<string, Marker>
  declare _uid?: number
  declare _unsave?: () => void
  declare _detailsAbort?: AbortController
  declare _selectedId?: string
  /** The clusters drawn now, so a zoom that changes none redraws nothing. */
  declare _pinLayout?: string
  declare _areaButton?: HTMLElement
  declare _timer?: ReturnType<typeof setTimeout>
  declare _abort?: AbortController
  declare _listeners?: Set<(type: SearchEvent, event: any) => void>
  declare _synced?: string

  initialize(options: SearchControlOptions = {}): void {
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined))
    super.initialize({ position: 'topleft', ...given })
    this.history = new SearchHistory()
    this._view = 'idle'
    this._rows = []
    this._active = -1
    this._results = []
    this._pins = new Map()
    this._pinned = []
    this._details = new Map()
    this._stars = new Map()
  }

  /** The id of the list of rows, which the field says it controls. */
  get _listId(): string {
    this._uid ??= ++searchControls
    return `tsmap-search-${this._uid}-list`
  }

  onAdd(map: any): HTMLElement {
    this.engine = new SearchEngine({ map, provider: this.options.provider, offline: this.options.offline, language: this.options.language, schema: this.options.schema })
    this._hookSaved()
    const container = DomUtil.create('div', CLASS)
    container.innerHTML = `
      <div class="${CLASS}-field">
        <span class="${CLASS}-icon">${MAGNIFIER}</span>
        <input class="${CLASS}-input" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${this._listId}" aria-label="${escape(this._t('search.placeholder'))}"
          placeholder="${escape(this.options.placeholder ?? this._t('search.placeholder'))}">
        <button class="${CLASS}-clear" type="button" aria-label="${escape(this._t('search.clear'))}">✕</button>
        <button class="${CLASS}-cancel" type="button">${escape(this._t('search.cancel'))}</button>
      </div>
      <div class="${CLASS}-body" role="listbox" aria-label="${escape(this._t('search.results'))}" id="${this._listId}"></div>
      <div class="tsmap-sr-only" role="status" aria-live="polite"></div>`
    this._input = container.querySelector<HTMLInputElement>(`.${CLASS}-input`)!
    this._body = container.querySelector<HTMLElement>(`.${CLASS}-body`)!

    DomEvent.disableClickPropagation(container)
    DomEvent.disableScrollPropagation(container)
    for (const type of ['pointerdown', 'touchstart', 'dblclick'])
      container.addEventListener(type, e => e.stopPropagation())

    this._input.addEventListener('focus', () => {
      if (this._view === 'idle')
        this._show(this._input!.value ? 'suggest' : 'home')
    })
    this._input.addEventListener('input', () => this._onInput())
    this._input.addEventListener('keydown', e => this._onKey(e))
    container.querySelector(`.${CLASS}-clear`)!.addEventListener('click', () => {
      this._input!.value = ''
      this._clearResults()
      this._show('home')
      this._input!.focus()
    })
    container.querySelector(`.${CLASS}-cancel`)!.addEventListener('click', () => this.cancel())
    this._body.addEventListener('click', e => this._onBodyClick(e))

    map.on('moveend', this._onMoveEnd, this)
    map.on('zoomend', this._layoutPins, this)
    map.on('resize', this._fit, this)
    this._container = container
    // Laid out once it is in the page.
    setTimeout(() => this._fit(), 0)
    return container
  }

  onRemove(map: any): void {
    // A control moved with setPosition is added again with a fresh field.
    this._view = 'idle'
    this._abort?.abort()
    clearTimeout(this._timer)
    this._clearPins()
    this._clearStars()
    this._unsave?.()
    this._unsave = undefined
    this._areaButton?.remove()
    map.off('moveend', this._onMoveEnd, this)
    map.off('zoomend', this._layoutPins, this)
    map.off('resize', this._fit, this)
  }

  // ---------------------------------------------------------------------------
  // What a page can ask of it
  // ---------------------------------------------------------------------------

  /** Search for text, as though typed and Search pressed. */
  async search(query: string): Promise<SearchPlace[]> {
    const category = categoryForQuery(query, this._locale())
    if (category)
      return this.searchCategory(category)
    this._input!.value = query
    this.history.add({ query })
    this._show('results', { loading: true, title: query })
    const places = await this._run(signal => this.engine.search(query, { near: this._near(), signal }))
    this._showResults(places, { query })
    return places
  }

  /** Find a kind of place in the area on screen: "Coffee", "Gas Stations". */
  async searchCategory(category: SearchCategory): Promise<SearchPlace[]> {
    this._input!.value = categoryLabel(category, this._locale())
    this._show('results', { loading: true, title: categoryLabel(category, this._locale()) })
    const places = await this._run(signal => this.engine.nearby(category, { near: this._near(), signal }))
    this._showResults(places, { category })
    return places
  }

  /** Show a place: fly to it, drop its pin, and open its card. */
  select(place: SearchPlace): this {
    this._place = place
    this.history.add({ place })
    this._pin(place, true)
    const map = this._map
    if (place.bbox && place.kind !== 'street') {
      const [w, s, e, n] = place.bbox
      map.flyToBounds?.([[s, w], [n, e]], { padding: [60, 60], maxZoom: 16 }) ?? map.fitBounds([[s, w], [n, e]])
    }
    else {
      const zoom = Math.max(map.getZoom(), place.source === 'online' && place.rank < 6 ? 12 : 16)
      map.flyTo ? map.flyTo([place.center.lat, place.center.lng], zoom) : map.setView([place.center.lat, place.center.lng], zoom)
    }
    this._show('place')
    this._announce([place.name, kindLabel(place.kind, this._locale()), place.address].filter(Boolean).join(', '))
    this._emit('select', { place })
    void this._loadDetails(place)
    return this
  }

  /**
   * The provider for details: the one given, or OpenStreetMap's. None by
   * default for a search kept off the network with `provider: null`.
   */
  get detailsProvider(): PlaceDetailsProvider | null {
    if (this.options.details === undefined)
      this.options.details = this.options.provider === null ? null : new OverpassPlaceDetails()
    return this.options.details
  }

  /**
   * Fetch a chosen place's hours, phone and website, and fill them into its
   * card if it is still showing. The card does not wait for them.
   */
  async _loadDetails(place: SearchPlace): Promise<PlaceDetails | undefined> {
    const provider = this.detailsProvider
    if (!provider)
      return undefined
    if (this._details.has(place.id))
      return this._details.get(place.id) ?? undefined
    this._detailsAbort?.abort()
    const abort = this._detailsAbort = new AbortController()
    let details: PlaceDetails | undefined
    try {
      details = await provider.details(place, { signal: abort.signal })
    }
    catch {
      // Offline, rate-limited, or not found: the card is complete without.
      return undefined
    }
    if (abort.signal.aborted)
      return undefined
    this._details.set(place.id, details ?? null)
    if (details) {
      if (this._view === 'place' && this._place?.id === place.id)
        this._renderPlace()
      this._emit('details', { place, details })
    }
    return details
  }

  /** Say something to a screen reader, through the control's live region. */
  _announce(text: string): void {
    const region = this._container?.querySelector<HTMLElement>('.tsmap-sr-only')
    if (region)
      region.textContent = text
  }

  /** The favorites and guides Save adds to: the one given, or the page's. */
  get saved(): SavedPlaces | null {
    if (this.options.saved === undefined)
      this.options.saved = savedPlaces()
    return this.options.saved
  }

  /** Follow the saved places: their stars, and the views that list them. */
  _hookSaved(): void {
    this._unsave?.()
    this._unsave = undefined
    const saved = this.saved
    if (!saved)
      return
    const changed = (): void => {
      if (!this._map)
        return
      this._drawStars()
      if (this._view === 'home')
        this._show('home')
      else if (this._view === 'place')
        this._renderPlace()
    }
    saved.on('change', changed)
    this._unsave = () => saved.off('change', changed)
    saved.ready().then(changed, () => {})
  }

  /** Add a place to Favorites, or take it out. Whether it is one now. */
  async toggleSaved(place: SearchPlace): Promise<boolean> {
    const saved = this.saved
    if (!saved)
      return false
    const now = await saved.toggleFavorite(place)
    this._emit(now ? 'save' : 'unsave', { place })
    return now
  }

  /** Show a guide's places as results, as tapping it under Guides does. */
  async showGuide(id: string): Promise<SearchPlace[]> {
    const saved = this.saved
    if (!saved)
      return []
    await saved.ready()
    const guide = saved.guides.find(g => g.id === id)
    if (!guide)
      return []
    const near = this._near()
    const places = saved.guidePlaces(id).map(p => this._fromSaved(p, near))
    this._input!.value = guide.name
    this._showResults(places, { query: guide.name })
    return places
  }

  _fromSaved(place: SavedPlace, near: LatLngLike): SearchPlace {
    return { ...place, source: 'map', rank: 5, distance: distanceMeters(near, place.center) }
  }

  /** Favorites on the map, as stars: not where a result's pin already is. */
  _drawStars(): void {
    this._clearStars()
    const saved = this.saved
    if (!saved || !this._map || this.options.showSaved === false)
      return
    for (const place of saved.favorites) {
      if (this._pinned.some(p => p.id === place.id))
        continue
      const marker = new Marker([place.center.lat, place.center.lng], {
        icon: new DivIcon({ className: `${CLASS}-pin-icon`, html: `<div class="${CLASS}-star">${STAR}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }),
        title: place.name,
        zIndexOffset: 200,
      })
      marker.on('click', () => this.select(this._fromSaved(place, this._near())))
      marker.addTo(this._map)
      this._stars.set(place.id, marker)
    }
  }

  _clearStars(): void {
    for (const star of this._stars.values())
      star.remove()
    this._stars.clear()
  }

  /** Share a place: the system share sheet where there is one, the clipboard where not. */
  async share(place: SearchPlace): Promise<'shared' | 'copied' | 'failed'> {
    const url = this.options.shareUrl?.(place)
      ?? `https://www.openstreetmap.org/?mlat=${place.center.lat.toFixed(6)}&mlon=${place.center.lng.toFixed(6)}#map=18/${place.center.lat.toFixed(6)}/${place.center.lng.toFixed(6)}`
    const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
    if (typeof nav?.share === 'function') {
      try {
        await nav.share({ title: place.name, text: [place.name, place.address].filter(Boolean).join(', '), url })
        return 'shared'
      }
      catch (err) {
        if ((err as Error)?.name === 'AbortError')
          return 'failed'
      }
    }
    try {
      await nav?.clipboard?.writeText(url)
      this._flash(this._t('search.linkCopied'))
      return 'copied'
    }
    catch {
      return 'failed'
    }
  }

  /** A word on the card for a moment: "Link copied". */
  _flash(text: string): void {
    const note = this._body?.querySelector<HTMLElement>(`.${CLASS}-note`)
    if (!note)
      return
    note.textContent = text
    setTimeout(() => {
      if (note.textContent === text)
        note.textContent = ''
    }, 2000)
  }

  /** Close everything: results, pins, the card. */
  cancel(): this {
    this._abort?.abort()
    this._input!.value = ''
    this._input!.blur()
    this._clearResults()
    this._show('idle')
    this._emit('clear', {})
    return this
  }

  /**
   * Bring search into line with a declarative description of it — what the
   * framework bindings call as their props change. The same query twice is
   * searched once.
   */
  sync(target: SearchTarget): this {
    this._syncOptions(target)
    if (target.query === undefined || target.query === this._synced)
      return this
    this._synced = target.query
    if (target.query.trim())
      this.search(target.query.trim()).catch(() => {})
    else
      this.cancel()
    return this
  }

  /** Ask another online geocoder from the next query on; `null` for none. */
  setProvider(provider: GeocoderProvider | null | undefined): this {
    if (provider === this.options.provider)
      return this
    this.options.provider = provider
    if (this.engine)
      this.engine.provider = provider === undefined ? new PhotonGeocoder() : provider
    return this
  }

  /** Search other downloaded maps from the next query on; `null` for none. */
  setOffline(offline: OfflineMaps | null | undefined): this {
    this.options.offline = offline
    if (this.engine)
      this.engine.offline = offline
    return this
  }

  _syncOptions(target: SearchTarget): void {
    const has = (key: keyof SearchTarget): boolean => key in target
    if (has('provider'))
      this.setProvider(target.provider)
    if (has('offline') && target.offline !== this.options.offline)
      this.setOffline(target.offline)
    if (has('language') && target.language !== this.options.language) {
      this.options.language = target.language
      if (this.engine)
        this.engine.language = target.language
    }
    // Followed as they are, read when next used.
    for (const key of ['location', 'turnByTurn', 'origin', 'onDirections', 'details', 'shareUrl'] as const) {
      if (has(key))
        (this.options as any)[key] = target[key]
    }
    if (has('saved') && target.saved !== this.options.saved) {
      this.options.saved = target.saved
      if (this._map)
        this._hookSaved()
    }
    if (has('showSaved') && target.showSaved !== this.options.showSaved) {
      this.options.showSaved = target.showSaved
      this._drawStars()
    }
    if (has('placeholder') && target.placeholder !== this.options.placeholder) {
      this.options.placeholder = target.placeholder
      this._input?.setAttribute('placeholder', target.placeholder ?? this._t('search.placeholder'))
    }
    let redraw = false
    if (has('categories') && !sameCategories(target.categories, this.options.categories)) {
      this.options.categories = target.categories
      redraw = true
    }
    if (has('recents') && target.recents !== this.options.recents) {
      this.options.recents = target.recents
      redraw = true
    }
    if (has('units') && target.units !== this.options.units) {
      this.options.units = target.units
      redraw = true
    }
    if (has('locale') && target.locale !== this.options.locale) {
      this.options.locale = target.locale
      this._relabel()
      redraw = true
    }
    if (redraw && this._map && (this._view === 'home' || this._view === 'place' || (this._view === 'results' && this._results.length)))
      this._show(this._view)
    if (has('position') && (target.position ?? 'topleft') !== this.options.position)
      this.setPosition(target.position ?? 'topleft')
  }

  /**
   * An event reduced to plain data, for a binding that sends it across a
   * boundary — the React Native WebView bridge — where live objects do not
   * survive.
   */
  static plainEvent(type: SearchEvent, event: any): Record<string, unknown> {
    const plain = (place: SearchPlace | undefined): SearchPlace | undefined =>
      place ? JSON.parse(JSON.stringify(place)) : undefined
    switch (type) {
      case 'results':
        return {
          query: event?.query,
          category: event?.category ? { id: event.category.id, label: event.category.label } : undefined,
          places: (event?.places ?? []).map(plain),
        }
      case 'select':
      case 'directions':
      case 'save':
      case 'unsave':
        return { place: plain(event?.place) }
      case 'details':
        return { place: plain(event?.place), details: event?.details ? JSON.parse(JSON.stringify(event.details)) : undefined }
      default:
        return {}
    }
  }

  /** Hear what happens: results, a place chosen, Directions. Returns the way to stop. */
  listen(fn: (type: SearchEvent, event: any) => void): () => void {
    this._listeners ??= new Set()
    this._listeners.add(fn)
    return () => this._listeners?.delete(fn)
  }

  get results(): SearchPlace[] {
    return [...this._results]
  }

  get selected(): SearchPlace | undefined {
    return this._place
  }

  _emit(type: SearchEvent, event: any): void {
    for (const fn of this._listeners ?? [])
      fn(type, event)
  }

  // ---------------------------------------------------------------------------
  // Typing
  // ---------------------------------------------------------------------------

  _near(): LatLngLike {
    const own = this.options.location?.()
    if (own)
      return own
    const c = this._map.getCenter()
    return { lat: c.lat, lng: c.lng }
  }

  _units(): DistanceUnits {
    return this.options.units ?? (prefersImperial(this.options.locale ?? this._map?.options?.locale) ? 'imperial' : 'metric')
  }

  /** The field's words, again in its language. */
  _relabel(): void {
    const input = this._input
    if (!input)
      return
    input.setAttribute('aria-label', this._t('search.placeholder'))
    input.setAttribute('placeholder', this.options.placeholder ?? this._t('search.placeholder'))
    this._container?.querySelector(`.${CLASS}-clear`)?.setAttribute('aria-label', this._t('search.clear'))
    const cancel = this._container?.querySelector(`.${CLASS}-cancel`)
    if (cancel)
      cancel.textContent = this._t('search.cancel')
    this._body?.setAttribute('aria-label', this._t('search.results'))
  }

  /** The language its words are in. */
  _locale(): string {
    return resolveLocale(this.options.locale ?? this.options.language ?? this._map?.options?.locale)
  }

  /** A word or sentence from the catalogue, in its language. */
  _t(key: string, params?: Record<string, string | number>): string {
    return message(this._locale(), key, params)
  }

  /** A distance in its language: "1.2 km", "1,2 km". */
  _distance(meters: number, units: DistanceUnits): string {
    return formatDistance(meters, units, this._locale())
  }

  async _run(fn: (signal: AbortSignal) => Promise<SearchPlace[]>): Promise<SearchPlace[]> {
    this._abort?.abort()
    const abort = this._abort = new AbortController()
    try {
      const places = this.engine.addStreets(await fn(abort.signal))
      return abort.signal.aborted ? [] : places
    }
    catch (err) {
      if ((err as Error)?.name === 'AbortError')
        return []
      throw err
    }
  }

  _onInput(): void {
    const query = this._input!.value
    this._container?.classList.toggle(`${CLASS}-has-text`, !!query)
    clearTimeout(this._timer)
    if (!query.trim()) {
      this._abort?.abort()
      this._show('home')
      return
    }
    // What is known already, straight away; the network after a pause.
    this._showSuggestions(query, [])
    this._timer = setTimeout(async () => {
      this._abort?.abort()
      const abort = this._abort = new AbortController()
      try {
        const places = await this.engine.suggest(query, {
          near: this._near(),
          signal: abort.signal,
          onLocal: local => !abort.signal.aborted && this._showSuggestions(query, this.engine.addStreets(local)),
        })
        if (!abort.signal.aborted && this._input!.value === query)
          this._showSuggestions(query, this.engine.addStreets(places))
      }
      catch {}
    }, 180)
  }

  _onKey(e: KeyboardEvent): void {
    const rows = this._body!.querySelectorAll<HTMLElement>('[data-row]')
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length)
        return
      e.preventDefault()
      this._active = e.key === 'ArrowDown'
        ? (this._active + 1) % rows.length
        : (this._active <= 0 ? rows.length : this._active) - 1
      rows.forEach((row, i) => {
        row.classList.toggle(`${CLASS}-active`, i === this._active)
        row.setAttribute('aria-selected', String(i === this._active))
      })
      const row = rows[this._active]
      if (row) {
        // Focus stays in the field; the screen reader is told which row is
        // highlighted, as a combobox should.
        row.id ||= `${this._listId}-${row.dataset.row}`
        this._input!.setAttribute('aria-activedescendant', row.id)
        row.scrollIntoView?.({ block: 'nearest' })
      }
    }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (this._active >= 0 && this._rows[this._active])
        this._choose(this._rows[this._active]!)
      else if (this._input!.value.trim())
        this.search(this._input!.value.trim())
    }
    else if (e.key === 'Escape') {
      e.preventDefault()
      this._back()
    }
  }

  /** One step back: card to results, results to an empty box, then closed. */
  _back(): void {
    const fromCard = this._view === 'place'
    if (this._view === 'place' && this._results.length)
      this._show('results')
    else if (this._view === 'results' || this._view === 'place' || this._view === 'suggest')
      this.cancel()
    else
      this._show('idle')
    // Closing a card puts the keyboard back in the field it was opened from.
    if (fromCard)
      this._input?.focus()
  }

  _choose(row: Row): void {
    switch (row.type) {
      case 'query':
        this.search(row.query)
        break
      case 'category':
        this.searchCategory(row.category)
        break
      case 'place':
        // A suggestion replaces any earlier results; a result keeps its
        // siblings on the map, as Apple's list does.
        if (this._view !== 'results') {
          this._clearPins()
          this._results = []
          this._resultsFor = undefined
        }
        this.select(row.place)
        break
      case 'saved':
        this._clearPins()
        this._results = []
        this.select(this._fromSaved(row.place, this._near()))
        break
      case 'guide':
        void this.showGuide(row.guide.id)
        break
      case 'recent':
        if (row.entry.place) {
          this._clearPins()
          this._results = []
          this.select({ ...row.entry.place, distance: distanceMeters(this._near(), row.entry.place.center) })
        }
        else if (row.entry.query) {
          this.search(row.entry.query)
        }
        break
    }
  }

  _onBodyClick(e: Event): void {
    const target = e.target as HTMLElement
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
    if (action === 'clear-recents') {
      this.history.clear()
      this._show('home')
      return
    }
    if (action === 'close-place') {
      this._back()
      return
    }
    if (action === 'directions' && this._place) {
      this._directions(this._place)
      return
    }
    if (action === 'save' && this._place) {
      void this.toggleSaved(this._place)
      return
    }
    if (action === 'share' && this._place) {
      void this.share(this._place)
      return
    }
    const row = target.closest<HTMLElement>('[data-row]')
    if (row) {
      const chosen = this._rows[Number(row.dataset.row)]
      if (chosen)
        this._choose(chosen)
    }
  }

  async _directions(place: SearchPlace): Promise<void> {
    this._emit('directions', { place })
    this.options.onDirections?.(place)
    const nav = this.options.turnByTurn
    if (!nav)
      return
    const origin = await (this.options.origin?.() ?? deviceLocation(this._near()))
    nav.options.destinationName = place.name
    this._show('idle')
    this._clearPins()
    await nav.preview(origin, place.center).catch(() => {})
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  _show(view: View, extra: { loading?: boolean, title?: string } = {}): void {
    this._view = view
    this._active = -1
    this._input?.removeAttribute('aria-activedescendant')
    this._container?.classList.toggle(`${CLASS}-open`, view !== 'idle')
    // On a phone the list shares the screen with the pins it describes.
    this._container?.classList.toggle(`${CLASS}-sheet`, view === 'results' || view === 'place')
    this._container?.classList.toggle(`${CLASS}-has-text`, !!this._input?.value)
    this._input?.setAttribute('aria-expanded', String(view !== 'idle'))
    if (view !== 'results')
      this._hideAreaButton()
    switch (view) {
      case 'idle':
        this._rows = []
        this._body!.innerHTML = ''
        break
      case 'home':
        this._renderHome()
        break
      case 'results':
        if (extra.loading) {
          this._rows = []
          this._body!.innerHTML = `<div class="${CLASS}-head"><span class="${CLASS}-title">${escape(extra.title ?? '')}</span></div><div class="${CLASS}-status">${escape(this._t('search.searching'))}</div>`
        }
        else {
          this._renderResults()
        }
        break
      case 'place':
        this._renderPlace()
        break
      default:
        break
    }
  }

  _renderHome(): void {
    const categories = this.options.categories ?? SEARCH_CATEGORIES.slice(0, 8)
    const recents = this.options.recents === false ? [] : this.history.list()
    // Favorites above Recents, and Guides between, as Apple's search shows them.
    const favorites = this.saved?.favorites ?? []
    const guides = this.saved?.guides ?? []
    this._rows = [
      ...categories.map(category => ({ type: 'category' as const, category })),
      ...favorites.map(place => ({ type: 'saved' as const, place })),
      ...guides.map(guide => ({ type: 'guide' as const, guide })),
      ...recents.map(entry => ({ type: 'recent' as const, entry })),
    ]
    const units = this._units()
    const chips = categories.map((category, i) => `
      <button class="${CLASS}-chip" type="button" role="option" aria-selected="false" data-row="${i}">${badge(category.icon, 40)}<span>${escape(categoryLabel(category, this._locale()))}</span></button>`).join('')
    const favoriteChips = favorites.map((place, j) => `
      <button class="${CLASS}-chip" type="button" role="option" aria-selected="false" data-row="${categories.length + j}">${badge(place.icon, 40)}<span>${escape(place.name)}</span></button>`).join('')
    const guideRows = guides.map((guide, j) => this._rowHtml(categories.length + favorites.length + j, `<span class="${CLASS}-glyph">${BOOK}</span>`, escape(guide.name), escape(this._t('search.places', { count: guide.places.length })))).join('')
    const recentRows = recents.map((entry, j) => {
      const i = categories.length + favorites.length + guides.length + j
      if (entry.place) {
        const d = distanceMeters(this._near(), entry.place.center)
        return this._rowHtml(i, badge(entry.place.icon), escape(entry.place.name), escape(describePlace({ ...entry.place, distance: d }, m => this._distance(m, units), this._locale())))
      }
      return this._rowHtml(i, `<span class="${CLASS}-glyph">${CLOCK}</span>`, escape(entry.query ?? ''), '')
    }).join('')
    this._body!.innerHTML = `
      <div class="${CLASS}-section"><span>${escape(this._t('search.findNearby'))}</span></div>
      <div class="${CLASS}-chips">${chips}</div>
      ${favorites.length ? `<div class="${CLASS}-section"><span>${escape(this._t('search.favorites'))}</span></div><div class="${CLASS}-chips">${favoriteChips}</div>` : ''}
      ${guides.length ? `<div class="${CLASS}-section"><span>${escape(this._t('search.guides'))}</span></div><div class="${CLASS}-rows">${guideRows}</div>` : ''}
      ${recents.length ? `<div class="${CLASS}-section"><span>${escape(this._t('search.recents'))}</span><button type="button" class="${CLASS}-link" data-action="clear-recents">${escape(this._t('search.clearRecents'))}</button></div><div class="${CLASS}-rows">${recentRows}</div>` : ''}`
  }

  _rowHtml(index: number, icon: string, title: string, detail: string): string {
    return `<div class="${CLASS}-row" role="option" aria-selected="false" data-row="${index}">${icon}<div class="${CLASS}-row-text"><div class="${CLASS}-row-title">${title}</div>${detail ? `<div class="${CLASS}-row-detail">${detail}</div>` : ''}</div></div>`
  }

  _showSuggestions(query: string, places: SearchPlace[]): void {
    this._view = 'suggest'
    this._container?.classList.add(`${CLASS}-open`)
    this._hideAreaButton()
    const units = this._units()
    const categories = categoriesMatching(query, this._locale()).slice(0, 2)
    this._rows = [
      { type: 'query', query },
      ...categories.map(category => ({ type: 'category' as const, category })),
      ...places.map(place => ({ type: 'place' as const, place })),
    ]
    let i = 0
    const html = [
      this._rowHtml(i++, `<span class="${CLASS}-glyph">${MAGNIFIER}</span>`, escape(query), ''),
      ...categories.map(category => this._rowHtml(i++, badge(category.icon), highlight(categoryLabel(category, this._locale()), query), escape(this._t('search.searchNearby')))),
      ...places.map(place => this._rowHtml(i++, badge(place.icon), highlight(place.name, query), escape(describePlace(place, m => this._distance(m, units), this._locale())))),
    ].join('')
    // Rewritten only when something changed, so a row is never swapped out
    // from under a pointer that is about to click it.
    const next = `<div class="${CLASS}-rows">${html}</div>`
    if (this._body!.dataset.html !== next) {
      this._body!.dataset.html = next
      this._body!.innerHTML = next
      this._active = -1
    }
  }

  _showResults(places: SearchPlace[], what: { query?: string, category?: SearchCategory }): void {
    this._results = places
    const c = this._map.getCenter()
    this._resultsFor = { ...what, center: { lat: c.lat, lng: c.lng }, zoom: this._map.getZoom() }
    this._clearPins()
    this._pinned = [...places]
    this._layoutPins()
    this._fitResults(places)
    this._show('results')
    const title = what.query ?? (what.category && categoryLabel(what.category, this._locale()))
    this._announce(places.length
      ? this._t(title ? 'search.countFor' : 'search.count', { count: places.length, query: title ?? '' })
      : title ? this._t('search.noneFor', { query: title }) : this._t('search.none'))
    this._emit('results', { ...what, places })
  }

  _renderResults(): void {
    const places = this._results
    const units = this._units()
    const what = this._resultsFor
    const title = (what?.category && categoryLabel(what.category, this._locale())) ?? what?.query ?? this._t('search.resultsTitle')
    this._rows = places.map(place => ({ type: 'place' as const, place }))
    const rows = places.map((place, i) => this._rowHtml(i, badge(place.icon), escape(place.name), escape(describePlace(place, m => this._distance(m, units), this._locale())))).join('')
    this._body!.dataset.html = ''
    this._body!.innerHTML = `
      <div class="${CLASS}-head"><span class="${CLASS}-title">${escape(title)}</span><span class="${CLASS}-count">${places.length ? escape(this._t('search.count', { count: places.length })) : ''}</span></div>
      ${places.length ? `<div class="${CLASS}-rows">${rows}</div>` : `<div class="${CLASS}-status">${escape(what?.category ? this._t('search.noneHere') : `${this._t('search.none')}.`)}</div>`}`
  }

  _renderPlace(): void {
    const place = this._place
    if (!place)
      return
    const units = this._units()
    const kind = kindLabel(place.kind, this._locale())
    const distance = place.distance !== undefined ? this._distance(place.distance, units) : undefined
    const coords = `${place.center.lat.toFixed(5)}, ${place.center.lng.toFixed(5)}`
    const details = this._details.get(place.id) ?? undefined
    const status = details?.openingHours ? openingStatus(details.openingHours) : undefined
    const hours = status ? `<div class="${CLASS}-place-hours ${CLASS}-${status.open ? 'open' : 'closed'}">${escape(describeOpening(status, new Date(), this._locale()))}</div>` : ''
    const website = details?.website && /^https?:\/\//i.test(details.website) ? details.website : details?.website ? `https://${details.website}` : undefined
    const phone = details?.phone?.replace(/[^\d+]/g, '')
    const isSaved = !!this.saved?.isFavorite(place.id)
    const actions = [
      this.saved ? `<button type="button" class="${CLASS}-action${isSaved ? ` ${CLASS}-saved` : ''}" data-action="save" aria-pressed="${isSaved}">${isSaved ? STAR : STAR_OUTLINE}<span>${escape(this._t(isSaved ? 'search.saved' : 'search.save'))}</span></button>` : '',
      phone ? `<a class="${CLASS}-action" href="tel:${escape(phone)}">${PHONE}<span>${escape(this._t('search.call'))}</span></a>` : '',
      website ? `<a class="${CLASS}-action" href="${escape(website)}" target="_blank" rel="noopener noreferrer">${GLOBE}<span>${escape(this._t('search.website'))}</span></a>` : '',
      `<button type="button" class="${CLASS}-action" data-action="share">${SHARE}<span>${escape(this._t('search.share'))}</span></button>`,
    ].join('')
    this._rows = []
    this._body!.dataset.html = ''
    this._body!.innerHTML = `
      <div class="${CLASS}-place">
        <div class="${CLASS}-place-head">
          ${badge(place.icon, 44)}
          <div class="${CLASS}-place-title">
            <div class="${CLASS}-place-name">${escape(place.name)}</div>
            <div class="${CLASS}-place-kind">${escape([kind, distance].filter(Boolean).join(' · '))}</div>
            ${hours}
          </div>
          <button type="button" class="${CLASS}-close" data-action="close-place" aria-label="${escape(this._t('search.close'))}">✕</button>
        </div>
        ${this.options.turnByTurn || this.options.onDirections ? `<button type="button" class="${CLASS}-directions" data-action="directions">${CAR}<span>${escape(this._t('search.directions'))}</span></button>` : ''}
        <div class="${CLASS}-actions">${actions}</div>
        <div class="${CLASS}-note" role="status" aria-live="polite"></div>
        <div class="${CLASS}-place-info">
          ${details?.openingHours ? `<div class="${CLASS}-info-label">${escape(this._t('search.hours'))}</div><div class="${CLASS}-info-value">${escape(details.openingHours)}</div>` : ''}
          ${details?.phone ? `<div class="${CLASS}-info-label">${escape(this._t('search.phone'))}</div><div class="${CLASS}-info-value">${escape(details.phone)}</div>` : ''}
          ${website ? `<div class="${CLASS}-info-label">${escape(this._t('search.website'))}</div><div class="${CLASS}-info-value">${escape(website.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, ''))}</div>` : ''}
          ${place.address ? `<div class="${CLASS}-info-label">${escape(this._t('search.address'))}</div><div class="${CLASS}-info-value">${escape(place.address)}</div>` : ''}
          <div class="${CLASS}-info-label">${escape(this._t('search.coordinates'))}</div><div class="${CLASS}-info-value">${coords}</div>
        </div>
      </div>`
  }

  // ---------------------------------------------------------------------------
  // The map
  // ---------------------------------------------------------------------------

  /** Give a place a pin, chosen or not, among the others. */
  _pin(place: SearchPlace, selected: boolean): void {
    if (!this._pinned.some(p => p.id === place.id))
      this._pinned.push(place)
    if (selected)
      this._selectedId = place.id
    this._layoutPins()
  }

  /**
   * Draw the pins, gathering those that would overlap into a numbered
   * bubble. Run again as the map zooms, so they come apart as it zooms in.
   * The chosen pin is never gathered.
   */
  _layoutPins(): void {
    const map = this._map
    if (!map)
      return
    const byId = new Map(this._pinned.map(place => [place.id, place]))
    const points = this._pinned.map((place) => {
      const p = map.latLngToContainerPoint([place.center.lat, place.center.lng])
      return { id: place.id, x: p.x, y: p.y }
    })
    const clusters = clusterPins(points, PIN_CLUSTER_RADIUS, this._selectedId)
    const layout = `${this._selectedId ?? ''}|${clusters.map(c => c.ids.join(',')).join(';')}`
    if (layout === this._pinLayout && this._pins.size)
      return
    this._removePins()
    this._pinLayout = layout
    this._drawStars()
    for (const cluster of clusters) {
      const members = cluster.ids.map(id => byId.get(id)!)
      if (members.length === 1)
        this._addPin(members[0]!, members[0]!.id === this._selectedId)
      else
        this._addCluster(members)
    }
  }

  /** Apple's balloon pin: the category's colour and glyph, on a stem. */
  _addPin(place: SearchPlace, selected: boolean): void {
    const category = POI_CATEGORIES[place.icon] ?? POI_CATEGORIES.place!
    const html = `<div class="${CLASS}-pin${selected ? ` ${CLASS}-pin-selected` : ''}" style="--pin:${category.color}">
      <div class="${CLASS}-pin-head"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" fill-rule="evenodd" d="${category.glyph}"/></svg></div>
      <div class="${CLASS}-pin-label">${escape(place.name)}</div></div>`
    const marker = new Marker([place.center.lat, place.center.lng], {
      icon: new DivIcon({ className: `${CLASS}-pin-icon`, html, iconSize: [36, 44], iconAnchor: [18, 44] }),
      title: place.name,
      zIndexOffset: selected ? 1000 : 0,
    })
    marker.on('click', () => this.select(place))
    marker.addTo(this._map)
    this._pins.set(place.id, marker)
  }

  /**
   * A bubble for several results, in the colour of the kind most of them
   * are, with how many. Tapping it zooms to them; where they cannot come
   * apart, it chooses the first.
   */
  _addCluster(members: SearchPlace[]): void {
    const counts = new Map<string, number>()
    for (const place of members)
      counts.set(place.icon, (counts.get(place.icon) ?? 0) + 1)
    const icon = [...counts].sort((a, b) => b[1] - a[1])[0]![0]
    const category = POI_CATEGORIES[icon] ?? POI_CATEGORIES.place!
    const first = members[0]!
    const label = this._t('search.count', { count: members.length })
    const html = `<div class="${CLASS}-cluster" style="--pin:${category.color}" role="button" aria-label="${escape(label)}">${members.length}</div>`
    const marker = new Marker([first.center.lat, first.center.lng], {
      icon: new DivIcon({ className: `${CLASS}-pin-icon`, html, iconSize: [36, 36], iconAnchor: [18, 18] }),
      title: label,
      zIndexOffset: 500,
    })
    marker.on('click', () => {
      const map = this._map
      const lats = members.map(p => p.center.lat)
      const lngs = members.map(p => p.center.lng)
      const same = Math.max(...lats) - Math.min(...lats) < 1e-5 && Math.max(...lngs) - Math.min(...lngs) < 1e-5
      if (same || map.getZoom() >= (map.getMaxZoom?.() ?? 20) - 0.5) {
        this.select(first)
        return
      }
      map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [80, 80], maxZoom: map.getMaxZoom?.() ?? 19 })
    })
    marker.addTo(this._map)
    this._pins.set(`cluster:${members.map(p => p.id).join(',')}`, marker)
  }

  _removePins(): void {
    for (const pin of this._pins.values())
      pin.remove()
    this._pins.clear()
    this._pinLayout = undefined
  }

  _clearPins(): void {
    this._removePins()
    this._pinned = []
    this._selectedId = undefined
    // Stars hidden under results' pins come back.
    if (this._map)
      this._drawStars()
  }

  _clearResults(): void {
    this._results = []
    this._resultsFor = undefined
    this._place = undefined
    this._clearPins()
    this._hideAreaButton()
  }

  /** Bring every result into view, unless they are already. */
  _fitResults(places: SearchPlace[]): void {
    if (!places.length)
      return
    const view = this._map.getBounds()
    if (places.every(p => view.contains?.([p.center.lat, p.center.lng]) ?? true))
      return
    const lats = places.map(p => p.center.lat)
    const lngs = places.map(p => p.center.lng)
    this._map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], {
      paddingTopLeft: [(this._container?.offsetWidth ?? 0) + 40, 60],
      paddingBottomRight: [60, 60],
      maxZoom: 16,
    })
  }

  _onMoveEnd(): void {
    const what = this._resultsFor
    if (this._view !== 'results' || !what?.category)
      return
    // Moved far enough to be looking somewhere else.
    const size = this._map.getSize()
    const moved = this._map.latLngToContainerPoint([what.center.lat, what.center.lng])
    const shift = Math.hypot(moved.x - size.x / 2, moved.y - size.y / 2)
    if (shift > Math.min(size.x, size.y) * 0.25 || Math.abs(this._map.getZoom() - what.zoom) >= 0.75)
      this._showAreaButton()
  }

  _showAreaButton(): void {
    if (this._areaButton)
      return
    const button = this._areaButton = DomUtil.create('button', `${CLASS}-area`, this._map.getContainer())
    button.type = 'button'
    button.textContent = this._t('search.searchThisArea')
    // Centred at the top of the map, unless the card is there: then just
    // below it.
    const card = this._container?.getBoundingClientRect()
    const box = (this._map.getContainer() as HTMLElement).getBoundingClientRect()
    const middle = box.left + box.width / 2
    if (card && card.width && card.left < middle + 90 && card.right > middle - 90)
      button.style.top = `${card.bottom - box.top + 10}px`
    for (const type of ['pointerdown', 'dblclick', 'touchstart'])
      button.addEventListener(type, e => e.stopPropagation())
    button.addEventListener('click', (e) => {
      e.stopPropagation()
      this._hideAreaButton()
      const what = this._resultsFor
      if (what?.category)
        this.searchCategory(what.category)
      else if (what?.query)
        this.search(what.query)
    })
  }

  _hideAreaButton(): void {
    this._areaButton?.remove()
    this._areaButton = undefined
  }

  /** As wide as a phone allows without running under the controls opposite. */
  _fit(): void {
    const container = this._container
    if (!container || !this._map)
      return
    const size = this._map.getSize()
    const right = this._map._controlCorners?.topright as HTMLElement | undefined
    const reserve = right?.childElementCount ? right.offsetWidth + 20 : 12
    container.style.width = `${Math.max(220, Math.min(360, size.x - 12 - reserve))}px`
    container.style.setProperty('--tsmap-search-max', `${Math.max(160, size.y - 90)}px`)
    container.style.setProperty('--tsmap-search-sheet', size.x < 600 ? `${Math.max(160, size.y * 0.42)}px` : `${Math.max(160, size.y - 90)}px`)
  }
}

/** The device's position, or `fallback` within a few seconds if it cannot be had. */
function deviceLocation(fallback: LatLngLike): Promise<LatLngLike> {
  return new Promise((resolve) => {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined
    if (!geo)
      return resolve(fallback)
    const timer = setTimeout(() => resolve(fallback), 5000)
    geo.getCurrentPosition(
      (p) => {
        clearTimeout(timer)
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
      { timeout: 5000, maximumAge: 60_000 },
    )
  })
}
