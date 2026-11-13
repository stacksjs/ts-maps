import * as DomEvent from '../../dom/DomEvent'
import * as PointerEvents from '../../dom/DomEvent.PointerEvents'
import { Handler } from '../../core/Handler'
import { Draggable } from '../../dom/Draggable'
import { Map } from '../Map'

Map.mergeOptions({
  dragRotate: true,
  pitchWithRotate: true,
})

/** Degrees of bearing per pixel dragged sideways. */
const BEARING_PER_PIXEL = 0.3
/** Degrees of pitch per pixel dragged up or down. */
const PITCH_PER_PIXEL = 0.25
/** Pixels the pointer may wander before a press becomes a drag (as `Draggable`). */
const CLICK_TOLERANCE = 3
/** How long after a right-drag the browser's trailing `contextmenu` is still its own. */
const CONTEXT_MENU_GRACE = 500

// Turns and tilts the map with a mouse: drag with the right button, or with
// the left button while Alt (Option) is held. Sideways movement changes the
// bearing, vertical movement the pitch (unless `pitchWithRotate` is off).
// The mouse's counterpart to TwoFingerRotateHandler and TwoFingerPitchHandler.
//
// Ctrl + left-drag, the other Mapbox binding, is left out: macOS delivers
// ctrl+click as a context-menu click, so Alt is the modifier that works
// everywhere.
export class DragRotateHandler extends Handler {
  _active = false
  _moved = false
  _rotated = false
  _pitched = false
  declare _pointerId: number
  declare _button: number
  declare _startX: number
  declare _startY: number
  declare _startBearing: number
  declare _startPitch: number
  /** A `contextmenu` that arrived mid-press, kept until it is known to be a click. */
  declare _heldContextMenu?: Event
  _sawContextMenu = false
  _swallowContextMenuUntil = 0

  addHooks(): void {
    DomEvent.on(this._map._container, 'pointerdown', this._onPointerDown, this)
    DomEvent.on(this._map._container, 'contextmenu', this._onContextMenu, this)
  }

  removeHooks(): void {
    if (this._active)
      this._finish(false)
    DomEvent.off(this._map._container, 'pointerdown', this._onPointerDown, this)
    DomEvent.off(this._map._container, 'contextmenu', this._onContextMenu, this)
    this._moved = false
    this._swallowContextMenuUntil = 0
  }

  /** Whether the last press turned into a rotation (so its `click` is not one). */
  moved(): boolean {
    return this._moved
  }

  /**
   * Whether this press is the rotate gesture: a mouse's right button, or its
   * left button with Alt held. Shift + left stays box zoom's. The pan handler
   * asks, so the same drag never pans as well.
   */
  claims(e: PointerEvent): boolean {
    if (!this._enabled || e.pointerType !== 'mouse')
      return false
    return e.button === 2 || (e.button === 0 && e.altKey && !e.shiftKey)
  }

  _onPointerDown(e: PointerEvent): void {
    if (this._active)
      return

    this._moved = false
    this._swallowContextMenuUntil = 0

    // A marker (or anything else draggable) under the pointer has the drag.
    if (!this.claims(e) || Draggable._dragging || PointerEvents.getPointers().length > 1)
      return

    const map = this._map
    this._active = true
    this._rotated = false
    this._pitched = false
    this._sawContextMenu = false
    this._heldContextMenu = undefined
    this._pointerId = e.pointerId
    this._button = e.button
    this._startX = e.clientX
    this._startY = e.clientY
    this._startBearing = map.getBearing()
    this._startPitch = map.getPitch()

    if (e.cancelable)
      e.preventDefault()

    // Keep the drag when the pointer leaves the map: without the capture a
    // release outside it never arrives, and the map goes on turning.
    try {
      map._container.setPointerCapture?.(e.pointerId)
    }
    catch {
      // Not a pointer the browser is tracking (a synthetic event).
    }

    DomEvent.on(map._container, 'pointermove', this._onPointerMove, this)
    DomEvent.on(map._container, 'pointerup pointercancel', this._onPointerUp, this)
  }

  _onPointerMove(e: PointerEvent): void {
    if (!this._active || e.pointerId !== this._pointerId)
      return

    const map = this._map
    const dx = e.clientX - this._startX
    const dy = e.clientY - this._startY

    if (!this._moved) {
      if (Math.abs(dx) + Math.abs(dy) < CLICK_TOLERANCE)
        return
      this._moved = true
      map._stop()
      map.fire('movestart')
    }

    if (e.cancelable)
      e.preventDefault()

    const bearing = (((this._startBearing + dx * BEARING_PER_PIXEL) % 360) + 360) % 360
    // Dragging up tilts the camera further over, as the two-finger gesture does.
    const pitch = map.options.pitchWithRotate === false
      ? map._pitch
      : map._clampPitch(this._startPitch - dy * PITCH_PER_PIXEL)

    const bearingChanged = bearing !== map._bearing
    const pitchChanged = pitch !== map._pitch
    if (!bearingChanged && !pitchChanged)
      return

    if (bearingChanged && !this._rotated) {
      this._rotated = true
      map.fire('rotatestart', { bearing: map._bearing })
    }
    if (pitchChanged && !this._pitched) {
      this._pitched = true
      map.fire('pitchstart', { pitch: map._pitch })
    }

    map._bearing = bearing
    map._pitch = pitch
    map._applyCameraTransform()

    if (bearingChanged)
      map.fire('rotate', { bearing })
    if (pitchChanged)
      map.fire('pitch', { pitch })
    map.fire('move', { originalEvent: e })
  }

  _onPointerUp(e: PointerEvent): void {
    if (!this._active || e.pointerId !== this._pointerId)
      return
    this._finish(e.type !== 'pointercancel')
  }

  _finish(completed: boolean): void {
    const map = this._map
    DomEvent.off(map._container, 'pointermove', this._onPointerMove, this)
    DomEvent.off(map._container, 'pointerup pointercancel', this._onPointerUp, this)
    this._active = false
    try {
      map._container.releasePointerCapture?.(this._pointerId)
    }
    catch {
      // Already released, or never captured.
    }

    const held = this._heldContextMenu
    this._heldContextMenu = undefined

    if (!this._moved) {
      // A right click after all: hand on the `contextmenu` that was kept back.
      if (held && completed)
        map._fireDOMEvent(held, 'contextmenu')
      return
    }

    // Where the menu follows the button's release (Windows, Linux), the
    // `contextmenu` for this drag is still to come.
    if (this._button === 2 && !this._sawContextMenu)
      this._swallowContextMenuUntil = Date.now() + CONTEXT_MENU_GRACE

    // The order `easeTo` ends in.
    map.fire('moveend')
    if (this._rotated)
      map.fire('rotateend', { bearing: map._bearing })
    if (this._pitched)
      map.fire('pitchend', { pitch: map._pitch })
  }

  /** While enabled, the right button turns the map; it does not open the browser's menu. */
  _onContextMenu(e: Event): void {
    e.preventDefault()
  }

  /**
   * Asked by the map before it fires `contextmenu`. `true` keeps the event
   * from listeners: for now while a press is still undecided (macOS sends
   * `contextmenu` on the way down; it is fired on release if nothing moved),
   * and for good when it belongs to a drag that turned the map.
   */
  _interceptContextMenu(e: Event): boolean {
    if (!this._enabled)
      return false

    if (this._active) {
      this._sawContextMenu = true
      if (!this._moved)
        this._heldContextMenu = e
      return true
    }

    if (this._swallowContextMenuUntil) {
      const swallow = Date.now() <= this._swallowContextMenuUntil
      this._swallowContextMenuUntil = 0
      return swallow
    }

    return false
  }
}

Map.addInitHook('addHandler', 'dragRotate', DragRotateHandler)
