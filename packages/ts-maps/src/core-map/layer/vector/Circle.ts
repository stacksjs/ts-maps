import { EarthCRS } from '../../geo/crs/EarthCRS'
import { LatLngBounds } from '../../geo/LatLngBounds'
import { CircleMarker } from './CircleMarker'

export class Circle extends CircleMarker {
  initialize(latlng: any, options?: any): void {
    super.initialize(latlng, options)
    if (Number.isNaN(this.options!.radius))
    throw new Error('Circle radius cannot be NaN')
  }

  getBounds(): LatLngBounds {
    const half: [number, number] = [this._pxRadius as number, this._pxRadiusY ?? (this._pxRadius as number)]
    return new LatLngBounds(
    this._map.layerPointToLatLng((this._point as any).subtract(half)),
    this._map.layerPointToLatLng((this._point as any).add(half)),
    )
  }

  _project(): void {
    const lng = this._latlng.lng
    const lat = this._latlng.lat
    const map = this._map
    const crs = map.options.crs

    if (crs.distance === EarthCRS.distance) {
      const d = Math.PI / 180
      const latR = (this._radius / EarthCRS.R) / d
      const top = map.project([lat + latR, lng])
      const bottom = map.project([lat - latR, lng])
      const p = top.add(bottom).divideBy(2)
      const lat2 = map.unproject(p).lat
      let lngR = Math.acos(
      (Math.cos(latR * d) - Math.sin(lat * d) * Math.sin(lat2 * d))
      / (Math.cos(lat * d) * Math.cos(lat2 * d)),
      ) / d

      if (Number.isNaN(lngR) || lngR === 0)
      lngR = latR / Math.cos(Math.PI / 180 * lat)

      this._point = p.subtract(map.getPixelOrigin())
      this._pxRadius = Number.isNaN(lngR) ? 0 : p.x - map.project([lat2, lng - lngR]).x
      this._pxRadiusY = p.y - top.y
    }
    else {
      const latlng2 = crs.unproject(crs.project(this._latlng).subtract([this._radius, 0]))
      this._point = map.latLngToLayerPoint(this._latlng)
      this._pxRadius = Math.abs((this._point as any).x - map.latLngToLayerPoint(latlng2).x)
    }

    this._updateBounds()
  }
}
