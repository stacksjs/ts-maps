import type { LatLngLike } from './LatLng'
import { LatLng } from './LatLng'

export type LatLngBoundsLike = LatLngBounds | [LatLngLike, LatLngLike] | LatLngLike[]

// Represents a rectangular geographical area on a map.
export class LatLngBounds {
  _southWest?: LatLng
  _northEast?: LatLng

  constructor(corner1?: any, corner2?: LatLngLike) {
    if (!corner1)
    return

    if (corner1 instanceof LatLngBounds) {
      // eslint-disable-next-line no-constructor-return
      return corner1 as LatLngBounds
    }

    const latlngs = corner2 ? [corner1, corner2] : corner1
    for (const latlng of latlngs)
    this.extend(latlng)
  }

  extend(obj: any): this {
    const sw = this._southWest
    const ne = this._northEast
    let sw2: LatLng, ne2: LatLng

    if (obj instanceof LatLng) {
      sw2 = obj
      ne2 = obj
    }
    else if (obj instanceof LatLngBounds) {
      sw2 = obj._southWest as LatLng
      ne2 = obj._northEast as LatLng
      if (!sw2 || !ne2)
      return this
    }
    else {
      if (!obj)
      return this
      if (LatLng.validate(obj))
      return this.extend(new LatLng(obj))
      return this.extend(new LatLngBounds(obj))
    }

    if (!sw && !ne) {
      this._southWest = new LatLng(sw2.lat, sw2.lng)
      this._northEast = new LatLng(ne2.lat, ne2.lng)
    }
    else {
      sw!.lat = Math.min(sw2.lat, sw!.lat)
      sw!.lng = Math.min(sw2.lng, sw!.lng)
      ne!.lat = Math.max(ne2.lat, ne!.lat)
      ne!.lng = Math.max(ne2.lng, ne!.lng)
    }
    return this
  }

  pad(bufferRatio: number): LatLngBounds {
    const sw = this._southWest!
    const ne = this._northEast!
    const heightBuffer = Math.abs(sw.lat - ne.lat) * bufferRatio
    const widthBuffer = Math.abs(sw.lng - ne.lng) * bufferRatio
    return new LatLngBounds(
    new LatLng(sw.lat - heightBuffer, sw.lng - widthBuffer),
    new LatLng(ne.lat + heightBuffer, ne.lng + widthBuffer),
    )
  }

  getCenter(): LatLng {
    return new LatLng(
    (this._southWest!.lat + this._northEast!.lat) / 2,
    (this._southWest!.lng + this._northEast!.lng) / 2,
    )
  }

  getSouthWest(): LatLng { return this._southWest as LatLng }
  getNorthEast(): LatLng { return this._northEast as LatLng }
  getNorthWest(): LatLng { return new LatLng(this.getNorth(), this.getWest()) }
  getSouthEast(): LatLng { return new LatLng(this.getSouth(), this.getEast()) }
  getWest(): number { return this._southWest!.lng }
  getSouth(): number { return this._southWest!.lat }
  getEast(): number { return this._northEast!.lng }
  getNorth(): number { return this._northEast!.lat }

  contains(obj: any): boolean {
    let target: any = obj
    if (LatLng.validate(target))
    target = new LatLng(target)
    else
    target = new LatLngBounds(target)

    const sw = this._southWest!
    const ne = this._northEast!
    let sw2: LatLng, ne2: LatLng

    if (target instanceof LatLngBounds) {
      sw2 = target.getSouthWest()
      ne2 = target.getNorthEast()
    }
    else {
      sw2 = ne2 = target
    }

    return sw2.lat >= sw.lat && ne2.lat <= ne.lat && sw2.lng >= sw.lng && ne2.lng <= ne.lng
  }

  intersects(bounds: LatLngBoundsLike): boolean {
    const b = new LatLngBounds(bounds as any)
    const sw = this._southWest!
    const ne = this._northEast!
    const sw2 = b.getSouthWest()
    const ne2 = b.getNorthEast()
    const latIntersects = ne2.lat >= sw.lat && sw2.lat <= ne.lat
    const lngIntersects = ne2.lng >= sw.lng && sw2.lng <= ne.lng
    return latIntersects && lngIntersects
  }

  overlaps(bounds: LatLngBoundsLike): boolean {
    const b = new LatLngBounds(bounds as any)
    const sw = this._southWest!
    const ne = this._northEast!
    const sw2 = b.getSouthWest()
    const ne2 = b.getNorthEast()
    const latOverlaps = ne2.lat > sw.lat && sw2.lat < ne.lat
    const lngOverlaps = ne2.lng > sw.lng && sw2.lng < ne.lng
    return latOverlaps && lngOverlaps
  }

  toBBoxString(): string {
    return [this.getWest(), this.getSouth(), this.getEast(), this.getNorth()].join(',')
  }

  equals(bounds: LatLngBoundsLike | null | undefined, maxMargin?: number): boolean {
    if (!bounds)
    return false
    const b = new LatLngBounds(bounds as any)
    return this._southWest!.equals(b.getSouthWest(), maxMargin)
    && this._northEast!.equals(b.getNorthEast(), maxMargin)
  }

  isValid(): boolean {
    return !!(this._southWest && this._northEast)
  }
}

export function toLatLngBounds(a?: any, b?: LatLngLike): LatLngBounds {
  if (a instanceof LatLngBounds)
  return a
  return new LatLngBounds(a, b)
}
