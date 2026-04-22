import * as Util from '../core/Util'
import * as DomUtil from '../dom/DomUtil'
import { LatLng } from '../geo/LatLng'
import { Point } from '../geometry/Point'
import { TsMap } from '../map/Map'
import { FeatureGroup } from './FeatureGroup'
import { Layer } from './Layer'

export class DivOverlay extends Layer {
  declare _latlng?: LatLng
  declare _source?: any
  declare _content?: any
  declare _container?: HTMLElement
  declare _contentNode?: HTMLElement
  declare _removeTimeout?: ReturnType<typeof setTimeout>
  declare _containerWidth?: number
  declare _containerHeight?: number
  declare _containerLeft?: number
  declare _containerBottom?: number
  declare _autopanning?: boolean

  initialize(options?: any, source?: any): void {
    if (options instanceof LatLng || Array.isArray(options)) {
      this._latlng = new LatLng(options as any)
      Util.setOptions(this as any, source)
    }
    else {
      Util.setOptions(this as any, options)
      this._source = source
    }
    if (this.options!.content)
    this._content = this.options!.content
  }

  openOn(map?: any): this {
    const m = arguments.length ? map : this._source._map
    if (!m.hasLayer(this))
    m.addLayer(this)
    return this
  }

  close(): this {
    this._map?.removeLayer(this)
    return this
  }

  toggle(layer?: any): this {
    if (this._map) {
      this.close()
    }
    else {
      if (arguments.length)
      this._source = layer
      else
      layer = this._source

      this._prepareOpen()
      this.openOn(layer._map)
    }
    return this
  }

  onAdd(map: any): void {
    this._zoomAnimated = map._zoomAnimated

    if (!this._container)
    this._initLayout()

    if (map._fadeAnimated)
    this._container!.style.opacity = '0'

    clearTimeout(this._removeTimeout as any)
    this.getPane().appendChild(this._container!)
    this.update()

    if (map._fadeAnimated)
    this._container!.style.opacity = '1'

    this.bringToFront()

    if (this.options!.interactive) {
      this._container!.classList.add('tsmap-interactive')
      this.addInteractiveTarget(this._container)
    }
  }

  onRemove(map: any): void {
    if (map._fadeAnimated) {
      this._container!.style.opacity = '0'
      this._removeTimeout = setTimeout(() => this._container!.remove(), 200)
    }
    else {
      this._container!.remove()
    }

    if (this.options!.interactive) {
      this._container!.classList.remove('tsmap-interactive')
      this.removeInteractiveTarget(this._container)
    }
  }

  getLatLng(): LatLng | undefined {
    return this._latlng
  }

  setLatLng(latlng: any): this {
    this._latlng = new LatLng(latlng)
    if (this._map) {
      this._updatePosition()
      this._adjustPan()
    }
    return this
  }

  getContent(): any {
    return this._content
  }

  setContent(content: any): this {
    this._content = content
    this.update()
    return this
  }

  getElement(): HTMLElement | undefined {
    return this._container
  }

  update(): void {
    if (!this._map)
    return

    this._container!.style.visibility = 'hidden'
    this._updateContent()
    this._updateLayout()
    this._updatePosition()
    this._container!.style.visibility = ''
    this._adjustPan()
  }

  getEvents(): Record<string, any> {
    const events: Record<string, any> = {
      zoom: this._updatePosition,
      viewreset: this._updatePosition,
    }
    if (this._zoomAnimated)
    events.zoomanim = this._animateZoom
    return events
  }

  isOpen(): boolean {
    return !!this._map && this._map.hasLayer(this)
  }

  bringToFront(): this {
    if (this._map)
    DomUtil.toFront(this._container!)
    return this
  }

  bringToBack(): this {
    if (this._map)
    DomUtil.toBack(this._container!)
    return this
  }

  _prepareOpen(latlng?: LatLng): boolean {
    let source = this._source
    if (!source._map)
    return false

    if (source instanceof FeatureGroup) {
      source = null
      for (const layer of Object.values(this._source._layers) as any[]) {
        if (layer._map) {
          source = layer
          break
        }
      }
      if (!source)
      return false
      this._source = source
    }

    if (!latlng) {
      if (source.getCenter)
      latlng = source.getCenter()
      else if (source.getLatLng)
      latlng = source.getLatLng()
      else if (source.getBounds)
      latlng = source.getBounds().getCenter()
      else
      throw new Error('Unable to get source layer LatLng.')
    }
    this.setLatLng(latlng as LatLng)
    if (this._map)
    this.update()
    return true
  }

  _updateContent(): void {
    if (!this._content)
    return
    const node = this._contentNode!
    const content = typeof this._content === 'function' ? this._content(this._source ?? this) : this._content

    if (typeof content === 'string') {
      node.innerHTML = content
    }
    else {
      while (node.hasChildNodes())
      node.removeChild(node.firstChild as Node)
      node.appendChild(content)
    }
    this.fire('contentupdate')
  }

  _updatePosition(): void {
    if (!this._map)
    return

    const pos = this._map.latLngToLayerPoint(this._latlng!)
    const anchor = this._getAnchor()
    let offset = new Point(this.options!.offset)

    if (this._zoomAnimated) {
      DomUtil.setPosition(this._container!, pos.add(anchor))
    }
    else {
      offset = offset.add(pos).add(anchor)
    }

    const bottom = this._containerBottom = -offset.y
    const left = this._containerLeft = -Math.round((this._containerWidth as number) / 2) + offset.x

    this._container!.style.bottom = `${bottom}px`
    this._container!.style.left = `${left}px`
  }

  _getAnchor(): Point | number[] {
    return [0, 0]
  }

  _initLayout(): void {}
  _updateLayout(): void {}
  _adjustPan(): void {}
  _animateZoom(_e: any): void {}
}

DivOverlay.setDefaultOptions( {
  interactive: false,
  offset: [0, 0],
  className: '',
  pane: undefined,
  content: '',
})

TsMap.include( {
  _initOverlay(this: any, OverlayClass: any, content: any, latlng: any, options: any) {
    let overlay = content
    if (!(overlay instanceof OverlayClass))
    overlay = new OverlayClass(options).setContent(content)
    if (latlng)
    overlay.setLatLng(latlng)
    return overlay
  },
})

Layer.include( {
  _initOverlay(this: any, OverlayClass: any, old: any, content: any, options: any) {
    let overlay = content
    if (overlay instanceof OverlayClass) {
      Util.setOptions(overlay, options)
      overlay._source = this
    }
    else {
      overlay = (old && !options) ? old : new OverlayClass(options, this)
      overlay.setContent(content)
    }
    return overlay
  },
})
