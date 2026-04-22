import * as Util from '../core/Util'
import * as DomEvent from './DomEvent'
import * as PointerEvents from './DomEvent.PointerEvents'
import * as DomUtil from './DomUtil'
import { Evented } from '../core/Events'
import { Point } from '../geometry/Point'

export class Draggable extends Evented {
  static _dragging: Draggable | false = false

  declare _element: HTMLElement
  declare _dragStartTarget: HTMLElement
  declare _preventOutline?: boolean
  declare _enabled?: boolean
  declare _moved?: boolean
  declare _moving?: boolean
  declare _startPoint?: Point
  declare _startPos?: Point
  declare _newPos?: Point
  declare _lastEvent?: PointerEvent
  declare _lastTarget?: HTMLElement | null
  declare _parentScale?: DomUtil.ScaleInfo

  initialize(element: HTMLElement, dragStartTarget?: HTMLElement, preventOutline?: boolean, options?: any): void {
    Util.setOptions(this as any, options)
    this._element = element
    this._dragStartTarget = dragStartTarget ?? element
    this._preventOutline = preventOutline
  }

  enable(): this {
    if (this._enabled)
    return this
    DomEvent.on(this._dragStartTarget, 'pointerdown', this._onDown, this)
    this._enabled = true
    return this
  }

  disable(): this {
    if (!this._enabled)
    return this

    if (Draggable._dragging === this)
    this.finishDrag(true)

    DomEvent.off(this._dragStartTarget, 'pointerdown', this._onDown, this)
    this._enabled = false
    this._moved = false
    return this
  }

  _onDown(e: PointerEvent): void {
    this._moved = false

    if (this._element.classList.contains('tsmap-zoom-anim'))
    return

    if (PointerEvents.getPointers().length !== 1) {
      if (Draggable._dragging === this)
      this.finishDrag()
      return
    }

    if (Draggable._dragging || e.shiftKey || (e.button !== 0 && e.pointerType !== 'touch'))
    return
    Draggable._dragging = this

    if (this._preventOutline)
    DomUtil.preventOutline(this._element)

    DomUtil.disableImageDrag()
    DomUtil.disableTextSelection()

    if (this._moving)
    return

    this.fire('down')

    const sizedParent = DomUtil.getSizedParentNode(this._element)

    this._startPoint = new Point(e.clientX, e.clientY)
    this._startPos = DomUtil.getPosition(this._element)
    this._parentScale = DomUtil.getScale(sizedParent)

    DomEvent.on(this._dragStartTarget, 'pointermove', this._onMove, this)
    DomEvent.on(this._dragStartTarget, 'pointerup pointercancel', this._onUp, this)
  }

  _onMove(e: PointerEvent): void {
    if (PointerEvents.getPointers().length > 1) {
      this._moved = true
      return
    }

    const offset = new Point(e.clientX, e.clientY)._subtract(this._startPoint as Point)

    if (!offset.x && !offset.y)
    return
    if (Math.abs(offset.x) + Math.abs(offset.y) < this.options!.clickTolerance)
    return

    offset.x /= (this._parentScale as DomUtil.ScaleInfo).x
    offset.y /= (this._parentScale as DomUtil.ScaleInfo).y

    if (e.cancelable)
    e.preventDefault()

    if (!this._moved) {
      this.fire('dragstart')
      this._moved = true
      this._element.ownerDocument.body.classList.add('tsmap-dragging')
      this._lastTarget = (e.target ?? (e as any).srcElement) as HTMLElement
      this._lastTarget.classList.add('tsmap-drag-target')
    }

    this._newPos = (this._startPos as Point).add(offset)
    this._moving = true
    this._lastEvent = e
    this._updatePosition()
  }

  _updatePosition(): void {
    const e = { originalEvent: this._lastEvent }
    this.fire('predrag', e)
    DomUtil.setPosition(this._element, this._newPos as Point)
    this.fire('drag', e)
  }

  _onUp(): void {
    this.finishDrag()
  }

  finishDrag(noInertia?: boolean): void {
    this._element.ownerDocument.body.classList.remove('tsmap-dragging')

    if (this._lastTarget) {
      this._lastTarget.classList.remove('tsmap-drag-target')
      this._lastTarget = null
    }

    DomEvent.off(this._dragStartTarget, 'pointermove', this._onMove, this)
    DomEvent.off(this._dragStartTarget, 'pointerup pointercancel', this._onUp, this)

    DomUtil.enableImageDrag()
    DomUtil.enableTextSelection()

    const fireDragend = this._moved && this._moving

    this._moving = false
    Draggable._dragging = false

    if (fireDragend) {
      this.fire('dragend', {
        noInertia,
        distance: (this._newPos as Point).distanceTo(this._startPos as Point),
      })
    }
  }
}

Draggable.setDefaultOptions( { clickTolerance: 3 })
