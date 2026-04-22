import type { Point } from '../../geometry/Point'
import * as DomEvent from '../../dom/DomEvent'
import { Handler } from '../../core/Handler'
import { TsMap } from '../Map'

TsMap.mergeOptions( {
  scrollWheelZoom: true,
  wheelDebounceTime: 40,
  wheelPxPerZoomLevel: 60,
})

export class ScrollWheelZoomHandler extends Handler {
  _delta = 0
  _startTime: number | null = null
  declare _timer?: ReturnType<typeof setTimeout>
  declare _lastMousePos?: Point

  addHooks(): void {
    DomEvent.on(this._map._container, 'wheel', this._onWheelScroll, this)
    this._delta = 0
  }

  removeHooks(): void {
    DomEvent.off(this._map._container, 'wheel', this._onWheelScroll, this)
    clearTimeout(this._timer as any)
  }

  _onWheelScroll(e: any): void {
    const delta = DomEvent.getWheelDelta(e)
    const debounce = this._map.options.wheelDebounceTime
    this._delta += delta
    this._lastMousePos = this._map.pointerEventToContainerPoint(e)

    if (!this._startTime)
    this._startTime = Date.now()

    const left = Math.max(debounce - (Date.now() - this._startTime), 0)
    clearTimeout(this._timer as any)
    this._timer = setTimeout(this._performZoom.bind(this), left)

    DomEvent.stop(e)
  }

  _performZoom(): void {
    const map = this._map
    const zoom = map.getZoom()
    const snap = map.options.zoomSnap ?? 0

    map._stop()

    const d2 = this._delta / (map.options.wheelPxPerZoomLevel * 4)
    const d3 = 4 * Math.log(2 / (1 + Math.exp(-Math.abs(d2)))) / Math.LN2
    const d4 = snap ? Math.ceil(d3 / snap) * snap : d3
    const delta = map._limitZoom(zoom + (this._delta > 0 ? d4 : -d4)) - zoom

    this._delta = 0
    this._startTime = null

    if (!delta)
    return

    if (map.options.scrollWheelZoom === 'center')
    map.setZoom(zoom + delta)
    else
    map.setZoomAround(this._lastMousePos as Point, zoom + delta)
  }
}

TsMap.addInitHook('addHandler', 'scrollWheelZoom', ScrollWheelZoomHandler)
