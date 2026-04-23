import type { EasingFunction } from '../dom/Animation'
import Browser from '../core/Browser'
import * as Util from '../core/Util'
import * as DomEvent from '../dom/DomEvent'
import * as PointerEvents from '../dom/DomEvent.PointerEvents'
import * as DomUtil from '../dom/DomUtil'
import { Evented } from '../core/Events'
import { Animation } from '../dom/Animation'
import { PosAnimation } from '../dom/PosAnimation'
import { EPSG3857 } from '../geo/crs/EPSG3857'
import { LatLng } from '../geo/LatLng'
import { LatLngBounds } from '../geo/LatLngBounds'
import { Bounds } from '../geometry/Bounds'
import { Point } from '../geometry/Point'
import { Style } from './Style'
import type { LayerSpecification, SourceSpecification, Style as StyleSpec } from '../style-spec/types'
import { diffStyles } from '../style-spec/diff'
import type { OfflineRegionOptions, OfflineRegionResult } from '../storage'
import { getDefaultCache, saveOfflineRegion } from '../storage'
import { buildTerrainMesh } from '../geo/terrainMesh'
import { TerrainSource } from '../geo/TerrainSource'
import type { WebGLTileRenderer } from '../renderer/webgl/WebGLTileRenderer'

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

// Atmospheric fog settings. Applied by the WebGL renderer when present;
// ignored by the Canvas2D path. Mirrors the property naming used by Mapbox
// GL JS (`map.setFog(...)`) so existing muscle-memory transfers.
export interface FogOptions {
  color?: string
  'horizon-blend'?: number
  range?: [number, number]
  'high-color'?: string
  'star-intensity'?: number
}

// Sky-layer settings. Same WebGL-only caveat as FogOptions.
export interface SkyOptions {
  'sky-color'?: string
  'horizon-color'?: string
  'fog-ground-blend'?: number
  'sun-position'?: [number, number]
  'sun-intensity'?: number
}

// Pluggable 3D layer contract. A `CustomLayerInterface` object can be handed
// to `map.addCustomLayer(...)`; the renderer will call `render()` each frame
// alongside the tile-layer draw calls with the current GL context and
// projection matrix. `onAdd` / `onRemove` bracket the layer's lifetime and
// are invoked only when a GL context is available.
export interface CustomLayerInterface {
  id: string
  type: 'custom'
  renderingMode?: '2d' | '3d'
  onAdd?: (map: TsMap, gl: WebGL2RenderingContext) => void
  onRemove?: (map: TsMap, gl: WebGL2RenderingContext) => void
  render: (gl: WebGL2RenderingContext, projectionMatrix: Float32Array) => void
}

// Terrain (3D DEM mesh warping) settings. The map keeps an in-memory
// `TerrainSource` populated from a raster-dem source; the WebGL renderer
// consumes it to build per-tile warped ground meshes. The API shape mirrors
// Mapbox GL JS's `setTerrain()` — `source` names a raster-dem source (added
// via `addSource()`), `exaggeration` scales vertical relief.
export interface TerrainOptions {
  /** Name of a raster-dem source previously added via `addSource`. */
  source: string
  /** Vertical exaggeration applied to elevation. Default `1`. */
  exaggeration?: number
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
  // `initialize()` from `options.pitch`. `declare`-only so the emitted
  // class field doesn't wipe the value set from `super()`.
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
  // Legacy pan-only animation, used by `panBy`. Kept alongside `_camAnim`
  // for the classic tile-pan flow.
  declare _panAnim?: PosAnimation
  // Unified camera animation engine. Drives `flyTo`, `easeTo`, and animated
  // `rotateTo` / `pitchTo`. Created lazily on first use.
  declare _camAnim?: Animation
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
  declare touchRotate?: any
  declare touchPitch?: any
  declare _popup?: any
  closePopup?: () => void
  declare _style?: Style
  declare _featureState?: globalThis.Map<string, Record<string, unknown>>
  // Atmospheric fog state. `null`/unset means no fog. Stored verbatim and
  // surfaced via `getFog()`; the renderer pulls it off when assembling frame
  // uniforms.
  declare _fog?: FogOptions | null
  // Sky-layer state. Same storage pattern as `_fog`.
  declare _sky?: SkyOptions | null
  // Registered custom 3D layers keyed by `layer.id`. `declare` keeps the field
  // type-only so it doesn't get re-initialised by the class-field semantics
  // after the base `Class` constructor runs (see class-field invariant).
  declare _customLayers?: globalThis.Map<string, CustomLayerInterface>
  // Active terrain configuration. `null` / undefined disables 3D warping.
  declare _terrain?: TerrainOptions | null
  // In-memory DEM tile cache used to answer `queryTerrainElevation` and to
  // build terrain meshes in the renderer. Lazy-created on the first
  // `setTerrain()` call.
  declare _terrainSource?: TerrainSource
  // DOM overlay host for atmospheric effects (sky + fog). The overlay lives
  // inside the map's container and is driven entirely via inline CSS
  // gradients so it works identically on Canvas2D and WebGL backends.
  declare _atmosphereOverlay?: HTMLElement
  // Lazy-initialized offline region API. See `getOfflineApi()` / the `offline`
  // getter below. Holds a small facade over the storage/TileCache pipeline so
  // callers can pre-download tiles for a bbox × zoom range.
  declare _offlineApi?: {
    save: (opts: OfflineRegionOptions) => Promise<OfflineRegionResult>
    size: () => Promise<{ bytes: number, entries: number }>
    clear: () => Promise<void>
  }

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
    const startBearing = this._bearing
    const startPitch = this._pitch

    targetCenter = new LatLng(targetCenter)
    const tz = targetZoom === undefined ? startZoom : this._limitZoom(targetZoom)
    const targetBearing = typeof options.bearing === 'number'
    ? ((options.bearing % 360) + 360) % 360
    : startBearing
    const targetPitch = typeof options.pitch === 'number' ? this._clampPitch(options.pitch) : startPitch

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

    const S = (r(1) - r0) / rho
    // Duration is in **milliseconds**. Older callers that passed seconds
    // (e.g. `duration: 0.8`) will animate roughly instantaneously — the
    // unified animation engine standardises on ms.
    const duration = options.duration ? options.duration : 1000 * S * 0.8

    const anim = this._getCamAnim()
    const bearingChanged = Math.abs(((targetBearing - startBearing + 540) % 360) - 180) > 1e-6
    const pitchChanged = Math.abs(targetPitch - startPitch) > 1e-6
    const zoomChanged = Math.abs(tz - startZoom) > 1e-6

    this._moveStart(true, options.noMoveStart)
    if (bearingChanged)
      this.fire('rotatestart', { bearing: startBearing })
    if (pitchChanged)
      this.fire('pitchstart', { pitch: startPitch })

    anim.run({
      duration,
      easing: t => 1 - (1 - t) ** 1.5,
      onFrame: ({ t }) => {
        const s = t * S
        const center = this.unproject(from.add(to.subtract(from).multiplyBy(u(s) / u1)), startZoom)
        const zoom = this.getScaleZoom(w0 / w(s), startZoom)
        if (bearingChanged)
          this._bearing = TsMap._lerpBearing(startBearing, targetBearing, t)
        if (pitchChanged)
          this._pitch = startPitch + (targetPitch - startPitch) * t
        this._move(center, zoom, { flyTo: true })
        if (bearingChanged || pitchChanged)
          this._applyCameraTransform()
        if (bearingChanged)
          this.fire('rotate', { bearing: this._bearing })
        if (pitchChanged)
          this.fire('pitch', { pitch: this._pitch })
      },
      onEnd: (completed) => {
        if (completed) {
          if (bearingChanged)
            this._bearing = targetBearing
          if (pitchChanged)
            this._pitch = targetPitch
          this._move(targetCenter, tz)
          if (bearingChanged || pitchChanged)
            this._applyCameraTransform()
          this._moveEnd(zoomChanged)
          if (bearingChanged)
            this.fire('rotateend', { bearing: targetBearing })
          if (pitchChanged)
            this.fire('pitchend', { pitch: targetPitch })
        }
        else {
          this._moveEnd(zoomChanged)
          if (bearingChanged)
            this.fire('rotateend', { bearing: this._bearing })
          if (pitchChanged)
            this.fire('pitchend', { pitch: this._pitch })
        }
      },
    })
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
  * Rotates the camera to `bearing` (degrees). Without options (or with
  * `animate: false`) this snaps instantly and is a thin alias for
  * `setBearing()`. With `animate: true`, the bearing is interpolated via
  * the unified camera animation engine (`_camAnim`), firing
  * `rotatestart` / `rotate` / `rotateend` events over the course of the
  * animation. Passing an `easing` function overrides the default
  * `easeInOutCubic`.
  */
  rotateTo(bearing: number, options?: { animate?: boolean, duration?: number, easing?: EasingFunction }): this {
    if (!options?.animate)
      return this.setBearing(bearing)
    return this.easeTo({
      bearing,
      duration: options.duration ?? 300,
      easing: options.easing,
    })
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
    if (this._atmosphereOverlay)
      this._updateAtmosphereOverlay()
    this.fire('pitch', { pitch: clamped })
    this.fire('pitchend', { pitch: clamped })
    return this
  }

  /**
  * Tilts the camera to `pitch` (degrees). Without options (or with
  * `animate: false`) this snaps instantly and is a thin alias for
  * `setPitch()`. With `animate: true`, the pitch is interpolated via the
  * unified camera animation engine, firing `pitchstart` / `pitch` /
  * `pitchend` events. `easing` defaults to `easeInOutCubic`.
  */
  pitchTo(pitch: number, options?: { animate?: boolean, duration?: number, easing?: EasingFunction }): this {
    if (!options?.animate)
      return this.setPitch(pitch)
    return this.easeTo({
      pitch,
      duration: options.duration ?? 300,
      easing: options.easing,
    })
  }

  _clampPitch(pitch: number): number {
    const min = this.options.minPitch ?? 0
    const max = this.options.maxPitch ?? 60
    return Math.max(min, Math.min(max, pitch))
  }

  /**
   * Canonical Mapbox-ergonomic camera move. Interpolates any subset of
   * `{center, zoom, bearing, pitch}` together through the unified animation
   * engine (`_camAnim`).
   *
   * Center interpolation: we lerp in projected **pixel** space at the
   * **start** zoom, then unproject at the interpolated zoom. This avoids
   * the antimeridian / polar issues you get from lerping raw `lat/lng`
   * (a lerp between `lng = 170` and `lng = -170` would go the long way
   * around) and gives a smooth great-circle-ish arc through the Mercator
   * projection.
   *
   * Bearing interpolation: shortest-angular-path (`((Δ + 540) % 360) - 180`)
   * so a `0° → 350°` move rotates 10° counter-clockwise, not 350° clockwise.
   *
   * Zoom and pitch are linear.
   *
   * Starting a new `easeTo` while another camera animation is in flight
   * cancels the old one (the engine fires `onEnd(false)`); the `moveend` /
   * `rotateend` / `pitchend` events for the superseded animation fire once
   * against the cancelled camera pose, and a fresh `movestart` fires for
   * the new one.
   */
  easeTo(options: {
    center?: any
    zoom?: number
    bearing?: number
    pitch?: number
    duration?: number
    easing?: EasingFunction
    padding?: any
    noMoveStart?: boolean
  } = {}): this {
    // Cancel any in-flight animation on this map. `_camAnim.run` would do
    // this too, but we also need to quiesce the legacy pan/fly fallbacks.
    this._stop()

    const startCenter = this.getCenter()
    const startZoom = this._zoom
    const startBearing = this._bearing
    const startPitch = this._pitch

    const endCenter = options.center !== undefined ? new LatLng(options.center) : startCenter
    const endZoom = options.zoom !== undefined ? this._limitZoom(options.zoom) : startZoom
    const endBearing = typeof options.bearing === 'number'
      ? ((options.bearing % 360) + 360) % 360
      : startBearing
    const endPitch = typeof options.pitch === 'number' ? this._clampPitch(options.pitch) : startPitch

    const duration = options.duration ?? 300

    const centerChanged = !startCenter.equals(endCenter)
    const zoomChanged = Math.abs(endZoom - startZoom) > 1e-9
    const bearingDelta = ((endBearing - startBearing + 540) % 360) - 180
    const bearingChanged = Math.abs(bearingDelta) > 1e-9
    const pitchChanged = Math.abs(endPitch - startPitch) > 1e-9

    // Nothing to do — match Mapbox by just firing a synthetic moveend.
    if (!centerChanged && !zoomChanged && !bearingChanged && !pitchChanged) {
      if (!options.noMoveStart)
        this.fire('movestart')
      this.fire('moveend')
      return this
    }

    // Project both centers to **start-zoom** world pixels so the lerp stays
    // consistent even as zoom changes mid-animation. Unproject each frame
    // at the interpolated zoom so marker positions track correctly.
    const fromPx = this.project(startCenter, startZoom)
    const toPx = this.project(endCenter, startZoom)

    // Zero-duration: snap instantly but still drive the engine so we fire
    // events in the right order.
    if (duration <= 0) {
      if (!options.noMoveStart)
        this._moveStart(zoomChanged, false)
      if (bearingChanged)
        this.fire('rotatestart', { bearing: startBearing })
      if (pitchChanged)
        this.fire('pitchstart', { pitch: startPitch })

      this._bearing = endBearing
      this._pitch = endPitch
      this._move(endCenter, endZoom)
      if (bearingChanged || pitchChanged)
        this._applyCameraTransform()
      this._moveEnd(zoomChanged)
      if (bearingChanged) {
        this.fire('rotate', { bearing: endBearing })
        this.fire('rotateend', { bearing: endBearing })
      }
      if (pitchChanged) {
        this.fire('pitch', { pitch: endPitch })
        this.fire('pitchend', { pitch: endPitch })
      }
      return this
    }

    const anim = this._getCamAnim()

    if (!options.noMoveStart)
      this._moveStart(zoomChanged, false)
    if (bearingChanged)
      this.fire('rotatestart', { bearing: startBearing })
    if (pitchChanged)
      this.fire('pitchstart', { pitch: startPitch })

    anim.run({
      duration,
      easing: options.easing,
      onFrame: ({ t }) => {
        const lerpZoom = startZoom + (endZoom - startZoom) * t
        const px = fromPx.add(toPx.subtract(fromPx).multiplyBy(t))
        const center = this.unproject(px, startZoom)
        if (bearingChanged)
          this._bearing = TsMap._lerpBearing(startBearing, endBearing, t)
        if (pitchChanged)
          this._pitch = startPitch + (endPitch - startPitch) * t
        this._move(center, lerpZoom, { easeTo: true })
        if (bearingChanged || pitchChanged)
          this._applyCameraTransform()
        if (bearingChanged)
          this.fire('rotate', { bearing: this._bearing })
        if (pitchChanged)
          this.fire('pitch', { pitch: this._pitch })
      },
      onEnd: (completed) => {
        if (completed) {
          if (bearingChanged)
            this._bearing = endBearing
          if (pitchChanged)
            this._pitch = endPitch
          this._move(endCenter, endZoom)
          if (bearingChanged || pitchChanged)
            this._applyCameraTransform()
          this._moveEnd(zoomChanged)
          if (bearingChanged)
            this.fire('rotateend', { bearing: endBearing })
          if (pitchChanged)
            this.fire('pitchend', { pitch: endPitch })
        }
        else {
          this._moveEnd(zoomChanged)
          if (bearingChanged)
            this.fire('rotateend', { bearing: this._bearing })
          if (pitchChanged)
            this.fire('pitchend', { pitch: this._pitch })
        }
      },
    })
    return this
  }

  /**
   * Returns `true` if a camera animation (ease / fly / animated
   * rotateTo / animated pitchTo) is currently running.
   */
  isEasing(): boolean {
    return !!this._camAnim?.isRunning()
  }

  /**
   * Read the map's current camera as a single object. Mirrors Mapbox GL JS
   * ergonomics — pair with `jumpTo`/`easeTo`/`flyTo` for a full camera API.
   */
  getCamera(): { center: LatLng, zoom: number, bearing: number, pitch: number } {
    return {
      center: this.getCenter(),
      zoom: this.getZoom(),
      bearing: this.getBearing(),
      pitch: this.getPitch(),
    }
  }

  /**
   * Snap the camera to the given target — no animation, no intermediate
   * events, correct `move`/`zoom`/`rotate`/`pitch` notifications on fields
   * that actually changed.
   */
  jumpTo(options: {
    center?: any
    zoom?: number
    bearing?: number
    pitch?: number
  } = {}): this {
    this._stop()

    const prevCenter = this.getCenter()
    const prevZoom = this._zoom
    const prevBearing = this._bearing
    const prevPitch = this._pitch

    if (options.bearing !== undefined) {
      const wrapped = ((options.bearing % 360) + 360) % 360
      if (wrapped !== prevBearing) {
        this._bearing = wrapped
        this.fire('rotate')
      }
    }

    if (options.pitch !== undefined) {
      const clamped = this._clampPitch(options.pitch)
      if (clamped !== prevPitch) {
        this._pitch = clamped
        this.fire('pitch')
      }
    }

    if (options.center !== undefined || options.zoom !== undefined) {
      const nextCenter = options.center !== undefined ? new LatLng(options.center) : prevCenter
      const nextZoom = options.zoom !== undefined ? this._limitZoom(options.zoom) : prevZoom
      if (!nextCenter.equals(prevCenter) || nextZoom !== prevZoom) {
        this._move(nextCenter, nextZoom)
      }
    }

    this._applyCameraTransform()
    return this
  }

  /**
   * Lazily allocates the shared `Animation` instance. Exactly one per map —
   * starting a new camera move cancels whatever's in flight, which is the
   * correct semantic for gestures.
   */
  _getCamAnim(): Animation {
    if (!this._camAnim)
      this._camAnim = new Animation()
    return this._camAnim
  }

  /**
   * Shortest-angular-path lerp on a `[0, 360)` value. Returns a value in
   * `[0, 360)`. Extracted as a static helper so both `easeTo` and `flyTo`
   * share identical wrap semantics.
   */
  static _lerpBearing(from: number, to: number, t: number): number {
    const delta = ((to - from + 540) % 360) - 180
    const raw = from + delta * t
    return ((raw % 360) + 360) % 360
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
    this._camAnim?.stop()
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

  // ---------- style-document API ----------

  // Replace the whole style. Emits `styledata` once the new style is live.
  // When both previous and next styles are set and `opts.diff` is true
  // (default), only the minimum diff commands are applied.
  setStyle(style: StyleSpec, opts?: { diff?: boolean, validate?: boolean }): this {
    const useDiff = opts?.diff !== false
    const validate = opts?.validate !== false

    if (useDiff && this._style) {
      const diff = diffStyles(this._style.spec, style)
      const resetCmd = diff.commands.find(c => c.command === 'setStyle')
      if (!resetCmd) {
        // Apply command-by-command.
        for (const cmd of diff.commands) this._applyStyleCommand(cmd)
        this.fire('styledata')
        return this
      }
      // Fall through to full reset.
    }

    // Tear down any existing style-layer hosts.
    if (this._style) {
      for (const host of this._style.sourceLayers.values()) {
        (this as any).removeLayer(host as any)
      }
    }

    this._style = new Style(style, { validate })
    for (const [sourceId, source] of Object.entries(this._style.spec.sources)) {
      const host = this._makeSourceLayer(sourceId, source as SourceSpecification)
      this._installFeatureStateLookup(sourceId, host)
      ;(this as any).addLayer(host as any)
    }
    this.fire('styledata')
    return this
  }

  getStyle(): StyleSpec | undefined {
    return this._style?.serialize()
  }

  isStyleLoaded(): boolean {
    return !!this._style
  }

  addSource(sourceId: string, source: SourceSpecification): this {
    if (!this._style) {
      this._style = new Style({ version: 8, sources: { [sourceId]: source }, layers: [] })
    }
    else {
      this._style.spec.sources[sourceId] = source
    }
    const host = this._makeSourceLayer(sourceId, source)
    this._installFeatureStateLookup(sourceId, host)
    ;(this as any).addLayer(host as any)
    this.fire('styledata')
    return this
  }

  getSource(sourceId: string): SourceSpecification | undefined {
    return this._style?.spec.sources[sourceId]
  }

  removeSource(sourceId: string): this {
    if (!this._style) return this
    const host = this._style.sourceLayers.get(sourceId)
    if (host) {
      ;(this as any).removeLayer(host as any)
      this._style.sourceLayers.delete(sourceId)
    }
    delete this._style.spec.sources[sourceId]
    this.fire('styledata')
    return this
  }

  // Build the concrete hosted Layer instance for a given source spec.
  // Uses dynamic `require` to avoid a module-init cycle: Map.ts →
  // VectorTileMapLayer → GridLayer → Layer → (include on TsMap).
  _makeSourceLayer(sourceId: string, source: SourceSpecification): unknown {
    if (source.type === 'raster') {
      const { TileLayer } = require('../layer/tile/TileLayer')
      const urls = source.tiles ?? []
      const url = urls[0]
      if (!url) throw new Error(`source "${sourceId}" has no tiles URL`)
      const tile = new TileLayer(url, {
        tileSize: source.tileSize ?? 256,
        minZoom: source.minzoom,
        maxZoom: source.maxzoom,
        attribution: source.attribution,
      })
      this._style!.sourceLayers.set(sourceId, tile)
      return tile
    }
    if (source.type === 'vector') {
      const { VectorTileMapLayer } = require('../layer/tile/VectorTileMapLayer')
      const urls = source.tiles ?? []
      const url = urls[0]
      if (!url) throw new Error(`source "${sourceId}" has no tiles URL`)
      const styleLayers = this._style!.spec.layers
        .filter(l => l.type !== 'background' && l.type !== 'raster' && (l as any).source === sourceId)
        .map(l => this._style!.toVectorStyleLayer(l))
      const vector = new VectorTileMapLayer({
        url,
        tileSize: (source as any).tileSize ?? 512,
        minZoom: source.minzoom,
        maxZoom: source.maxzoom,
        attribution: source.attribution,
        layers: styleLayers,
      })
      this._style!.sourceLayers.set(sourceId, vector)
      return vector
    }
    if (source.type === 'raster-dem') {
      const { TileLayer } = require('../layer/tile/TileLayer')
      const urls = source.tiles ?? []
      const url = urls[0] ?? ''
      const tile = new TileLayer(url, {
        tileSize: source.tileSize ?? 512,
        minZoom: source.minzoom,
        maxZoom: source.maxzoom,
        attribution: source.attribution,
      })
      this._style!.sourceLayers.set(sourceId, tile)
      return tile
    }
    throw new Error(`source type "${source.type}" is not supported in setStyle yet`)
  }

  // Style-spec layer API. Note: `map.addLayer(Layer)` still works for the
  // base Layer instance via the mixin in `layer/Layer.ts`. We distinguish
  // here by the argument having a `type` string literal and an `id`.
  addStyleLayer(layer: LayerSpecification, before?: string): this {
    if (!this._style) throw new Error('addStyleLayer requires a loaded style')
    const layers = this._style.spec.layers
    if (before) {
      const idx = layers.findIndex(l => l.id === before)
      if (idx >= 0) layers.splice(idx, 0, layer)
      else layers.push(layer)
    }
    else {
      layers.push(layer)
    }
    this._style.layerSpecs.set(layer.id, layer)
    // Repaint the source host so the new layer takes effect.
    if ((layer as any).source) {
      const host = this._style.sourceLayers.get((layer as any).source)
      if (typeof (host as any)?.setStyleLayers === 'function') {
        // Rebuild its style-layer list.
        const next = layers
          .filter(l => l.type !== 'background' && l.type !== 'raster' && (l as any).source === (layer as any).source)
          .map(l => this._style!.toVectorStyleLayer(l))
        ;(host as any).setStyleLayers(next)
        (host as any).redraw?.()
      }
    }
    this.fire('styledata')
    return this
  }

  removeStyleLayer(id: string): this {
    if (!this._style) return this
    const idx = this._style.spec.layers.findIndex(l => l.id === id)
    if (idx < 0) return this
    const removed = this._style.spec.layers.splice(idx, 1)[0]!
    this._style.layerSpecs.delete(id)
    if ((removed as any).source) {
      const host = this._style.sourceLayers.get((removed as any).source)
      if (typeof (host as any)?.setStyleLayers === 'function') {
        const next = this._style.spec.layers
          .filter(l => l.type !== 'background' && l.type !== 'raster' && (l as any).source === (removed as any).source)
          .map(l => this._style!.toVectorStyleLayer(l))
        ;(host as any).setStyleLayers(next)
        (host as any).redraw?.()
      }
    }
    this.fire('styledata')
    return this
  }

  getStyleLayer(id: string): LayerSpecification | undefined {
    return this._style?.layerSpecs.get(id)
  }

  setPaintProperty(layerId: string, name: string, value: unknown): this {
    this._style?.setPaintProperty(layerId, name, value)
    this.fire('styledata')
    return this
  }

  setLayoutProperty(layerId: string, name: string, value: unknown): this {
    this._style?.setLayoutProperty(layerId, name, value)
    this.fire('styledata')
    return this
  }

  setFilter(layerId: string, filter: unknown): this {
    this._style?.setFilter(layerId, filter)
    this.fire('styledata')
    return this
  }

  // --- feature-state API ------------------------------------------------
  // Persistent per-feature state keyed by `{source, sourceLayer, id}`. Style
  // expressions read from this via `['feature-state', <key>]` — the classic
  // use case is hover/selected highlighting that shouldn't require tile
  // refetches.

  _featureStateKey(lookup: { source: string, sourceLayer?: string, id: number | string }): string {
    // Keep numbers and strings distinct so the id `1` and the id `"1"` don't
    // collide. `typeof` prefix is cheap and unambiguous.
    const idTag = typeof lookup.id === 'number' ? `n:${lookup.id}` : `s:${lookup.id}`
    return `${lookup.source}|${lookup.sourceLayer ?? ''}|${idTag}`
  }

  _ensureFeatureStateMap(): globalThis.Map<string, Record<string, unknown>> {
    if (!this._featureState)
      this._featureState = new globalThis.Map()
    return this._featureState
  }

  _repaintSource(sourceId: string): void {
    // Light repaint: re-rasterize tiles we already have rather than the full
    // refetch `redraw()` does. Only VectorTileMapLayer tracks decoded tiles.
    const host: any = this._style?.sourceLayers.get(sourceId)
    if (!host)
      return
    if (typeof host._repaintDecodedTiles === 'function')
      host._repaintDecodedTiles()
  }

  setFeatureState(
    lookup: { source: string, sourceLayer?: string, id: number | string },
    state: Record<string, unknown>,
  ): this {
    const store = this._ensureFeatureStateMap()
    const key = this._featureStateKey(lookup)
    const existing = store.get(key)
    if (existing)
      Object.assign(existing, state)
    else
      store.set(key, { ...state })
    this._repaintSource(lookup.source)
    return this
  }

  getFeatureState(lookup: { source: string, sourceLayer?: string, id: number | string }): Record<string, unknown> {
    const store = this._featureState
    if (!store)
      return {}
    const key = this._featureStateKey(lookup)
    return store.get(key) ?? {}
  }

  removeFeatureState(
    lookup: { source: string, sourceLayer?: string, id: number | string },
    key?: string,
  ): this {
    const store = this._featureState
    if (!store)
      return this
    const fullKey = this._featureStateKey(lookup)
    if (key === undefined) {
      store.delete(fullKey)
    }
    else {
      const existing = store.get(fullKey)
      if (existing) {
        delete existing[key]
        if (Object.keys(existing).length === 0)
          store.delete(fullKey)
      }
    }
    this._repaintSource(lookup.source)
    return this
  }

  // Wire a per-source feature-state lookup into the given vector-tile host so
  // its paint-pass can resolve `['feature-state', …]` without re-architecting
  // the draw path.
  _installFeatureStateLookup(sourceId: string, host: any): void {
    if (typeof host?.setFeatureStateLookup !== 'function')
      return
    host.setFeatureStateLookup((src: string, srcLayer: string, id: number | string) => {
      const store = this._featureState
      if (!store)
        return {}
      const idTag = typeof id === 'number' ? `n:${id}` : `s:${id}`
      return store.get(`${src}|${srcLayer}|${idTag}`) ?? {}
    })
    // Let the host know which source id it represents so callbacks round-trip
    // the same key used by setFeatureState.
    if (typeof host.setSourceId === 'function')
      host.setSourceId(sourceId)
  }

  _applyStyleCommand(cmd: any): void {
    switch (cmd.command) {
      case 'addSource': {
        const [sourceId, source] = cmd.args
        if (!this._style) this._style = new Style({ version: 8, sources: {}, layers: [] }, { validate: false })
        this._style.spec.sources[sourceId] = source
        const host = this._makeSourceLayer(sourceId, source)
        this._installFeatureStateLookup(sourceId, host)
        ;(this as any).addLayer(host as any)
        break
      }
      case 'removeSource': {
        const [sourceId] = cmd.args
        this.removeSource(sourceId)
        break
      }
      case 'addLayer': {
        const [layer, before] = cmd.args
        this.addStyleLayer(layer, before)
        break
      }
      case 'removeLayer': {
        const [id] = cmd.args
        this.removeStyleLayer(id)
        break
      }
      case 'setPaintProperty': {
        const [layerId, name, value] = cmd.args
        this._style?.setPaintProperty(layerId, name, value)
        break
      }
      case 'setLayoutProperty': {
        const [layerId, name, value] = cmd.args
        this._style?.setLayoutProperty(layerId, name, value)
        break
      }
      case 'setFilter': {
        const [layerId, filter] = cmd.args
        this._style?.setFilter(layerId, filter)
        break
      }
      case 'setLayerZoomRange': {
        const [layerId, minzoom, maxzoom] = cmd.args
        this._style?.setLayerZoomRange(layerId, minzoom, maxzoom)
        break
      }
      // Other commands are no-ops for now.
    }
  }

  /**
  * Sets (or clears) the atmospheric fog. Pass `null` to disable. The options
  * object is stored verbatim and is ignored by the Canvas2D renderer — the
  * WebGL renderer reads it from `getFog()` when assembling frame uniforms.
  * Fires a `fogchange` event.
  *
  * Throws `RangeError` when `range[0] >= range[1]` or when `star-intensity`
  * is negative.
  */
  setFog(fog: FogOptions | null): this {
    if (fog !== null) {
      if (fog.range !== undefined) {
        const [start, end] = fog.range
        if (!(start < end))
          throw new RangeError(`setFog: range[0] (${start}) must be < range[1] (${end}).`)
      }
      if (fog['star-intensity'] !== undefined && fog['star-intensity'] < 0)
        throw new RangeError(`setFog: star-intensity must be >= 0 (got ${fog['star-intensity']}).`)
    }
    this._fog = fog === null ? null : { ...fog }
    this._updateAtmosphereOverlay()
    this.fire('fogchange', { fog: this._fog })
    return this
  }

  /** Returns the stored fog options, or `null` when fog is disabled/unset. */
  getFog(): FogOptions | null {
    return this._fog ?? null
  }

  /**
  * Sets (or clears) the sky layer. Pass `null` to disable. `fog-ground-blend`
  * and `sun-intensity` are clamped into `[0, 1]`; `NaN` anywhere in the
  * options throws `RangeError`. Fires a `skychange` event.
  */
  setSky(sky: SkyOptions | null): this {
    if (sky !== null) {
      const numericFields: (keyof SkyOptions)[] = ['fog-ground-blend', 'sun-intensity']
      for (const key of numericFields) {
        const value = sky[key] as number | undefined
        if (value !== undefined && Number.isNaN(value))
          throw new RangeError(`setSky: ${key} is NaN.`)
      }
      if (sky['sun-position'] !== undefined) {
        const [az, alt] = sky['sun-position']
        if (Number.isNaN(az) || Number.isNaN(alt))
          throw new RangeError('setSky: sun-position contains NaN.')
      }
      const normalized: SkyOptions = { ...sky }
      if (normalized['fog-ground-blend'] !== undefined)
        normalized['fog-ground-blend'] = Math.max(0, Math.min(1, normalized['fog-ground-blend']))
      if (normalized['sun-intensity'] !== undefined)
        normalized['sun-intensity'] = Math.max(0, Math.min(1, normalized['sun-intensity']))
      this._sky = normalized
    }
    else {
      this._sky = null
    }
    this._updateAtmosphereOverlay()
    this.fire('skychange', { sky: this._sky })
    return this
  }

  /** Returns the stored sky options, or `null` when the sky is disabled/unset. */
  getSky(): SkyOptions | null {
    return this._sky ?? null
  }

  /**
   * Enables 3D terrain (DEM-based mesh warping). `source` must name a
   * raster-dem source previously registered via `addSource()`.
   * `exaggeration` scales the vertical relief (default 1). Passing `null`
   * disables terrain and frees the in-memory elevation cache.
   *
   * Fires `'terrainchange'` on every call.
   */
  setTerrain(terrain: TerrainOptions | null): this {
    if (terrain !== null) {
      if (typeof terrain.source !== 'string' || terrain.source.length === 0)
        throw new TypeError('setTerrain: `source` must be a non-empty string.')
      if (terrain.exaggeration !== undefined && !Number.isFinite(terrain.exaggeration))
        throw new RangeError(`setTerrain: exaggeration must be a finite number (got ${terrain.exaggeration}).`)
      if (terrain.exaggeration !== undefined && terrain.exaggeration < 0)
        throw new RangeError(`setTerrain: exaggeration must be >= 0 (got ${terrain.exaggeration}).`)
      this._terrain = { source: terrain.source, exaggeration: terrain.exaggeration ?? 1 }
      if (!this._terrainSource)
        this._terrainSource = new TerrainSource({ exaggeration: this._terrain.exaggeration })
      else
        this._terrainSource.setExaggeration(this._terrain.exaggeration ?? 1)
    }
    else {
      this._terrain = null
      this._terrainSource?.clear()
    }
    this.fire('terrainchange', { terrain: this._terrain })
    return this
  }

  /** Returns the stored terrain options, or `null` when terrain is off. */
  getTerrain(): TerrainOptions | null {
    return this._terrain ?? null
  }

  /**
   * Returns the `TerrainSource` instance backing the current terrain
   * config, or `undefined` when terrain is off. Exposed for the renderer
   * and for callers that want to ingest DEM tiles directly (e.g. from a
   * worker decode or a pre-downloaded offline region).
   */
  getTerrainSource(): TerrainSource | undefined {
    return this._terrainSource
  }

  /**
   * Bilinear elevation query at an arbitrary lng/lat. Returns the best
   * available sample (walking up the pyramid when the preferred zoom
   * isn't loaded) or `null` when no DEM tile covers the point yet.
   * Always returns `null` when terrain is disabled.
   */
  queryTerrainElevation(lngLat: LatLng | { lng: number, lat: number }): number | null {
    if (!this._terrain || !this._terrainSource)
      return null
    const z = Math.max(0, Math.floor(this.getZoom?.() ?? 0))
    return this._terrainSource.queryElevation(lngLat.lng, lngLat.lat, z)
  }

  /**
   * Builds / updates / removes the atmosphere overlay inside the map
   * container. The overlay is a single `<div>` absolutely positioned over
   * the map pane with two stacked linear gradients — one for the sky, one
   * for the fog band around the horizon. Visibility scales with pitch, so
   * a top-down map (pitch 0) sees no overlay at all.
   */
  _updateAtmosphereOverlay(): void {
    const container = this._container
    if (!container || typeof container.appendChild !== 'function')
      return

    const hasSky = this._sky !== null && this._sky !== undefined
    const hasFog = this._fog !== null && this._fog !== undefined
    if (!hasSky && !hasFog) {
      if (this._atmosphereOverlay && this._atmosphereOverlay.parentNode)
        this._atmosphereOverlay.parentNode.removeChild(this._atmosphereOverlay)
      this._atmosphereOverlay = undefined
      return
    }

    if (!this._atmosphereOverlay) {
      const div = (container.ownerDocument ?? document).createElement('div')
      div.className = 'ts-maps-atmosphere'
      if (div.style) {
        div.style.position = 'absolute'
        div.style.inset = '0'
        div.style.pointerEvents = 'none'
        div.style.zIndex = '400'
      }
      container.appendChild(div)
      this._atmosphereOverlay = div
    }

    const pitch = this.getPitch?.() ?? 0
    // Only become visible once the camera tilts past ~5° — a top-down map
    // has no horizon to tint.
    const pitchT = Math.max(0, Math.min(1, (pitch - 5) / 55))

    const skyColor = this._sky?.['sky-color'] ?? '#87ceeb'
    const horizonColor = this._sky?.['horizon-color'] ?? '#ffffff'
    const fogColor = this._fog?.color ?? 'rgb(245, 247, 250)'
    const horizonBlend = this._fog?.['horizon-blend'] ?? 0.1

    const gradients: string[] = []
    if (hasSky) {
      gradients.push(
        `linear-gradient(to bottom, ${skyColor} 0%, ${horizonColor} 40%, transparent 60%)`,
      )
    }
    if (hasFog) {
      const band = Math.max(0.05, Math.min(0.4, horizonBlend * 2))
      const mid = 0.45
      const from = Math.max(0, mid - band / 2)
      const to = Math.min(1, mid + band / 2)
      gradients.push(
        `linear-gradient(to bottom, transparent ${(from * 100).toFixed(1)}%, ${fogColor} ${(mid * 100).toFixed(1)}%, transparent ${(to * 100).toFixed(1)}%)`,
      )
    }

    const style = this._atmosphereOverlay.style
    if (!style)
      return
    style.background = gradients.join(', ')
    style.opacity = String(pitchT.toFixed(3))
    style.display = pitchT <= 0 ? 'none' : 'block'
  }

  /**
  * Best-effort lookup for a WebGL2 context on the map's container. Custom
  * layers only need this for their `onAdd` / `onRemove` callbacks; the
  * renderer wires the per-frame `render()` call through its own GL handle.
  */
  _getCustomLayerGL(): WebGL2RenderingContext | null {
    const container = this._container
    if (!container || typeof container.querySelector !== 'function')
      return null
    const canvas = container.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas || typeof canvas.getContext !== 'function')
      return null
    try {
      return (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ?? null
    }
    catch {
      return null
    }
  }

  /**
  * Registers a custom 3D layer. `layer.onAdd` is called immediately if the
  * map already has a GL context; otherwise the call is deferred to when one
  * becomes available. Throws if `layer.id` is already registered.
  */
  addCustomLayer(layer: CustomLayerInterface): this {
    if (!this._customLayers)
      this._customLayers = new globalThis.Map()
    if (this._customLayers.has(layer.id))
      throw new Error(`addCustomLayer: a custom layer with id "${layer.id}" is already registered.`)
    this._customLayers.set(layer.id, layer)
    const gl = this._getCustomLayerGL()
    if (gl && typeof layer.onAdd === 'function')
      layer.onAdd(this, gl)
    this.fire('customlayer:add', { id: layer.id, layer })
    return this
  }

  /**
   * Convenience ingest for a single DEM tile. Decodes `pixels` (RGBA byte
   * stream, left-to-right top-to-bottom) into the configured encoding's
   * elevation grid and stores it in the backing `TerrainSource`.
   * No-op when terrain is disabled.
   */
  addTerrainTile(coord: { z: number, x: number, y: number }, pixels: Uint8Array | Uint8ClampedArray): void {
    if (!this._terrain || !this._terrainSource)
      return
    this._terrainSource.addTilePixels(coord, pixels)
  }

  /**
   * Draws the terrain mesh for a single tile coordinate into the supplied
   * GL renderer as the underlay for the regular tile content. Called by
   * `VectorTileMapLayer._drawTile` during the WebGL path; no-op when
   * terrain is off or the DEM tile isn't loaded yet.
   */
  _drawTerrainForTile(glRenderer: WebGLTileRenderer, coord: { z: number, x: number, y: number }, tileSize: number, projectionMatrix: Float32Array): void {
    if (!this._terrain || !this._terrainSource)
      return
    const src = this._terrainSource
    if (!src.hasTile(coord))
      return
    const elev = src.getTile(coord)
    if (!elev)
      return
    const mesh = buildTerrainMesh({
      elevation: elev,
      demSize: src.demSize,
      tileSize,
      resolution: src.meshResolution,
      exaggeration: src.exaggeration,
      // Metres → tile units. Holding this small keeps z well-inside the
      // orthographic frustum so mountain peaks don't clip.
      unitsPerMeter: 0.001,
    })
    glRenderer.drawTerrain(mesh.positions, mesh.indices, [0.78, 0.80, 0.75, 1], 1, projectionMatrix)
  }

  /**
   * Invokes `render(gl, projectionMatrix)` on every registered custom layer
   * in insertion order. Called by WebGL-backed tile layers after drawing
   * their own content so custom GL code can composite on top. Errors from
   * individual layers are trapped so one broken layer doesn't stop the
   * others from rendering.
   */
  _invokeCustomLayerRender(gl: WebGL2RenderingContext, projectionMatrix: Float32Array): void {
    if (!this._customLayers || this._customLayers.size === 0)
      return
    for (const layer of this._customLayers.values()) {
      try {
        layer.render(gl, projectionMatrix)
      }
      catch (err) {
        console.warn(`[ts-maps] custom layer "${layer.id}" threw during render:`, err)
      }
    }
  }

  /** Removes a custom 3D layer by id. No-op for unknown ids. */
  removeCustomLayer(id: string): this {
    const layer = this._customLayers?.get(id)
    if (!layer)
      return this
    const gl = this._getCustomLayerGL()
    if (gl && typeof layer.onRemove === 'function')
      layer.onRemove(this, gl)
    this._customLayers!.delete(id)
    this.fire('customlayer:remove', { id, layer })
    return this
  }

  /** Returns the custom layer registered under `id`, or `undefined`. */
  getCustomLayer(id: string): CustomLayerInterface | undefined {
    return this._customLayers?.get(id)
  }

  /** Returns the list of registered custom layers in insertion order. */
  getCustomLayers(): CustomLayerInterface[] {
    return this._customLayers ? Array.from(this._customLayers.values()) : []
  }

  // Lazy offline-region facade. Delegates to the shared `TileCache` unless the
  // caller supplies their own via `OfflineRegionOptions.cache`. Progress
  // updates are fired as `offline:progress` events on the map.
  get offline(): {
    save: (opts: OfflineRegionOptions) => Promise<OfflineRegionResult>
    size: () => Promise<{ bytes: number, entries: number }>
    clear: () => Promise<void>
  } {
    if (!this._offlineApi) {
      const self = this
      this._offlineApi = {
        save(opts: OfflineRegionOptions): Promise<OfflineRegionResult> {
          return saveOfflineRegion(opts, self)
        },
        async size(): Promise<{ bytes: number, entries: number }> {
          return (getDefaultCache()).size()
        },
        async clear(): Promise<void> {
          await (getDefaultCache()).clear()
        },
      }
    }
    return this._offlineApi
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
