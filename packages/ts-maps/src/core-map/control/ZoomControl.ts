import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { TsMap } from '../map/Map'
import { Control } from './Control'

export class ZoomControl extends Control {
  _zoomInButton?: HTMLAnchorElement
  _zoomOutButton?: HTMLAnchorElement
  _disabled?: boolean

  onAdd(map: any): HTMLElement {
    const zoomName = 'tsmap-control-zoom'
    const container = DomUtil.create('div', `${zoomName} tsmap-bar`)
    const options = this.options!

    this._zoomInButton = this._createButton(options.zoomInText, options.zoomInTitle, `${zoomName}-in`, container, this._zoomIn)
    this._zoomOutButton = this._createButton(options.zoomOutText, options.zoomOutTitle, `${zoomName}-out`, container, this._zoomOut)

    this._updateDisabled()
    map.on('zoomend zoomlevelschange', this._updateDisabled, this)
    return container
  }

  onRemove(map: any): void {
    map.off('zoomend zoomlevelschange', this._updateDisabled, this)
  }

  disable(): this {
    this._disabled = true
    this._updateDisabled()
    return this
  }

  enable(): this {
    this._disabled = false
    this._updateDisabled()
    return this
  }

  _zoomIn = (e: any): void => {
    if (!this._disabled && this._map._zoom < this._map.getMaxZoom())
    this._map.zoomIn(this._map.options.zoomDelta * (e.shiftKey ? 3 : 1))
  }

  _zoomOut = (e: any): void => {
    if (!this._disabled && this._map._zoom > this._map.getMinZoom())
    this._map.zoomOut(this._map.options.zoomDelta * (e.shiftKey ? 3 : 1))
  }

  _createButton(html: string, title: string, className: string, container: HTMLElement, fn: (e: any) => void): HTMLAnchorElement {
    const link = DomUtil.create('a', className, container) as HTMLAnchorElement
    link.innerHTML = html
    link.href = '#'
    link.title = title
    link.setAttribute('role', 'button')
    link.setAttribute('aria-label', title)

    DomEvent.disableClickPropagation(link)
    DomEvent.on(link, 'click', DomEvent.stop)
    DomEvent.on(link, 'click', fn, this)
    DomEvent.on(link, 'click', this._refocusOnMap, this)
    return link
  }

  _updateDisabled = (): void => {
    const map = this._map
    const className = 'tsmap-disabled'

    this._zoomInButton?.classList.remove(className)
    this._zoomOutButton?.classList.remove(className)
    this._zoomInButton?.setAttribute('aria-disabled', 'false')
    this._zoomOutButton?.setAttribute('aria-disabled', 'false')

    if (this._disabled || map._zoom === map.getMinZoom()) {
      this._zoomOutButton?.classList.add(className)
      this._zoomOutButton?.setAttribute('aria-disabled', 'true')
    }
    if (this._disabled || map._zoom === map.getMaxZoom()) {
      this._zoomInButton?.classList.add(className)
      this._zoomInButton?.setAttribute('aria-disabled', 'true')
    }
  }
}

ZoomControl.setDefaultOptions( {
  position: 'topleft',
  zoomInText: '<span aria-hidden="true">+</span>',
  zoomInTitle: 'Zoom in',
  zoomOutText: '<span aria-hidden="true">&#x2212;</span>',
  zoomOutTitle: 'Zoom out',
})

TsMap.mergeOptions( { zoomControl: true })

TsMap.addInitHook(function (this: any) {
  if (this.options.zoomControl) {
    this.zoomControl = new ZoomControl()
    this.addControl(this.zoomControl)
  }
})
