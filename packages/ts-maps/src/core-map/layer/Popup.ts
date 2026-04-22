import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { Point } from '../geometry/Point'
import { TsMap } from '../map/Map'
import { DivOverlay } from './DivOverlay'
import { FeatureGroup } from './FeatureGroup'
import { Layer } from './Layer'
import { Path } from './vector/Path'

export class Popup extends DivOverlay {
  declare _wrapper?: HTMLElement
  declare _tipContainer?: HTMLElement
  declare _tip?: HTMLElement
  declare _closeButton?: HTMLAnchorElement
  declare _resizeObserver?: ResizeObserver

  openOn(map?: any): this {
    const m = arguments.length ? map : this._source._map
    if (!m.hasLayer(this) && m._popup && m._popup.options.autoClose)
    m.removeLayer(m._popup)
    m._popup = this
    return super.openOn(m)
  }

  onAdd(map: any): void {
    super.onAdd(map)
    map.fire('popupopen', { popup: this })
    if (this._source) {
      this._source.fire('popupopen', { popup: this }, true)
      if (!(this._source instanceof Path))
      this._source.on('preclick', DomEvent.stopPropagation)
    }
  }

  onRemove(map: any): void {
    super.onRemove(map)
    map.fire('popupclose', { popup: this })
    if (this._source) {
      this._source.fire('popupclose', { popup: this }, true)
      if (!(this._source instanceof Path))
      this._source.off('preclick', DomEvent.stopPropagation)
    }
  }

  getEvents(): Record<string, any> {
    const events = super.getEvents()
    if (this.options!.closeOnClick ?? this._map.options.closePopupOnClick)
    events.preclick = this.close
    if (this.options!.keepInView)
    events.moveend = this._adjustPan
    return events
  }

  _initLayout(): void {
    const prefix = 'tsmap-popup'
    const container = this._container = DomUtil.create('div', `${prefix} ${this.options!.className || ''} tsmap-zoom-animated`)
    const wrapper = this._wrapper = DomUtil.create('div', `${prefix}-content-wrapper`, container)
    this._contentNode = DomUtil.create('div', `${prefix}-content`, wrapper)

    DomEvent.disableClickPropagation(container)
    DomEvent.disableScrollPropagation(this._contentNode)
    DomEvent.on(container, 'contextmenu', DomEvent.stopPropagation)

    this._tipContainer = DomUtil.create('div', `${prefix}-tip-container`, container)
    this._tip = DomUtil.create('div', `${prefix}-tip`, this._tipContainer)

    if (this.options!.closeButton) {
      const closeButton = this._closeButton = DomUtil.create('a', `${prefix}-close-button`, container) as HTMLAnchorElement
      closeButton.setAttribute('role', 'button')
      closeButton.setAttribute('aria-label', this.options!.closeButtonLabel)
      closeButton.href = '#close'
      closeButton.innerHTML = '<span aria-hidden="true">&#215;</span>'

      DomEvent.on(closeButton, 'click', (ev: any) => {
        ev.preventDefault()
        this.close()
      })
    }

    if (this.options!.trackResize) {
      this._resizeObserver = new ResizeObserver((entries) => {
        if (!this._map)
        return
        this._containerWidth = entries[0]?.contentRect?.width
        this._containerHeight = entries[0]?.contentRect?.height
        this._updateLayout()
        this._updatePosition()
        this._adjustPan()
      })
      this._resizeObserver.observe(this._contentNode!)
    }
  }

  _updateLayout(): void {
    const container = this._contentNode!
    const style = container.style

    style.maxWidth = `${this.options!.maxWidth}px`
    style.minWidth = `${this.options!.minWidth}px`

    const height = this._containerHeight ?? container.offsetHeight
    const maxHeight = this.options!.maxHeight
    const scrolledClass = 'tsmap-popup-scrolled'

    if (maxHeight && height > maxHeight) {
      style.height = `${maxHeight}px`
      container.classList.add(scrolledClass)
    }
    else {
      container.classList.remove(scrolledClass)
    }

    this._containerWidth = this._container!.offsetWidth
    this._containerHeight = this._container!.offsetHeight
  }

  _animateZoom(e: any): void {
    const pos = this._map._latLngToNewLayerPoint(this._latlng!, e.zoom, e.center)
    const anchor = this._getAnchor()
    DomUtil.setPosition(this._container!, pos.add(anchor))
  }

  _adjustPan(): void {
    if (!this.options!.autoPan)
    return
    this._map._panAnim?.stop()

    if (this._autopanning) {
      this._autopanning = false
      return
    }

    const map = this._map
    const marginBottom = Number.parseInt(getComputedStyle(this._container!).marginBottom, 10) || 0
    const containerHeight = (this._containerHeight as number) + marginBottom
    const containerWidth = this._containerWidth as number
    const layerPos = new Point(this._containerLeft!, -containerHeight - (this._containerBottom as number))

    layerPos._add(DomUtil.getPosition(this._container!))

    const containerPos = map.layerPointToContainerPoint(layerPos)
    const padding = new Point(this.options!.autoPanPadding)
    const paddingTL = new Point(this.options!.autoPanPaddingTopLeft ?? padding)
    const paddingBR = new Point(this.options!.autoPanPaddingBottomRight ?? padding)
    const size = map.getSize()
    let dx = 0
    let dy = 0

    if (containerPos.x + containerWidth + paddingBR.x > size.x)
    dx = containerPos.x + containerWidth - size.x + paddingBR.x
    if (containerPos.x - dx - paddingTL.x < 0)
    dx = containerPos.x - paddingTL.x
    if (containerPos.y + containerHeight + paddingBR.y > size.y)
    dy = containerPos.y + containerHeight - size.y + paddingBR.y
    if (containerPos.y - dy - paddingTL.y < 0)
    dy = containerPos.y - paddingTL.y

    if (dx || dy) {
      if (this.options!.keepInView)
      this._autopanning = true
      map.fire('autopanstart').panBy([dx, dy])
    }
  }

  _getAnchor(): Point {
    return new Point(this._source?._getPopupAnchor ? this._source._getPopupAnchor() : [0, 0])
  }
}

Popup.setDefaultOptions( {
  pane: 'popupPane',
  offset: [0, 7],
  maxWidth: 300,
  minWidth: 50,
  maxHeight: null,
  autoPan: true,
  autoPanPaddingTopLeft: null,
  autoPanPaddingBottomRight: null,
  autoPanPadding: [5, 5],
  keepInView: false,
  closeButton: true,
  closeButtonLabel: 'Close popup',
  autoClose: true,
  closeOnEscapeKey: true,
  className: '',
  trackResize: true,
})

TsMap.mergeOptions( { closePopupOnClick: true })

TsMap.include( {
  openPopup(this: any, popup: any, latlng?: any, options?: any) {
    this._initOverlay(Popup, popup, latlng, options).openOn(this)
    return this
  },

  closePopup(this: any, popup?: Popup) {
    const p = arguments.length ? popup : this._popup
    p?.close()
    return this
  },
})

Layer.include( {
  bindPopup(this: any, content: any, options?: any): any {
    this._popup = this._initOverlay(Popup, this._popup, content, options)
    if (!this._popupHandlersAdded) {
      this.on( {
        click: this._openPopup,
        keypress: this._onKeyPress,
        remove: this.closePopup,
        move: this._movePopup,
      })
      this._popupHandlersAdded = true
    }
    return this
  },

  unbindPopup(this: any): any {
    if (this._popup) {
      this.off( {
        click: this._openPopup,
        keypress: this._onKeyPress,
        remove: this.closePopup,
        move: this._movePopup,
      })
      this._popupHandlersAdded = false
      this._popup = null
    }
    return this
  },

  openPopup(this: any, latlng?: any): any {
    if (this._popup) {
      if (!(this instanceof FeatureGroup))
      this._popup._source = this
      if (this._popup._prepareOpen(latlng || this._latlng))
      this._popup.openOn(this._map)
    }
    return this
  },

  closePopup(this: any): any {
    this._popup?.close()
    return this
  },

  togglePopup(this: any): any {
    this._popup?.toggle(this)
    return this
  },

  isPopupOpen(this: any): boolean {
    return this._popup?.isOpen() ?? false
  },

  setPopupContent(this: any, content: any): any {
    this._popup?.setContent(content)
    return this
  },

  getPopup(this: any): any {
    return this._popup
  },

  _openPopup(this: any, e: any): void {
    if (!this._popup || !this._map)
    return
    DomEvent.stop(e)
    const target = e.propagatedFrom ?? e.target
    if (this._popup._source === target && !(target instanceof Path)) {
      if (this._map.hasLayer(this._popup))
      this.closePopup()
      else
      this.openPopup(e.latlng)
      return
    }
    this._popup._source = target
    this.openPopup(e.latlng)
  },

  _movePopup(this: any, e: any): void {
    this._popup.setLatLng(e.latlng)
  },

  _onKeyPress(this: any, e: any): void {
    if (e.originalEvent.code === 'Enter')
    this._openPopup(e)
  },
})
