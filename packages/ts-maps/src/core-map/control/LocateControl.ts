import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { Control } from './Control'

/**
 * "Where am I" — the crosshair button every map is expected to have.
 *
 * Centres the map on the device's own position and, unless told otherwise,
 * keeps following it as the position updates. The button carries its own state
 * so the user is never left wondering whether anything happened:
 *
 *   idle      the outline crosshair
 *   locating  pulsing, while the first fix is being acquired
 *   active    filled, while the map is following the device
 *   denied    struck through, when permission was refused or the fix failed
 *
 * Geolocation is requested on CLICK and never on load. A permission prompt
 * that appears unasked is the fastest way to be denied for the rest of the
 * session, and a denied permission cannot be re-requested without the user
 * going into browser settings.
 *
 * Following stops the moment the user pans, drags, or zooms by hand: a map
 * that yanks itself back under a finger is worse than one that does nothing.
 */
export interface LocateControlOptions {
  position?: string
  /** Zoom to apply on the first fix. Null keeps the current zoom. */
  zoom?: number | null
  /** Keep re-centring as the position changes. Default: true. */
  follow?: boolean
  /** Passed through to the Geolocation API. */
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
  title?: string
  titleLocating?: string
  titleActive?: string
  titleDenied?: string
  /** Draw an accuracy circle and position dot. Default: true. */
  showMarker?: boolean
}

const CLASS = 'tsmap-control-locate'

export class LocateControl extends Control {
  declare _button?: HTMLAnchorElement
  declare _watchId?: number
  declare _following?: boolean
  declare _marker?: any
  declare _accuracyCircle?: any

  onAdd(map: any): HTMLElement {
    const options = this.options as LocateControlOptions
    const container = DomUtil.create('div', `${CLASS} tsmap-bar`)

    const link = DomUtil.create('a', `${CLASS}-button`, container) as HTMLAnchorElement
    link.href = '#'
    link.title = options.title ?? 'Show your location'
    link.setAttribute('role', 'button')
    link.setAttribute('aria-label', link.title)
    // The crosshair is drawn in CSS so it inherits colour with the button
    // state and stays crisp at any pixel ratio.
    link.innerHTML = '<span class="tsmap-locate-icon" aria-hidden="true"></span>'

    DomEvent.disableClickPropagation(link)
    DomEvent.on(link, 'click', DomEvent.stop)
    DomEvent.on(link, 'click', this._onClick, this)

    this._button = link
    this._setState('idle')

    // Any hand-driven movement means the user has taken over.
    map.on('dragstart zoomstart', this._stopFollowing, this)

    return container
  }

  onRemove(map: any): void {
    map.off('dragstart zoomstart', this._stopFollowing, this)
    this._clearWatch()
    this._clearMarker()
  }

  /** Start locating, as though the button had been pressed. */
  start(): this {
    this._locate()
    return this
  }

  /** Stop following and drop the position marker. */
  stop(): this {
    this._clearWatch()
    this._clearMarker()
    this._setState('idle')
    return this
  }

  _onClick(): void {
    // A second press on an active button turns following off, which is the
    // behaviour of every other map's locate button.
    if (this._following) {
      this.stop()
      return
    }
    this._locate()
  }

  _locate(): void {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    if (!nav?.geolocation) {
      this._setState('denied')
      this._map?.fire?.('locateerror', { message: 'Geolocation is not available in this browser' })
      return
    }

    const options = this.options as LocateControlOptions
    this._setState('locating')

    const positionOptions: PositionOptions = {
      enableHighAccuracy: options.enableHighAccuracy ?? true,
      timeout: options.timeout ?? 10000,
      maximumAge: options.maximumAge ?? 60000,
    }

    const onError = (error: GeolocationPositionError): void => {
      this._clearWatch()
      this._setState('denied')
      this._map?.fire?.('locateerror', { code: error.code, message: error.message })
    }

    if (options.follow === false) {
      nav.geolocation.getCurrentPosition(p => this._onPosition(p, true), onError, positionOptions)
      return
    }

    // watchPosition rather than a poll: the browser decides when the fix has
    // actually moved, which on a phone is both faster and cheaper than asking.
    this._following = true
    this._watchId = nav.geolocation.watchPosition(
      p => this._onPosition(p, true),
      onError,
      positionOptions,
    )
  }

  _onPosition(position: GeolocationPosition, recenter: boolean): void {
    const options = this.options as LocateControlOptions
    const { latitude, longitude, accuracy } = position.coords
    const latlng = [latitude, longitude] as [number, number]

    this._setState(this._following ? 'active' : 'idle')

    if (recenter && this._map) {
      const zoom = options.zoom === null ? this._map.getZoom() : (options.zoom ?? 16)
      this._map.setView(latlng, zoom)
    }

    if (options.showMarker !== false)
      this._updateMarker(latlng, accuracy)

    this._map?.fire?.('locatefound', { latlng, accuracy, position })
  }

  _updateMarker(latlng: [number, number], accuracy: number): void {
    const map = this._map
    if (!map)
      return

    // Drawn through the map's own layer API so it participates in panning and
    // zooming like anything else on the map.
    const circleFactory = (map as any).circle ?? (globalThis as any).tsmapCircle
    if (typeof circleFactory !== 'function')
      return

    if (this._accuracyCircle) {
      this._accuracyCircle.setLatLng?.(latlng)
      this._accuracyCircle.setRadius?.(accuracy)
      return
    }

    this._accuracyCircle = circleFactory.call(map, latlng, {
      radius: accuracy,
      className: 'tsmap-locate-accuracy',
      interactive: false,
    })
    this._accuracyCircle?.addTo?.(map)
  }

  _clearMarker(): void {
    this._accuracyCircle?.remove?.()
    this._accuracyCircle = undefined
    this._marker?.remove?.()
    this._marker = undefined
  }

  _stopFollowing(): void {
    // Keep the fix and the marker; just stop yanking the viewport back.
    if (!this._following)
      return
    this._following = false
    this._clearWatch()
    this._setState('idle')
  }

  _clearWatch(): void {
    if (this._watchId !== undefined && typeof navigator !== 'undefined')
      navigator.geolocation?.clearWatch(this._watchId)
    this._watchId = undefined
    this._following = false
  }

  _setState(state: 'idle' | 'locating' | 'active' | 'denied'): void {
    const button = this._button
    if (!button)
      return

    const options = this.options as LocateControlOptions
    // classList directly: DomUtil has no add/removeClass helper, and the DOM's
    // own API is the thing those helpers would have wrapped anyway.
    for (const name of ['idle', 'locating', 'active', 'denied'])
      button.classList.remove(`${CLASS}-${name}`)

    button.classList.add(`${CLASS}-${state}`)

    const title = state === 'locating'
      ? (options.titleLocating ?? 'Finding your location…')
      : state === 'active'
        ? (options.titleActive ?? 'Following your location')
        : state === 'denied'
          ? (options.titleDenied ?? 'Location unavailable — check browser permissions')
          : (options.title ?? 'Show your location')

    button.title = title
    button.setAttribute('aria-label', title)
    button.setAttribute('aria-pressed', String(state === 'active'))
    button.setAttribute('data-state', state)
  }
}

LocateControl.setDefaultOptions({
  position: 'topright',
  zoom: 16,
  follow: true,
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000,
  showMarker: true,
})
