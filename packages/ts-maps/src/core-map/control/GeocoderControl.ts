import type { GeocoderProvider, GeocodingResult } from '../services/types'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { DivIcon } from '../layer/marker/DivIcon'
import { Marker } from '../layer/marker/Marker'
import { defaultGeocoder } from '../services/index'
import { Control } from './Control'

/**
 * A place search box, sitting on top of the geocoder providers in
 * `services/`.
 *
 * The adapters have always been there; what was missing was the control that
 * makes them usable without hand-rolling an input, a debounce, a result list
 * and keyboard handling on every map. The default provider is Nominatim, which
 * needs no key — so `control.geocoder().addTo(map)` searches out of the box.
 *
 * Requests are debounced and the in-flight one is aborted on every keystroke.
 * That is politeness towards a public endpoint as much as it is correctness:
 * without the abort, a slow early response can land after a fast later one and
 * repopulate the list with results for a query the user has already moved past.
 */
export interface GeocoderControlOptions {
  position?: string
  /** Defaults to the keyless Nominatim provider. */
  provider?: GeocoderProvider
  placeholder?: string
  title?: string
  /** Maximum results to request and show. Default 5. */
  limit?: number
  /** Milliseconds of quiet before a request goes out. Default 300. */
  debounce?: number
  /** Shortest query worth sending. Default 3. */
  minLength?: number
  /** Start as a button that expands into an input on click. Default false. */
  collapsed?: boolean
  /** Animate to the result rather than jumping. Default true. */
  flyTo?: boolean
  /** Zoom applied when a result carries no bounding box. Default 14. */
  zoom?: number
  /** Drop a marker on the chosen result. Default true. */
  marker?: boolean
  /** Bias results towards the current map centre. Default true. */
  proximity?: boolean
  language?: string
  countries?: string[]
  bbox?: [number, number, number, number]
  errorText?: string
  noResultsText?: string
}

const CLASS = 'tsmap-control-geocoder'

export class GeocoderControl extends Control {
  declare _input?: HTMLInputElement
  declare _list?: HTMLUListElement
  declare _toggle?: HTMLAnchorElement
  declare _results: GeocodingResult[]
  declare _selected: number
  declare _timer?: ReturnType<typeof setTimeout>
  declare _abort?: AbortController
  declare _marker?: Marker
  declare _expanded?: boolean

  onAdd(_map: any): HTMLElement {
    const options = this.options as GeocoderControlOptions
    this._results = []
    this._selected = -1

    const container = DomUtil.create('div', `${CLASS} tsmap-bar`)

    if (options.collapsed) {
      const toggle = DomUtil.create('a', `${CLASS}-toggle`, container) as HTMLAnchorElement
      toggle.href = '#'
      toggle.title = options.title ?? 'Search for a place'
      toggle.setAttribute('role', 'button')
      toggle.setAttribute('aria-label', toggle.title)
      toggle.setAttribute('aria-expanded', 'false')
      toggle.innerHTML = '<span class="tsmap-geocoder-icon" aria-hidden="true"></span>'
      DomEvent.on(toggle, 'click', DomEvent.stop)
      DomEvent.on(toggle, 'click', this._onToggle, this)
      this._toggle = toggle
    }

    const form = DomUtil.create('div', `${CLASS}-form`, container)

    const input = DomUtil.create('input', `${CLASS}-input`, form) as HTMLInputElement
    input.type = 'text'
    input.placeholder = options.placeholder ?? 'Search'
    input.setAttribute('role', 'combobox')
    input.setAttribute('aria-autocomplete', 'list')
    input.setAttribute('aria-expanded', 'false')
    input.setAttribute('aria-label', options.title ?? 'Search for a place')
    input.autocomplete = 'off'

    const list = DomUtil.create('ul', `${CLASS}-list`, container) as HTMLUListElement
    list.setAttribute('role', 'listbox')

    this._input = input
    this._list = list

    // Without these the map steals the drag, the wheel, and the double-click
    // from an input sitting on top of it.
    DomEvent.disableClickPropagation(container)
    DomEvent.disableScrollPropagation(container)
    DomEvent.on(input, 'input', this._onInput, this)
    DomEvent.on(input, 'keydown', this._onKeyDown, this)

    this._setExpanded(!options.collapsed)
    return container
  }

  onRemove(_map: any): void {
    this._cancelPending()
    this._marker?.remove()
    this._marker = undefined
  }

  /** Fill the box and search, as though the text had been typed. */
  setQuery(query: string): this {
    if (this._input)
      this._input.value = query
    this._search(query)
    return this
  }

  /** Empty the box, drop the results, and remove the result marker. */
  clear(): this {
    this._cancelPending()
    if (this._input)
      this._input.value = ''
    this._results = []
    this._selected = -1
    this._renderList()
    this._marker?.remove()
    this._marker = undefined
    return this
  }

  _onToggle(): void {
    this._setExpanded(!this._expanded)
    if (this._expanded)
      this._input?.focus()
  }

  _setExpanded(expanded: boolean): void {
    this._expanded = expanded
    // add/remove rather than toggle(class, force) — see Map._applyTheme.
    if (expanded)
      this._container?.classList.add(`${CLASS}-expanded`)
    else
      this._container?.classList.remove(`${CLASS}-expanded`)
    this._toggle?.setAttribute('aria-expanded', String(expanded))
  }

  _onInput(): void {
    this._search(this._input?.value ?? '')
  }

  _search(query: string): void {
    const options = this.options as GeocoderControlOptions
    const trimmed = query.trim()

    this._cancelPending()

    if (trimmed.length < (options.minLength ?? 3)) {
      this._results = []
      this._selected = -1
      this._renderList()
      return
    }

    const run = (): void => this._request(trimmed)
    const wait = options.debounce ?? 300
    if (wait > 0)
      this._timer = setTimeout(run, wait)
    else
      run()
  }

  _request(query: string): void {
    const options = this.options as GeocoderControlOptions
    const provider = options.provider ?? defaultGeocoder()
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined

    this._abort = controller
    this._container?.classList.add(`${CLASS}-busy`)

    provider.search(query, {
      limit: options.limit ?? 5,
      language: options.language,
      countries: options.countries,
      bbox: options.bbox,
      proximity: options.proximity === false ? undefined : this._map?.getCenter?.(),
      signal: controller?.signal,
    })
      .then((results) => {
        // A response from a superseded request must not repopulate the list.
        if (this._abort !== controller)
          return
        this._container?.classList.remove(`${CLASS}-busy`)
        this._results = results ?? []
        this._selected = -1
        this._renderList()
        this._map?.fire?.('geocoderesults', { query, results: this._results })
      })
      .catch((error: any) => {
        if (this._abort !== controller || error?.name === 'AbortError')
          return
        this._container?.classList.remove(`${CLASS}-busy`)
        this._results = []
        this._renderList()
        this._map?.fire?.('geocodeerror', { query, error })
      })
  }

  _renderList(): void {
    const list = this._list
    if (!list)
      return

    list.replaceChildren()
    const hasResults = this._results.length > 0

    if (hasResults)
      this._container?.classList.add(`${CLASS}-open`)
    else
      this._container?.classList.remove(`${CLASS}-open`)
    this._input?.setAttribute('aria-expanded', String(hasResults))

    if (!hasResults) {
      this._input?.removeAttribute('aria-activedescendant')
      return
    }

    this._results.forEach((result, index) => {
      const item = DomUtil.create('li', `${CLASS}-item`, list) as HTMLLIElement
      item.textContent = result.text
      item.id = `${CLASS}-item-${index}`
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', String(index === this._selected))
      if (index === this._selected)
        item.classList.add(`${CLASS}-item-active`)
      DomEvent.on(item, 'click', DomEvent.stop)
      DomEvent.on(item, 'click', () => this.select(index), this)
    })
  }

  _onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        DomEvent.stop(event as any)
        this._move(1)
        break
      case 'ArrowUp':
        DomEvent.stop(event as any)
        this._move(-1)
        break
      case 'Enter':
        DomEvent.stop(event as any)
        // Enter with nothing highlighted takes the top hit, which is what a
        // search box is expected to do.
        if (this._results.length)
          this.select(this._selected >= 0 ? this._selected : 0)
        break
      case 'Escape':
        DomEvent.stop(event as any)
        this.clear()
        break
    }
  }

  _move(delta: number): void {
    if (!this._results.length)
      return
    const count = this._results.length
    this._selected = (this._selected + delta + count) % count
    this._renderList()
    this._input?.setAttribute('aria-activedescendant', `${CLASS}-item-${this._selected}`)
  }

  /** Choose a result by index, as though it had been clicked. */
  select(index: number): this {
    const result = this._results[index]
    const map = this._map
    if (!result || !map)
      return this

    const options = this.options as GeocoderControlOptions
    const center: [number, number] = [result.center.lat, result.center.lng]

    if (result.bbox) {
      const [west, south, east, north] = result.bbox
      map.fitBounds([[south, west], [north, east]])
    }
    else {
      const zoom = options.zoom ?? 14
      if (options.flyTo !== false && typeof map.flyTo === 'function')
        map.flyTo(center, zoom)
      else
        map.setView(center, zoom)
    }

    if (options.marker !== false) {
      if (this._marker)
        this._marker.setLatLng(center)
      else
        this._marker = new Marker(center, { icon: new DivIcon({ className: `${CLASS}-marker`, iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map)
    }

    if (this._input)
      this._input.value = result.text

    this._results = []
    this._selected = -1
    this._renderList()

    map.fire?.('geocodeselect', { result })
    return this
  }

  _cancelPending(): void {
    if (this._timer !== undefined) {
      clearTimeout(this._timer)
      this._timer = undefined
    }
    this._abort?.abort()
    this._abort = undefined
    this._container?.classList.remove(`${CLASS}-busy`)
  }
}

GeocoderControl.setDefaultOptions({
  position: 'topleft',
  placeholder: 'Search',
  limit: 5,
  debounce: 300,
  minLength: 3,
  collapsed: false,
  flyTo: true,
  zoom: 14,
  marker: true,
  proximity: true,
})
