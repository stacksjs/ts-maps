import type { OfflineMaps } from '../offline/OfflineMaps'
import type { OfflineRegionRecord } from '../offline/OfflineStore'
import type { GeocoderProvider } from '../services/types'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { Rectangle } from '../layer/vector/Rectangle'
import { offlineMaps } from '../offline/OfflineMaps'
import { unitToLat, unitToLng } from '../offline/plan'
import { Control } from './Control'

/**
 * Offline Maps, after Apple Maps.
 *
 * A button opens the list of downloaded maps: each with its size and date, a
 * progress bar while it downloads, and Pause, Resume, Update and Delete.
 * "Download New Map" dims the map around a rounded frame — drag its corners,
 * or move the map beneath it, to choose the area — and the card below names
 * the place and says how big the download will be before anything is fetched.
 *
 * When the browser goes offline a pill says so, and whether downloaded maps
 * cover what is on screen. "Only Use Offline Maps" keeps the map off the
 * network entirely.
 */
export interface OfflineMapsControlOptions {
  position?: string
  /** The manager to show. Default: the page's, `offlineMaps()`. */
  maps?: OfflineMaps
  /** Names a new area from its centre. Default: the largest place label inside it. */
  geocoder?: GeocoderProvider
  /** Other files to keep with every download: a TileJSON the page fetches itself, say. */
  resources?: string[]
  /** Show the offline pill when the connection drops. Default true. */
  showStatus?: boolean
  title?: string
}

const CLASS = 'tsmap-offline'

const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>'

/** "850 KB", "312 MB", "1.2 GB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1000)
    return `${Math.max(0, Math.round(bytes))} bytes`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1000
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

function day(time: number): string {
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(time).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

/** Place classes, most important first: what an area is named after. */
const NAMING = ['country', 'state', 'province', 'city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood', 'hamlet']

export class OfflineMapsControl extends Control {
  declare options: OfflineMapsControlOptions & Record<string, any>
  declare maps: OfflineMaps
  declare _button?: HTMLAnchorElement
  declare _card?: HTMLElement
  declare _select?: HTMLElement
  declare _frame?: { top: number, left: number, right: number, bottom: number }
  declare _pill?: HTMLElement
  declare _outline?: Rectangle
  declare _confirming?: string
  declare _estimateTimer?: ReturnType<typeof setTimeout>
  declare _estimateToken?: number
  declare _nameEdited?: boolean
  declare _offline?: boolean
  declare _unsubscribe?: () => void

  initialize(options: OfflineMapsControlOptions = {}): void {
    super.initialize({ position: 'topright', showStatus: true, ...options })
    this.maps = options.maps ?? offlineMaps()
  }

  onAdd(map: any): HTMLElement {
    const container = DomUtil.create('div', `${CLASS}-control tsmap-bar`)
    const link = DomUtil.create('a', `${CLASS}-button`, container) as HTMLAnchorElement
    link.href = '#'
    link.title = this.options.title ?? 'Offline Maps'
    link.setAttribute('role', 'button')
    link.setAttribute('aria-label', link.title)
    link.innerHTML = ICON
    DomEvent.disableClickPropagation(link)
    DomEvent.on(link, 'click', DomEvent.stop)
    DomEvent.on(link, 'click', () => (this._card ? this.close() : this.open()))
    this._button = link

    const refresh = (): void => this._refresh()
    this.maps.on('change progress', refresh)
    const connection = (): void => this._updateStatus()
    if (typeof window !== 'undefined') {
      window.addEventListener('online', connection)
      window.addEventListener('offline', connection)
    }
    map.on('moveend', connection)
    this._unsubscribe = () => {
      this.maps.off('change progress', refresh)
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', connection)
        window.removeEventListener('offline', connection)
      }
      map.off('moveend', connection)
    }
    this.maps.ready().then(connection, () => {})
    connection()
    return container
  }

  onRemove(): void {
    this._unsubscribe?.()
    this._endSelection()
    this.close()
    this._pill?.remove()
    this._pill = undefined
  }

  /** Show the list of downloaded maps. */
  open(): this {
    this._endSelection()
    this._card?.remove()
    this._card = this._panel(`${CLASS}-card`)
    this._button?.classList.add(`${CLASS}-button-active`)
    this.maps.ready().then(() => this._renderList(), () => this._renderList())
    this._renderList()
    return this
  }

  close(): this {
    this._endSelection()
    this._card?.remove()
    this._card = undefined
    this._confirming = undefined
    this._hideOutline()
    this._button?.classList.remove(`${CLASS}-button-active`)
    return this
  }

  /** Start choosing an area to download. */
  selectArea(): this {
    const map = this._map
    if (!map)
      return this
    this._card?.remove()
    this._hideOutline()
    this._button?.classList.add(`${CLASS}-button-active`)
    this._nameEdited = false
    this._frame = { top: 0, left: 0, right: 0, bottom: 0 }

    const select = this._select = DomUtil.create('div', `${CLASS}-select`, map.getContainer())
    select.innerHTML = `<div class="${CLASS}-frame"></div>${['nw', 'ne', 'sw', 'se'].map(c => `<div class="${CLASS}-handle ${CLASS}-handle-${c}" data-corner="${c}"></div>`).join('')}`
    for (const handle of select.querySelectorAll<HTMLElement>(`.${CLASS}-handle`))
      this._dragHandle(handle)

    const card = this._card = this._panel(`${CLASS}-card ${CLASS}-card-select`)
    card.innerHTML = `
      <div class="${CLASS}-head"><span class="${CLASS}-title">Download Map</span><button class="${CLASS}-close" aria-label="Cancel">✕</button></div>
      <input class="${CLASS}-name" aria-label="Name" value="" placeholder="Name">
      <div class="${CLASS}-estimate">Estimating size…</div>
      <div class="${CLASS}-hint">Drag the corners, or move the map, to choose the area.</div>
      <div class="${CLASS}-actions"><button class="${CLASS}-cancel">Cancel</button><button class="${CLASS}-download">Download</button></div>`
    card.querySelector(`.${CLASS}-close`)?.addEventListener('click', () => this.open())
    card.querySelector(`.${CLASS}-cancel`)?.addEventListener('click', () => this.open())
    card.querySelector(`.${CLASS}-download`)?.addEventListener('click', () => this._download())
    card.querySelector(`.${CLASS}-name`)?.addEventListener('input', () => (this._nameEdited = true))

    this._frame = this._defaultFrame()
    map.on('move', this._layoutSelection, this)
    map.on('moveend', this._settleSelection, this)
    this._layoutSelection()
    this._settleSelection()
    return this
  }

  /**
   * Where the frame starts: inside the view, clear of the controls down the
   * side and of the card along the bottom, so every corner can be grabbed.
   */
  _defaultFrame(): { top: number, left: number, right: number, bottom: number } {
    const map = this._map
    const size = map.getSize()
    const container = map.getContainer() as HTMLElement
    const box = container.getBoundingClientRect()
    const margin = Math.max(28, Math.min(size.x, size.y) * 0.08)
    // The widest control column either side, where it reaches down the frame.
    const side = (corner: string): number => {
      const el = map._controlCorners?.[corner] as HTMLElement | undefined
      if (!el?.childElementCount)
        return 0
      const r = el.getBoundingClientRect()
      return corner.endsWith('right') ? box.right - r.left : r.right - box.left
    }
    const card = this._card?.getBoundingClientRect()
    const bottom = card && card.height ? box.bottom - card.top + margin * 0.75 : margin
    const left = Math.max(margin, side('topleft') + 16)
    const right = Math.max(margin, side('topright') + 16)
    // Never so tight there is no area left to pick.
    return {
      top: Math.min(margin + 16, size.y / 4),
      left: Math.min(left, size.x / 3),
      right: Math.min(right, size.x / 3),
      bottom: Math.min(bottom, size.y * 0.6),
    }
  }

  /** The chosen area, `[west, south, east, north]`. */
  selectedBounds(): [number, number, number, number] | undefined {
    const map = this._map
    const f = this._frame
    if (!map || !f)
      return undefined
    const size = map.getSize()
    // The frame's corners on the ground; under rotation or pitch the area is
    // the box around all four.
    const corners = [
      [f.left, f.top],
      [size.x - f.right, f.top],
      [f.left, size.y - f.bottom],
      [size.x - f.right, size.y - f.bottom],
    ].map(([x, y]) => map.containerPointToLatLng([x, y]))
    const lats = corners.map((c: any) => c.lat)
    const lngs = corners.map((c: any) => c.lng)
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
  }

  // ---------------------------------------------------------------------------
  // The list
  // ---------------------------------------------------------------------------

  _refresh(): void {
    if (this._card && !this._select)
      this._renderList()
    this._updateStatus()
  }

  _renderList(): void {
    const card = this._card
    if (!card || this._select)
      return
    const regions = this.maps.regions
    const rows = regions.map(region => this._row(region)).join('')
    const used = regions.reduce((sum, r) => sum + r.bytes, 0)
    const html = `
      <div class="${CLASS}-head"><span class="${CLASS}-title">Offline Maps</span><button class="${CLASS}-close" aria-label="Close">✕</button></div>
      <button class="${CLASS}-new">${ICON}<span>Download New Map</span></button>
      ${regions.length ? `<div class="${CLASS}-section">Downloaded Maps</div><div class="${CLASS}-list">${rows}</div>` : `<div class="${CLASS}-empty">Download maps to use them without a connection — the map, search and directions all keep working.</div>`}
      <label class="${CLASS}-setting"><span>Only Use Offline Maps</span><input type="checkbox" class="${CLASS}-switch"${this.maps.onlyOffline ? ' checked' : ''}></label>
      ${regions.length ? `<div class="${CLASS}-usage">${formatBytes(used)} used on this device</div>` : ''}`
    // Progress updates many times a second; leave the DOM alone when nothing
    // visible changed, so a button is never replaced under a pointer.
    if (card.dataset.html === html)
      return
    card.dataset.html = html
    card.innerHTML = html

    card.querySelector(`.${CLASS}-close`)?.addEventListener('click', () => this.close())
    card.querySelector(`.${CLASS}-new`)?.addEventListener('click', () => this.selectArea())
    card.querySelector<HTMLInputElement>(`.${CLASS}-switch`)?.addEventListener('change', (e) => {
      this.maps.onlyOffline = (e.currentTarget as HTMLInputElement).checked
      this._updateStatus()
      this._map?.fire('offline:mode', { onlyOffline: this.maps.onlyOffline })
    })
    card.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => this._act(button.dataset.action!, button.dataset.id!))
    })
  }

  _row(region: OfflineRegionRecord): string {
    const id = escape(region.id)
    const percent = region.tiles ? Math.floor((region.downloaded / region.tiles) * 100) : 0
    let detail: string
    let actions: string
    const confirming = this._confirming === region.id
    const remove = confirming
      ? `<button class="${CLASS}-action ${CLASS}-danger" data-action="confirm-delete" data-id="${id}">Delete Map</button>`
      : `<button class="${CLASS}-action" data-action="delete" data-id="${id}">Delete</button>`
    switch (region.status) {
      case 'downloading':
        detail = `<div class="${CLASS}-bar"><span style="width:${percent}%"></span></div><span>Downloading · ${formatBytes(region.bytes)} · ${percent}%</span>`
        actions = `<button class="${CLASS}-action" data-action="pause" data-id="${id}">Pause</button>${remove}`
        break
      case 'paused':
        detail = `<div class="${CLASS}-bar ${CLASS}-bar-paused"><span style="width:${percent}%"></span></div><span>Paused · ${percent}%</span>`
        actions = `<button class="${CLASS}-action" data-action="resume" data-id="${id}">Resume</button>${remove}`
        break
      case 'error':
        detail = `<span class="${CLASS}-error">${escape(region.error ?? 'Download failed')}</span>`
        actions = `<button class="${CLASS}-action" data-action="resume" data-id="${id}">Retry</button>${remove}`
        break
      default:
        detail = `<span>${formatBytes(region.bytes)} · ${region.updatedAt > region.createdAt + 60_000 ? 'Updated' : 'Downloaded'} ${day(region.updatedAt)}</span>`
        actions = `<button class="${CLASS}-action" data-action="update" data-id="${id}">Update</button>${remove}`
    }
    return `
      <div class="${CLASS}-row" data-status="${region.status}">
        <button class="${CLASS}-row-name" data-action="show" data-id="${id}">${escape(region.name)}</button>
        <div class="${CLASS}-row-detail">${detail}</div>
        <div class="${CLASS}-row-actions">${actions}</div>
      </div>`
  }

  _act(action: string, id: string): void {
    const maps = this.maps
    const done = (): void => this._renderList()
    this._confirming = undefined
    switch (action) {
      case 'show':
        this._show(id)
        break
      case 'pause':
        maps.pause(id).then(done, done)
        break
      case 'resume':
        maps.resume(id).catch(() => {})
        break
      case 'update':
        maps.update(id).catch(() => {})
        break
      case 'delete':
        this._confirming = id
        this._renderList()
        break
      case 'confirm-delete':
        this._hideOutline()
        maps.delete(id).then(done, done)
        break
    }
    this._renderList()
  }

  /** Fly to a downloaded map and outline it, as tapping one in Apple's list does. */
  _show(id: string): void {
    const region = this.maps.regions.find(r => r.id === id)
    const map = this._map
    if (!region || !map)
      return
    const [w, s, e, n] = region.bounds
    this._hideOutline()
    this._outline = new Rectangle([[s, w], [n, e]], { color: '#0a84ff', weight: 3, fillOpacity: 0.08, interactive: false }).addTo(map)
    map.fitBounds([[s, w], [n, e]], { padding: [40, 40], paddingBottomRight: [40, (this._card?.offsetHeight ?? 0) + 40] })
  }

  _hideOutline(): void {
    this._outline?.remove()
    this._outline = undefined
  }

  // ---------------------------------------------------------------------------
  // Choosing an area
  // ---------------------------------------------------------------------------

  _layoutSelection(): void {
    const select = this._select
    const f = this._frame
    if (!select || !f)
      return
    const frame = select.querySelector<HTMLElement>(`.${CLASS}-frame`)!
    Object.assign(frame.style, { top: `${f.top}px`, left: `${f.left}px`, right: `${f.right}px`, bottom: `${f.bottom}px` })
    const place = (corner: string, x: string, y: string): void => {
      const el = select.querySelector<HTMLElement>(`.${CLASS}-handle-${corner}`)
      if (el)
        Object.assign(el.style, { left: x, top: y })
    }
    const size = this._map.getSize()
    place('nw', `${f.left}px`, `${f.top}px`)
    place('ne', `${size.x - f.right}px`, `${f.top}px`)
    place('sw', `${f.left}px`, `${size.y - f.bottom}px`)
    place('se', `${size.x - f.right}px`, `${size.y - f.bottom}px`)
    this._showEstimate(false)
  }

  _settleSelection(): void {
    clearTimeout(this._estimateTimer)
    this._estimateTimer = setTimeout(() => {
      this._showEstimate(true)
      this._suggestName()
    }, 250)
  }

  _dragHandle(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (down) => {
      down.preventDefault()
      down.stopPropagation()
      const corner = handle.dataset.corner!
      const start = { ...this._frame! }
      const origin = { x: down.clientX, y: down.clientY }
      const size = this._map.getSize()
      const MIN = 80
      // The card covers the bottom of the map; a corner dragged under it
      // could not be grabbed again.
      const box = (this._map.getContainer() as HTMLElement).getBoundingClientRect()
      const card = this._card?.getBoundingClientRect()
      const floor = card && card.height ? box.bottom - card.top + 12 : 8
      handle.setPointerCapture?.(down.pointerId)
      const move = (e: PointerEvent): void => {
        const dx = e.clientX - origin.x
        const dy = e.clientY - origin.y
        const f = this._frame!
        if (corner.includes('n'))
          f.top = Math.max(8, Math.min(size.y - f.bottom - MIN, start.top + dy))
        if (corner.includes('s'))
          f.bottom = Math.max(floor, Math.min(size.y - f.top - MIN, start.bottom - dy))
        if (corner.includes('w'))
          f.left = Math.max(8, Math.min(size.x - f.right - MIN, start.left + dx))
        if (corner.includes('e'))
          f.right = Math.max(8, Math.min(size.x - f.left - MIN, start.right - dx))
        this._layoutSelection()
      }
      const up = (): void => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', up)
        this._settleSelection()
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
      handle.addEventListener('pointercancel', up)
    })
  }

  _showEstimate(sample: boolean): void {
    const bounds = this.selectedBounds()
    const card = this._card
    if (!bounds || !card)
      return
    const area = { bounds, map: this._map }
    const render = (estimate: { bytes: number, tiles: number, tooLarge: boolean }): void => {
      const el = card.querySelector(`.${CLASS}-estimate`)
      const button = card.querySelector<HTMLButtonElement>(`.${CLASS}-download`)
      if (!el || !button)
        return
      if (estimate.tiles === 0) {
        el.textContent = 'There is nothing on this map to download.'
        button.disabled = true
      }
      else if (estimate.tooLarge) {
        el.innerHTML = `<span class="${CLASS}-error">This area is too large. Zoom in to choose a smaller one.</span>`
        button.disabled = true
      }
      else {
        el.innerHTML = `Estimated size: <strong>${formatBytes(estimate.bytes)}</strong>`
        button.disabled = false
      }
    }
    render(this.maps.quickEstimate(area))
    if (sample) {
      const token = this._estimateToken = (this._estimateToken ?? 0) + 1
      this.maps.estimate(area).then((estimate) => {
        if (token === this._estimateToken && this._select)
          render(estimate)
      }, () => {})
    }
  }

  async _suggestName(): Promise<void> {
    const bounds = this.selectedBounds()
    const input = this._card?.querySelector<HTMLInputElement>(`.${CLASS}-name`)
    if (!bounds || !input || this._nameEdited)
      return
    // No place labelled inside a small area: the nearest one around it, which
    // is still the name someone would give it.
    const [w, south, e, n] = bounds
    const dx = (e - w) / 2
    const dy = (n - south) / 2
    let name = nameFromLabels(this._map, bounds) ?? nameFromLabels(this._map, [w - dx, south - dy, e + dx, n + dy])
    if (!name && this.options.geocoder) {
      const center = { lat: (south + n) / 2, lng: (w + e) / 2 }
      name = (await this.options.geocoder.reverse(center, { limit: 1 }).catch(() => []))[0]?.text
    }
    // Nothing better: keep what it was called a moment ago.
    if (!this._nameEdited && this._select)
      input.value = name ?? (input.value || 'Offline Map')
  }

  _download(): void {
    const bounds = this.selectedBounds()
    if (!bounds)
      return
    const name = this._card?.querySelector<HTMLInputElement>(`.${CLASS}-name`)?.value
    const map = this._map
    const download = this.maps.download({ bounds, name, map, resources: this.options.resources })
    download.catch(error => map?.fire('error', { error }))
    this.open()
    map?.fire('offline:download', { bounds, name })
  }

  _endSelection(): void {
    clearTimeout(this._estimateTimer)
    if (!this._select)
      return
    this._select.remove()
    this._select = undefined
    this._frame = undefined
    this._map?.off('move', this._layoutSelection, this)
    this._map?.off('moveend', this._settleSelection, this)
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  _updateStatus(): void {
    if (!this._map || this.options.showStatus === false)
      return
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    const only = this.maps.onlyOffline
    if (!offline && !only) {
      this._pill?.remove()
      this._pill = undefined
      return
    }
    // Any downloaded map on screen: that part of the view, at least, is whole.
    const view = this._map.getBounds()
    const covered = this.maps.regions.some(({ status, bounds: b }) =>
      status === 'complete' && b[0] <= view.getEast() && b[2] >= view.getWest() && b[1] <= view.getNorth() && b[3] >= view.getSouth())
    const text = only
      ? 'Using Offline Maps Only'
      : covered ? 'Offline · Using Downloaded Maps' : 'You’re Offline'
    this._pill ??= this._panel(`${CLASS}-pill`)
    this._pill.classList.toggle(`${CLASS}-pill-covered`, covered || only)
    if (this._pill.textContent !== text)
      this._pill.textContent = text
  }

  _panel(className: string): HTMLElement {
    const el = DomUtil.create('div', className, this._map.getContainer())
    // Taps on a panel are for the panel, not a drag of the map beneath it.
    for (const type of ['pointerdown', 'wheel', 'dblclick', 'click', 'touchstart'])
      el.addEventListener(type, e => e.stopPropagation())
    return el
  }
}

/**
 * The most important place labelled inside an area — "San Francisco", or
 * "Hayes Valley" for a small one — read from the vector tiles on screen.
 */
export function nameFromLabels(map: any, bounds: [number, number, number, number]): string | undefined {
  const [w, s, e, n] = bounds
  let best: { name: string, score: number } | undefined
  const cx = (w + e) / 2
  const cy = (s + n) / 2
  for (const host of map?._style?.sourceLayers?.values?.() ?? []) {
    if (typeof host.querySourceFeatures !== 'function' || typeof host._subTile !== 'function')
      continue
    for (const { feature, tile } of host.querySourceFeatures({ sourceLayer: 'place' })) {
      const props = feature.properties ?? {}
      const name = props['name:latin'] ?? props.name
      const rank = NAMING.indexOf(String(props.class))
      if (typeof name !== 'string' || rank < 0 || feature.type !== 1)
        continue
      const sub = host._subTile(tile)
      const z = host._getZoomForUrl(sub.z)
      const p = feature.loadGeometry()[0]?.[0]
      if (!p)
        continue
      const lat = unitToLat((sub.y + p.y / feature.extent) / 2 ** z)
      const lng = unitToLng((sub.x + p.x / feature.extent) / 2 ** z)
      if (lng < w || lng > e || lat < s || lat > n)
        continue
      // A bigger place wins; between equals, the one nearer the middle.
      const off = Math.hypot((lng - cx) / (e - w || 1), (lat - cy) / (n - s || 1))
      const score = rank + (typeof props.rank === 'number' ? props.rank / 100 : 0) + off
      if (!best || score < best.score)
        best = { name, score }
    }
  }
  return best?.name
}
