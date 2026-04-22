import { Handler } from '../../core/Handler'
import { off, on, stop } from '../../dom/DomEvent'
import { Point } from '../../geometry/Point'
import { TsMap } from '../Map'

TsMap.mergeOptions( { keyboard: true, keyboardPanDelta: 80 })

export class KeyboardHandler extends Handler {
  static keyCodes: Record<string, string[]> = {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    down: ['ArrowDown'],
    up: ['ArrowUp'],
    zoomIn: ['Equal', 'NumpadAdd', 'BracketRight'],
    zoomOut: ['Minus', 'NumpadSubtract', 'Digit6', 'Slash'],
  }

  _panKeys: Record<string, [number, number]> = {}
  _zoomKeys: Record<string, number> = {}
  _focused = false

  initialize(map: any): void {
    super.initialize(map)
    this._setPanDelta(map.options.keyboardPanDelta)
    this._setZoomDelta(map.options.zoomDelta)
  }

  addHooks(): void {
    const container = this._map._container
    if (container.tabIndex <= 0)
    container.tabIndex = 0
    container.ariaKeyShortcuts = Object.values(KeyboardHandler.keyCodes).flat().join(' ')

    on(container, {
      focus: this._onFocus,
      blur: this._onBlur,
      pointerdown: this._onPointerDown,
    }, this)

    this._map.on( { focus: this._addHooks, blur: this._removeHooks }, this)
  }

  removeHooks(): void {
    this._removeHooks()
    off(this._map._container, {
      focus: this._onFocus,
      blur: this._onBlur,
      pointerdown: this._onPointerDown,
    }, this)
    this._map.off( { focus: this._addHooks, blur: this._removeHooks }, this)
  }

  _onPointerDown = (): void => {
    if (this._focused)
    return
    const body = document.body
    const docEl = document.documentElement
    const top = body.scrollTop || docEl.scrollTop
    const left = body.scrollLeft || docEl.scrollLeft
    this._map._container.focus()
    window.scrollTo(left, top)
  }

  _onFocus = (): void => {
    this._focused = true
    this._map.fire('focus')
  }

  _onBlur = (): void => {
    this._focused = false
    this._map.fire('blur')
  }

  _setPanDelta(panDelta: number): void {
    const keys = this._panKeys = {} as Record<string, [number, number]>
    const codes = KeyboardHandler.keyCodes
    for (const code of codes.left)
    keys[code] = [-1 * panDelta, 0]
    for (const code of codes.right)
    keys[code] = [panDelta, 0]
    for (const code of codes.down)
    keys[code] = [0, panDelta]
    for (const code of codes.up)
    keys[code] = [0, -1 * panDelta]
  }

  _setZoomDelta(zoomDelta: number): void {
    const keys = this._zoomKeys = {} as Record<string, number>
    const codes = KeyboardHandler.keyCodes
    for (const code of codes.zoomIn)
    keys[code] = zoomDelta
    for (const code of codes.zoomOut)
    keys[code] = -zoomDelta
  }

  _addHooks = (): void => {
    on(document, 'keydown', this._onKeyDown, this)
  }

  _removeHooks = (): void => {
    off(document, 'keydown', this._onKeyDown, this)
  }

  _onKeyDown = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey)
    return

    const key = e.code
    const map = this._map
    let offset: [number, number] | Point | undefined

    if (key in this._panKeys) {
      if (!map._panAnim || !map._panAnim._inProgress) {
        offset = this._panKeys[key]
        if (e.shiftKey)
        offset = new Point(offset).multiplyBy(3)
        if (map.options.maxBounds)
        offset = map._limitOffset(new Point(offset), map.options.maxBounds)
        if (map.options.worldCopyJump) {
          const newLatLng = map.wrapLatLng(map.unproject(map.project(map.getCenter()).add(offset)))
          map.panTo(newLatLng)
        }
        else {
          map.panBy(offset)
        }
      }
    }
    else if (key in this._zoomKeys) {
      map.setZoom(map.getZoom() + (e.shiftKey ? 3 : 1) * this._zoomKeys[key])
    }
    else if (key === 'Escape' && map._popup && map._popup.options.closeOnEscapeKey) {
      map.closePopup?.()
    }
    else {
      return
    }

    stop(e)
  }
}

TsMap.addInitHook('addHandler', 'keyboard', KeyboardHandler)
