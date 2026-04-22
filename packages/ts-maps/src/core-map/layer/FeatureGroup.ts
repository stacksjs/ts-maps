import type { Layer } from './Layer'
import { LatLngBounds } from '../geo/LatLngBounds'
import { LayerGroup } from './LayerGroup'

export class FeatureGroup extends LayerGroup {
  addLayer(layer: Layer): this {
    if (this.hasLayer(layer))
    return this

    layer.addEventParent(this)
    super.addLayer(layer)
    return this.fire('layeradd', { layer }) as this
  }

  removeLayer(layer: Layer | number): this {
    if (!this.hasLayer(layer as any))
    return this
    const actual = (typeof layer === 'number' ? this._layers[layer] : layer) as Layer

    actual.removeEventParent(this)
    super.removeLayer(actual)
    return this.fire('layerremove', { layer: actual }) as this
  }

  setStyle(style: any): this {
    return this.eachLayer(l => (l as any).setStyle?.(style))
  }

  bringToFront(): this {
    return this.eachLayer(l => (l as any).bringToFront?.())
  }

  bringToBack(): this {
    return this.eachLayer(l => (l as any).bringToBack?.())
  }

  getBounds(): LatLngBounds {
    const bounds = new LatLngBounds()
    for (const layer of Object.values(this._layers))
    bounds.extend((layer as any).getBounds ? (layer as any).getBounds() : (layer as any).getLatLng())
    return bounds
  }
}
