import Browser from '../../core/Browser'
import * as DomEvent from '../../dom/DomEvent'
import * as PointerEvents from '../../dom/DomEvent.PointerEvents'
import { Handler } from '../../core/Handler'
import { Point } from '../../geometry/Point'
import { TsMap } from '../Map'

const tapHoldDelay = 600

TsMap.mergeOptions( {
  tapHold: Browser.safari && Browser.mobile,
  tapTolerance: 15,
})

export class TapHoldHandler extends Handler {
  declare _holdTimeout?: ReturnType<typeof setTimeout>
  declare _startPos?: Point
  declare _newPos?: Point

  addHooks(): void {
    DomEvent.on(this._map._container, 'pointerdown', this._onDown, this)
  }

  removeHooks(): void {
    DomEvent.off(this._map._container, 'pointerdown', this._onDown, this)
    clearTimeout(this._holdTimeout as any)
  }

  _onDown(e: PointerEvent): void {
    clearTimeout(this._holdTimeout as any)
    if (PointerEvents.getPointers().length !== 1 || e.pointerType === 'mouse')
    return
    const el = this._map._container
    this._startPos = this._newPos = new Point(e.clientX, e.clientY)

    this._holdTimeout = setTimeout(() => {
      this._cancel()
      if (!this._isTapValid())
      return
      DomEvent.on(el, 'pointerup', DomEvent.preventDefault)
      DomEvent.on(el, 'pointerup pointercancel', this._cancelClickPrevent, this)
      this._simulateEvent('contextmenu', e)
    }, tapHoldDelay)

    DomEvent.on(el, 'pointerup pointercancel contextmenu', this._cancel, this)
    DomEvent.on(el, 'pointermove', this._onMove, this)
  }

  _cancelClickPrevent(): void {
    const el = this._map._container
    DomEvent.off(el, 'pointerup', DomEvent.preventDefault)
    DomEvent.off(el, 'pointerup pointercancel', this._cancelClickPrevent, this)
  }

  _cancel(): void {
    clearTimeout(this._holdTimeout as any)
    const el = this._map._container
    DomEvent.off(el, 'pointerup pointercancel contextmenu', this._cancel, this)
    DomEvent.off(el, 'pointermove', this._onMove, this)
  }

  _onMove(e: PointerEvent): void {
    this._newPos = new Point(e.clientX, e.clientY)
  }

  _isTapValid(): boolean {
    return (this._newPos as Point).distanceTo(this._startPos as Point) <= this._map.options.tapTolerance
  }

  _simulateEvent(type: string, e: PointerEvent): void {
    const simulatedEvent: any = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      screenX: e.screenX,
      screenY: e.screenY,
      clientX: e.clientX,
      clientY: e.clientY,
    })
    simulatedEvent._simulated = true
    ; (e.target as Element).dispatchEvent(simulatedEvent)
  }
}

TsMap.addInitHook('addHandler', 'tapHold', TapHoldHandler)
