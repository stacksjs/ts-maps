import type { LatLng } from '../../geo/LatLng'
import type { Point } from '../../geometry/Point'
import * as DomEvent from '../../dom/DomEvent'
import * as PointerEvents from '../../dom/DomEvent.PointerEvents'
import { Handler } from '../../core/Handler'
import { TsMap } from '../Map'

TsMap.mergeOptions( { pinchZoom: true, bounceAtZoomLimits: true })

export class PinchZoomHandler extends Handler {
  _zooming = false
  _moved = false
  declare _centerPoint?: Point
  declare _startLatLng?: LatLng
  declare _pinchStartLatLng?: LatLng
  declare _startDist?: number
  declare _startZoom?: number
  declare _zoom?: number
  declare _center?: LatLng
  declare _animRequest?: number

  addHooks(): void {
    this._map._container.classList.add('tsmap-touch-zoom')
    DomEvent.on(this._map._container, 'pointerdown', this._onPointerStart, this)
  }

  removeHooks(): void {
    this._map._container.classList.remove('tsmap-touch-zoom')
    DomEvent.off(this._map._container, 'pointerdown', this._onPointerStart, this)
  }

  _onPointerStart(e: PointerEvent): void {
    const map = this._map
    const pointers = PointerEvents.getPointers()
    if (pointers.length !== 2 || map._animatingZoom || this._zooming)
    return

    const p1 = map.pointerEventToContainerPoint(pointers[0])
    const p2 = map.pointerEventToContainerPoint(pointers[1])

    this._centerPoint = map.getSize()._divideBy(2)
    this._startLatLng = map.containerPointToLatLng(this._centerPoint)
    if (map.options.pinchZoom !== 'center')
    this._pinchStartLatLng = map.containerPointToLatLng(p1.add(p2)._divideBy(2))

    this._startDist = p1.distanceTo(p2)
    this._startZoom = map.getZoom()

    this._moved = false
    this._zooming = true

    map._stop()

    DomEvent.on(this._map._container, 'pointermove', this._onPointerMove, this)
    DomEvent.on(this._map._container, 'pointerup pointercancel', this._onPointerEnd, this)

    e.preventDefault()
  }

  _onPointerMove(e: PointerEvent): void {
    const pointers = PointerEvents.getPointers()
    if (pointers.length !== 2 || !this._zooming)
    return

    const map = this._map
    const p1 = map.pointerEventToContainerPoint(pointers[0])
    const p2 = map.pointerEventToContainerPoint(pointers[1])
    const scale = p1.distanceTo(p2) / (this._startDist as number)

    this._zoom = map.getScaleZoom(scale, this._startZoom)
    const z = this._zoom as number

    if (
    !map.options.bounceAtZoomLimits
    && ((z < map.getMinZoom() && scale < 1) || (z > map.getMaxZoom() && scale > 1))
    ) {
      this._zoom = map._limitZoom(this._zoom)
    }

    if (map.options.pinchZoom === 'center') {
      this._center = this._startLatLng
      if (scale === 1)
      return
    }
    else {
      const delta = p1._add(p2)._divideBy(2)._subtract(this._centerPoint as Point)
      if (scale === 1 && delta.x === 0 && delta.y === 0)
      return
      this._center = map.unproject(
      map.project(this._pinchStartLatLng as LatLng, this._zoom).subtract(delta),
      this._zoom,
      )
    }

    if (!this._moved) {
      map._moveStart(true, false)
      this._moved = true
    }

    if (this._animRequest !== undefined)
    cancelAnimationFrame(this._animRequest)

    const moveFn = map._move.bind(map, this._center as LatLng, this._zoom, { pinch: true, round: false }, undefined)
    this._animRequest = requestAnimationFrame(moveFn.bind(this))

    e.preventDefault()
  }

  _onPointerEnd(): void {
    if (!this._moved || !this._zooming) {
      this._zooming = false
      return
    }
    this._zooming = false
    if (this._animRequest !== undefined)
    cancelAnimationFrame(this._animRequest)

    DomEvent.off(this._map._container, 'pointermove', this._onPointerMove, this)
    DomEvent.off(this._map._container, 'pointerup pointercancel', this._onPointerEnd, this)

    if (this._map.options.zoomAnimation) {
      this._map._animateZoom(
      this._center as LatLng,
      this._map._limitZoom(this._zoom as number),
      true,
      this._map.options.zoomSnap,
      )
    }
    else {
      this._map._resetView(this._center as LatLng, this._map._limitZoom(this._zoom as number))
    }
  }
}

TsMap.addInitHook('addHandler', 'pinchZoom', PinchZoomHandler)

TsMap.addInitHook(function (this: any) {
  this.touchZoom = this.pinchZoom
  if (this.options.touchZoom !== undefined) {
    // eslint-disable-next-line no-console
    console.warn('Map: touchZoom option is deprecated and will be removed in future versions. Use pinchZoom instead.')
    this.options.pinchZoom = this.options.touchZoom
    delete this.options.touchZoom
  }
  if (this.options.pinchZoom)
  this.pinchZoom.enable()
  else
  this.pinchZoom.disable()
})
