import type { Point } from '../../geometry/Point'
import type { Transformation } from '../../geometry/Transformation'
import * as Util from '../../core/Util'
import { Bounds } from '../../geometry/Bounds'
import { LatLng } from '../LatLng'
import { LatLngBounds } from '../LatLngBounds'

export class CRS {
  static projection: any = undefined
  static transformation: Transformation | undefined = undefined
  static code?: string
  static wrapLng?: [number, number]
  static wrapLat?: [number, number]
  static infinite = false

  static latLngToPoint(this: any, latlng: LatLng, zoom: number): Point {
    const projectedPoint = this.projection.project(latlng)
    const scale = this.scale(zoom)
    return this.transformation._transform(projectedPoint, scale)
  }

  static pointToLatLng(this: any, point: Point, zoom: number): LatLng {
    const scale = this.scale(zoom)
    const untransformedPoint = this.transformation.untransform(point, scale)
    return this.projection.unproject(untransformedPoint)
  }

  static project(this: any, latlng: LatLng): Point {
    return this.projection.project(latlng)
  }

  static unproject(this: any, point: Point): LatLng {
    return this.projection.unproject(point)
  }

  static scale(zoom: number): number {
    return 256 * 2 ** zoom
  }

  static zoom(scale: number): number {
    return Math.log(scale / 256) / Math.LN2
  }

  static getProjectedBounds(this: any, zoom: number): Bounds | null {
    if (this.infinite)
    return null
    const b = this.projection.bounds
    const s = this.scale(zoom)
    const min = this.transformation.transform(b.min, s)
    const max = this.transformation.transform(b.max, s)
    return new Bounds(min, max)
  }

  static distance(_a: LatLng, _b: LatLng): number {
    return 0
  }

  static wrapLatLng(this: any, latlng: LatLng): LatLng {
    const ll = new LatLng(latlng)
    const lng = this.wrapLng ? Util.wrapNum(ll.lng, this.wrapLng, true) : ll.lng
    const lat = this.wrapLat ? Util.wrapNum(ll.lat, this.wrapLat, true) : ll.lat
    const alt = ll.alt
    return new LatLng(lat, lng, alt)
  }

  static wrapLatLngBounds(this: any, bounds: LatLngBounds): LatLngBounds {
    const b = new LatLngBounds(bounds)
    const center = b.getCenter()
    const newCenter = this.wrapLatLng(center)
    const latShift = center.lat - newCenter.lat
    const lngShift = center.lng - newCenter.lng

    if (latShift === 0 && lngShift === 0)
    return b

    const sw = b.getSouthWest()
    const ne = b.getNorthEast()
    const newSw = new LatLng(sw.lat - latShift, sw.lng - lngShift)
    const newNe = new LatLng(ne.lat - latShift, ne.lng - lngShift)
    return new LatLngBounds(newSw, newNe)
  }
}
