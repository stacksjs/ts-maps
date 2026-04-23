import * as DomEvent from '../../dom/DomEvent'
import * as PointerEvents from '../../dom/DomEvent.PointerEvents'
import { Handler } from '../../core/Handler'
import { TsMap } from '../Map'

TsMap.mergeOptions({ touchPitch: true })

// Two-finger parallel-vertical drag tilts the map. Disambiguated from
// rotate + zoom via simple thresholds: large |Δangle| → rotate, large
// |Δdistance| → zoom, otherwise if both fingers move together vertically
// we treat it as pitch.
export class TwoFingerPitchHandler extends Handler {
  _pitching = false
  _moved = false
  declare _startY1: number
  declare _startY2: number
  declare _startX1: number
  declare _startX2: number
  declare _startPitch: number
  declare _startDist: number
  declare _animRequest?: number

  addHooks(): void {
    DomEvent.on(this._map._container, 'pointerdown', this._onPointerStart, this)
  }

  removeHooks(): void {
    DomEvent.off(this._map._container, 'pointerdown', this._onPointerStart, this)
  }

  _onPointerStart(_e: PointerEvent): void {
    const pointers = PointerEvents.getPointers()
    if (pointers.length !== 2 || this._pitching)
      return

    const map = this._map
    const p1 = map.pointerEventToContainerPoint(pointers[0])
    const p2 = map.pointerEventToContainerPoint(pointers[1])

    this._startX1 = p1.x
    this._startY1 = p1.y
    this._startX2 = p2.x
    this._startY2 = p2.y
    this._startPitch = map.getPitch()
    this._startDist = p1.distanceTo(p2)

    this._pitching = true
    this._moved = false

    DomEvent.on(this._map._container, 'pointermove', this._onPointerMove, this)
    DomEvent.on(this._map._container, 'pointerup pointercancel', this._onPointerEnd, this)
  }

  _onPointerMove(e: PointerEvent): void {
    const pointers = PointerEvents.getPointers()
    if (pointers.length !== 2 || !this._pitching)
      return

    const map = this._map
    const p1 = map.pointerEventToContainerPoint(pointers[0])
    const p2 = map.pointerEventToContainerPoint(pointers[1])

    const dy1 = p1.y - this._startY1
    const dy2 = p2.y - this._startY2
    const dx1 = p1.x - this._startX1
    const dx2 = p2.x - this._startX2

    // Heuristic thresholds — keep the gesture decisive.
    // If fingers moved in opposite vertical directions, bail (likely rotate).
    if (Math.sign(dy1) !== Math.sign(dy2) && Math.abs(dy1) > 5 && Math.abs(dy2) > 5)
      return

    // If the total horizontal motion dwarfs vertical, bail (likely rotate/zoom).
    const meanDy = (dy1 + dy2) / 2
    const meanDx = (dx1 + dx2) / 2
    if (Math.abs(meanDx) > Math.abs(meanDy) * 1.5)
      return

    // If the pair-distance changed much, bail (pinch-zoom territory).
    const nowDist = p1.distanceTo(p2)
    const distRatio = nowDist / this._startDist
    if (Math.abs(distRatio - 1) > 0.1)
      return

    if (!this._moved && Math.abs(meanDy) < 5)
      return

    if (!this._moved) {
      this._moved = true
      map.fire('pitchstart')
    }

    // Upward drag (negative meanDy in screen coords) increases pitch.
    const nextPitch = this._startPitch - meanDy * 0.3

    if (this._animRequest !== undefined)
      cancelAnimationFrame(this._animRequest)

    this._animRequest = requestAnimationFrame(() => {
      map.setPitch(nextPitch)
    })

    e.preventDefault()
  }

  _onPointerEnd(): void {
    if (this._animRequest !== undefined)
      cancelAnimationFrame(this._animRequest)

    DomEvent.off(this._map._container, 'pointermove', this._onPointerMove, this)
    DomEvent.off(this._map._container, 'pointerup pointercancel', this._onPointerEnd, this)

    if (this._moved)
      this._map.fire('pitchend')

    this._pitching = false
    this._moved = false
  }
}

TsMap.addInitHook('addHandler', 'touchPitch', TwoFingerPitchHandler)
