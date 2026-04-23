import * as Util from '../core/Util'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { Point } from '../geometry/Point'
import { TsMap } from '../map/Map'
import { DivOverlay } from './DivOverlay'
import { FeatureGroup } from './FeatureGroup'
import { Layer } from './Layer'

export class Tooltip extends DivOverlay {
  onAdd(map: any): void {
    super.onAdd(map)
    this.setOpacity(this.options!.opacity)
    map.fire('tooltipopen', { tooltip: this })
    if (this._source) {
      this.addEventParent(this._source)
      this._source.fire('tooltipopen', { tooltip: this }, true)
    }
  }

  onRemove(map: any): void {
    super.onRemove(map)
    map.fire('tooltipclose', { tooltip: this })
    if (this._source) {
      this.removeEventParent(this._source)
      this._source.fire('tooltipclose', { tooltip: this }, true)
    }
  }

  getEvents(): Record<string, any> {
    const events = super.getEvents()
    if (!this.options!.permanent)
    events.preclick = this.close
    return events
  }

  _initLayout(): void {
    const prefix = 'tsmap-tooltip'
    const className = `${prefix} ${this.options!.className || ''} tsmap-zoom-${this._zoomAnimated ? 'animated' : 'hide'}`
    this._contentNode = this._container = DomUtil.create('div', className)
    this._container.setAttribute('role', 'tooltip')
    this._container.setAttribute('id', `tsmap-tooltip-${Util.stamp(this)}`)
  }

  _updateLayout(): void {}
  _adjustPan(): void {}

  _setPosition(pos: Point): void {
    let subX: number, subY: number
    let direction = this.options!.direction
    const map = this._map
    const container = this._container as HTMLElement
    const centerPoint = map.latLngToContainerPoint(map.getCenter())
    const tooltipPoint = map.layerPointToContainerPoint(pos)
    const tooltipWidth = container.offsetWidth
    const tooltipHeight = container.offsetHeight
    const offset = new Point(this.options!.offset)
    const anchor = this._getAnchor() as Point

    if (direction === 'top') {
      subX = tooltipWidth / 2
      subY = tooltipHeight
    }
    else if (direction === 'bottom') {
      subX = tooltipWidth / 2
      subY = 0
    }
    else if (direction === 'center') {
      subX = tooltipWidth / 2
      subY = tooltipHeight / 2
    }
    else if (direction === 'right') {
      subX = 0
      subY = tooltipHeight / 2
    }
    else if (direction === 'left') {
      subX = tooltipWidth
      subY = tooltipHeight / 2
    }
    else if (tooltipPoint.x < centerPoint.x) {
      direction = 'right'
      subX = 0
      subY = tooltipHeight / 2
    }
    else {
      direction = 'left'
      subX = tooltipWidth + (offset.x + anchor.x) * 2
      subY = tooltipHeight / 2
    }

    pos = pos.subtract(new Point(subX, subY, true)).add(offset).add(anchor)

    container.classList.remove('tsmap-tooltip-right', 'tsmap-tooltip-left', 'tsmap-tooltip-top', 'tsmap-tooltip-bottom')
    container.classList.add(`tsmap-tooltip-${direction}`)
    DomUtil.setPosition(container, pos)
  }

  _updatePosition(): void {
    const pos = this._map.latLngToLayerPoint(this._latlng!)
    this._setPosition(pos)
  }

  setOpacity(opacity: number): void {
    this.options!.opacity = opacity
    if (this._container)
    this._container.style.opacity = String(opacity)
  }

  _animateZoom(e: any): void {
    const pos = this._map._latLngToNewLayerPoint(this._latlng!, e.zoom, e.center)
    this._setPosition(pos)
  }

  _getAnchor(): Point {
    return new Point(
    this._source?._getTooltipAnchor && !this.options!.sticky ? this._source._getTooltipAnchor() : [0, 0],
    )
  }
}

Tooltip.setDefaultOptions( {
  pane: 'tooltipPane',
  offset: [0, 0],
  direction: 'auto',
  permanent: false,
  sticky: false,
  opacity: 0.9,
})

TsMap.include( {
  openTooltip(this: any, tooltip: any, latlng?: any, options?: any) {
    this._initOverlay(Tooltip, tooltip, latlng, options).openOn(this)
    return this
  },

  closeTooltip(this: any, tooltip: any) {
    tooltip.close()
    return this
  },
})

Layer.include( {
  bindTooltip(this: any, content: any, options?: any): any {
    if (this._tooltip && this.isTooltipOpen())
    this.unbindTooltip()
    this._tooltip = this._initOverlay(Tooltip, this._tooltip, content, options)
    this._initTooltipInteractions()
    if (this._tooltip.options.permanent && this._map && this._map.hasLayer(this))
    this.openTooltip()
    return this
  },

  unbindTooltip(this: any): any {
    if (this._tooltip) {
      this._initTooltipInteractions(true)
      this.closeTooltip()
      this._tooltip = null
    }
    return this
  },

  _initTooltipInteractions(this: any, remove?: boolean): void {
    if (!remove && this._tooltipHandlersAdded)
    return
    const onOff = remove ? 'off' : 'on'
    const events: any = { remove: this.closeTooltip, move: this._moveTooltip }
    if (!this._tooltip.options.permanent) {
      events.pointerover = this._openTooltip
      events.pointerout = this.closeTooltip
      events.click = this._openTooltip
      if (this._map)
      this._addFocusListeners(remove)
      else
      events.add = () => this._addFocusListeners(remove)
    }
    else {
      events.add = this._openTooltip
    }
    if (this._tooltip.options.sticky)
      events.pointermove = this._moveTooltip;
    (this as any)[onOff](events)
    this._tooltipHandlersAdded = !remove
  },

  openTooltip(this: any, latlng?: any): any {
    if (this._tooltip) {
      if (!(this instanceof FeatureGroup))
      this._tooltip._source = this
      if (this._tooltip._prepareOpen(latlng)) {
        this._tooltip.openOn(this._map)
        if (this.getElement)
        this._setAriaDescribedByOnLayer(this)
        else if (this.eachLayer)
        this.eachLayer(this._setAriaDescribedByOnLayer, this)
      }
    }
    return this
  },

  closeTooltip(this: any): any {
    if (this._tooltip)
    return this._tooltip.close()
  },

  toggleTooltip(this: any): any {
    this._tooltip?.toggle(this)
    return this
  },

  isTooltipOpen(this: any): boolean {
    return this._tooltip.isOpen()
  },

  setTooltipContent(this: any, content: any): any {
    this._tooltip?.setContent(content)
    return this
  },

  getTooltip(this: any): any {
    return this._tooltip
  },

  _addFocusListeners(this: any, remove?: boolean): void {
    if (this.getElement)
    this._addFocusListenersOnLayer(this, remove)
    else if (this.eachLayer)
    this.eachLayer((layer: any) => this._addFocusListenersOnLayer(layer, remove), this)
  },

  _addFocusListenersOnLayer(this: any, layer: any, remove?: boolean): void {
    const el = typeof layer.getElement === 'function' && layer.getElement()
    if (el) {
      const onOff = remove ? 'off' : 'on'
      if (!remove) {
        if (el._tsmap_focus_handler)
        DomEvent.off(el, 'focus', el._tsmap_focus_handler, this)
        el._tsmap_focus_handler = () => {
          if (this._tooltip) {
            this._tooltip._source = layer
            this.openTooltip()
          }
        }
      }

      if (el._tsmap_focus_handler)
        (DomEvent as any)[onOff](el, 'focus', el._tsmap_focus_handler, this);
      (DomEvent as any)[onOff](el, 'blur', this.closeTooltip, this)
      if (remove)
        delete el._tsmap_focus_handler
    }
  },

  _setAriaDescribedByOnLayer(this: any, layer: any): void {
    const el = typeof layer.getElement === 'function' && layer.getElement()
    el?.setAttribute?.('aria-describedby', this._tooltip._container.id)
  },

  _openTooltip(this: any, e: any): void {
    if (!this._tooltip || !this._map)
    return
    if (this._map.dragging?.moving()) {
      if (e.type === 'add' && !this._moveEndOpensTooltip) {
        this._moveEndOpensTooltip = true
        this._map.once('moveend', () => {
          this._moveEndOpensTooltip = false
          this._openTooltip(e)
        })
      }
      return
    }
    this._tooltip._source = e.propagatedFrom ?? e.target
    this.openTooltip(this._tooltip.options.sticky ? e.latlng : undefined)
  },

  _moveTooltip(this: any, e: any): void {
    let latlng = e.latlng
    if (this._tooltip.options.sticky && e.originalEvent) {
      const containerPoint = this._map.pointerEventToContainerPoint(e.originalEvent)
      const layerPoint = this._map.containerPointToLayerPoint(containerPoint)
      latlng = this._map.layerPointToLatLng(layerPoint)
    }
    this._tooltip.setLatLng(latlng)
  },
})
