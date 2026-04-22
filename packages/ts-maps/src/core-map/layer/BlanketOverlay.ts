import type { Point } from '../geometry/Point'
import * as Util from '../core/Util'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { Bounds } from '../geometry/Bounds'
import { Layer } from './Layer'

export class BlanketOverlay extends Layer {
  declare _container?: HTMLElement
  declare _bounds?: Bounds
  declare _center?: any
  declare _zoom?: number

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
    this._updateTransform(this._map.getCenter(), this._map.getZoom())
  }

  _updateTransform(center: any, zoom: number): void {
    const scale = this._map.getZoomScale(zoom, this._zoom as number)
    const viewHalf = this._map.getSize().multiplyBy(0.5 + this.options!.padding)
    const currentCenterPoint = this._map.project(this._center, zoom)
    const topLeftOffset = viewHalf.multiplyBy(-scale)._add(currentCenterPoint)
    ._subtract(this._map._getNewPixelOrigin(center, zoom))._round()

    DomUtil.setTransform(this._container as HTMLElement, topLeftOffset, scale)
  }

  _onMoveEnd(ev?: any): void {
    const p = this.options!.padding
    const size = this._map.getSize()
    const min = this._map.containerPointToLayerPoint(size.multiplyBy(-p)).round() as Point

    this._bounds = new Bounds(min, min.add(size.multiplyBy(1 + p * 2)).round())
    this._center = this._map.getCenter()
    this._zoom = this._map.getZoom()
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
    const p = this.options!.padding
    const size = this._map.getSize().multiplyBy(1 + p * 2).round()
    this._container!.style.width = `${size.x}px`
    this._container!.style.height = `${size.y}px`
    return size
  }

  _onZoomEnd(): void {}
  _onViewReset(): void {}
  _onSettled(_ev?: any): void {}
}

BlanketOverlay.setDefaultOptions( { padding: 0.1, continuous: false })
