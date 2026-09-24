import * as Util from '../core/Util'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { Bounds } from '../geometry/Bounds'
import { Point } from '../geometry/Point'
import { Layer } from './Layer'

export class BlanketOverlay extends Layer {
  declare _container?: HTMLElement
  declare _bounds?: Bounds
  declare _center?: any
  declare _zoom?: number
  /** World pixels, at `_zoom`, of the blanket's top-left corner. */
  declare _topLeftWorld?: Point
  /** The pixel origin the blanket's content was projected against. */
  declare _origin?: Point
  /** The camera the blanket was last laid out for. */
  declare _bearing?: number
  declare _pitch?: number

  initialize(options?: any): void {
    Util.setOptions(this as any, options)
  }

  onAdd(_map?: any): void {
    if (!this._container) {
      this._initContainer()
      this._container!.classList.add('tsmap-zoom-animated')
    }
    this.getPane().appendChild(this._container!)
    this._resizeContainer()
    this._onMoveEnd()
  }

  onRemove(_map?: any): void {
    this._destroyContainer()
  }

  getEvents(): Record<string, any> {
    const events: Record<string, any> = {
      viewreset: this._reset,
      zoom: this._onZoom,
      moveend: this._onMoveEnd,
      resize: this._resizeContainer,
      zoomend: this._onZoomEnd,
    }
    if (this._zoomAnimated)
    events.zoomanim = this._onAnimZoom
    if (this.options!.continuous)
    events.move = this._onMoveEnd
    return events
  }

  _onAnimZoom(ev: any): void {
    this._updateTransform(ev.center, ev.zoom)
  }

  _onZoom(): void {
    const map = this._map
    const center = map.getCenter()
    const zoom = map.getZoom()
    // A camera that never stops — the navigation camera, a long flight —
    // never sends `moveend`, and without one the blanket is a picture of an
    // old view stretched over the new one: blurred, the wrong way round, and
    // cut off where the old view ended. Redraw once it has drifted too far.
    if (this._stale(center, zoom)) {
      this._onMoveEnd()
      return
    }
    this._updateTransform(center, zoom)
  }

  _stale(center: any, zoom: number): boolean {
    if (this._zoom === undefined || !this._center)
      return false
    const map = this._map
    if (Math.abs(zoom - this._zoom) > 0.4)
      return true
    if (Math.abs(((map._bearing ?? 0) - (this._bearing ?? 0) + 540) % 360 - 180) > 8 || Math.abs((map._pitch ?? 0) - (this._pitch ?? 0)) > 4)
      return true
    const size = map.getSize()
    const moved = map.project(center, zoom).distanceTo(map.project(this._center, zoom))
    return moved > Math.min(size.x, size.y) * this.options!.padding * 0.8
  }

  _updateTransform(center: any, zoom: number): void {
    const scale = this._map.getZoomScale(zoom, this._zoom as number)
    const topLeftOffset = (this._topLeftWorld as Point).multiplyBy(scale)
      ._subtract(this._map._getNewPixelOrigin(center, zoom))._round()

    DomUtil.setTransform(this._container as HTMLElement, topLeftOffset, scale)
  }

  /**
   * The layer-pixel rectangle the blanket covers: the view and its padding.
   *
   * On a flat north-up map that is the view's own rectangle. Turned or tilted,
   * the view sees a different shape of ground — the corners of a turned view
   * reach past it, and the top of a tilted one far beyond — so the blanket
   * covers the ground the padded corners actually see, stopping short of the
   * horizon and capped, so a steep view does not ask for an enormous canvas.
   */
  _layout(): Bounds {
    const map = this._map
    const p = this.options!.padding
    const size = map.getSize()
    if (!map._bearing && !map._pitch) {
      const min = map.containerPointToLayerPoint(size.multiplyBy(-p)).round() as Point
      return new Bounds(min, min.add(size.multiplyBy(1 + p * 2)).round())
    }
    const corners = [
      new Point(-p * size.x, -p * size.y),
      new Point((1 + p) * size.x, -p * size.y),
      new Point((1 + p) * size.x, (1 + p) * size.y),
      new Point(-p * size.x, (1 + p) * size.y),
    ].map(c => map.containerPointToLayerPoint(map._clampToGround ? map._clampToGround(c, 1 / 8) : c))
    const center = map.containerPointToLayerPoint(size.divideBy(2))
    const limit = new Point(Math.min(size.x * 3, 4096), Math.min(size.y * 3, 4096))
    let min = new Point(Infinity, Infinity)
    let max = new Point(-Infinity, -Infinity)
    for (const c of corners) {
      min = new Point(Math.min(min.x, c.x), Math.min(min.y, c.y))
      max = new Point(Math.max(max.x, c.x), Math.max(max.y, c.y))
    }
    // Capped around the view's centre, which is where the eye is.
    min = new Point(Math.max(min.x, center.x - limit.x / 2), Math.max(min.y, center.y - limit.y / 2))
    max = new Point(Math.min(max.x, center.x + limit.x / 2), Math.min(max.y, center.y + limit.y / 2))
    return new Bounds(min.round(), max.round())
  }

  /** The blanket's size in pixels, once laid out. */
  _blanketSize(): Point {
    if (this._bounds)
      return this._bounds.getSize().round()
    return this._map.getSize().multiplyBy(1 + this.options!.padding * 2).round()
  }

  _onMoveEnd(ev?: any): void {
    const map = this._map
    const previous = this._bounds?.getSize()
    // What a renderer holds is in layer pixels, which are relative to the
    // pixel origin. That used to move only at the end of a zoom; a pan that
    // moves the centre instead of the pane — `jumpTo`, `easeTo`, any pan of a
    // tilted map, the navigation camera — moves it too, and paths projected
    // against the old origin would be drawn off to one side.
    if (this._topLeftWorld && (map.getZoom() !== this._zoom || !map.getPixelOrigin().equals(this._origin)))
      this._onZoomEnd()
    this._origin = map.getPixelOrigin()
    this._bounds = this._layout()
    this._center = map.getCenter()
    this._zoom = map.getZoom()
    this._bearing = map._bearing ?? 0
    this._pitch = map._pitch ?? 0
    this._topLeftWorld = this._bounds.min.add(map.getPixelOrigin())
    if (!previous || !previous.equals(this._bounds.getSize()))
      this._resizeContainer()
    this._updateTransform(this._center, this._zoom as number)
    this._onSettled(ev)
  }

  _reset(): void {
    this._onSettled()
    this._updateTransform(this._center, this._zoom as number)
    this._onViewReset()
  }

  _initContainer(): void {
    this._container = DomUtil.create('div')
  }

  _destroyContainer(): void {
    DomEvent.off(this._container!)
    this._container!.remove()
    delete this._container
  }

  _resizeContainer(): Point {
    const size = this._blanketSize()
    this._container!.style.width = `${size.x}px`
    this._container!.style.height = `${size.y}px`
    return size
  }

  _onZoomEnd(): void {}
  _onViewReset(): void {}
  _onSettled(_ev?: any): void {}
}

BlanketOverlay.setDefaultOptions( { padding: 0.1, continuous: false })
