import * as DomEvent from '../../dom/DomEvent'
import * as PointerEvents from '../../dom/DomEvent.PointerEvents'
import { Handler } from '../../core/Handler'
import { TsMap } from '../Map'

TsMap.mergeOptions({ touchRotate: true })

// Rotates the map's bearing by the angular delta of a two-finger twist gesture.
// Shares the pointerdown channel with PinchZoomHandler; both apply their
// respective deltas in the same frame.
export class TwoFingerRotateHandler extends Handler {
  _rotating = false
  _moved = false
  declare _startAngle: number
  declare _startBearing: number
  declare _pivot: { x: number, y: number }
  declare _animRequest?: number

  addHooks(): void {
    DomEvent.on(this._map._container, 'pointerdown', this._onPointerStart, this)
  }

  removeHooks(): void {
    DomEvent.off(this._map._container, 'pointerdown', this._onPointerStart, this)
  }

  _onPointerStart(_e: PointerEvent): void {
    const pointers = PointerEvents.getPointers()
    if (pointers.length !== 2 || this._rotating)
      return

    const map = this._map
    const p1 = map.pointerEventToContainerPoint(pointers[0])
    const p2 = map.pointerEventToContainerPoint(pointers[1])

    this._startAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    this._startBearing = map.getBearing()

    // Pivot: map center for 'center', otherwise midpoint between the two fingers.
    if (map.options.touchRotate === 'center') {
      const size = map.getSize()
      this._pivot = { x: size.x / 2, y: size.y / 2 }
    }
    else {
      this._pivot = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    }

    this._rotating = true
    this._moved = false

    DomEvent.on(this._map._container, 'pointermove', this._onPointerMove, this)
    DomEvent.on(this._map._container, 'pointerup pointercancel', this._onPointerEnd, this)
  }

  _onPointerMove(e: PointerEvent): void {
    const pointers = PointerEvents.getPointers()
    if (pointers.length !== 2 || !this._rotating)
      return

    const map = this._map
    const p1 = map.pointerEventToContainerPoint(pointers[0])
    const p2 = map.pointerEventToContainerPoint(pointers[1])

    const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    const deltaDeg = (currentAngle - this._startAngle) * 180 / Math.PI
    const nextBearing = this._startBearing + deltaDeg

    if (!this._moved) {
      this._moved = true
      map.fire('rotatestart')
    }

    if (this._animRequest !== undefined)
      cancelAnimationFrame(this._animRequest)

    this._animRequest = requestAnimationFrame(() => {
      map.setBearing(nextBearing)
    })

    e.preventDefault()
  }

  _onPointerEnd(): void {
    if (this._animRequest !== undefined)
      cancelAnimationFrame(this._animRequest)

    DomEvent.off(this._map._container, 'pointermove', this._onPointerMove, this)
    DomEvent.off(this._map._container, 'pointerup pointercancel', this._onPointerEnd, this)

    if (this._moved)
      this._map.fire('rotateend')

    this._rotating = false
    this._moved = false
  }
}

TsMap.addInitHook('addHandler', 'touchRotate', TwoFingerRotateHandler)
