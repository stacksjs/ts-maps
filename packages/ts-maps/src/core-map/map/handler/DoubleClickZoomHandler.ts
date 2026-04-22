import { Handler } from '../../core/Handler'
import { TsMap } from '../Map'

TsMap.mergeOptions( { doubleClickZoom: true })

export class DoubleClickZoomHandler extends Handler {
  addHooks(): void {
    this._map.on('dblclick', this._onDoubleClick, this)
  }

  removeHooks(): void {
    this._map.off('dblclick', this._onDoubleClick, this)
  }

  _onDoubleClick = (e: any): void => {
    const map = this._map
    const oldZoom = map.getZoom()
    const delta = map.options.zoomDelta
    const zoom = e.originalEvent.shiftKey ? oldZoom - delta : oldZoom + delta
    if (map.options.doubleClickZoom === 'center')
    map.setZoom(zoom)
    else
    map.setZoomAround(e.containerPoint, zoom)
  }
}

TsMap.addInitHook('addHandler', 'doubleClickZoom', DoubleClickZoomHandler)
