import * as Util from '../core/Util'
import { Evented } from '../core/Events'
import { TsMap } from '../map/Map'

export class Layer extends Evented {
  _map?: any
  _mapToAdd?: any
  _zoomAnimated?: boolean

  getEvents(): Record<string, any> { return {} }
  onAdd(_map: any): void {}
  onRemove(_map: any): void {}
  beforeAdd(_map: any): void {}

  addTo(map: any): this {
    map.addLayer(this)
    return this
  }

  remove(): this {
    return this.removeFrom(this._map || this._mapToAdd)
  }

  removeFrom(obj: any): this {
    obj?.removeLayer(this)
    return this
  }

  getPane(name?: string): HTMLElement {
    return this._map.getPane(name ? (this.options?.[name] || name) : this.options!.pane)
  }

  addInteractiveTarget(targetEl: any): this {
    this._map._targets[Util.stamp(targetEl)] = this
    return this
  }

  removeInteractiveTarget(targetEl: any): this {
    delete this._map._targets[Util.stamp(targetEl)]
    return this
  }

  getAttribution(): string | null | undefined {
    return this.options?.attribution
  }

  _layerAdd(e: any): void {
    const map = e.target
    if (!map.hasLayer(this))
    return

    this._map = map
    this._zoomAnimated = map._zoomAnimated

    const events = this.getEvents()
    if (events && Object.keys(events).length) {
      map.on(events, this)
      this.once('remove', () => map.off(events, this))
    }

    this.onAdd(map)
    this.fire('add')
    map.fire('layeradd', { layer: this })
  }
}

Layer.setDefaultOptions( {
  pane: 'overlayPane',
  attribution: null,
  bubblingPointerEvents: true,
})

// Extend TsMap with layer-management methods.
TsMap.include( {
  addLayer(this: any, layer: Layer): any {
    if (!(layer as any)._layerAdd)
    throw new Error('The provided object is not a Layer.')

    const id = Util.stamp(layer)
    if (this._layers[id])
    return this
    this._layers[id] = layer

    ; (layer as any)._mapToAdd = this

    layer.beforeAdd(this)
    this.whenReady((layer as any)._layerAdd, layer)
    return this
  },

  removeLayer(this: any, layer: Layer): any {
    const id = Util.stamp(layer)
    if (!this._layers[id])
    return this

    if (this._loaded)
    layer.onRemove(this)

    delete this._layers[id]

    if (this._loaded) {
      this.fire('layerremove', { layer })
      layer.fire('remove')
    }

    (layer as any)._map = (layer as any)._mapToAdd = null
    return this
  },

  hasLayer(this: any, layer: Layer): boolean {
    return Util.stamp(layer) in this._layers
  },

  eachLayer(this: any, method: (layer: Layer) => void, context?: any): any {
    for (const layer of Object.values(this._layers) as Layer[])
    method.call(context, layer)
    return this
  },

  _addLayers(this: any, layers: any): void {
    const arr = layers ? (Array.isArray(layers) ? layers : [layers]) : []
    for (const layer of arr)
    this.addLayer(layer)
  },

  _addZoomLimit(this: any, layer: Layer): void {
    const opts = layer.options as any
    if (!Number.isNaN(opts?.maxZoom) || !Number.isNaN(opts?.minZoom)) {
      this._zoomBoundLayers[Util.stamp(layer)] = layer
      this._updateZoomLevels()
    }
  },

  _removeZoomLimit(this: any, layer: Layer): void {
    const id = Util.stamp(layer)
    if (this._zoomBoundLayers[id]) {
      delete this._zoomBoundLayers[id]
      this._updateZoomLevels()
    }
  },

  _updateZoomLevels(this: any): void {
    let minZoom = Infinity
    let maxZoom = -Infinity
    const oldZoomSpan = this._getZoomSpan()

    for (const l of Object.values(this._zoomBoundLayers) as any[]) {
      const options = l.options
      minZoom = Math.min(minZoom, options.minZoom ?? Infinity)
      maxZoom = Math.max(maxZoom, options.maxZoom ?? -Infinity)
    }

    this._layersMaxZoom = maxZoom === -Infinity ? undefined : maxZoom
    this._layersMinZoom = minZoom === Infinity ? undefined : minZoom

    if (oldZoomSpan !== this._getZoomSpan())
    this.fire('zoomlevelschange')

    if (this.options.maxZoom === undefined && this._layersMaxZoom && this.getZoom() > this._layersMaxZoom)
    this.setZoom(this._layersMaxZoom)
    if (this.options.minZoom === undefined && this._layersMinZoom && this.getZoom() < this._layersMinZoom)
    this.setZoom(this._layersMinZoom)
  },
})
