import type { Point } from '../../geometry/Point'
import * as DomEvent from '../../dom/DomEvent'
import * as DomUtil from '../../dom/DomUtil'
import { Handler } from '../../core/Handler'
import { LatLngBounds } from '../../geo/LatLngBounds'
import { Bounds } from '../../geometry/Bounds'
import { TsMap } from '../Map'

TsMap.mergeOptions( { boxZoom: true })

export class BoxZoomHandler extends Handler {
  declare _container: HTMLElement
  declare _pane: HTMLElement
  _resetStateTimeout: any = 0
  _moved = false
  declare _box?: HTMLElement
  declare _startPoint?: Point
  declare _point?: Point

  initialize(map: any): void {
    super.initialize(map)
    this._container = map._container
    this._pane = map._panes.overlayPane
    this._resetStateTimeout = 0
    map.on('unload', this._destroy, this)
  }

  addHooks(): void {
    DomEvent.on(this._container, 'pointerdown', this._onPointerDown, this)
  }

  removeHooks(): void {
    DomEvent.off(this._container, 'pointerdown', this._onPointerDown, this)
  }

  moved(): boolean {
    return this._moved
  }

  _destroy(): void {
    this._pane?.remove();
    (this as any)._pane = undefined
  }

  _resetState(): void {
    this._resetStateTimeout = 0
    this._moved = false
  }

  _clearDeferredResetState(): void {
    if (this._resetStateTimeout !== 0) {
      clearTimeout(this._resetStateTimeout)
      this._resetStateTimeout = 0
    }
  }

  _onPointerDown(e: PointerEvent): boolean | undefined {
    if (!e.shiftKey || e.button !== 0)
    return false

    this._clearDeferredResetState()
    this._resetState()

    DomUtil.disableTextSelection()
    DomUtil.disableImageDrag()

    this._startPoint = this._map.pointerEventToContainerPoint(e)

    DomEvent.on(this._container, {
      contextmenu: DomEvent.stop,
      pointermove: this._onPointerMove,
      pointerup: this._onPointerUp,
      keydown: this._onKeyDown,
    }, this)
    DomEvent.on(document, 'keydown', this._onKeyDown, this)
  }

  _onPointerMove(e: PointerEvent): void {
    if (!this._moved) {
      this._moved = true
      this._box = DomUtil.create('div', 'tsmap-zoom-box', this._container)
      this._container.classList.add('tsmap-crosshair')
      this._map.fire('boxzoomstart')
    }

    this._point = this._map.pointerEventToContainerPoint(e)

    const bounds = new Bounds(this._point, this._startPoint as Point)
    const size = bounds.getSize()

    DomUtil.setPosition(this._box as HTMLElement, bounds.min)
    this._box!.style.width = `${size.x}px`
    this._box!.style.height = `${size.y}px`
  }

  _finish(): void {
    if (this._moved) {
      this._box?.remove()
      this._container.classList.remove('tsmap-crosshair')
    }
    DomUtil.enableTextSelection()
    DomUtil.enableImageDrag()

    DomEvent.off(this._container, {
      contextmenu: DomEvent.stop,
      pointermove: this._onPointerMove,
      pointerup: this._onPointerUp,
    }, this)
    DomEvent.off(document, 'keydown', this._onKeyDown, this)
  }

  _onPointerUp(e: PointerEvent): void {
    if (e.button !== 0)
    return
    this._finish()
    if (!this._moved)
    return

    this._clearDeferredResetState()
    this._resetStateTimeout = setTimeout(this._resetState.bind(this), 0)

    const bounds = new LatLngBounds(
    this._map.containerPointToLatLng(this._startPoint as Point),
    this._map.containerPointToLatLng(this._point as Point),
    )

    this._map.fitBounds(bounds).fire('boxzoomend', { boxZoomBounds: bounds })
  }

  _onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      this._finish()
      this._clearDeferredResetState()
      this._resetState()
    }
  }
}

TsMap.addInitHook('addHandler', 'boxZoom', BoxZoomHandler)
