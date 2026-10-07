import type { LatLngLike } from '../geo/LatLng'
import type { PanoramaView } from './PanoramaRenderer'
import type { StreetImage, StreetImageryProvider } from './providers'
import { Control } from '../control/Control'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { controlLocale, formatDate, message } from '../i18n'
import { DivIcon } from '../layer/marker/DivIcon'
import { Marker } from '../layer/marker/Marker'
import { headingToward, normalizeHeading, stepsFrom, stepToward } from './navigation'
import { PanoramaRenderer } from './PanoramaRenderer'
import { nearestImage, PanoramaxImagery } from './providers'

/**
 * Look Around, after Apple Maps: street-level pictures you can turn in and
 * walk through.
 *
 * The binoculars button shows the streets with pictures in blue; tap one
 * and the map gives way to the picture taken there, full-bleed. Drag to
 * look round, scroll or pinch to zoom, tap ahead (or the arrows, or the
 * arrow keys) to move along the street. A small map in the corner shows
 * where you stand and which way you look. A place card with pictures near
 * it offers them too (see `SearchControl`'s `lookAround`).
 *
 * Pictures come from a `StreetImageryProvider`: Panoramax by default (open,
 * no key), or Mapillary with a token.
 */
export interface LookAroundOptions {
  position?: string
  /** Where pictures come from. Default Panoramax. */
  provider?: StreetImageryProvider
  /** The small map in the corner. Default true. */
  miniMap?: boolean
  /** The language its words are in. Default the map's, else the browser's. */
  locale?: string
  title?: string
}

/** What `sync` brings it into line with; left out is left alone. */
export interface LookAroundTarget {
  /** Show the streets with pictures and wait for a tap. */
  choosing?: boolean
  /** Look from the picture nearest here; `null` to close. */
  at?: LatLngLike | null
  /** The way to look, compass degrees. */
  heading?: number
  position?: string
  provider?: StreetImageryProvider
}

/**
 * Every event, with the callback-prop name bindings give it: `open` and
 * `imagechange` `{ image }`, `close`, `viewchange` `{ heading, pitch, fov }`,
 * `choosingchange` `{ choosing }`, `notfound` `{ at }` when there is no
 * picture near a tap.
 */
export const LOOK_AROUND_EVENTS: {
  readonly open: 'onOpen'
  readonly close: 'onClose'
  readonly imagechange: 'onImageChange'
  readonly viewchange: 'onViewChange'
  readonly choosingchange: 'onChoosingChange'
  readonly notfound: 'onNotFound'
} = {
  open: 'onOpen',
  close: 'onClose',
  imagechange: 'onImageChange',
  viewchange: 'onViewChange',
  choosingchange: 'onChoosingChange',
  notfound: 'onNotFound',
}

export type LookAroundEvent = keyof typeof LOOK_AROUND_EVENTS

const CLASS = 'tsmap-lookaround'
const SOURCE = 'ts-maps-lookaround'
const LAYERS = ['ts-maps-lookaround-points', 'ts-maps-lookaround-lines']
const BLUE = '#0a84ff'

const BINOCULARS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7.5 5c1.3 0 2.3.9 2.5 2.1l.1.9h3.8l.1-.9C14.2 5.9 15.2 5 16.5 5c1.2 0 2.2.8 2.5 2l1.8 6.7a4 4 0 1 1-7.7 2.3L13 15h-2l-.1 1a4 4 0 1 1-7.7-2.3L5 7c.3-1.2 1.3-2 2.5-2Zm-.5 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg>'
const CHEVRON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m6 15 6-6 6 6"/></svg>'

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

function isImage(target: unknown): target is StreetImage {
  return !!target && typeof target === 'object' && 'url' in target && 'heading' in target && 'id' in target
}

function toLatLng(at: LatLngLike): { lat: number, lng: number } {
  if (Array.isArray(at))
    return { lat: at[0], lng: at[1] }
  const p = at as { lat: number, lng?: number, lon?: number }
  return { lat: p.lat, lng: p.lng ?? p.lon ?? 0 }
}

export class LookAround extends Control {
  declare options: LookAroundOptions & Record<string, any>
  declare provider: StreetImageryProvider
  declare image?: StreetImage
  declare view: PanoramaView
  declare choosing: boolean
  declare _button?: HTMLAnchorElement
  declare _overlay?: HTMLElement
  declare _renderer?: PanoramaRenderer
  declare _candidates: StreetImage[]
  declare _step: number
  declare _frame?: number
  declare _listeners?: Set<(type: LookAroundEvent, event: any) => void>
  declare _mini?: any
  declare _miniMarker?: any
  declare _note?: HTMLElement
  declare _returnFocus?: HTMLElement | null
  declare _synced: { choosing?: boolean, at?: string | null, heading?: number }
  declare _abort?: AbortController

  initialize(options: LookAroundOptions = {}): void {
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined))
    super.initialize({ position: 'topright', ...given })
    this.provider = options.provider ?? new PanoramaxImagery()
    this.view = { heading: 0, pitch: 0, fov: 75 }
    this.choosing = false
    this._candidates = []
    this._step = 1
    this._synced = {}
  }

  _t(key: string, params?: Record<string, string | number>): string {
    return message(controlLocale(this), key, params)
  }

  get isOpen(): boolean {
    return !!this._overlay
  }

  onAdd(): HTMLElement {
    const container = DomUtil.create('div', `${CLASS}-control tsmap-bar`)
    const link = DomUtil.create('a', `${CLASS}-button`, container) as HTMLAnchorElement
    link.href = '#'
    link.title = this.options.title ?? this._t('lookaround.title')
    link.setAttribute('role', 'button')
    link.setAttribute('aria-label', link.title)
    link.setAttribute('aria-pressed', 'false')
    link.innerHTML = BINOCULARS
    DomEvent.disableClickPropagation(link)
    DomEvent.on(link, 'click', DomEvent.stop)
    DomEvent.on(link, 'click', () => this.setChoosing(!this.choosing))
    this._button = link
    return container
  }

  onRemove(map: any): void {
    this.close()
    this.setChoosing(false)
    map.off('styledata', this._ensureCoverage, this)
  }

  // ---------------------------------------------------------------------------
  // Choosing on the map
  // ---------------------------------------------------------------------------

  /** Show the streets with pictures, and open the picture nearest the next tap. */
  setChoosing(on: boolean): this {
    const map = this._map
    if (on === this.choosing || !map)
      return this
    this.choosing = on
    this._button?.setAttribute('aria-pressed', String(on))
    map.getContainer().classList.toggle(`${CLASS}-choosing`, on)
    if (on) {
      map.on('click', this._onMapClick, this)
      map.on('styledata', this._ensureCoverage, this)
      this._ensureCoverage()
      this._flash(this._t('lookaround.choose'))
    }
    else {
      map.off('click', this._onMapClick, this)
      map.off('styledata', this._ensureCoverage, this)
      this._removeCoverage()
      this._flash('')
    }
    this._emit('choosingchange', { choosing: on })
    return this
  }

  _ensureCoverage(): void {
    const map = this._map
    const coverage = this.provider.coverage?.()
    if (!coverage || !map?.addSource || map.getSource?.(SOURCE) || !map.getStyle?.())
      return
    map.addSource(SOURCE, { type: 'vector', tiles: [coverage.tiles], minzoom: coverage.minzoom, maxzoom: coverage.maxzoom })
    const overlay = { 'ts-maps:overlay': true }
    const filter = coverage.filter ? { filter: coverage.filter } : {}
    map.addStyleLayer({
      id: LAYERS[1]!,
      type: 'line',
      source: SOURCE,
      'source-layer': coverage.lines,
      metadata: overlay,
      ...filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': BLUE, 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 4, 19, 8] },
    })
    if (coverage.points) {
      map.addStyleLayer({
        id: LAYERS[0]!,
        type: 'circle',
        source: SOURCE,
        'source-layer': coverage.points,
        minzoom: 17,
        metadata: overlay,
        ...filter,
        paint: { 'circle-color': BLUE, 'circle-radius': 3.5, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 },
      })
    }
  }

  _removeCoverage(): void {
    const map = this._map
    for (const id of LAYERS) {
      if (map?.getStyleLayer?.(id))
        map.removeStyleLayer(id)
    }
    if (map?.getSource?.(SOURCE))
      map.removeSource(SOURCE)
  }

  _onMapClick(e: { latlng: { lat: number, lng: number } }): void {
    const map = this._map
    // About a finger's width on the map, in metres.
    const metresPerPixel = (40075016.686 * Math.cos((e.latlng.lat * Math.PI) / 180)) / (256 * 2 ** map.getZoom())
    const radius = Math.max(15, Math.min(250, 30 * metresPerPixel))
    void this.open(e.latlng, { radius })
  }

  // ---------------------------------------------------------------------------
  // The viewer
  // ---------------------------------------------------------------------------

  /**
   * Look from a picture, or from the one nearest a place. `heading` sets the
   * way to look; `lookAt` turns to face a place, as a place card does.
   * Resolves to the picture, or undefined when there is none near.
   */
  async open(target: StreetImage | LatLngLike, options: { heading?: number, lookAt?: LatLngLike, radius?: number } = {}): Promise<StreetImage | undefined> {
    this._abort?.abort()
    const abort = this._abort = new AbortController()
    let image: StreetImage | undefined
    if (isImage(target)) {
      image = target
    }
    else {
      const at = toLatLng(target)
      image = await nearestImage(this.provider, at, options.radius ?? 60, abort.signal).catch(() => undefined)
      if (abort.signal.aborted)
        return undefined
      if (!image) {
        this._flash(this._t('lookaround.none'))
        this._emit('notfound', { at })
        return undefined
      }
    }
    const heading = options.heading ?? (options.lookAt ? headingToward(image, toLatLng(options.lookAt)) : this.isOpen ? this.view.heading : image.heading)
    if (this.choosing)
      this.setChoosing(false)
    const opening = !this.isOpen
    this._build()
    this.view = { ...this.view, heading: normalizeHeading(heading), pitch: 0 }
    await this._go(image, false)
    if (opening)
      this._emit('open', { image })
    return image
  }

  /** Close the viewer and give the map back. */
  close(): this {
    this._abort?.abort()
    if (!this._overlay)
      return this
    if (this._frame !== undefined)
      (globalThis.cancelAnimationFrame ?? clearTimeout)(this._frame)
    this._frame = undefined
    this._mini?.remove()
    this._mini = undefined
    this._miniMarker = undefined
    this._renderer?.remove()
    this._renderer = undefined
    this._overlay.remove()
    this._overlay = undefined
    this.image = undefined
    this._candidates = []
    this._returnFocus?.focus?.()
    this._emit('close', {})
    return this
  }

  /** Look another way. */
  setView(view: Partial<PanoramaView>): this {
    this.view = {
      heading: normalizeHeading(view.heading ?? this.view.heading),
      pitch: Math.max(-80, Math.min(80, view.pitch ?? this.view.pitch)),
      fov: Math.max(30, Math.min(100, view.fov ?? this.view.fov)),
    }
    this._draw()
    this._updateMini()
    this._emit('viewchange', { ...this.view })
    return this
  }

  /** Move to the next picture along the way you look (or back, or aside). Resolves to it, if there was one. */
  async step(way: 'forward' | 'back' | 'left' | 'right' = 'forward'): Promise<StreetImage | undefined> {
    if (!this.image)
      return undefined
    const turn = { forward: 0, back: 180, left: -90, right: 90 }[way]
    const next = stepToward(this.image, this._candidates, this.view.heading + turn)
    if (next)
      await this._go(next, true)
    return next
  }

  /** The pictures each way from here, for the arrows. */
  get steps(): ReturnType<typeof stepsFrom> {
    return this.image ? stepsFrom(this.image, this._candidates, this.view.heading) : {}
  }

  async _go(image: StreetImage, animate: boolean): Promise<void> {
    const renderer = this._renderer
    if (!renderer)
      return
    this.image = image
    this._caption()
    this._updateMini()
    this._candidates = [image]
    this._arrows()
    try {
      await renderer.show(image)
    }
    catch {
      this._flash(this._t('lookaround.failed'))
      return
    }
    if (this.image !== image)
      return
    if (animate && renderer.webgl)
      await this._animate()
    else
      this._draw()
    this._emit('imagechange', { image })
    // A sharper copy, once the first is showing.
    if (image.hdUrl && image.hdUrl !== image.url && renderer.webgl) {
      renderer.show(image, image.hdUrl).then(() => this.image === image && this._draw(), () => {})
    }
    void this._loadNeighbours(image)
  }

  async _loadNeighbours(image: StreetImage): Promise<void> {
    const signal = this._abort?.signal
    const near = await this.provider.near(image, { radius: 35, limit: 30, signal }).catch(() => [] as StreetImage[])
    const linked = await Promise.all([image.next, image.prev]
      .filter((id): id is string => !!id && !near.some(n => n.id === id))
      .map(id => this.provider.get(id, { signal }).catch(() => undefined)))
    if (this.image !== image)
      return
    // eslint-disable-next-line no-unused-vars
    this._candidates = [image, ...near.filter(n => n.id !== image.id), ...linked.filter((n): n is StreetImage => !!n)]
    this._arrows()
  }

  _animate(): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now()
      const duration = 450
      const tick = (): void => {
        const t = Math.min(1, (Date.now() - start) / duration)
        // Ease out: quick away, settling into the new picture.
        this._step = 1 - (1 - t) ** 3
        this._renderer?.draw(this.view, this._step)
        if (t < 1 && this._renderer)
          this._frame = (globalThis.requestAnimationFrame ?? ((fn: () => void) => setTimeout(fn, 16)))(tick) as unknown as number
        else
          resolve()
      }
      tick()
    })
  }

  _draw(): void {
    if (this._frame !== undefined || !this._renderer)
      return
    const raf = globalThis.requestAnimationFrame ?? ((fn: () => void) => setTimeout(fn, 16))
    this._frame = raf(() => {
      this._frame = undefined
      this._renderer?.draw(this.view, 1)
    }) as unknown as number
  }

  _build(): void {
    if (this._overlay || !this._map)
      return
    const map = this._map
    this._returnFocus = (globalThis.document?.activeElement as HTMLElement | null) ?? null
    const overlay = DomUtil.create('div', CLASS, map.getContainer())
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', this._t('lookaround.title'))
    overlay.tabIndex = 0
    this._overlay = overlay
    this._renderer = new PanoramaRenderer(overlay)
    overlay.insertAdjacentHTML('beforeend', `
      <div class="${CLASS}-top">
        <div class="${CLASS}-caption"><div class="${CLASS}-title">${escape(this._t('lookaround.title'))}</div><div class="${CLASS}-date"></div></div>
        <button type="button" class="${CLASS}-done" data-action="close">${escape(this._t('lookaround.done'))}</button>
      </div>
      <div class="${CLASS}-arrows">
        <button type="button" class="${CLASS}-arrow" data-step="forward" aria-label="${escape(this._t('lookaround.forward'))}">${CHEVRON}</button>
        <button type="button" class="${CLASS}-arrow ${CLASS}-back" data-step="back" aria-label="${escape(this._t('lookaround.back'))}">${CHEVRON}</button>
      </div>
      <div class="${CLASS}-credit"></div>
      <div class="${CLASS}-note" role="status" aria-live="polite"></div>`)

    // The map beneath does not see any of this.
    for (const type of ['pointerdown', 'wheel', 'dblclick', 'click', 'touchstart', 'mousedown', 'keydown'])
      overlay.addEventListener(type, e => e.stopPropagation())
    overlay.addEventListener('click', (e) => {
      const el = e.target as HTMLElement
      const step = el.closest<HTMLElement>('[data-step]')?.dataset.step
      if (step)
        void this.step(step as 'forward' | 'back')
      else if (el.closest('[data-action="close"]'))
        this.close()
    })
    this._interact(overlay)
    if (this.options.miniMap !== false)
      this._buildMini(overlay)
    overlay.focus?.()
  }

  /** Drag to look round, scroll to zoom, tap to move toward where you tapped, keys for all of it. */
  _interact(overlay: HTMLElement): void {
    const view = this._renderer!.element
    let drag: { x: number, y: number, heading: number, pitch: number, moved: boolean } | undefined
    view.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, heading: this.view.heading, pitch: this.view.pitch, moved: false }
      view.setPointerCapture?.(e.pointerId)
    })
    view.addEventListener('pointermove', (e) => {
      if (!drag)
        return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 4)
        drag.moved = true
      // The picture follows the finger: degrees per pixel at this zoom.
      const perPixel = this.view.fov / Math.max(1, view.clientHeight)
      this.setView({ heading: drag.heading - dx * perPixel, pitch: drag.pitch + dy * perPixel })
    })
    view.addEventListener('pointerup', (e) => {
      const tap = drag && !drag.moved
      drag = undefined
      if (!tap)
        return
      // Move toward the way tapped.
      const rect = view.getBoundingClientRect()
      const nx = rect.width ? ((e.clientX - rect.left) / rect.width) * 2 - 1 : 0
      const across = Math.atan(nx * Math.tan((this.view.fov * Math.PI) / 360) * (rect.width / Math.max(1, rect.height))) * 180 / Math.PI
      const next = this.image && stepToward(this.image, this._candidates, this.view.heading + across, { spread: 35 })
      if (next)
        void this._go(next, true)
    })
    view.addEventListener('wheel', (e) => {
      e.preventDefault?.()
      this.setView({ fov: this.view.fov * Math.exp(e.deltaY * 0.001) })
    })
    overlay.addEventListener('keydown', (e) => {
      const key = e.key
      if (key === 'Escape')
        this.close()
      else if (key === 'ArrowLeft')
        this.setView({ heading: this.view.heading - 15 })
      else if (key === 'ArrowRight')
        this.setView({ heading: this.view.heading + 15 })
      else if (key === 'ArrowUp')
        void this.step('forward')
      else if (key === 'ArrowDown')
        void this.step('back')
      else if (key === '+' || key === '=')
        this.setView({ fov: this.view.fov / 1.25 })
      else if (key === '-')
        this.setView({ fov: this.view.fov * 1.25 })
      else
        return
      e.preventDefault()
    })
  }

  _buildMini(overlay: HTMLElement): void {
    const map = this._map
    const style = map.getStyle?.()
    // eslint-disable-next-line no-unused-vars
    const Ctor = map.constructor as new (el: HTMLElement, options: Record<string, unknown>) => any
    if (!style || typeof Ctor !== 'function')
      return
    const inset = DomUtil.create('div', `${CLASS}-mini`, overlay)
    inset.setAttribute('aria-label', this._t('lookaround.mini'))
    const center = map.getCenter()
    try {
      this._mini = new Ctor(inset, {
        center: [center.lat, center.lng],
        zoom: 17,
        style,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        pinchZoom: false,
        keyboard: false,
        boxZoom: false,
        zoomAnimation: false,
        fadeAnimation: false,
      })
    }
    catch {
      inset.remove()
      return
    }
    const cone = `<svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true"><path d="M30 30 L12 4 A32 32 0 0 1 48 4 Z" fill="${BLUE}" fill-opacity=".35"/><circle cx="30" cy="30" r="7" fill="${BLUE}" stroke="#fff" stroke-width="3"/></svg>`
    this._miniMarker = new Marker([center.lat, center.lng], {
      icon: new DivIcon({ className: `${CLASS}-cone`, html: `<div class="${CLASS}-cone-turn">${cone}</div>`, iconSize: [60, 60], iconAnchor: [30, 30] }),
      interactive: false,
    }).addTo(this._mini)
  }

  _updateMini(): void {
    const image = this.image
    if (!image || !this._mini)
      return
    this._mini.setView([image.lat, image.lng], this._mini.getZoom?.() ?? 17, { animate: false })
    this._miniMarker?.setLatLng([image.lat, image.lng])
    const turn = this._miniMarker?.getElement?.()?.querySelector?.(`.${CLASS}-cone-turn`) as HTMLElement | undefined
    if (turn)
      turn.style.transform = `rotate(${this.view.heading}deg)`
  }

  _caption(): void {
    const image = this.image
    const overlay = this._overlay
    if (!image || !overlay)
      return
    const date = overlay.querySelector(`.${CLASS}-date`)
    if (date)
      date.textContent = image.capturedAt ? this._t('lookaround.captured', { date: formatDate(image.capturedAt, controlLocale(this), { month: 'short', year: 'numeric' }) }) : ''
    const credit = overlay.querySelector(`.${CLASS}-credit`)
    if (credit)
      credit.textContent = image.attribution ?? this.provider.attribution
  }

  _arrows(): void {
    const overlay = this._overlay
    if (!overlay)
      return
    const steps = this.steps
    for (const way of ['forward', 'back'] as const) {
      const button = overlay.querySelector<HTMLButtonElement>(`[data-step="${way}"]`)
      if (button)
        button.disabled = !steps[way]
    }
  }

  /** A word over the map or the picture for a moment. */
  _flash(text: string): void {
    const map = this._map
    if (!map)
      return
    let note = this._overlay?.querySelector<HTMLElement>(`.${CLASS}-note`) ?? this._note
    if (!note && text) {
      note = this._note = DomUtil.create('div', `${CLASS}-hint`, map.getContainer())
      note.setAttribute('role', 'status')
      note.setAttribute('aria-live', 'polite')
    }
    if (!note)
      return
    note.textContent = text
    if (!text && note === this._note) {
      note.remove()
      this._note = undefined
    }
  }

  /** Bring it into line with a declarative description: what bindings call as props change. */
  sync(target: LookAroundTarget): this {
    if ('provider' in target && target.provider && target.provider !== this.provider) {
      const choosing = this.choosing
      this.setChoosing(false)
      this.provider = target.provider
      if (choosing)
        this.setChoosing(true)
    }
    if ('position' in target && (target.position ?? 'topright') !== this.options.position)
      this.setPosition(target.position ?? 'topright')
    if (target.choosing !== undefined && target.choosing !== this._synced.choosing) {
      this._synced.choosing = target.choosing
      this.setChoosing(target.choosing)
    }
    if ('at' in target) {
      const key = target.at === null || target.at === undefined ? null : JSON.stringify(toLatLng(target.at))
      if (key !== this._synced.at) {
        this._synced.at = key
        if (target.at)
          void this.open(target.at, { heading: target.heading })
        else if (target.at === null)
          this.close()
      }
    }
    if (target.heading !== undefined && target.heading !== this._synced.heading) {
      this._synced.heading = target.heading
      if (this.isOpen)
        this.setView({ heading: target.heading })
    }
    return this
  }

  /** Hear its events. Returns the way to stop. */
  listen(fn: (type: LookAroundEvent, event: any) => void): () => void {
    this._listeners ??= new Set()
    this._listeners.add(fn)
    return () => this._listeners?.delete(fn)
  }

  _emit(type: LookAroundEvent, event: any): void {
    for (const fn of this._listeners ?? [])
      fn(type, event)
  }

  /** An event as plain data, for a binding that sends it across a bridge. */
  static plainEvent(type: LookAroundEvent, event: any): unknown {
    if (event?.image) {
      const { id, provider, lat, lng, heading, capturedAt } = event.image as StreetImage
      return { image: { id, provider, lat, lng, heading, capturedAt } }
    }
    return type === 'close' ? {} : event
  }
}

export function lookAround(options: LookAroundOptions = {}): LookAround {
  return new LookAround(options)
}
