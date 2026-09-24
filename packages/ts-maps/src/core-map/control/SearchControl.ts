import type { OfflineMaps } from '../offline/OfflineMaps'
import type { SearchCategory } from '../search/categories'
import type { SearchHistoryEntry, SearchPlace } from '../search/SearchEngine'
import type { DistanceUnits } from '../services/instructions'
import type { GeocoderProvider, LatLngLike } from '../services/types'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { DivIcon } from '../layer/marker/DivIcon'
import { Marker } from '../layer/marker/Marker'
import { categoriesMatching, categoryForQuery, kindLabel, SEARCH_CATEGORIES } from '../search/categories'
import { describePlace, distanceMeters, SearchEngine, SearchHistory } from '../search/SearchEngine'
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
  language?: string
}

/**
 * Every event search reports, with the callback-prop name bindings would give
 * it. `results` carries `{ query?, category?, places }`; `select` and
 * `directions` `{ place }`; `clear` nothing.
 */
export const SEARCH_EVENTS: {
  readonly results: 'onResults'
  readonly select: 'onSelect'
  readonly directions: 'onDirections'
  readonly clear: 'onClear'
} = {
  results: 'onResults',
  select: 'onSelect',
  directions: 'onDirections',
  clear: 'onClear',
}

export type SearchEvent = keyof typeof SEARCH_EVENTS

const CLASS = 'tsmap-search'

type Row
  = | { type: 'query', query: string }
    | { type: 'category', category: SearchCategory }
    | { type: 'place', place: SearchPlace }
    | { type: 'recent', entry: SearchHistoryEntry }

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
const CLOCK = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17Z M12 7.5V12l3 2"/></svg>`
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
  declare _areaButton?: HTMLElement
  declare _timer?: ReturnType<typeof setTimeout>
  declare _abort?: AbortController
  declare _listeners?: Set<(type: SearchEvent, event: any) => void>

  initialize(options: SearchControlOptions = {}): void {
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined))
    super.initialize({ position: 'topleft', ...given })
    this.history = new SearchHistory()
    this._view = 'idle'
    this._rows = []
    this._active = -1
    this._results = []
    this._pins = new Map()
  }

  onAdd(map: any): HTMLElement {
    this.engine = new SearchEngine({ map, provider: this.options.provider, offline: this.options.offline, language: this.options.language })
    const container = DomUtil.create('div', CLASS)
    container.innerHTML = `
      <div class="${CLASS}-field">
        <span class="${CLASS}-icon">${MAGNIFIER}</span>
        <input class="${CLASS}-input" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-label="Search Maps"
          placeholder="${escape(this.options.placeholder ?? 'Search Maps')}">
        <button class="${CLASS}-clear" type="button" aria-label="Clear">✕</button>
        <button class="${CLASS}-cancel" type="button">Cancel</button>
      </div>
      <div class="${CLASS}-body" role="listbox"></div>`
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
    map.on('resize', this._fit, this)
    this._container = container
    // Laid out once it is in the page.
    setTimeout(() => this._fit(), 0)
    return container
  }

  onRemove(map: any): void {
    this._abort?.abort()
    clearTimeout(this._timer)
    this._clearPins()
    this._areaButton?.remove()
    map.off('moveend', this._onMoveEnd, this)
    map.off('resize', this._fit, this)
  }

  // ---------------------------------------------------------------------------
  // What a page can ask of it
  // ---------------------------------------------------------------------------

  /** Search for text, as though typed and Search pressed. */
  async search(query: string): Promise<SearchPlace[]> {
    const category = categoryForQuery(query)
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
    this._input!.value = category.label
    this._show('results', { loading: true, title: category.label })
    const places = await this._run(signal => this.engine.nearby(category, { near: this._near(), signal }))
    this._showResults(places, { category })
    return places
  }

  /** Show a place: fly to it, drop its pin, and open its card. */
  select(place: SearchPlace): this {
    this._place = place
    this.history.add({ place })
    this._pin(place, true)
    // The inner element: the marker's own carries its position.
    for (const [id, pin] of this._pins) {
      const chosen = id === place.id
      const icon = (pin as any)._icon as HTMLElement | undefined
      const head = icon?.querySelector(`.${CLASS}-pin`)
      if (chosen)
        head?.classList.add(`${CLASS}-pin-selected`)
      else
        head?.classList.remove(`${CLASS}-pin-selected`)
      pin.setZIndexOffset(chosen ? 1000 : 0)
    }
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
    this._emit('select', { place })
    return this
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
    return this.options.units ?? (prefersImperial() ? 'imperial' : 'metric')
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
      rows.forEach((row, i) => row.classList.toggle(`${CLASS}-active`, i === this._active))
      rows[this._active]?.scrollIntoView?.({ block: 'nearest' })
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
    if (this._view === 'place' && this._results.length)
      this._show('results')
    else if (this._view === 'results' || this._view === 'place' || this._view === 'suggest')
      this.cancel()
    else
      this._show('idle')
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
          this._body!.innerHTML = `<div class="${CLASS}-head"><span class="${CLASS}-title">${escape(extra.title ?? '')}</span></div><div class="${CLASS}-status">Searching…</div>`
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
    this._rows = [
      ...categories.map(category => ({ type: 'category' as const, category })),
      ...recents.map(entry => ({ type: 'recent' as const, entry })),
    ]
    const units = this._units()
    const chips = categories.map((category, i) => `
      <button class="${CLASS}-chip" type="button" data-row="${i}">${badge(category.icon, 40)}<span>${escape(category.label)}</span></button>`).join('')
    const recentRows = recents.map((entry, j) => {
      const i = categories.length + j
      if (entry.place) {
        const d = distanceMeters(this._near(), entry.place.center)
        return this._rowHtml(i, badge(entry.place.icon), escape(entry.place.name), escape(describePlace({ ...entry.place, distance: d }, m => formatDistance(m, units))))
      }
      return this._rowHtml(i, `<span class="${CLASS}-glyph">${CLOCK}</span>`, escape(entry.query ?? ''), '')
    }).join('')
    this._body!.innerHTML = `
      <div class="${CLASS}-section"><span>Find Nearby</span></div>
      <div class="${CLASS}-chips">${chips}</div>
      ${recents.length ? `<div class="${CLASS}-section"><span>Recents</span><button type="button" class="${CLASS}-link" data-action="clear-recents">Clear</button></div><div class="${CLASS}-rows">${recentRows}</div>` : ''}`
  }

  _rowHtml(index: number, icon: string, title: string, detail: string): string {
    return `<div class="${CLASS}-row" role="option" data-row="${index}">${icon}<div class="${CLASS}-row-text"><div class="${CLASS}-row-title">${title}</div>${detail ? `<div class="${CLASS}-row-detail">${detail}</div>` : ''}</div></div>`
  }

  _showSuggestions(query: string, places: SearchPlace[]): void {
    this._view = 'suggest'
    this._container?.classList.add(`${CLASS}-open`)
    this._hideAreaButton()
    const units = this._units()
    const categories = categoriesMatching(query).slice(0, 2)
    this._rows = [
      { type: 'query', query },
      ...categories.map(category => ({ type: 'category' as const, category })),
      ...places.map(place => ({ type: 'place' as const, place })),
    ]
    let i = 0
    const html = [
      this._rowHtml(i++, `<span class="${CLASS}-glyph">${MAGNIFIER}</span>`, escape(query), ''),
      ...categories.map(category => this._rowHtml(i++, badge(category.icon), highlight(category.label, query), 'Search Nearby')),
      ...places.map(place => this._rowHtml(i++, badge(place.icon), highlight(place.name, query), escape(describePlace(place, m => formatDistance(m, units))))),
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
    for (const place of places)
      this._pin(place, false)
    this._fitResults(places)
    this._show('results')
    this._emit('results', { ...what, places })
  }

  _renderResults(): void {
    const places = this._results
    const units = this._units()
    const what = this._resultsFor
    const title = what?.category?.label ?? what?.query ?? 'Results'
    this._rows = places.map(place => ({ type: 'place' as const, place }))
    const rows = places.map((place, i) => this._rowHtml(i, badge(place.icon), escape(place.name), escape(describePlace(place, m => formatDistance(m, units))))).join('')
    this._body!.dataset.html = ''
    this._body!.innerHTML = `
      <div class="${CLASS}-head"><span class="${CLASS}-title">${escape(title)}</span><span class="${CLASS}-count">${places.length ? `${places.length} ${places.length === 1 ? 'result' : 'results'}` : ''}</span></div>
      ${places.length ? `<div class="${CLASS}-rows">${rows}</div>` : `<div class="${CLASS}-status">No results${what?.category ? ' in this area. Zoom out or move the map, then Search This Area.' : '.'}</div>`}`
  }

  _renderPlace(): void {
    const place = this._place
    if (!place)
      return
    const units = this._units()
    const kind = kindLabel(place.kind)
    const distance = place.distance !== undefined ? formatDistance(place.distance, units) : undefined
    const coords = `${place.center.lat.toFixed(5)}, ${place.center.lng.toFixed(5)}`
    this._rows = []
    this._body!.dataset.html = ''
    this._body!.innerHTML = `
      <div class="${CLASS}-place">
        <div class="${CLASS}-place-head">
          ${badge(place.icon, 44)}
          <div class="${CLASS}-place-title">
            <div class="${CLASS}-place-name">${escape(place.name)}</div>
            <div class="${CLASS}-place-kind">${escape([kind, distance].filter(Boolean).join(' · '))}</div>
          </div>
          <button type="button" class="${CLASS}-close" data-action="close-place" aria-label="Close">✕</button>
        </div>
        ${this.options.turnByTurn || this.options.onDirections ? `<button type="button" class="${CLASS}-directions" data-action="directions">${CAR}<span>Directions</span></button>` : ''}
        <div class="${CLASS}-place-info">
          ${place.address ? `<div class="${CLASS}-info-label">Address</div><div class="${CLASS}-info-value">${escape(place.address)}</div>` : ''}
          <div class="${CLASS}-info-label">Coordinates</div><div class="${CLASS}-info-value">${coords}</div>
        </div>
      </div>`
  }

  // ---------------------------------------------------------------------------
  // The map
  // ---------------------------------------------------------------------------

  /** Apple's balloon pin: the category's colour and glyph, on a stem. */
  _pin(place: SearchPlace, selected: boolean): void {
    if (this._pins.has(place.id))
      return
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

  _clearPins(): void {
    for (const pin of this._pins.values())
      pin.remove()
    this._pins.clear()
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
    button.textContent = 'Search This Area'
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
