import { LatLngBounds } from '../../geo/LatLngBounds'
import { Polygon } from './Polygon'

export class Rectangle extends Polygon {
  initialize(latLngBounds: any, options?: any): void {
    super.initialize(this._boundsToLatLngs(latLngBounds), options)
  }

  setBounds(latLngBounds: any): this {
    return this.setLatLngs(this._boundsToLatLngs(latLngBounds))
  }

  _boundsToLatLngs(latLngBounds: any): any[] {
    const b = new LatLngBounds(latLngBounds)
    return [
    b.getSouthWest(),
    b.getNorthWest(),
    b.getNorthEast(),
    b.getSouthEast(),
    ]
  }
}
