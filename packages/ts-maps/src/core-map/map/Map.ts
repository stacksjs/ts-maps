import Browser from '../core/Browser'
import * as Util from '../core/Util'
import * as DomEvent from '../dom/DomEvent'
import * as PointerEvents from '../dom/DomEvent.PointerEvents'
import * as DomUtil from '../dom/DomUtil'
import { Evented } from '../core/Events'
import { PosAnimation } from '../dom/PosAnimation'
import { EPSG3857 } from '../geo/crs/EPSG3857'
import { LatLng } from '../geo/LatLng'
import { LatLngBounds } from '../geo/LatLngBounds'
import { Bounds } from '../geometry/Bounds'
import { Point } from '../geometry/Point'

export interface MapOptions {
  crs?: any
  center?: any
  zoom?: number
  minZoom?: number
  maxZoom?: number
  layers?: any[]
  maxBounds?: any
  renderer?: any
  zoomAnimation?: boolean
  zoomAnimationThreshold?: number
  fadeAnimation?: boolean
  markerZoomAnimation?: boolean
  transform3DLimit?: number
  /**
  * Initial bearing (rotation) of the map in degrees, in the range `[0, 360)`.
  * `0` = north up (default). `90` = east is up. Mirrors Mapbox GL JS's
  * `bearing` camera property.
  */
  bearing?: number
  /**
  * Initial pitch (camera tilt) of the map in degrees. `0` = looking straight
  * down (default). Positive values tilt the horizon toward the viewer.
  * Mirrors Mapbox GL JS's `pitch` camera property. Clamped to
  * `[minPitch, maxPitch]` on `setPitch()`.
  */
  pitch?: number
  /**
  * Maximum allowed pitch in degrees. Default 60 (same as Mapbox GL JS).
  */
  maxPitch?: number
  /**
  * Minimum allowed pitch in degrees. Default 0.
  */
  minPitch?: number
  /**
  * Forces the map's zoom level to always be a multiple of this. A value of
  * `0` (the default) means no snapping — zoom can take any fractional value,
  * which yields a continuous, Mapbox-style zoom experience for wheel and
  * pinch interactions. A value of `1` would restrict zoom to integer levels
  * (the classic Leaflet behavior).
  */
  zoomSnap?: number
  /**
  * Controls how much the map's zoom level will change after a `zoomIn()`,
  * `zoomOut()`, pressing `+` or `-` on the keyboard, or using the zoom
  * controls. Values smaller than `1` (e.g. `0.5`) allow for greater granularity.
  */
  zoomDelta?: number
  trackResize?: boolean
  [key: string]: any
}

// The central class of the API — used to create a map on a page and manipulate it.
export class TsMap extends Evented {
  static _pointerEvents: string[] = ['click', 'dblclick', 'pointerover', 'pointerout', 'contextmenu']

  // Runtime slots populated by initialize / hooks.
  declare options: MapOptions
  declare _handlers: any[]
  declare _layers: Record<number, any>
  declare _zoomBoundLayers: Record<number, any>
  _sizeChanged = true
  // Map rotation in degrees, normalized to `[0, 360)`. `0` = north up. Updated
  // via `setBearing()` / `rotateTo()`. Purely a viewport transform — does not
  // affect the underlying CRS projection. Populated in `initialize()` from
  // `options.bearing` (the class-field `declare` keeps `isolatedDeclarations`
  // happy without introducing a field initializer that would run AFTER
  // `Class.constructor` → `this.initialize()`).
  declare _bearing: number
  // Camera pitch (tilt) in degrees. `0` = looking straight down (default).
  // Clamped to `[minPitch, maxPitch]` on `setPitch()`. Populated in
  // `initialize()` from `options.pitch`. `declare`-only for the same reason
  // as `_bearing` (see class-field invariant in ROADMAP.md).
  declare _pitch: number
  declare _container: HTMLElement & { _tsmap_id?: number }
  declare _containerId?: number
  declare _loaded?: boolean
  declare _zoom: number
  declare _lastCenter?: LatLng | null
  declare _pixelOrigin?: Point
  declare _mapPane: HTMLElement
  declare _panes: Record<string, HTMLElement>
  declare _paneRenderers: Record<string, any>
  declare _targets: Record<number, any>
  declare _fadeAnimated?: boolean
  declare _zoomAnimated?: boolean
  declare _animatingZoom?: boolean
  declare _animateToCenter?: LatLng
  declare _animateToZoom?: number
  declare _tempFireZoomEvent?: boolean
  declare _panAnim?: PosAnimation
  declare _flyToFrame?: number
  declare _resizeRequest?: number | null
  declare _sizeTimer?: ReturnType<typeof setTimeout>
  declare _transitionEndTimer?: ReturnType<typeof setTimeout>
  declare _resizeObserver?: ResizeObserver
  declare _proxy?: HTMLElement
  declare _size?: Point
  declare _locateOptions?: any
  declare _locationWatchId?: number
  declare _layersMinZoom?: number
  declare _layersMaxZoom?: number
  declare _enforcingBounds?: boolean
  _initControlPos?: () => void
  _clearControlPos?: () => void
  _addLayers?: (layers?: any | any[]) => void
  declare _renderer?: any
  declare dragging?: any
  declare boxZoom?: any
  declare touchZoom?: any
  declare pinchZoom?: any
  declare doubleClickZoom?: any
  declare scrollWheelZoom?: any
  declare keyboard?: any
  declare tapHold?: any
  declare _popup?: any
  closePopup?: () => void

  initialize(id: string | HTMLElement, options?: MapOptions): void {
    options = Util.setOptions(this as any, options) as MapOptions

    this._handlers = []
    this._layers = {}
    this._zoomBoundLayers = {}
    this._sizeChanged = true
    this._bearing = typeof options.bearing === 'number'
    ? ((options.bearing % 360) + 360) % 360
    : 0
    this._pitch = typeof options.pitch === 'number'
    ? this._clampPitch(options.pitch)
    : 0

    this._initContainer(id)
    this._initLayout()
    this._initEvents()

    if (options.maxBounds)
    this.setMaxBounds(options.maxBounds)

    if (options.zoom !== undefined)
    this._zoom = this._limitZoom(options.zoom)

    if (options.center && options.zoom !== undefined)
    this.setView(new LatLng(options.center), options.zoom, { reset: true })

    if (this._bearing || this._pitch)
    this._applyCameraTransform()

    this.callInitHooks()

    this._zoomAnimated = this.options.zoomAnimation

    if (this._zoomAnimated)
    this._createAnimProxy()

    this._addLayers?.(this.options.layers)
  }

  setView(center: any, zoom?: number, options?: any): this {
    zoom = zoom === undefined ? this._zoom : this._limitZoom(zoom as number)
    center = this._limitCenter(new LatLng(center), zoom as number, this.options.maxBounds)
    options ??= {}

    this._stop()

    if (this._loaded && !options.reset && options !== true) {
      if (options.animate !== undefined) {
        options.zoom = { animate: options.animate, ...options.zoom }
        options.pan = { animate: options.animate, duration: options.duration, ...options.pan }
      }

      const moved = this._zoom !== zoom
      ? this._tryAnimatedZoom && this._tryAnimatedZoom(center, zoom as number, options.zoom)
      : this._tryAnimatedPan(center, options.pan)

      if (moved) {
        clearTimeout(this._sizeTimer as any)
        return this
      }
    }

    this._resetView(center, zoom as number, options.pan?.noMoveStart)
    return this
  }

  setZoom(zoom: number, options?: any): this {
    if (!this._loaded) {
      this._zoom = zoom
      return this
    }
    return this.setView(this.getCenter(), zoom, { zoom: options })
  }

  zoomIn(delta?: number, options?: any): this {
    delta ??= this.options.zoomDelta
    return this.setZoom(this._zoom + (delta as number), options)
  }

  zoomOut(delta?: number, options?: any): this {
    delta ??= this.options.zoomDelta
    return this.setZoom(this._zoom - (delta as number), options)
  }

  setZoomAround(latlng: any, zoom: number, options?: any): this {
    const scale = this.getZoomScale(zoom)
    const viewHalf = this.getSize().divideBy(2)
    const containerPoint = latlng instanceof Point ? latlng : this.latLngToContainerPoint(latlng)
    const centerOffset = containerPoint.subtract(viewHalf).multiplyBy(1 - 1 / scale)
    const newCenter = this.containerPointToLatLng(viewHalf.add(centerOffset))
    return this.setView(newCenter, zoom, { zoom: options })
  }

  _getBoundsCenterZoom(bounds: any, options?: any): { center: LatLng, zoom: number } {
    options ??= {}
    bounds = bounds.getBounds ? bounds.getBounds() : new LatLngBounds(bounds)

    const paddingTL = new Point(options.paddingTopLeft || options.padding || [0, 0])
    const paddingBR = new Point(options.paddingBottomRight || options.padding || [0, 0])

    let zoom = this.getBoundsZoom(bounds, false, paddingTL.add(paddingBR))
    zoom = typeof options.maxZoom === 'number' ? Math.min(options.maxZoom, zoom) : zoom

    if (zoom === Infinity)
    return { center: bounds.getCenter(), zoom }

    const paddingOffset = paddingBR.subtract(paddingTL).divideBy(2)
    const swPoint = this.project(bounds.getSouthWest(), zoom)
    const nePoint = this.project(bounds.getNorthEast(), zoom)
    const center = this.unproject(swPoint.add(nePoint).divideBy(2).add(paddingOffset), zoom)
    return { center, zoom }
  }

  fitBounds(bounds: any, options?: any): this {
    const b = new LatLngBounds(bounds)
    if (!b.isValid())
    throw new Error('Bounds are not valid.')
    const target = this._getBoundsCenterZoom(b, options)
    return this.setView(target.center, target.zoom, options)
  }

  fitWorld(options?: any): this {
    return this.fitBounds([[-90, -180], [90, 180]], options)
  }

  panTo(center: any, options?: any): this {
    return this.setView(center, this._zoom, { pan: options })
  }

  panBy(offset: any, options?: any): this {
    offset = new Point(offset).round()
    options ??= {}

    if (!offset.x && !offset.y)
    return this.fire('moveend')

    if (options.animate !== true && !this.getSize().contains(offset)) {
      this._resetView(this.unproject(this.project(this.getCenter()).add(offset)), this.getZoom())
      return this
    }

    if (!this._panAnim) {
      this._panAnim = new PosAnimation()
      this._panAnim.on( {
        step: this._onPanTransitionStep,
        end: this._onPanTransitionEnd,
      }, this)
    }

    if (!options.noMoveStart)
    this.fire('movestart')

    if (options.animate !== false) {
      this._mapPane.classList.add('tsmap-pan-anim')
      const newPos = this._getMapPanePos().subtract(offset).round()
      this._panAnim.run(this._mapPane, newPos, options.duration || 0.25, options.easeLinearity)
    }
    else {
      this._rawPanBy(offset)
      this.fire('move').fire('moveend')
    }
    return this
  }

  flyTo(targetCenter: any, targetZoom?: number, options?: any): this {
    options ??= {}
    if (options.animate === false)
    return this.setView(targetCenter, targetZoom, options)

    this._stop()

    const from = this.project(this.getCenter())
    const to = this.project(targetCenter)
    const size = this.getSize()
    const startZoom = this._zoom

    targetCenter = new LatLng(targetCenter)
    const tz = targetZoom === undefined ? startZoom : this._limitZoom(targetZoom)

    const w0 = Math.max(size.x, size.y)
    const w1 = w0 * this.getZoomScale(startZoom, tz)
    const u1 = to.distanceTo(from) || 1
    const rho = 1.42
    const rho2 = rho * rho

    function r(i: number): number {
      const s1 = i ? -1 : 1
      const s2 = i ? w1 : w0
      const t1 = w1 * w1 - w0 * w0 + s1 * rho2 * rho2 * u1 * u1
      const b1 = 2 * s2 * rho2 * u1
      const b = t1 / b1
      const sq = Math.sqrt(b * b + 1) - b
      return sq < 0.000000015 ? -18 : Math.log(sq)
    }

    function sinh(n: number): number { return (Math.exp(n) - Math.exp(-n)) / 2 }
    function cosh(n: number): number { return (Math.exp(n) + Math.exp(-n)) / 2 }
    function tanh(n: number): number { return sinh(n) / cosh(n) }

    const r0 = r(0)
    function w(s: number): number { return w0 * (cosh(r0) / cosh(r0 + rho * s)) }
    function u(s: number): number { return w0 * (cosh(r0) * tanh(r0 + rho * s) - sinh(r0)) / rho2 }
    function easeOut(t: number): number { return 1 - (1 - t) ** 1.5 }

    const start = Date.now()
    const S = (r(1) - r0) / rho
    const duration = options.duration ? 1000 * options.duration : 1000 * S * 0.8

    const frame = (): void => {
      const t = (Date.now() - start) / duration
      const s = easeOut(t) * S

      if (t <= 1) {
        this._flyToFrame = requestAnimationFrame(frame)
        this._move(
        this.unproject(from.add(to.subtract(from).multiplyBy(u(s) / u1)), startZoom),
        this.getScaleZoom(w0 / w(s), startZoom),
        { flyTo: true },
        )
      }
      else {
        this._move(targetCenter, tz)._moveEnd(true)
      }
    }

    this._moveStart(true, options.noMoveStart)
    frame()
    return this
  }

  flyToBounds(bounds: any, options?: any): this {
    const target = this._getBoundsCenterZoom(bounds, options)
    return this.flyTo(target.center, target.zoom, options)
  }

  setMaxBounds(bounds: any): this {
    const b = new LatLngBounds(bounds)
    if (this.listens('moveend', this._panInsideMaxBounds))
    this.off('moveend', this._panInsideMaxBounds)

    if (!b.isValid()) {
      this.options.maxBounds = null
      return this
    }

    this.options.maxBounds = b

    if (this._loaded)
    this._panInsideMaxBounds()

    return this.on('moveend', this._panInsideMaxBounds, this)
  }

  setMinZoom(zoom: number): this {
    const oldZoom = this.options.minZoom
    this.options.minZoom = zoom
    if (this._loaded && oldZoom !== zoom) {
      this.fire('zoomlevelschange')
      if (this.getZoom() < (this.options.minZoom as number))
      return this.setZoom(zoom)
    }
    return this
  }

  setMaxZoom(zoom: number): this {
    const oldZoom = this.options.maxZoom
    this.options.maxZoom = zoom
    if (this._loaded && oldZoom !== zoom) {
      this.fire('zoomlevelschange')
      if (this.getZoom() > (this.options.maxZoom as number))
      return this.setZoom(zoom)
    }
    return this
  }

  panInsideBounds(bounds: any, options?: any): this {
    this._enforcingBounds = true
    const center = this.getCenter()
    const newCenter = this._limitCenter(center, this._zoom, new LatLngBounds(bounds))
    if (!center.equals(newCenter))
    this.panTo(newCenter, options)
    this._enforcingBounds = false
    return this
  }

  panInside(latlng: any, options?: any): this {
    options ??= {}
    const paddingTL = new Point(options.paddingTopLeft || options.padding || [0, 0])
    const paddingBR = new Point(options.paddingBottomRight || options.padding || [0, 0])
    const pixelCenter = this.project(this.getCenter())
    const pixelPoint = this.project(latlng)
    const pixelBounds = this.getPixelBounds()
    const paddedBounds = new Bounds([pixelBounds.min.add(paddingTL), pixelBounds.max.subtract(paddingBR)])
    const paddedSize = paddedBounds.getSize()

    if (!paddedBounds.contains(pixelPoint)) {
      this._enforcingBounds = true
      const centerOffset = pixelPoint.subtract(paddedBounds.getCenter())
      const offset = paddedBounds.extend(pixelPoint).getSize().subtract(paddedSize)
      pixelCenter.x += centerOffset.x < 0 ? -offset.x : offset.x
      pixelCenter.y += centerOffset.y < 0 ? -offset.y : offset.y
      this.panTo(this.unproject(pixelCenter), options)
      this._enforcingBounds = false
    }
    return this
  }

  invalidateSize(options?: any): this {
    if (!this._loaded)
    return this

    options = { animate: false, pan: true, ...(options === true ? { animate: true } : options) }

    const oldSize = this.getSize()
    this._sizeChanged = true
    this._lastCenter = null

    const newSize = this.getSize()
    const oldCenter = oldSize.divideBy(2).round()
    const newCenter = newSize.divideBy(2).round()
    const offset = oldCenter.subtract(newCenter)

    if (!offset.x && !offset.y)
    return this

    if (options.animate && options.pan) {
      this.panBy(offset)
    }
    else {
      if (options.pan)
      this._rawPanBy(offset)
      this.fire('move')

      if (options.debounceMoveend) {
        clearTimeout(this._sizeTimer as any)
        this._sizeTimer = setTimeout(this.fire.bind(this, 'moveend'), 200)
      }
      else {
        this.fire('moveend')
      }
    }

    if (this._bearing || this._pitch)
    this._applyCameraTransform()

    return this.fire('resize', { oldSize, newSize })
  }

  stop(): this {
    this.setZoom(this._limitZoom(this._zoom))
    if (!this.options.zoomSnap)
    this.fire('viewreset')
    return this._stop()
  }

  locate(options?: any): this {
    const opts = this._locateOptions = { timeout: 10000, watch: false, ...options }

    if (!('geolocation' in navigator)) {
      this._handleGeolocationError( { code: 0, message: 'Geolocation not supported.' })
      return this
    }

    const onResponse = this._handleGeolocationResponse.bind(this)
    const onError = this._handleGeolocationError.bind(this)

    if (opts.watch) {
      if (this._locationWatchId !== undefined)
      navigator.geolocation.clearWatch(this._locationWatchId)
      this._locationWatchId = navigator.geolocation.watchPosition(onResponse, onError, opts)
    }
    else {
      navigator.geolocation.getCurrentPosition(onResponse, onError, opts)
    }
    return this
  }

  stopLocate(): this {
    (navigator as any).geolocation?.clearWatch?.(this._locationWatchId)
    if (this._locateOptions)
    this._locateOptions.setView = false
    return this
  }

  _handleGeolocationError(error: any): void {
    if (!this._container._tsmap_id)
    return
    const c = error.code
    const message = error.message
    || (c === 1 ? 'permission denied' : (c === 2 ? 'position unavailable' : 'timeout'))

    if (this._locateOptions.setView && !this._loaded)
    this.fitWorld()

    this.fire('locationerror', { code: c, message: `Geolocation error: ${message}.` })
  }

  _handleGeolocationResponse(pos: GeolocationPosition): void {
    if (!this._container._tsmap_id)
    return
    const lat = pos.coords.latitude
    const lng = pos.coords.longitude
    const latlng = new LatLng(lat, lng)
    const bounds = latlng.toBounds(pos.coords.accuracy * 2)
    const options = this._locateOptions

    if (options.setView) {
      const zoom = this.getBoundsZoom(bounds)
      this.setView(latlng, options.maxZoom ? Math.min(zoom, options.maxZoom) : zoom)
    }

    const data: any = { latlng, bounds, timestamp: pos.timestamp }
    for (const i in pos.coords) {
      if (typeof (pos.coords as any)[i] === 'number')
      data[i] = (pos.coords as any)[i]
    }
    this.fire('locationfound', data)
  }

  addHandler(name: string, HandlerClass: any): this {
    if (!HandlerClass)
    return this

    const handler = (this as any)[name] = new HandlerClass(this)
    this._handlers.push(handler)

    if (this.options[name])
    handler.enable()

    return this
  }

  remove(): this {
    this._initEvents(true)
    if (this.options.maxBounds)
    this.off('moveend', this._panInsideMaxBounds)

    if (this._containerId !== this._container._tsmap_id)
    throw new Error('Map container is being reused by another instance')

    delete this._container._tsmap_id
    delete this._containerId

    if (this._locationWatchId !== undefined)
    this.stopLocate()

    this._stop()

    PointerEvents.disablePointerDetection(this._container)
    this._mapPane.remove()

    if (this._clearControlPos)
    this._clearControlPos()
    if (this._resizeRequest) {
      cancelAnimationFrame(this._resizeRequest)
      this._resizeRequest = null
    }

    this._clearHandlers()

    clearTimeout(this._transitionEndTimer as any)
    clearTimeout(this._sizeTimer as any)

    if (this._loaded)
    this.fire('unload')

    this._destroyAnimProxy()

    for (const layer of Object.values(this._layers) as any[])
    layer.remove()
    for (const pane of Object.values(this._panes))
    pane.remove()

    this._layers = {}
    this._panes = {} as any
    delete (this as any)._mapPane
    delete this._renderer

    return this
  }

  createPane(name?: string, container?: HTMLElement | null): HTMLElement {
    const className = `tsmap-pane${name ? ` tsmap-$ {name.replace('Pane', '')}-pane` : ''}`
    const pane = DomUtil.create('div', className, container || this._mapPane)
    if (name)
    this._panes[name] = pane
    return pane
  }

  getCenter(): LatLng {
    this._checkIfLoaded()
    if (this._lastCenter && !this._moved())
    return this._lastCenter.clone()
    return this.layerPointToLatLng(this._getCenterLayerPoint())
  }

  getZoom(): number {
    return this._zoom
  }

  /**
  * Returns the current map bearing (rotation) in degrees, in the range
  * `[0, 360)`. `0` = north is up.
  */
  getBearing(): number {
    return this._bearing
  }

  /**
  * Sets the map bearing (rotation) in degrees. Input is wrapped to `[0, 360)`
  * using `((b % 360) + 360) % 360`, so negative and >360 values are valid.
  * Fires `rotatestart`, `rotate`, `rotateend` events.
  */
  setBearing(bearing: number): this {
    const wrapped = ((bearing % 360) + 360) % 360
    if (wrapped === this._bearing)
    return this

    this.fire('rotatestart', { bearing: this._bearing })
    this._bearing = wrapped
    this._applyCameraTransform()
    this.fire('rotate', { bearing: wrapped })
    this.fire('rotateend', { bearing: wrapped })
    return this
  }

  /**
  * Alias of `setBearing()` with an (optional) animation hook. Animation is
  * not yet wired — Phase 1.4 will merge this into the unified camera
  * animation engine. For now, this is always a no-animation snap.
  */
  rotateTo(bearing: number, _options?: { animate?: boolean, duration?: number }): this {
    return this.setBearing(bearing)
  }

  /**
  * Returns the current map pitch (camera tilt) in degrees. `0` = looking
  * straight down.
  */
  getPitch(): number {
    return this._pitch
  }

  /**
  * Sets the map pitch (camera tilt) in degrees. Clamped to
  * `[minPitch, maxPitch]` (defaults `[0, 60]`). Fires `pitchstart`, `pitch`,
  * `pitchend` events.
  */
  setPitch(pitch: number): this {
    const clamped = this._clampPitch(pitch)
    if (clamped === this._pitch)
    return this

    this.fire('pitchstart', { pitch: this._pitch })
    this._pitch = clamped
    this._applyCameraTransform()
    this.fire('pitch', { pitch: clamped })
    this.fire('pitchend', { pitch: clamped })
    return this
  }

  /**
  * Alias of `setPitch()` with an (optional) animation hook. Animation is
  * not yet wired — Phase 1.4 will merge this into the unified camera
  * animation engine. For now, this is always a no-animation snap.
  */
  pitchTo(pitch: number, _options?: { animate?: boolean, duration?: number }): this {
    return this.setPitch(pitch)
  }

  _clampPitch(pitch: number): number {
    const min = this.options.minPitch ?? 0
    const max = this.options.maxPitch ?? 60
    return Math.max(min, Math.min(max, pitch))
  }

  getBounds(): LatLngBounds {
    const bounds = this.getPixelBounds()
    const sw = this.unproject(bounds.getBottomLeft())
    const ne = this.unproject(bounds.getTopRight())
    return new LatLngBounds(sw, ne)
  }

  getMinZoom(): number {
    return this.options.minZoom ?? this._layersMinZoom ?? 0
  }

  getMaxZoom(): number {
    return this.options.maxZoom ?? this._layersMaxZoom ?? Infinity
  }

  getBoundsZoom(bounds: any, inside?: boolean, padding?: any): number {
    const b = new LatLngBounds(bounds)
    const pad = new Point(padding ?? [0, 0])

    let zoom = this.getZoom() ?? 0
    const min = this.getMinZoom()
    const max = this.getMaxZoom()
    const nw = b.getNorthWest()
    const se = b.getSouthEast()
    const size = this.getSize().subtract(pad)
    const boundsSize = new Bounds(this.project(se, zoom), this.project(nw, zoom)).getSize()
    const snap = this.options.zoomSnap!
    const scalex = size.x / boundsSize.x
    const scaley = size.y / boundsSize.y
    const scale = inside ? Math.max(scalex, scaley) : Math.min(scalex, scaley)

    zoom = this.getScaleZoom(scale, zoom)

    if (snap) {
      zoom = Math.round(zoom / (snap / 100)) * (snap / 100)
      zoom = inside ? Math.ceil(zoom / snap) * snap : Math.floor(zoom / snap) * snap
    }

    return Math.max(min, Math.min(max, zoom))
  }

  getSize(): Point {
    if (!this._size || this._sizeChanged) {
      this._size = new Point(this._container.clientWidth || 0, this._container.clientHeight || 0)
      this._sizeChanged = false
    }
    return this._size.clone()
  }

  getPixelBounds(center?: any, zoom?: number): Bounds {
    const topLeftPoint = this._getTopLeftPoint(center, zoom)
    return new Bounds(topLeftPoint, topLeftPoint.add(this.getSize()))
  }

  getPixelOrigin(): Point {
    this._checkIfLoaded()
    return this._pixelOrigin as Point
  }

  getPixelWorldBounds(zoom?: number): Bounds {
    return this.options.crs.getProjectedBounds(zoom ?? this.getZoom())
  }

  getPane(pane: string | HTMLElement): HTMLElement {
    return typeof pane === 'string' ? this._panes[pane] : pane
  }

  getPanes(): Record<string, HTMLElement> {
    return this._panes
  }

  getContainer(): HTMLElement {
    return this._container
  }

  getZoomScale(toZoom: number, fromZoom?: number): number {
    const crs = this.options.crs
    fromZoom ??= this._zoom
    return crs.scale(toZoom) / crs.scale(fromZoom)
  }

  getScaleZoom(scale: number, fromZoom?: number): number {
    const crs = this.options.crs
    fromZoom ??= this._zoom
    const zoom = crs.zoom(scale * crs.scale(fromZoom))
    return Number.isNaN(zoom) ? Infinity : zoom
  }

  project(latlng: any, zoom?: number): Point {
    zoom ??= this._zoom
    return this.options.crs.latLngToPoint(new LatLng(latlng), zoom)
  }

  unproject(point: any, zoom?: number): LatLng {
    zoom ??= this._zoom
    return this.options.crs.pointToLatLng(new Point(point), zoom)
  }

  layerPointToLatLng(point: any): LatLng {
    const projectedPoint = new Point(point).add(this.getPixelOrigin())
    return this.unproject(projectedPoint)
  }

  latLngToLayerPoint(latlng: any): Point {
    const projectedPoint = this.project(new LatLng(latlng))._round()
    return projectedPoint._subtract(this.getPixelOrigin())
  }

  wrapLatLng(latlng: any): LatLng {
    return this.options.crs.wrapLatLng(new LatLng(latlng))
  }

  wrapLatLngBounds(bounds: any): LatLngBounds {
    return this.options.crs.wrapLatLngBounds(new LatLngBounds(bounds))
  }

  distance(latlng1: any, latlng2: any): number {
    return this.options.crs.distance(new LatLng(latlng1), new LatLng(latlng2))
  }

  containerPointToLayerPoint(point: any): Point {
    const p = new Point(point)
    if (!this._bearing && !this._pitch)
    return p.subtract(this._getMapPanePos())
    // With rotation and/or pitch, the CSS transform on `_mapPane` is
    //   translate3d(mapPanePos) rotateX(pitch) rotate(bearing)
    // with `transform-origin` set to the viewport center (see
    // `_applyCameraTransform`). Inverting requires:
    //   1. subtract pane pos to get viewport-center-relative coords
    //   2. subtract the viewport center
    //   3. un-pitch (reverse perspective) to recover the pre-pitch
    //      screen-center-relative layer coords
    //   4. un-rotate by `-bearing` around the viewport center
    //   5. add the viewport center back
    const center = this.getSize()._divideBy(2)
    let shifted = p.subtract(this._getMapPanePos())._subtract(center)
    if (this._pitch)
    shifted = this._unpitchPoint(shifted)
    if (this._bearing)
    shifted = this._rotatePoint(shifted, -this._bearing, new Point(0, 0))
    return shifted._add(center)
  }

  layerPointToContainerPoint(point: any): Point {
    const p = new Point(point)
    if (!this._bearing && !this._pitch)
    return p.add(this._getMapPanePos())
    const center = this.getSize()._divideBy(2)
    let shifted = p.subtract(center)
    if (this._bearing)
    shifted = this._rotatePoint(shifted, this._bearing, new Point(0, 0))
    if (this._pitch)
    shifted = this._pitchPoint(shifted)
    return shifted._add(center)._add(this._getMapPanePos())
  }

  containerPointToLatLng(point: any): LatLng {
    const layerPoint = this.containerPointToLayerPoint(new Point(point))
    return this.layerPointToLatLng(layerPoint)
  }

  latLngToContainerPoint(latlng: any): Point {
    return this.layerPointToContainerPoint(this.latLngToLayerPoint(new LatLng(latlng)))
  }

  pointerEventToContainerPoint(e: any): Point {
    return DomEvent.getPointerPosition(e, this._container)
  }

  pointerEventToLayerPoint(e: any): Point {
    return this.containerPointToLayerPoint(this.pointerEventToContainerPoint(e))
  }

  pointerEventToLatLng(e: any): LatLng {
    return this.layerPointToLatLng(this.pointerEventToLayerPoint(e))
  }

  _initContainer(id: string | HTMLElement): void {
    const container = this._container = DomUtil.get(id) as HTMLElement & { _tsmap_id?: number }
    if (!container)
    throw new Error('Map container not found.')
    else if (container._tsmap_id)
    throw new Error('Map container is already initialized.')

    PointerEvents.enablePointerDetection(container)
    DomEvent.on(container, 'scroll', this._onScroll, this)
    this._containerId = Util.stamp(container)
  }

  _initLayout(): void {
    const container = this._container

    this._fadeAnimated = this.options.fadeAnimation

    const classes = ['tsmap-container', 'tsmap-touch']
    if (Browser.retina)
    classes.push('tsmap-retina')
    if (Browser.safari)
    classes.push('tsmap-safari')
    if (this._fadeAnimated)
    classes.push('tsmap-fade-anim')

    container.classList.add(...classes)

    const { position } = getComputedStyle(container)
    if (position !== 'absolute' && position !== 'relative' && position !== 'fixed' && position !== 'sticky')
    container.style.position = 'relative'

    this._initPanes()
    if (this._initControlPos)
    this._initControlPos()
  }

  _initPanes(): void {
    const panes = this._panes = {} as Record<string, HTMLElement>
    this._paneRenderers = {}

    this._mapPane = this.createPane('mapPane', this._container)
    DomUtil.setPosition(this._mapPane, new Point(0, 0))

    this.createPane('tilePane')
    this.createPane('overlayPane')
    this.createPane('shadowPane')
    this.createPane('markerPane')
    this.createPane('tooltipPane')
    this.createPane('popupPane')

    if (!this.options.markerZoomAnimation) {
      panes.markerPane.classList.add('tsmap-zoom-hide')
      panes.shadowPane.classList.add('tsmap-zoom-hide')
    }
  }

  _resetView(center: LatLng, zoom: number, noMoveStart?: boolean): void {
    DomUtil.setPosition(this._mapPane, new Point(0, 0))
    const loading = !this._loaded
    this._loaded = true
    zoom = this._limitZoom(zoom)

    this.fire('viewprereset')

    const zoomChanged = this._zoom !== zoom
    this._moveStart(zoomChanged, noMoveStart)
    ._move(center, zoom)
    ._moveEnd(zoomChanged)

    this.fire('viewreset')

    if (loading)
    this.fire('load')
  }

  _moveStart(zoomChanged: boolean, noMoveStart?: boolean): this {
    if (zoomChanged)
    this.fire('zoomstart')
    if (!noMoveStart)
    this.fire('movestart')
    return this
  }

  _move(center: LatLng, zoom?: number, data?: any, suppressEvent?: boolean): this {
    if (zoom === undefined)
    zoom = this._zoom
    const zoomChanged = this._zoom !== zoom

    this._zoom = zoom
    this._lastCenter = center
    this._pixelOrigin = this._getNewPixelOrigin(center)

    if (!suppressEvent) {
      if (zoomChanged || data?.pinch)
      this.fire('zoom', data)
      this.fire('move', data)
    }
    else if (data?.pinch) {
      this.fire('zoom', data)
    }
    return this
  }

  _moveEnd(zoomChanged: boolean): this {
    if (zoomChanged)
    this.fire('zoomend')
    return this.fire('moveend')
  }

  _stop(): this {
    if (this._flyToFrame !== undefined)
    cancelAnimationFrame(this._flyToFrame)
    this._panAnim?.stop()
    return this
  }

  _rawPanBy(offset: Point): void {
    DomUtil.setPosition(this._mapPane, this._getMapPanePos().subtract(offset))
  }

  _getZoomSpan(): number {
    return this.getMaxZoom() - this.getMinZoom()
  }

  _panInsideMaxBounds(): void {
    if (!this._enforcingBounds)
    this.panInsideBounds(this.options.maxBounds)
  }

  _checkIfLoaded(): void {
    if (!this._loaded)
    throw new Error('Set map center and zoom first.')
  }

  _initEvents(remove?: boolean): void {
    this._targets = {}
    this._targets[Util.stamp(this._container)] = this

    const onOff = remove ? DomEvent.off : DomEvent.on
    onOff(
    this._container,
    'click dblclick pointerdown pointerup pointerover pointerout pointermove contextmenu keypress keydown keyup',
    this._handleDOMEvent,
    this,
    )

    if (this.options.trackResize) {
      if (!remove) {
        if (!this._resizeObserver)
        this._resizeObserver = new ResizeObserver(this._onResize.bind(this))
        this._resizeObserver.observe(this._container)
      }
      else {
        this._resizeObserver?.disconnect()
      }
    }

    if (this.options.transform3DLimit)
    (remove ? this.off : this.on).call(this, 'moveend', this._onMoveEnd)
  }

  _onResize(): void {
    if (this._resizeRequest !== undefined && this._resizeRequest !== null)
    cancelAnimationFrame(this._resizeRequest)
    this._resizeRequest = requestAnimationFrame(() => { this.invalidateSize( { debounceMoveend: true }) })
  }

  _onScroll(): void {
    this._container.scrollTop = 0
    this._container.scrollLeft = 0
  }

  _onMoveEnd(): void {
    const pos = this._getMapPanePos()
    if (Math.max(Math.abs(pos.x), Math.abs(pos.y)) >= (this.options.transform3DLimit as number))
    this._resetView(this.getCenter(), this.getZoom())
  }

  _findEventTargets(e: any, type: string): any[] {
    let targets: any[] = []
    let target: any
    let src: any = e.target || e.srcElement
    let dragging = false
    const isHover = type === 'pointerout' || type === 'pointerover'

    while (src) {
      target = this._targets[Util.stamp(src)]
      if (target && (type === 'click' || type === 'preclick') && this._draggableMoved(target)) {
        dragging = true
        break
      }
      if (target && target.listens(type, true)) {
        if (isHover && !DomEvent.isExternalTarget(src, e))
        break
        targets.push(target)
        if (isHover)
        break
      }
      if (src === this._container)
      break
      src = src.parentNode
    }
    if (!targets.length && !dragging && !isHover && this.listens(type, true))
    targets = [this]
    return targets
  }

  _isClickDisabled(el: any): boolean | undefined {
    while (el && el !== this._container) {
      if (el._tsmap_disable_click || !el.parentNode)
      return true
      el = el.parentNode
    }
  }

  _handleDOMEvent(e: any): void {
    const el = e.target ?? e.srcElement
    if (!this._loaded || el._tsmap_disable_events || (e.type === 'click' && this._isClickDisabled(el)))
    return

    const type = e.type
    if (type === 'pointerdown')
    DomUtil.preventOutline(el)

    this._fireDOMEvent(e, type)
  }

  _fireDOMEvent(e: any, type: string, canvasTargets?: any[]): void {
    if (type === 'click')
    this._fireDOMEvent(e, 'preclick', canvasTargets)

    let targets = this._findEventTargets(e, type)

    if (canvasTargets) {
      const filtered = canvasTargets.filter((t: any) => t.listens(type, true))
      targets = filtered.concat(targets)
    }

    if (!targets.length)
    return

    if (type === 'contextmenu')
    e.preventDefault()

    const target = targets[0]
    const data: any = { originalEvent: e }

    if (e.type !== 'keypress' && e.type !== 'keydown' && e.type !== 'keyup') {
      const isMarker = target.getLatLng && (!target._pxRadius || target._pxRadius <= 10)
      data.containerPoint = isMarker
      ? this.latLngToContainerPoint(target.getLatLng())
      : this.pointerEventToContainerPoint(e)
      data.layerPoint = this.containerPointToLayerPoint(data.containerPoint)
      data.latlng = isMarker ? target.getLatLng() : this.layerPointToLatLng(data.layerPoint)
    }

    for (const t of targets) {
      t.fire(type, data, true)
      if (
      data.originalEvent._stopped
      || (t.options?.bubblingPointerEvents === false && TsMap._pointerEvents.includes(type))
      ) {
        return
      }
    }
  }

  _draggableMoved(obj: any): boolean {
    obj = obj.dragging?.enabled() ? obj : this
    return obj.dragging?.moved() || this.boxZoom?.moved()
  }

  _clearHandlers(): void {
    for (const handler of this._handlers)
    handler.disable()
  }

  whenReady(callback: (e?: any) => void, context?: any): this {
    if (this._loaded)
    callback.call(context || this, { target: this })
    else
    this.on('load', callback, context)
    return this
  }

  _getMapPanePos(): Point {
    return DomUtil.getPosition(this._mapPane)
  }

  /**
  * Rotates `p` by `angle` degrees around `origin` and returns a new Point.
  * Positive `angle` is clockwise in screen space (y-axis points down).
  */
  _rotatePoint(p: Point, angle: number, origin: Point): Point {
    if (!angle)
    return p.clone()
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const dx = p.x - origin.x
    const dy = p.y - origin.y
    return new Point(origin.x + dx * cos - dy * sin, origin.y + dx * sin + dy * cos)
  }

  /**
  * Pushes the current `_bearing` and `_pitch` onto the CSS transforms of
  * `_mapPane` and the upright panes (marker / popup / tooltip). Both camera
  * transforms pivot around the viewport center via `transform-origin`.
  * Called after every `setBearing()` / `setPitch()`. Replaces the earlier
  * `_applyBearingToPanes()` so bearing and pitch are kept consistent.
  */
  _applyCameraTransform(): void {
    if (!this._mapPane)
    return
    const center = this.getSize()._divideBy(2)
    const originCss = `${center.x}px ${center.y}px`
    this._mapPane.style.transformOrigin = originCss

    // Re-apply the current pane position together with the new rotation and
    // pitch. This composes
    //   translate3d(panePos) rotateX(pitch) rotate(bearing)
    // on `_mapPane` (see `DomUtil.setTransform` for order rationale).
    const pos = this._getMapPanePos()
    DomUtil.setPosition(this._mapPane, pos, this._bearing, this._pitch)

    // Counter-transform the upright panes so icons / popups / tooltips do
    // not visually spin or tilt with the map. The pivot is the same viewport
    // center so the counter-transform cancels precisely.
    const upright = ['markerPane', 'popupPane', 'tooltipPane']
    const active = !!this._bearing || !!this._pitch
    for (const name of upright) {
      const pane = this._panes?.[name]
      if (!pane)
      continue
      if (active) {
        pane.classList.add('tsmap-upright')
        pane.style.transformOrigin = originCss
        // CSS applies right-to-left, so `rotateX(-pitch) rotate(-bearing)`
        // first undoes bearing around the element's Z axis, then undoes
        // pitch around the SCREEN X axis — which exactly inverts the
        // composition applied to `_mapPane` above.
        pane.style.transform = `rotateX(${-this._pitch}deg) rotate(${-this._bearing}deg) translateZ(0)`
      }
      else {
        pane.classList.remove('tsmap-upright')
        pane.style.transform = ''
        pane.style.transformOrigin = ''
      }
    }
  }

  /**
  * Forward perspective projection: takes a screen-center-relative
  * layer-space point (post-bearing, pre-pitch) and returns the on-screen
  * projection of that ground point through the pitched virtual camera.
  * Camera height `h = (H/2) / tan(fovY/2)` with `fovY = 36.87°` (Mapbox
  * default). At pitch=0 this is the identity.
  */
  _pitchPoint(p: Point): Point {
    const theta = (this._pitch * Math.PI) / 180
    if (!theta)
    return p.clone()
    const H = this.getSize().y
    const h = (H / 2) / Math.tan((36.87 * Math.PI / 180) / 2)
    const sinT = Math.sin(theta)
    const cosT = Math.cos(theta)
    const denom = h - p.y * sinT
    if (Math.abs(denom) < 1e-6)
    return p.clone()
    const sx = h * p.x / denom
    const sy = h * p.y * cosT / denom
    return new Point(sx, sy)
  }

  /**
  * Inverse of `_pitchPoint`: takes a screen-center-relative screen-space
  * point and reverse-perspective-projects it onto the tilted ground plane,
  * returning the screen-center-relative layer-space (post-bearing, pre-pitch)
  * coordinate. At pitch=0 this is the identity.
  */
  _unpitchPoint(p: Point): Point {
    const theta = (this._pitch * Math.PI) / 180
    if (!theta)
    return p.clone()
    const H = this.getSize().y
    const h = (H / 2) / Math.tan((36.87 * Math.PI / 180) / 2)
    const sinT = Math.sin(theta)
    const cosT = Math.cos(theta)
    // Derived in task notes: solving sy = h*ly*cos/(h - ly*sin) for ly,
    // then back-substituting for lx.
    const denom = h * cosT + p.y * sinT
    if (Math.abs(denom) < 1e-6)
    return p.clone()
    const ly = p.y * h / denom
    const lx = p.x * h * cosT / denom
    return new Point(lx, ly)
  }

  _moved(): boolean {
    const pos = this._getMapPanePos()
    return !!pos && !pos.equals([0, 0])
  }

  _getTopLeftPoint(center?: any, zoom?: number): Point {
    const pixelOrigin = center && zoom !== undefined
    ? this._getNewPixelOrigin(center, zoom)
    : this.getPixelOrigin()
    return pixelOrigin.subtract(this._getMapPanePos())
  }

  _getNewPixelOrigin(center: any, zoom?: number): Point {
    const viewHalf = this.getSize()._divideBy(2)
    return this.project(center, zoom)._subtract(viewHalf)._add(this._getMapPanePos())._round()
  }

  _latLngToNewLayerPoint(latlng: any, zoom: number, center: any): Point {
    const topLeft = this._getNewPixelOrigin(center, zoom)
    return this.project(latlng, zoom)._subtract(topLeft)
  }

  _latLngBoundsToNewLayerBounds(latLngBounds: LatLngBounds, zoom: number, center: any): Bounds {
    const topLeft = this._getNewPixelOrigin(center, zoom)
    return new Bounds([
    this.project(latLngBounds.getSouthWest(), zoom)._subtract(topLeft),
    this.project(latLngBounds.getNorthWest(), zoom)._subtract(topLeft),
    this.project(latLngBounds.getSouthEast(), zoom)._subtract(topLeft),
    this.project(latLngBounds.getNorthEast(), zoom)._subtract(topLeft),
    ])
  }

  _getCenterLayerPoint(): Point {
    return this.containerPointToLayerPoint(this.getSize()._divideBy(2))
  }

  _getCenterOffset(latlng: any): Point {
    return this.latLngToLayerPoint(latlng).subtract(this._getCenterLayerPoint())
  }

  _limitCenter(center: LatLng, zoom: number, bounds?: LatLngBounds | null): LatLng {
    if (!bounds)
    return center
    const centerPoint = this.project(center, zoom)
    const viewHalf = this.getSize().divideBy(2)
    const viewBounds = new Bounds(centerPoint.subtract(viewHalf), centerPoint.add(viewHalf))
    const offset = this._getBoundsOffset(viewBounds, bounds, zoom)

    if (Math.abs(offset.x) <= 1 && Math.abs(offset.y) <= 1)
    return center

    return this.unproject(centerPoint.add(offset), zoom)
  }

  _limitOffset(offset: Point, bounds?: LatLngBounds | null): Point {
    if (!bounds)
    return offset
    const viewBounds = this.getPixelBounds()
    const newBounds = new Bounds(viewBounds.min.add(offset), viewBounds.max.add(offset))
    return offset.add(this._getBoundsOffset(newBounds, bounds))
  }

  _getBoundsOffset(pxBounds: Bounds, maxBounds: LatLngBounds, zoom?: number): Point {
    const projectedMaxBounds = new Bounds(
    this.project(maxBounds.getNorthEast(), zoom),
    this.project(maxBounds.getSouthWest(), zoom),
    )
    const minOffset = projectedMaxBounds.min.subtract(pxBounds.min)
    const maxOffset = projectedMaxBounds.max.subtract(pxBounds.max)
    const dx = this._rebound(minOffset.x, -maxOffset.x)
    const dy = this._rebound(minOffset.y, -maxOffset.y)
    return new Point(dx, dy)
  }

  _rebound(left: number, right: number): number {
    return left + right > 0
    ? Math.round(left - right) / 2
    : Math.max(0, Math.ceil(left)) - Math.max(0, Math.floor(right))
  }

  _limitZoom(zoom: number): number {
    const min = this.getMinZoom()
    const max = this.getMaxZoom()
    const snap = this.options.zoomSnap!
    if (snap)
    zoom = Math.round(zoom / snap) * snap
    return Math.max(min, Math.min(max, zoom))
  }

  _onPanTransitionStep(): void {
    this.fire('move')
  }

  _onPanTransitionEnd(): void {
    this._mapPane.classList.remove('tsmap-pan-anim')
    this.fire('moveend')
  }

  _tryAnimatedPan(center: any, options?: any): boolean {
    const offset = this._getCenterOffset(center)._trunc()
    if (options?.animate !== true && !this.getSize().contains(offset))
    return false
    this.panBy(offset, options)
    return true
  }

  _createAnimProxy(): void {
    this._proxy = DomUtil.create('div', 'tsmap-proxy tsmap-zoom-animated')
    this._panes.mapPane?.appendChild(this._proxy)

    this.on('zoomanim', this._animateProxyZoom, this)
    this.on('load moveend', this._animMoveEnd, this)

    DomEvent.on(this._proxy, 'transitionend', this._catchTransitionEnd, this)
  }

  _animateProxyZoom(e: any): void {
    const transform = this._proxy!.style.transform
    DomUtil.setTransform(
    this._proxy as HTMLElement,
    this.project(e.center, e.zoom),
    this.getZoomScale(e.zoom, 1),
    )
    if (transform === this._proxy!.style.transform && this._animatingZoom)
    this._onZoomTransitionEnd()
  }

  _animMoveEnd(): void {
    const c = this.getCenter()
    const z = this.getZoom()
    DomUtil.setTransform(this._proxy as HTMLElement, this.project(c, z), this.getZoomScale(z, 1))
  }

  _destroyAnimProxy(): void {
    if (this._proxy) {
      DomEvent.off(this._proxy, 'transitionend', this._catchTransitionEnd, this)
      this._proxy.remove()
      this.off('zoomanim', this._animateProxyZoom, this)
      this.off('load moveend', this._animMoveEnd, this)
      delete this._proxy
    }
  }

  _catchTransitionEnd(e: any): void {
    if (this._animatingZoom && e.propertyName.includes('transform'))
    this._onZoomTransitionEnd()
  }

  _nothingToAnimate(): boolean {
    return !this._container.getElementsByClassName('tsmap-zoom-animated').length
  }

  _tryAnimatedZoom(center: any, zoom: number, options?: any): boolean {
    if (this._animatingZoom)
    return true

    options ??= {}

    if (
    !this._zoomAnimated
    || options.animate === false
    || this._nothingToAnimate()
    || Math.abs(zoom - this._zoom) > (this.options.zoomAnimationThreshold as number)
    ) {
      return false
    }

    const scale = this.getZoomScale(zoom)
    const offset = this._getCenterOffset(center)._divideBy(1 - 1 / scale)

    if (options.animate !== true && !this.getSize().contains(offset))
    return false

    requestAnimationFrame(() => {
      this._moveStart(true, options.noMoveStart ?? false)
      ._animateZoom(center, zoom, true)
    })

    return true
  }

  _animateZoom(center: LatLng, zoom: number, startAnim?: boolean, noUpdate?: boolean): void {
    if (!this._mapPane)
    return

    if (startAnim) {
      this._animatingZoom = true
      this._animateToCenter = center
      this._animateToZoom = zoom
      this._mapPane.classList.add('tsmap-zoom-anim')
    }

    this.fire('zoomanim', { center, zoom, noUpdate })

    if (!this._tempFireZoomEvent)
    this._tempFireZoomEvent = this._zoom !== this._animateToZoom

    this._move(this._animateToCenter as LatLng, this._animateToZoom as number, undefined, true)

    this._transitionEndTimer = setTimeout(this._onZoomTransitionEnd.bind(this), 250)
  }

  _onZoomTransitionEnd(): void {
    if (!this._animatingZoom)
    return

    this._mapPane?.classList.remove('tsmap-zoom-anim')
    this._animatingZoom = false

    this._move(this._animateToCenter as LatLng, this._animateToZoom as number, undefined, true)

    if (this._tempFireZoomEvent)
    this.fire('zoom')
    delete this._tempFireZoomEvent

    this.fire('move')

    this._moveEnd(true)
  }
}

TsMap.setDefaultOptions( {
  crs: EPSG3857,
  center: undefined,
  zoom: undefined,
  minZoom: undefined,
  maxZoom: undefined,
  layers: [],
  maxBounds: undefined,
  renderer: undefined,
  zoomAnimation: true,
  zoomAnimationThreshold: 4,
  fadeAnimation: true,
  markerZoomAnimation: true,
  transform3DLimit: 8388608,
  // zoomSnap: 0 enables fractional zoom by default (Mapbox-style). Set to 1
  // to restrict zoom to integer levels (classic Leaflet behavior).
  zoomSnap: 0,
  zoomDelta: 1,
  trackResize: true,
  bearing: 0,
  pitch: 0,
  maxPitch: 60,
  minPitch: 0,
})

export const Map: typeof TsMap = TsMap

export function createMap(id: string | HTMLElement, options?: MapOptions): TsMap {
  return new TsMap(id, options)
}
