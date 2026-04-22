import * as Util from '../../core/Util'
import * as DomEvent from '../../dom/DomEvent'
import * as DomUtil from '../../dom/DomUtil'
import { LatLng } from '../../geo/LatLng'
import { Point } from '../../geometry/Point'
import { Layer } from '../Layer'
import { DefaultIcon } from './DefaultIcon'
import { MarkerDrag } from './Marker.Drag'

export class Marker extends Layer {
  declare _latlng: LatLng
  declare _icon?: HTMLElement | null
  declare _shadow?: HTMLElement | null
  declare _zIndex?: number
  declare _popup?: any
  declare dragging?: MarkerDrag

  initialize(latlng: any, options?: any): void {
    Util.setOptions(this as any, options)
    this._latlng = new LatLng(latlng)
  }

  onAdd(map: any): void {
    this._zoomAnimated = this._zoomAnimated && map.options.markerZoomAnimation
    if (this._zoomAnimated)
    map.on('zoomanim', this._animateZoom, this)
    this._initIcon()
    this.update()
  }

  onRemove(map: any): void {
    if (this.dragging?.enabled()) {
      this.options!.draggable = true
      this.dragging.removeHooks()
    }
    delete this.dragging

    if (this._zoomAnimated)
    map.off('zoomanim', this._animateZoom, this)

    this._removeIcon()
    this._removeShadow()
  }

  getEvents(): Record<string, any> {
    return { zoom: this.update, viewreset: this.update }
  }

  getLatLng(): LatLng {
    return this._latlng
  }

  setLatLng(latlng: any): this {
    const oldLatLng = this._latlng
    this._latlng = new LatLng(latlng)
    this.update()
    return this.fire('move', { oldLatLng, latlng: this._latlng })
  }

  setZIndexOffset(offset: number): this {
    this.options!.zIndexOffset = offset
    return this.update()
  }

  getIcon(): any {
    return this.options!.icon
  }

  setIcon(icon: any): this {
    this.options!.icon = icon
    if (this._map) {
      this._initIcon()
      this.update()
    }
    if (this._popup)
    (this as any).bindPopup(this._popup, this._popup.options)
    return this
  }

  getElement(): HTMLElement | null | undefined {
    return this._icon
  }

  update(): this {
    if (this._icon && this._map) {
      const pos = this._map.latLngToLayerPoint(this._latlng).round()
      this._setPos(pos)
    }
    return this
  }

  _initIcon(): void {
    const options = this.options!
    const classToAdd = `tsmap-zoom-${this._zoomAnimated ? 'animated' : 'hide'}`

    const icon = options.icon.createIcon(this._icon)
    let addIcon = false

    if (icon !== this._icon) {
      if (this._icon)
      this._removeIcon()
      addIcon = true

      if (options.title)
      icon.title = options.title
      if (icon.tagName === 'IMG')
      icon.alt = options.alt ?? ''
    }

    icon.classList.add(classToAdd)

    if (options.keyboard) {
      icon.tabIndex = 0
      icon.setAttribute('role', 'button')
    }

    this._icon = icon

    if (options.riseOnHover) {
      this.on( {
        pointerover: this._bringToFront,
        pointerout: this._resetZIndex,
      })
    }

    if (options.autoPanOnFocus)
    DomEvent.on(icon, 'focus', this._panOnFocus, this)

    const newShadow = options.icon.createShadow(this._shadow)
    let addShadow = false

    if (newShadow !== this._shadow) {
      this._removeShadow()
      addShadow = true
    }

    if (newShadow) {
      newShadow.classList.add(classToAdd)
      newShadow.alt = ''
    }
    this._shadow = newShadow

    if (options.opacity < 1)
    this._updateOpacity()

    if (addIcon)
    this.getPane().appendChild(this._icon as HTMLElement)
    this._initInteraction()
    if (newShadow && addShadow)
    this.getPane(options.shadowPane).appendChild(this._shadow as HTMLElement)
  }

  _removeIcon(): void {
    if (this.options!.riseOnHover) {
      this.off( {
        pointerover: this._bringToFront,
        pointerout: this._resetZIndex,
      })
    }
    if (this.options!.autoPanOnFocus)
    DomEvent.off(this._icon, 'focus', this._panOnFocus, this)

    this._icon?.remove()
    this.removeInteractiveTarget(this._icon)
    this._icon = null
  }

  _removeShadow(): void {
    this._shadow?.remove()
    this._shadow = null
  }

  _setPos(pos: Point): void {
    if (this._icon)
    DomUtil.setPosition(this._icon as HTMLElement, pos)
    if (this._shadow)
    DomUtil.setPosition(this._shadow as HTMLElement, pos)
    this._zIndex = pos.y + this.options!.zIndexOffset
    this._resetZIndex()
  }

  _updateZIndex(offset: number): void {
    if (this._icon)
    this._icon.style.zIndex = String((this._zIndex as number) + offset)
  }

  _animateZoom(opt: any): void {
    const pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center).round()
    this._setPos(pos)
  }

  _initInteraction(): void {
    if (!this.options!.interactive)
    return

    this._icon!.classList.add('tsmap-interactive')
    this.addInteractiveTarget(this._icon)

    if (MarkerDrag) {
      let draggable = this.options!.draggable
      if (this.dragging) {
        draggable = this.dragging.enabled()
        this.dragging.disable()
      }
      this.dragging = new MarkerDrag(this)
      if (draggable)
      this.dragging.enable()
    }
  }

  setOpacity(opacity: number): this {
    this.options!.opacity = opacity
    if (this._map)
    this._updateOpacity()
    return this
  }

  _updateOpacity(): void {
    const opacity = this.options!.opacity
    if (this._icon)
    this._icon.style.opacity = String(opacity)
    if (this._shadow)
    this._shadow.style.opacity = String(opacity)
  }

  _bringToFront(): void {
    this._updateZIndex(this.options!.riseOffset)
  }

  _resetZIndex(): void {
    this._updateZIndex(0)
  }

  _panOnFocus(): void {
    const map = this._map
    if (!map)
    return

    const iconOpts = this.options!.icon.options
    const size = iconOpts.iconSize ? new Point(iconOpts.iconSize) : new Point(0, 0)
    const anchor = iconOpts.iconAnchor ? new Point(iconOpts.iconAnchor) : new Point(0, 0)

    map.panInside(this._latlng, {
      paddingTopLeft: anchor,
      paddingBottomRight: size.subtract(anchor),
    })
  }

  _getPopupAnchor(): any {
    return this.options!.icon.options.popupAnchor
  }

  _getTooltipAnchor(): any {
    return this.options!.icon.options.tooltipAnchor
  }
}

Marker.setDefaultOptions( {
  icon: new DefaultIcon(),
  interactive: true,
  keyboard: true,
  title: '',
  alt: 'Marker',
  zIndexOffset: 0,
  opacity: 1,
  riseOnHover: false,
  riseOffset: 250,
  pane: 'markerPane',
  shadowPane: 'shadowPane',
  bubblingPointerEvents: false,
  autoPanOnFocus: true,
  draggable: false,
  autoPan: false,
  autoPanPadding: [50, 50],
  autoPanSpeed: 10,
})
