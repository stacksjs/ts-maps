import * as Util from '../core/Util'
import { EarthCRS } from './crs/EarthCRS'
import { LatLngBounds } from './LatLngBounds'

export type LatLngTuple = [number, number] | [number, number, number]
export type LatLngLike = LatLng | LatLngTuple | { lat: number, lng?: number, lon?: number, alt?: number } | number

// Represents a geographical point (latitude, longitude, optional altitude).
export class LatLng {
  lat!: number
  lng!: number
  alt?: number

  constructor(lat: LatLngLike | number, lng?: number, alt?: number) {
    const valid = LatLng.validate(lat, lng, alt)
    if (!valid)
    throw new Error(`Invalid LatLng object: (${lat}, ${lng})`)

    let _lat: number, _lng: number, _alt: number | undefined
    if (lat instanceof LatLng) {
      // eslint-disable-next-line no-constructor-return
      return lat as LatLng
    }
    else if (Array.isArray(lat) && typeof (lat as any)[0] !== 'object') {
      if (lat.length === 3) {
        _lat = lat[0] as number
        _lng = lat[1] as number
        _alt = lat[2] as number
      }
      else {
        _lat = lat[0] as number
        _lng = lat[1] as number
      }
    }
    else if (typeof lat === 'object' && lat !== null && 'lat' in (lat as any)) {
      const o = lat as any
      _lat = o.lat
      _lng = 'lng' in o ? o.lng : o.lon
      _alt = o.alt
    }
    else {
      _lat = lat as number
      _lng = lng as number
      _alt = alt
    }

    this.lat = +_lat!
    this.lng = +_lng!
    if (_alt !== undefined)
    this.alt = +_alt
  }

  static validate(lat: any, lng?: any, _alt?: any): boolean {
    if (lat instanceof LatLng || (typeof lat === 'object' && lat !== null && 'lat' in lat))
    return true
    if (lat && Array.isArray(lat) && typeof lat[0] !== 'object') {
      if (lat.length === 3 || lat.length === 2)
      return true
      return false
    }
    if ((lat || lat === 0) && (lng || lng === 0))
    return true
    return false
  }

  equals(obj: LatLngLike, maxMargin?: number): boolean {
    if (!obj)
    return false
    const other = new LatLng(obj as any)
    const margin = Math.max(Math.abs(this.lat - other.lat), Math.abs(this.lng - other.lng))
    return margin <= (maxMargin ?? 1.0E-9)
  }

  toString(precision?: number): string {
    return `LatLng(${Util.formatNum(this.lat, precision)}, ${Util.formatNum(this.lng, precision)})`
  }

  distanceTo(other: LatLngLike): number {
    return EarthCRS.distance(this, new LatLng(other as any))
  }

  wrap(): LatLng {
    return EarthCRS.wrapLatLng(this)
  }

  toBounds(sizeInMeters: number): LatLngBounds {
    const latAccuracy = 180 * sizeInMeters / 40075017
    const lngAccuracy = latAccuracy / Math.cos((Math.PI / 180) * this.lat)
    return new LatLngBounds(
    [this.lat - latAccuracy, this.lng - lngAccuracy],
    [this.lat + latAccuracy, this.lng + lngAccuracy],
    )
  }

  clone(): LatLng {
    const latlng = new LatLng(0, 0)
    latlng.lat = this.lat
    latlng.lng = this.lng
    latlng.alt = this.alt
    return latlng
  }
}

export function toLatLng(a: LatLngLike | null | undefined, b?: number, c?: number): LatLng {
  if (a instanceof LatLng)
  return a
  if (a === null || a === undefined)
  return a as any
  return new LatLng(a as any, b, c)
}
