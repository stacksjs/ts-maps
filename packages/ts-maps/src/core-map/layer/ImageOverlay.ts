import * as Util from '../core/Util'
import * as DomUtil from '../dom/DomUtil'
import { LatLngBounds } from '../geo/LatLngBounds'
import { Bounds } from '../geometry/Bounds'
import { Layer } from './Layer'

export class ImageOverlay extends Layer {
  _url: any
  declare _bounds: LatLngBounds
  declare _image?: HTMLImageElement | HTMLVideoElement | SVGElement | any

  initialize(url: any, bounds: any, options?: any): void {
    this._url = url
    this._bounds = new LatLngBounds(bounds)
    Util.setOptions(this as any, options)
  }

  onAdd(): void {
    if (!this._image) {
      this._initImage()
      if (this.options!.opacity < 1)
      this._updateOpacity()
    }

    if (this.options!.interactive) {
      this._image.classList.add('tsmap-interactive')
      this.addInteractiveTarget(this._image)
    }

    this.getPane().appendChild(this._image)
    this._reset()
  }

  onRemove(): void {
    this._image.remove()
    if (this.options!.interactive)
    this.removeInteractiveTarget(this._image)
  }

  setOpacity(opacity: number): this {
    this.options!.opacity = opacity
    if (this._image)
    this._updateOpacity()
    return this
  }

  setStyle(styleOpts: any): this {
    if (styleOpts.opacity)
    this.setOpacity(styleOpts.opacity)
    return this
  }

  bringToFront(): this {
    if (this._map)
    DomUtil.toFront(this._image)
    return this
  }

  bringToBack(): this {
    if (this._map)
    DomUtil.toBack(this._image)
    return this
  }

  setUrl(url: string): this {
    this._url = url
    if (this._image)
    (this._image as HTMLImageElement).src = url
    return this
  }

  setBounds(bounds: any): this {
    this._bounds = new LatLngBounds(bounds)
    if (this._map)
    this._reset()
    return this
  }

  getEvents(): Record<string, any> {
    const events: Record<string, any> = { zoom: this._reset, viewreset: this._reset }
    if (this._zoomAnimated)
    events.zoomanim = this._animateZoom
    return events
  }

  setZIndex(value: number): this {
    this.options!.zIndex = value
    this._updateZIndex()
    return this
  }

  getBounds(): LatLngBounds {
    return this._bounds
  }

  getElement(): any {
    return this._image
  }

  _initImage(): void {
    const wasElementSupplied = this._url.tagName === 'IMG'
    const img = this._image = wasElementSupplied ? this._url : DomUtil.create('img')

    img.classList.add('tsmap-image-layer')
    if (this._zoomAnimated)
    img.classList.add('tsmap-zoom-animated')
    if (this.options!.className)
    img.classList.add(...Util.splitWords(this.options!.className))

    img.onselectstart = Util.falseFn
    img.onpointermove = Util.falseFn

    img.onload = this.fire.bind(this, 'load')
    img.onerror = this._overlayOnError.bind(this)

    if (this.options!.crossOrigin || this.options!.crossOrigin === '')
    img.crossOrigin = this.options!.crossOrigin === true ? '' : this.options!.crossOrigin

    img.decoding = this.options!.decoding

    if (this.options!.zIndex)
    this._updateZIndex()

    if (wasElementSupplied) {
      this._url = img.src
      return
    }

    img.src = this._url
    img.alt = this.options!.alt
  }

  _animateZoom(e: any): void {
    const scale = this._map.getZoomScale(e.zoom)
    const offset = this._map._latLngBoundsToNewLayerBounds(this._bounds, e.zoom, e.center).min
    DomUtil.setTransform(this._image, offset, scale)
  }

  _reset(): void {
    const image = this._image
    const bounds = new Bounds(
    this._map.latLngToLayerPoint(this._bounds.getNorthWest()),
    this._map.latLngToLayerPoint(this._bounds.getSouthEast()),
    )
    const size = bounds.getSize()

    DomUtil.setPosition(image, bounds.min)
    image.style.width = `${size.x}px`
    image.style.height = `${size.y}px`
  }

  _updateOpacity(): void {
    this._image.style.opacity = this.options!.opacity
  }

  _updateZIndex(): void {
    if (this._image && this.options!.zIndex !== undefined && this.options!.zIndex !== null)
    this._image.style.zIndex = this.options!.zIndex
  }

  _overlayOnError(): void {
    this.fire('error')
    const errorUrl = this.options!.errorOverlayUrl
    if (errorUrl && this._url !== errorUrl) {
      this._url = errorUrl
      this._image.src = errorUrl
    }
  }

  getCenter(): any {
    return this._bounds.getCenter()
  }
}

ImageOverlay.setDefaultOptions( {
  opacity: 1,
  alt: '',
  interactive: false,
  crossOrigin: false,
  errorOverlayUrl: '',
  zIndex: 1,
  className: '',
  decoding: 'auto',
})
