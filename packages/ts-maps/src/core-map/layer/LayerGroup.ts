import * as Util from '../core/Util'
import { Layer } from './Layer'

export class LayerGroup extends Layer {
  declare _layers: Record<number | string, Layer>

  initialize(layers?: Layer[], options?: any): void {
    Util.setOptions(this as any, options);
    (this as any)._layers = {}
    for (const layer of layers ?? [])
      this.addLayer(layer)
  }

  addLayer(layer: Layer): this {
    const id = this.getLayerId(layer)
    this._layers[id] = layer
    this._map?.addLayer(layer)
    return this
  }

  removeLayer(layer: Layer | number): this {
    const id = typeof layer === 'number' ? layer : this.getLayerId(layer)

    if (this._map && this._layers[id])
    this._map.removeLayer(this._layers[id])

    delete this._layers[id]
    return this
  }

  hasLayer(layer: Layer | number): boolean {
    const layerId = typeof layer === 'number' ? layer : this.getLayerId(layer)
    return layerId in this._layers
  }

  clearLayers(): this {
    return this.eachLayer(this.removeLayer, this)
  }

  onAdd(map: any): void {
    this.eachLayer(map.addLayer, map)
  }

  onRemove(map: any): void {
    this.eachLayer(map.removeLayer, map)
  }

  eachLayer(method: (layer: Layer) => void, context?: any): this {
    for (const layer of Object.values(this._layers))
    method.call(context, layer)
    return this
  }

  getLayer(id: number): Layer | undefined {
    return this._layers[id]
  }

  getLayers(): Layer[] {
    const layers: Layer[] = []
    this.eachLayer((l: Layer) => layers.push(l))
    return layers
  }

  setZIndex(zIndex: number): this {
    return this.eachLayer(l => (l as any).setZIndex?.(zIndex))
  }

  getLayerId(layer: Layer): number {
    return Util.stamp(layer)
  }
}
