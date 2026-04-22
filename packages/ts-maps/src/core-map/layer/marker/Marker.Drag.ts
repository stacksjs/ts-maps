import * as DomUtil from '../../dom/DomUtil'
import { Handler } from '../../core/Handler'
import { Draggable } from '../../dom/Draggable'
import { Bounds } from '../../geometry/Bounds'
import { Point } from '../../geometry/Point'

export class MarkerDrag extends Handler {
  _marker: any
  _draggable?: Draggable
  _oldLatLng?: any
  _panRequest?: number

  initialize(marker: any): void {
    super.initialize(marker._map)
    this._marker = marker
  }

  addHooks(): void {
    const icon = this._marker._icon
    if (!this._draggable)
    this._draggable = new Draggable(icon, icon, true)

    this._draggable.on( {
      dragstart: this._onDragStart,
      predrag: this._onPreDrag,
      drag: this._onDrag,
      dragend: this._onDragEnd,
    }, this).enable()

    icon.classList.add('tsmap-marker-draggable')
  }

  removeHooks(): void {
    this._draggable?.off( {
      dragstart: this._onDragStart,
      predrag: this._onPreDrag,
      drag: this._onDrag,
      dragend: this._onDragEnd,
    }, this).disable()

    this._marker._icon?.classList.remove('tsmap-marker-draggable')
  }

  moved(): boolean | undefined {
    return this._draggable?._moved
  }

  _adjustPan = (e: any): void => {
    const marker = this._marker
    const map = marker._map
    const speed = marker.options.autoPanSpeed
    const padding = marker.options.autoPanPadding
    const iconPos = DomUtil.getPosition(marker._icon)
    const bounds = map.getPixelBounds()
    const origin = map.getPixelOrigin()

    const panBounds = new Bounds(
    bounds.min._subtract(origin).add(padding),
    bounds.max._subtract(origin).subtract(padding),
    )

    if (!panBounds.contains(iconPos)) {
      const movement = new Point(
      (Math.max(panBounds.max.x, iconPos.x) - panBounds.max.x) / (bounds.max.x - panBounds.max.x)
      - (Math.min(panBounds.min.x, iconPos.x) - panBounds.min.x) / (bounds.min.x - panBounds.min.x),

      (Math.max(panBounds.max.y, iconPos.y) - panBounds.max.y) / (bounds.max.y - panBounds.max.y)
      - (Math.min(panBounds.min.y, iconPos.y) - panBounds.min.y) / (bounds.min.y - panBounds.min.y),
      ).multiplyBy(speed)

      map.panBy(movement, { animate: false })

      const d = this._draggable as any
      d._newPos._add(movement)
      d._startPos._add(movement)

      DomUtil.setPosition(marker._icon, d._newPos)
      this._onDrag(e)

      this._panRequest = requestAnimationFrame(this._adjustPan.bind(this, e))
    }
  }

  _onDragStart = (): void => {
    this._oldLatLng = this._marker.getLatLng()
    this._marker.closePopup?.()
    this._marker.fire('movestart').fire('dragstart')
  }

  _onPreDrag = (e: any): void => {
    if (this._marker.options.autoPan) {
      if (this._panRequest !== undefined)
      cancelAnimationFrame(this._panRequest)
      this._panRequest = requestAnimationFrame(this._adjustPan.bind(this, e))
    }
  }

  _onDrag = (e: any): void => {
    const marker = this._marker
    const shadow = marker._shadow
    const iconPos = DomUtil.getPosition(marker._icon)
    const latlng = marker._map.layerPointToLatLng(iconPos)

    if (shadow)
    DomUtil.setPosition(shadow, iconPos)

    marker._latlng = latlng
    e.latlng = latlng
    e.oldLatLng = this._oldLatLng

    marker.fire('move', e).fire('drag', e)
  }

  _onDragEnd = (e: any): void => {
    if (this._panRequest !== undefined)
    cancelAnimationFrame(this._panRequest)
    delete this._oldLatLng
    this._marker.fire('moveend').fire('dragend', e)
  }
}
