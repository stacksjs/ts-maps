import * as Util from '../core/Util'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { Control } from './Control'

interface LayerEntry {
  layer: any
  name: string
  overlay?: boolean
}

export class LayersControl extends Control {
  declare _layerControlInputs: any[]
  declare _layers: LayerEntry[]
  _lastZIndex = 0
  _handlingClick = false
  _preventClick = false
  declare _section: HTMLElement
  declare _separator: HTMLElement
  declare _baseLayersList: HTMLElement
  declare _overlaysList: HTMLElement
  declare _layersLink: HTMLAnchorElement
  declare _collapseDelayTimeout?: ReturnType<typeof setTimeout>

  initialize(baseLayers?: Record<string, any>, overlays?: Record<string, any>, options?: any): void {
    super.initialize(options)
    this._layerControlInputs = []
    this._layers = []
    this._lastZIndex = 0
    this._handlingClick = false
    this._preventClick = false

    for (const [name, layer] of Object.entries(baseLayers ?? {}))
    this._addLayer(layer, name)
    for (const [name, layer] of Object.entries(overlays ?? {}))
    this._addLayer(layer, name, true)
  }

  onAdd(map: any): HTMLElement {
    this._initLayout()
    this._update()
    this._map = map
    map.on('zoomend', this._checkDisabledLayers, this)

    for (const layer of this._layers)
    layer.layer.on('add remove', this._onLayerChange, this)

    if (!this.options!.collapsed)
    map.on('resize', this._expandIfNotCollapsed, this)

    return this._container as HTMLElement
  }

  addTo(map: any): this {
    super.addTo(map)
    return this._expandIfNotCollapsed()
  }

  onRemove(): void {
    this._map.off('zoomend', this._checkDisabledLayers, this)
    for (const layer of this._layers)
    layer.layer.off('add remove', this._onLayerChange, this)
    this._map.off('resize', this._expandIfNotCollapsed, this)
  }

  addBaseLayer(layer: any, name: string): this {
    this._addLayer(layer, name)
    return this._map ? this._update() : this
  }

  addOverlay(layer: any, name: string): this {
    this._addLayer(layer, name, true)
    return this._map ? this._update() : this
  }

  removeLayer(layer: any): this {
    layer.off('add remove', this._onLayerChange, this)
    const obj = this._getLayer(Util.stamp(layer))
    if (obj)
    this._layers.splice(this._layers.indexOf(obj), 1)
    return this._map ? this._update() : this
  }

  expand(): this {
    clearTimeout(this._collapseDelayTimeout as any)
    this._container!.classList.add('tsmap-control-layers-expanded')
    this._section.style.height = ''
    const acceptableHeight = this._map.getSize().y - (this._container!.offsetTop + 50)
    if (acceptableHeight < this._section.clientHeight) {
      this._section.classList.add('tsmap-control-layers-scrollbar')
      this._section.style.height = `${acceptableHeight}px`
    }
    else {
      this._section.classList.remove('tsmap-control-layers-scrollbar')
    }
    this._checkDisabledLayers()
    return this
  }

  collapse(ev?: any): this {
    if (!ev || !((ev.type === 'pointerleave' || ev.type === 'pointerout') && ev.pointerType === 'touch')) {
      if (this.options!.collapseDelay > 0) {
        this._collapseDelayTimeout = setTimeout(() => {
          this._container!.classList.remove('tsmap-control-layers-expanded')
        }, this.options!.collapseDelay)
        return this
      }
      this._container!.classList.remove('tsmap-control-layers-expanded')
    }
    return this
  }

  _initLayout(): void {
    const className = 'tsmap-control-layers'
    const container = this._container = DomUtil.create('div', className)
    const collapsed = this.options!.collapsed

    DomEvent.disableClickPropagation(container)
    DomEvent.disableScrollPropagation(container)

    const section = this._section = DomUtil.create('fieldset', `${className}-list`)

    if (collapsed) {
      this._map.on('click', this.collapse, this)
      DomEvent.on(container, {
        pointerenter: this._expandSafely,
        pointerleave: this.collapse,
      }, this)
    }

    const link = this._layersLink = DomUtil.create('a', `${className}-toggle`, container) as HTMLAnchorElement
    link.href = '#'
    link.title = 'Layers'
    link.setAttribute('role', 'button')

    DomEvent.on(link, {
      keydown(this: LayersControl, e: any) {
        if (e.code === 'Enter')
        this._expandSafely()
      },
      click(this: LayersControl, e: any) {
        e.preventDefault()
        this._expandSafely()
      },
    }, this)

    if (!collapsed)
    this.expand()

    this._baseLayersList = DomUtil.create('div', `${className}-base`, section)
    this._separator = DomUtil.create('div', `${className}-separator`, section)
    this._overlaysList = DomUtil.create('div', `${className}-overlays`, section)

    container.appendChild(section)
  }

  _getLayer(id: number): LayerEntry | undefined {
    for (const layer of this._layers) {
      if (layer && Util.stamp(layer.layer) === id)
      return layer
    }
  }

  _addLayer(layer: any, name: string, overlay?: boolean): void {
    if (this._map)
    layer.on('add remove', this._onLayerChange, this)

    this._layers.push( { layer, name, overlay })

    if (this.options!.sortLayers)
    this._layers.sort((a, b) => this.options!.sortFunction(a.layer, b.layer, a.name, b.name))

    if (this.options!.autoZIndex && layer.setZIndex) {
      this._lastZIndex++
      layer.setZIndex(this._lastZIndex)
    }

    this._expandIfNotCollapsed()
  }

  _update(): this {
    if (!this._container)
    return this

    this._baseLayersList.replaceChildren()
    this._overlaysList.replaceChildren()

    this._layerControlInputs = []
    let baseLayersPresent = false
    let overlaysPresent = false
    let baseLayersCount = 0

    for (const obj of this._layers) {
      this._addItem(obj)
      overlaysPresent ||= !!obj.overlay
      baseLayersPresent ||= !obj.overlay
      baseLayersCount += !obj.overlay ? 1 : 0
    }

    if (this.options!.hideSingleBase) {
      baseLayersPresent = baseLayersPresent && baseLayersCount > 1
      this._baseLayersList.style.display = baseLayersPresent ? '' : 'none'
    }

    this._separator.style.display = overlaysPresent && baseLayersPresent ? '' : 'none'
    return this
  }

  _onLayerChange(e: any): void {
    if (!this._handlingClick)
    this._update()

    const obj = this._getLayer(Util.stamp(e.target))!
    const type = obj.overlay
    ? (e.type === 'add' ? 'overlayadd' : 'overlayremove')
    : (e.type === 'add' ? 'baselayerchange' : null)

    if (type)
    this._map.fire(type, obj)
  }

  _addItem(obj: LayerEntry): HTMLLabelElement {
    const label = document.createElement('label')
    const checked = this._map.hasLayer(obj.layer)

    const input = document.createElement('input') as HTMLInputElement & { layerId?: number }
    input.type = obj.overlay ? 'checkbox' : 'radio'
    input.className = 'tsmap-control-layers-selector'
    input.defaultChecked = checked
    if (!obj.overlay)
    input.name = `tsmap-base-layers_${Util.stamp(this)}`

    this._layerControlInputs.push(input)
    input.layerId = Util.stamp(obj.layer)

    DomEvent.on(input, 'click', this._onInputClick, this)

    const name = document.createElement('span')
    name.innerHTML = ` ${obj.name}`

    const holder = document.createElement('span')
    label.appendChild(holder)
    holder.appendChild(input)
    holder.appendChild(name)

    const container = obj.overlay ? this._overlaysList : this._baseLayersList
    container.appendChild(label)

    this._checkDisabledLayers()
    return label
  }

  _onInputClick(e: any): void {
    if (this._preventClick)
    return

    const inputs = this._layerControlInputs
    const addedLayers: any[] = []
    const removedLayers: any[] = []

    this._handlingClick = true

    for (const input of inputs) {
      const layer = this._getLayer(input.layerId)!.layer
      if (input.checked)
      addedLayers.push(layer)
      else
      removedLayers.push(layer)
    }

    for (const layer of removedLayers) {
      if (this._map.hasLayer(layer))
      this._map.removeLayer(layer)
    }
    for (const layer of addedLayers) {
      if (!this._map.hasLayer(layer))
      this._map.addLayer(layer)
    }

    this._handlingClick = false
    this._refocusOnMap(e)
  }

  _checkDisabledLayers(): void {
    const inputs = this._layerControlInputs
    const zoom = this._map.getZoom()
    for (const input of inputs) {
      const layer = this._getLayer(input.layerId)!.layer
      input.disabled = (layer.options.minZoom !== undefined && zoom < layer.options.minZoom)
      || (layer.options.maxZoom !== undefined && zoom > layer.options.maxZoom)
    }
  }

  _expandIfNotCollapsed(): this {
    if (this._map && !this.options!.collapsed)
    this.expand()
    return this
  }

  _expandSafely(): void {
    const section = this._section
    this._preventClick = true
    DomEvent.on(section, 'click', DomEvent.preventDefault)
    this.expand()
    setTimeout(() => {
      DomEvent.off(section, 'click', DomEvent.preventDefault)
      this._preventClick = false
    })
  }
}

LayersControl.setDefaultOptions( {
  collapsed: true,
  collapseDelay: 0,
  position: 'topright',
  autoZIndex: true,
  hideSingleBase: false,
  sortLayers: false,
  sortFunction(_layerA: any, _layerB: any, nameA: string, nameB: string): number {
    return nameA < nameB ? -1 : (nameB < nameA ? 1 : 0)
  },
})
