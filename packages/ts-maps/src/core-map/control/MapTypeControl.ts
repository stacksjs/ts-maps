import type { BasemapStyleOptions } from '../styles/basemap'
import type { TrafficLayer } from '../traffic/TrafficLayer'
import type { ImageryOptions } from '../styles/imagery'
import type { Style as StyleSpec } from '../style-spec/types'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { dark, light } from '../styles/basemap'
import { hybrid, satellite } from '../styles/imagery'
import { Control } from './Control'

/**
 * The map type picker, after Apple Maps: Explore, Driving, Satellite.
 *
 * A button opens a card of map types; choosing one sets its style. Markers,
 * routes and popups are not part of a style and stay where they are, as does
 * the camera; layers and sources a page added to the style itself (a route
 * drawn as a line layer, a heatmap) are carried over onto the new one.
 */
export interface MapTypeOption {
  id: string
  /** What the card calls it: "Explore", "Satellite". */
  label: string
  /** The style, or a function building it when chosen. */
  style: StyleSpec | (() => StyleSpec)
  /** The chrome to show over it: imagery reads best under dark controls. */
  theme?: 'light' | 'dark' | 'auto'
}

export interface MapTypeControlOptions {
  position?: string
  /** The types to offer, in order. See `mapTypes()` for Apple's set. */
  types?: MapTypeOption[]
  /** The type showing. Default the first. */
  value?: string
  title?: string
  /**
   * Which of the style's layers are the page's own, to carry onto the next
   * map type. By default those drawing a GeoJSON, image, video or canvas
   * source, which a basemap does not use, and anything added since the
   * picker last set a style, or marked `metadata: { 'ts-maps:overlay': true }`.
   */
  keep?: (layer: StyleSpec['layers'][number], style: StyleSpec) => boolean
  /** A traffic layer for the card's Traffic switch, as Apple's picker has. */
  traffic?: TrafficLayer
}

/** What `sync` brings the control into line with; left out is left alone. */
export interface MapTypeTarget {
  value?: string
  open?: boolean
  position?: string
  types?: MapTypeOption[]
  /** Show traffic, with the `traffic` layer the picker was given. */
  showTraffic?: boolean
}

/**
 * Every event the picker reports, with the callback-prop name bindings give
 * it: `change` `{ value }` when a type is chosen, `openchange` `{ open }`,
 * `trafficchange` `{ traffic }` when the Traffic switch is turned.
 */
export const MAP_TYPE_EVENTS: {
  readonly change: 'onChange'
  readonly openchange: 'onOpenChange'
  readonly trafficchange: 'onTrafficChange'
} = {
  change: 'onChange',
  openchange: 'onOpenChange',
  trafficchange: 'onTrafficChange',
}

export type MapTypeEvent = keyof typeof MAP_TYPE_EVENTS

export interface MapTypesOptions extends Omit<BasemapStyleOptions, 'emphasis' | 'mode'>, ImageryOptions {
  /** The light or dark basemap for Explore and Driving. Default light. */
  theme?: 'light' | 'dark'
  /** Offer Satellite with labels on (hybrid) rather than without. Default true. */
  labels?: boolean
}

/**
 * Apple's map types from one basemap source and one imagery source: Explore
 * (the basemap), Driving (roads first) and Satellite (imagery, with names).
 */
export function mapTypes(options: MapTypesOptions): MapTypeOption[] {
  const build = options.theme === 'dark' ? dark : light
  return [
    { id: 'explore', label: 'Explore', style: () => build(options), theme: options.theme ?? 'light' },
    { id: 'driving', label: 'Driving', style: () => build({ ...options, emphasis: 'driving' }), theme: options.theme ?? 'light' },
    { id: 'satellite', label: 'Satellite', style: () => options.labels === false ? satellite(options) : hybrid(options), theme: 'dark' },
  ]
}

const CLASS = 'tsmap-maptype'

const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M9 4.5 3.5 6.6v13l5.5-2.1 6 2.1 5.5-2.1v-13L15 6.6Zm0 0v13m6-10.9v13"/></svg>'

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

export class MapTypeControl extends Control {
  declare options: MapTypeControlOptions & Record<string, any>
  declare value?: string
  declare _button?: HTMLAnchorElement
  declare _card?: HTMLElement
  declare _listeners?: Set<(type: MapTypeEvent, event: any) => void>
  /** Layer and source ids of the style this control last set, to tell a page's own additions from it. */
  declare _base?: { layers: Set<string>, sources: Set<string> }
  declare _synced: { value?: string, open?: boolean, showTraffic?: boolean }

  initialize(options: MapTypeControlOptions = {}): void {
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined))
    super.initialize({ position: 'topright', ...given })
    this.value = options.value ?? options.types?.[0]?.id
    this._synced = {}
  }

  onAdd(): HTMLElement {
    const container = DomUtil.create('div', `${CLASS}-control tsmap-bar`)
    const link = DomUtil.create('a', `${CLASS}-button`, container) as HTMLAnchorElement
    link.href = '#'
    link.title = this.options.title ?? 'Map Type'
    link.setAttribute('role', 'button')
    link.setAttribute('aria-label', link.title)
    link.setAttribute('aria-haspopup', 'dialog')
    link.innerHTML = ICON
    DomEvent.disableClickPropagation(link)
    DomEvent.on(link, 'click', DomEvent.stop)
    DomEvent.on(link, 'click', () => (this._card ? this.close() : this.open()))
    this._button = link
    return container
  }

  onRemove(): void {
    this.close()
  }

  get types(): MapTypeOption[] {
    return this.options.types ?? []
  }

  get isOpen(): boolean {
    return !!this._card
  }

  /** Show the card of map types. */
  open(): this {
    if (!this._map || this._card)
      return this
    const card = DomUtil.create('div', `${CLASS}-card`, this._map.getContainer())
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-label', 'Choose Map')
    card.addEventListener('click', (e) => {
      const el = e.target as HTMLElement
      const type = el.closest<HTMLElement>('[data-type]')?.dataset.type
      if (type)
        this.select(type)
      else if (el.closest('[data-action="close"]'))
        this.close()
    })
    // Taps on the card are for the card, not a drag of the map beneath it.
    for (const type of ['pointerdown', 'wheel', 'dblclick', 'click', 'touchstart'])
      card.addEventListener(type, e => e.stopPropagation())
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close()
        this._button?.focus()
      }
    })
    this._card = card
    this._render()
    this._button?.setAttribute('aria-expanded', 'true')
    card.querySelector<HTMLElement>(`[data-type="${this.value}"]`)?.focus?.()
    this._emit('openchange', { open: true })
    return this
  }

  close(): this {
    if (!this._card)
      return this
    this._card.remove()
    this._card = undefined
    this._button?.setAttribute('aria-expanded', 'false')
    this._emit('openchange', { open: false })
    return this
  }

  _render(): void {
    if (!this._card)
      return
    const options = this.types.map(type => `
      <button type="button" class="${CLASS}-option${type.id === this.value ? ` ${CLASS}-active` : ''}" data-type="${escape(type.id)}" aria-pressed="${type.id === this.value}">
        <span class="${CLASS}-swatch ${CLASS}-swatch-${escape(type.id)}" aria-hidden="true"></span>
        <span class="${CLASS}-label">${escape(type.label)}</span>
      </button>`).join('')
    const traffic = this.options.traffic
    this._card.innerHTML = `
      <div class="${CLASS}-head"><span class="${CLASS}-title">Choose Map</span><button type="button" class="${CLASS}-close" data-action="close" aria-label="Close">✕</button></div>
      <div class="${CLASS}-options">${options}</div>
      ${traffic ? `<label class="${CLASS}-setting"><span>Traffic</span><input type="checkbox" class="${CLASS}-switch" data-setting="traffic"${traffic.active ? ' checked' : ''}></label>` : ''}`
    this._card.querySelector<HTMLInputElement>('[data-setting="traffic"]')?.addEventListener('change', (e) => {
      const on = (e.currentTarget as HTMLInputElement).checked
      if (on !== traffic!.active)
        traffic!.toggle(this._map)
      this._emit('trafficchange', { traffic: on })
    })
  }

  /**
   * Show a map type: set its style, keeping what the page added to the
   * last one, and its chrome theme.
   */
  select(id: string): this {
    const type = this.types.find(t => t.id === id)
    const map = this._map
    if (!type || !map)
      return this
    const next = typeof type.style === 'function' ? type.style() : type.style
    map.setStyle(this._carryOver(next))
    this._base = { layers: new Set(next.layers.map(l => l.id)), sources: new Set(Object.keys(next.sources)) }
    if (type.theme && typeof map.setTheme === 'function')
      map.setTheme(type.theme)
    const changed = id !== this.value
    this.value = id
    this._render()
    if (changed)
      this._emit('change', { value: id })
    return this
  }

  /** Whether a layer of `style` is the page's own rather than the basemap's. */
  _isOverlay(layer: StyleSpec['layers'][number], style: StyleSpec): boolean {
    if (this.options.keep)
      return this.options.keep(layer, style)
    if ((layer as { metadata?: Record<string, unknown> }).metadata?.['ts-maps:overlay'])
      return true
    if (this._base && !this._base.layers.has(layer.id))
      return true
    const source = (layer as { source?: string }).source
    const type = source ? (style.sources[source] as { type?: string } | undefined)?.type : undefined
    return type === 'geojson' || type === 'image' || type === 'video' || type === 'canvas'
  }

  /** `next` with the layers and sources the page added to the current style on top. */
  _carryOver(next: StyleSpec): StyleSpec {
    const current = this._map?.getStyle?.() as StyleSpec | undefined
    if (!current)
      return next
    const nextLayers = new Set(next.layers.map(l => l.id))
    const extras = current.layers.filter(l => !nextLayers.has(l.id) && this._isOverlay(l, current))
    if (!extras.length)
      return next
    const sources = { ...next.sources }
    for (const layer of extras) {
      const id = (layer as { source?: string }).source
      if (id && !(id in sources) && current.sources[id])
        sources[id] = current.sources[id]!
    }
    return { ...next, sources, layers: [...next.layers, ...extras] }
  }

  /** Bring the control into line with a declarative description: what bindings call as props change. */
  sync(target: MapTypeTarget): this {
    if ('types' in target && target.types)
      this.options.types = target.types
    if ('position' in target && (target.position ?? 'topright') !== this.options.position)
      this.setPosition(target.position ?? 'topright')
    if (target.value !== undefined && target.value !== this._synced.value) {
      this._synced.value = target.value
      if (target.value !== this.value || !this._base)
        this.select(target.value)
    }
    const traffic = this.options.traffic
    if (traffic && target.showTraffic !== undefined && target.showTraffic !== this._synced.showTraffic) {
      this._synced.showTraffic = target.showTraffic
      if (target.showTraffic !== traffic.active)
        traffic.toggle(this._map)
    }
    if (target.open !== undefined && target.open !== this._synced.open) {
      this._synced.open = target.open
      if (target.open)
        this.open()
      else
        this.close()
    }
    this._render()
    return this
  }

  /** Hear `change` and `openchange`. Returns the way to stop. */
  listen(fn: (type: MapTypeEvent, event: any) => void): () => void {
    this._listeners ??= new Set()
    this._listeners.add(fn)
    return () => this._listeners?.delete(fn)
  }

  _emit(type: MapTypeEvent, event: any): void {
    for (const fn of this._listeners ?? [])
      fn(type, event)
  }
}
