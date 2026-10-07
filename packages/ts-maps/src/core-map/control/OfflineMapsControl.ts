import type { OfflineMaps, OfflineStorage } from '../offline/OfflineMaps'
import type { OfflineRegionRecord } from '../offline/OfflineStore'
import type { GeocoderProvider } from '../services/types'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { controlLocale, formatDate, formatNumber, message } from '../i18n'
import { Rectangle } from '../layer/vector/Rectangle'
import { distanceMeters } from '../search/SearchEngine'
import { formatDistance, prefersImperial } from '../services/instructions'
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
  /** The language of the panel. Default the map's, else the browser's. */
  locale?: string
}

/**
 * Every event the offline maps UI reports, with the callback-prop name the
 * framework bindings give it. One table, so the bindings cannot drift apart.
 *
 * `change` carries `{ regions }`; `progress`, `complete` and `error` carry
 * `{ region }` (and `error` an `error`); `delete` `{ id }`; `modechange`
 * `{ onlyOffline }`; `openchange` `{ open }`, when the panel opens or closes.
 */
export const OFFLINE_MAPS_EVENTS: {
  readonly change: 'onChange'
  readonly progress: 'onProgress'
  readonly complete: 'onComplete'
  readonly error: 'onError'
  readonly delete: 'onDelete'
  readonly modechange: 'onModeChange'
  readonly openchange: 'onOpenChange'
} = {
  change: 'onChange',
  progress: 'onProgress',
  complete: 'onComplete',
  error: 'onError',
  delete: 'onDelete',
  modechange: 'onModeChange',
  openchange: 'onOpenChange',
}

export type OfflineMapsEvent = keyof typeof OFFLINE_MAPS_EVENTS

/**
 * What `sync` brings the control into line with: its state, `open` and
 * `onlyOffline`, which are left alone when undefined, and its options, which
 * are followed when their key is present, undefined meaning the default.
 * A binding passes every prop; code of your own passes what it changes.
 */
export interface OfflineMapsTarget extends Omit<OfflineMapsControlOptions, 'maps' | 'geocoder'> {
  /** The panel is showing: the list, or the area picker. */
  open?: boolean
  onlyOffline?: boolean
  maps?: OfflineMaps | null
  geocoder?: GeocoderProvider | null
}

const CLASS = 'tsmap-offline'

/** Offline maps controls on the page, for ids no two share. */
let offlineControls = 0

const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>'

/** "850 KB", "312 MB", "1.2 GB"; "1,2 GB" in German. */
export function formatBytes(bytes: number, locale?: string): string {
  if (bytes < 1000)
    return message(locale, 'offline.bytes', { count: Math.max(0, Math.round(bytes)) })
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1000
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1
  return `${formatNumber(value, locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })} ${units[unit]}`
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

/** "Sep 23", with the year when it is not this one. */
function day(time: number, locale?: string): string {
  return formatDate(time, locale, { month: 'short', day: 'numeric', year: new Date(time).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

/**
 * How big an area is, as it would be said: "About 2.1 × 1.4 km". What the
 * picker's frame shows, in words, for those who cannot see it.
 */
export function areaSize([w, s, e, n]: [number, number, number, number], units?: 'metric' | 'imperial', locale?: string): string {
  const system = units ?? (prefersImperial(locale) ? 'imperial' : 'metric')
  const midLat = (s + n) / 2
  const across = distanceMeters({ lat: midLat, lng: w }, { lat: midLat, lng: e })
  const down = distanceMeters({ lat: s, lng: w }, { lat: n, lng: w })
  const a = formatDistance(across, system, locale)
  const b = formatDistance(down, system, locale)
  const [value, unit] = a.split(' ')
  // One unit, said once: "1.8 × 2.2 km".
  return message(locale, 'offline.area', { across: unit === b.split(' ')[1] ? value! : a, down: b })
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
  declare _unhookMaps?: () => void
  declare _listeners?: Map<(type: OfflineMapsEvent, event: any) => void, Array<[string, (e: any) => void]>>
  declare _wasOpen?: boolean
  declare _synced: { open?: boolean, onlyOffline?: boolean }
  declare _uid: number
  declare _storageInfo?: OfflineStorage | null

  initialize(options: OfflineMapsControlOptions = {}): void {
    // An option passed as undefined — as bindings pass every prop — means
    // the default, not "no position".
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined))
    super.initialize({ position: 'topright', showStatus: true, ...given })
    this.maps = options.maps ?? offlineMaps()
    this._synced = {}
    this._uid = ++offlineControls
  }

  /** The language it speaks: its own `locale`, else the map's, else the browser's. */
  get locale(): string {
    return controlLocale(this)
  }

  _t(key: string, params?: Record<string, string | number>): string {
    return message(this.locale, key, params)
  }

  onAdd(map: any): HTMLElement {
    const container = DomUtil.create('div', `${CLASS}-control tsmap-bar`)
    const link = DomUtil.create('a', `${CLASS}-button`, container) as HTMLAnchorElement
    link.href = '#'
    link.title = this.options.title ?? this._t('offline.title')
    link.setAttribute('role', 'button')
    link.setAttribute('aria-label', link.title)
    link.setAttribute('aria-haspopup', 'dialog')
    link.setAttribute('aria-expanded', 'false')
    link.innerHTML = ICON
    DomEvent.disableClickPropagation(link)
    DomEvent.on(link, 'click', DomEvent.stop)
    DomEvent.on(link, 'click', () => (this._card ? this.close() : this.open()))
    this._button = link

    this._hookMaps()
    const connection = (): void => this._updateStatus()
    if (typeof window !== 'undefined') {
      window.addEventListener('online', connection)
      window.addEventListener('offline', connection)
    }
    map.on('moveend', connection)
    this._unsubscribe = () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', connection)
        window.removeEventListener('offline', connection)
      }
      map.off('moveend', connection)
    }
    connection()
    return container
  }

  _hookMaps(): void {
    const maps = this.maps
    const refresh = (): void => this._refresh()
    maps.on('change progress modechange settingchange', refresh)
    const persisted = (): void => {
      this._storageInfo = undefined
      this._refresh()
    }
    maps.on('persist', persisted)
    this._unhookMaps = () => {
      maps.off('change progress modechange settingchange', refresh)
      maps.off('persist', persisted)
    }
    maps.ready().then(() => this.maps === maps && this._refresh(), () => {})
  }

  onRemove(): void {
    this._unhookMaps?.()
    this._unhookMaps = undefined
    this._unsubscribe?.()
    this._endSelection()
    this.close()
    this._pill?.remove()
    this._pill = undefined
  }

  /** Whether the panel is showing: the list, or the area picker. */
  get isOpen(): boolean {
    return !!this._card
  }

  /**
   * Hear every event the UI reports — the manager's, and the panel opening
   * and closing — as `(type, event)`. Returns the way to stop.
   */
  listen(fn: (type: OfflineMapsEvent, event: any) => void): () => void {
    this._listeners ??= new Map()
    const forward: Array<[string, (e: any) => void]> = (['change', 'progress', 'complete', 'error', 'delete', 'modechange'] as const)
      .map(type => [type, (e: any) => fn(type, e)])
    this._listeners.set(fn, forward)
    for (const [type, handler] of forward)
      this.maps.on(type, handler)
    return () => {
      // Off whichever manager the control shows by then, not the one it
      // showed when this began: `setMaps` moves the handlers across.
      for (const [type, handler] of this._listeners?.get(fn) ?? [])
        this.maps.off(type, handler)
      this._listeners?.delete(fn)
    }
  }

  /**
   * Show another manager: its maps in the list, its events to listeners.
   * Listeners hear a `change` with its regions, so a binding's view follows.
   */
  setMaps(maps: OfflineMaps): this {
    if (maps === this.maps)
      return this
    const old = this.maps
    for (const forward of this._listeners?.values() ?? []) {
      for (const [type, handler] of forward) {
        old.off(type, handler)
        maps.on(type, handler)
      }
    }
    this._unhookMaps?.()
    this.maps = maps
    // A mode a binding declared holds for whichever manager is shown.
    if (this._synced.onlyOffline !== undefined)
      maps.onlyOffline = this._synced.onlyOffline
    if (this._map) {
      this._hookMaps()
      this._refresh()
    }
    for (const fn of this._listeners?.keys() ?? [])
      fn('change', { regions: maps.regions })
    return this
  }

  /**
   * Bring the control into line with a declarative description of it — what
   * the framework bindings call as their props change. Unchanged values cost
   * nothing, so it can be called on every render.
   */
  sync(target: OfflineMapsTarget): this {
    if ('maps' in target)
      this.setMaps(target.maps ?? offlineMaps())
    if ('geocoder' in target)
      this.options.geocoder = target.geocoder ?? undefined
    if ('resources' in target)
      this.options.resources = target.resources
    if ('locale' in target && target.locale !== this.options.locale) {
      this.options.locale = target.locale
      const title = this.options.title ?? this._t('offline.title')
      this._button?.setAttribute('title', title)
      this._button?.setAttribute('aria-label', title)
      if (this._card && !this._select) {
        this._card.setAttribute('aria-label', this._t('offline.title'))
        this._renderList()
      }
      this._updateStatus()
    }
    if ('title' in target && target.title !== this.options.title) {
      const was = this.options.title ?? this._t('offline.title')
      this.options.title = target.title
      const title = target.title ?? this._t('offline.title')
      if (title !== was) {
        this._button?.setAttribute('title', title)
        this._button?.setAttribute('aria-label', title)
      }
    }
    if ('showStatus' in target && (target.showStatus ?? true) !== (this.options.showStatus ?? true)) {
      this.options.showStatus = target.showStatus ?? true
      if (this.options.showStatus === false) {
        this._pill?.remove()
        this._pill = undefined
      }
      this._updateStatus()
    }
    if ('position' in target && (target.position ?? 'topright') !== this.options.position)
      this.setPosition(target.position ?? 'topright')
    // State is followed when it changes, not on every call: a panel the user
    // closed from inside stays closed when some other prop changes, until
    // `open` itself does.
    if (target.onlyOffline !== undefined && target.onlyOffline !== this._synced.onlyOffline) {
      this._synced.onlyOffline = target.onlyOffline
      this.maps.onlyOffline = !!target.onlyOffline
    }
    if (target.open !== undefined && target.open !== this._synced.open) {
      this._synced.open = target.open
      if (target.open && !this.isOpen)
        this.open()
      else if (!target.open && this.isOpen)
        this.close()
    }
    return this
  }

  /**
   * An event reduced to plain data, for a binding that sends it across a
   * boundary — the React Native WebView bridge — where live objects do not
   * survive.
   */
  static plainEvent(type: OfflineMapsEvent, event: any): Record<string, unknown> {
    const plain = (region: OfflineRegionRecord | undefined): OfflineRegionRecord | undefined =>
      region ? JSON.parse(JSON.stringify(region)) : undefined
    switch (type) {
      case 'change':
        return { regions: (event?.regions ?? []).map(plain) }
      case 'progress':
      case 'complete':
        return { region: plain(event?.region) }
      case 'error':
        return { region: plain(event?.region), message: String(event?.error?.message ?? event?.error ?? 'error') }
      case 'delete':
        return { id: event?.id }
      case 'modechange':
        return { onlyOffline: !!event?.onlyOffline }
      case 'openchange':
        return { open: !!event?.open }
      default:
        return {}
    }
  }

  _setOpen(open: boolean): void {
    if (this._wasOpen === open)
      return
    this._wasOpen = open
    for (const fn of this._listeners?.keys() ?? [])
      fn('openchange', { open })
  }

  /** Show the list of downloaded maps. */
  open(): this {
    this._endSelection()
    // Read again each time: downloads since change what is used and free.
    this._storageInfo = undefined
    const returning = this._card?.contains(document.activeElement)
    this._card?.remove()
    this._card = this._panel(`${CLASS}-card`, this._t('offline.title'))
    this._button?.classList.add(`${CLASS}-button-active`)
    this._button?.setAttribute('aria-expanded', 'true')
    this.maps.ready().then(() => this._renderList(), () => this._renderList())
    this._renderList()
    // The keyboard moves into the panel when it opens from the button, or
    // stays in it coming back from the area picker.
    if (returning || this._button === document.activeElement)
      this._card.querySelector<HTMLElement>(`.${CLASS}-new`)?.focus()
    this._setOpen(true)
    return this
  }

  close(): this {
    this._endSelection()
    const hadFocus = !!this._card?.contains(document.activeElement)
    this._card?.remove()
    this._button?.setAttribute('aria-expanded', 'false')
    if (hadFocus)
      this._button?.focus()
    this._card = undefined
    this._confirming = undefined
    this._hideOutline()
    this._button?.classList.remove(`${CLASS}-button-active`)
    this._setOpen(false)
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
    select.innerHTML = `<div class="${CLASS}-frame"></div>${['nw', 'ne', 'sw', 'se'].map(c => `<div class="${CLASS}-handle ${CLASS}-handle-${c}" data-corner="${c}" role="button" tabindex="0" aria-label="${this._t(`offline.corner.${c}`)}" aria-describedby="${CLASS}-estimate-${this._uid}"></div>`).join('')}`
    for (const handle of select.querySelectorAll<HTMLElement>(`.${CLASS}-handle`)) {
      this._dragHandle(handle)
      this._keyHandle(handle)
    }

    const t = (key: string): string => this._t(key)
    const card = this._card = this._panel(`${CLASS}-card ${CLASS}-card-select`, t('offline.downloadMap'))
    card.innerHTML = `
      <div class="${CLASS}-head"><span class="${CLASS}-title">${t('offline.downloadMap')}</span><button class="${CLASS}-close" aria-label="${t('offline.cancel')}">✕</button></div>
      <input class="${CLASS}-name" aria-label="${t('offline.name')}" value="" placeholder="${t('offline.name')}">
      <div class="${CLASS}-estimate" id="${CLASS}-estimate-${this._uid}" aria-live="polite">${t('offline.estimating')}</div>
      <div class="${CLASS}-hint">${t('offline.hint')}</div>
      <div class="${CLASS}-hint">${t('offline.hintShort')}</div>
      <div class="${CLASS}-actions"><button class="${CLASS}-cancel">${t('offline.cancel')}</button><button class="${CLASS}-download">${t('offline.download')}</button></div>`
    card.querySelector(`.${CLASS}-close`)?.addEventListener('click', () => this.open())
    card.querySelector(`.${CLASS}-cancel`)?.addEventListener('click', () => this.open())
    card.querySelector(`.${CLASS}-download`)?.addEventListener('click', () => this._download())
    card.querySelector(`.${CLASS}-name`)?.addEventListener('input', () => (this._nameEdited = true))

    this._frame = this._defaultFrame()
    map.on('move', this._layoutSelection, this)
    map.on('moveend', this._settleSelection, this)
    this._layoutSelection()
    this._settleSelection()
    this._setOpen(true)
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
    const t = (key: string, params?: Record<string, string | number>): string => this._t(key, params)
    const html = `
      <div class="${CLASS}-head"><span class="${CLASS}-title">${t('offline.title')}</span><button class="${CLASS}-close" aria-label="${t('offline.close')}">✕</button></div>
      <button class="${CLASS}-new">${ICON}<span>${t('offline.downloadNew')}</span></button>
      ${regions.length ? `<div class="${CLASS}-section">${t('offline.section')}</div><div class="${CLASS}-list">${rows}</div>` : `<div class="${CLASS}-empty">${t('offline.empty')}</div>`}
      <label class="${CLASS}-setting"><span>${t('offline.autoUpdate')}</span><input type="checkbox" class="${CLASS}-switch" data-setting="autoUpdate"${this.maps.autoUpdate ? ' checked' : ''}></label>
      <label class="${CLASS}-setting"><span>${t('offline.onlyOffline')}</span><input type="checkbox" class="${CLASS}-switch" data-setting="onlyOffline"${this.maps.onlyOffline ? ' checked' : ''}></label>
      ${regions.length ? `<div class="${CLASS}-usage">${t('offline.used', { size: formatBytes(used, this.locale) })}${this._storageNote()}</div>` : ''}`
    // Progress updates many times a second; leave the DOM alone when nothing
    // visible changed, so a button is never replaced under a pointer.
    if (card.dataset.html === html)
      return
    card.dataset.html = html
    card.innerHTML = html

    card.querySelector(`.${CLASS}-close`)?.addEventListener('click', () => this.close())
    card.querySelector(`.${CLASS}-new`)?.addEventListener('click', () => this.selectArea())
    card.querySelector<HTMLInputElement>(`[data-setting="onlyOffline"]`)?.addEventListener('change', (e) => {
      this.maps.onlyOffline = (e.currentTarget as HTMLInputElement).checked
      this._updateStatus()
      this._map?.fire('offline:mode', { onlyOffline: this.maps.onlyOffline })
    })
    card.querySelector<HTMLInputElement>(`[data-setting="autoUpdate"]`)?.addEventListener('change', (e) => {
      this.maps.autoUpdate = (e.currentTarget as HTMLInputElement).checked
    })
    card.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => this._act(button.dataset.action!, button.dataset.id!))
    })
  }

  /**
   * Whether the browser will keep the maps, read once the panel opens. Said
   * only when it will not, since that is the case to act on.
   */
  _storageNote(): string {
    if (this._storageInfo === undefined) {
      this._storageInfo = null
      this.maps.storage().then((info) => {
        this._storageInfo = info ?? null
        this._renderList()
      }, () => {})
    }
    return this._storageInfo?.persisted === false ? ` · ${this._t('offline.mayRemove')}` : ''
  }

  _row(region: OfflineRegionRecord): string {
    const locale = this.locale
    const t = (key: string, params?: Record<string, string | number>): string => message(locale, key, params)
    const id = escape(region.id)
    const name = escape(region.name)
    const percent = region.tiles ? Math.floor((region.downloaded / region.tiles) * 100) : 0
    const shown = formatNumber(percent / 100, locale, { style: 'percent' })
    let detail: string
    let actions: string
    const confirming = this._confirming === region.id
    // Each button says which map it acts on: a list of "Pause", "Pause",
    // "Delete" read aloud is no help.
    const button = (action: string, text: string, label: string, extra = ''): string =>
      `<button class="${CLASS}-action${extra}" data-action="${action}" data-id="${id}" aria-label="${label}">${text}</button>`
    const remove = confirming
      ? button('confirm-delete', t('offline.deleteMap'), t('offline.deleteForGood', { name }), ` ${CLASS}-danger`)
      : button('delete', t('offline.delete'), t('offline.deleteNamed', { name }))
    const bar = (paused: boolean): string =>
      `<div class="${CLASS}-bar${paused ? ` ${CLASS}-bar-paused` : ''}" role="progressbar" aria-label="${t(paused ? 'offline.pausedNamed' : 'offline.downloadingNamed', { name })}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>`
    switch (region.status) {
      case 'downloading':
        detail = `${bar(false)}<span>${t('offline.downloading')} · ${formatBytes(region.bytes, locale)} · ${shown}</span>`
        actions = `${button('pause', t('offline.pause'), t('offline.pauseNamed', { name }))}${remove}`
        break
      case 'paused':
        detail = `${bar(true)}<span>${t('offline.paused')} · ${shown}</span>`
        actions = `${button('resume', t('offline.resume'), t('offline.resumeNamed', { name }))}${remove}`
        break
      case 'error':
        detail = `<span class="${CLASS}-error">${escape(region.error ?? t('offline.failed'))}</span>`
        actions = `${button('resume', t('offline.retry'), t('offline.retryNamed', { name }))}${remove}`
        break
      default:
        detail = `<span>${formatBytes(region.bytes, locale)} · ${t(region.updatedAt > region.createdAt + 60_000 ? 'offline.updated' : 'offline.downloaded', { date: day(region.updatedAt, locale) })}</span>`
        actions = `${button('update', t('offline.update'), t('offline.updateNamed', { name }))}${remove}`
    }
    return `
      <div class="${CLASS}-row" data-status="${region.status}">
        <button class="${CLASS}-row-name" data-action="show" data-id="${id}" aria-label="${t('offline.show', { name })}">${name}</button>
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

  /** Arrow keys move a focused corner: 10 pixels a press, 50 with Shift. */
  _keyHandle(handle: HTMLElement): void {
    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 50 : 10
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      if (!dx && !dy)
        return
      e.preventDefault()
      e.stopPropagation()
      const f = this._frame!
      const size = this._map.getSize()
      const corner = handle.dataset.corner!
      const MIN = 80
      if (corner.includes('n'))
        f.top = Math.max(8, Math.min(size.y - f.bottom - MIN, f.top + dy))
      if (corner.includes('s'))
        f.bottom = Math.max(8, Math.min(size.y - f.top - MIN, f.bottom - dy))
      if (corner.includes('w'))
        f.left = Math.max(8, Math.min(size.x - f.right - MIN, f.left + dx))
      if (corner.includes('e'))
        f.right = Math.max(8, Math.min(size.x - f.left - MIN, f.right - dx))
      this._layoutSelection()
      this._settleSelection()
    })
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
      const locale = this.locale
      if (estimate.tiles === 0) {
        el.textContent = message(locale, 'offline.nothing')
        button.disabled = true
      }
      else if (estimate.tooLarge) {
        el.innerHTML = `<span class="${CLASS}-error">${message(locale, 'offline.tooLarge')}</span>`
        button.disabled = true
      }
      else {
        const free = this._storageInfo?.free
        const size = `${areaSize(bounds, undefined, locale)} · ${message(locale, 'offline.estimate', { size: `<strong>${formatBytes(estimate.bytes, locale)}</strong>` })}`
        // An estimate, so a warning rather than a refusal: the download says
        // plainly if it does run out.
        el.innerHTML = free !== undefined && free < estimate.bytes
          ? `${size} · <span class="${CLASS}-error">${message(locale, 'offline.free', { size: formatBytes(free, locale) })}</span>`
          : size
        button.disabled = false
      }
    }
    if (this._storageInfo === undefined) {
      this._storageInfo = null
      this.maps.storage().then((info) => {
        this._storageInfo = info ?? null
        if (this._select)
          render(this.maps.quickEstimate(area))
      }, () => {})
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
      input.value = name ?? (input.value || this._t('offline.defaultName'))
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
    const covered = this.maps.regions.some((region) => {
      const [w, south, e, n] = region.bounds
      return region.status === 'complete' && w <= view.getEast() && e >= view.getWest() && south <= view.getNorth() && n >= view.getSouth()
    })
    const text = this._t(only ? 'offline.onlyOfflineStatus' : covered ? 'offline.covered' : 'offline.offline')
    this._pill ??= this._panel(`${CLASS}-pill`)
    this._pill.classList.toggle(`${CLASS}-pill-covered`, covered || only)
    if (this._pill.textContent !== text)
      this._pill.textContent = text
  }

  _panel(className: string, label?: string): HTMLElement {
    const el = DomUtil.create('div', className, this._map.getContainer())
    if (label) {
      el.setAttribute('role', 'dialog')
      el.setAttribute('aria-label', label)
      // Escape closes it, as a dialog's should, and the keyboard goes back
      // to the button that opened it.
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          this.close()
        }
      })
    }
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
