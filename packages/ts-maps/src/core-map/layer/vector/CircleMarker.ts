import type { Point } from '../../geometry/Point'
import * as Util from '../../core/Util'
import { LatLng } from '../../geo/LatLng'
import { Bounds } from '../../geometry/Bounds'
import { Path } from './Path'

export class CircleMarker extends Path {
  _latlng!: LatLng
  _radius!: number
  _point?: Point
  _pxRadius?: number
  _pxRadiusY?: number

  initialize(latlng: any, options?: any): void {
    Util.setOptions(this as any, options)
    this._latlng = new LatLng(latlng)
    this._radius = this.options!.radius
  }

  setLatLng(latlng: any): this {
    const oldLatLng = this._latlng
    this._latlng = new LatLng(latlng)
    this.redraw()
    return this.fire('move', { oldLatLng, latlng: this._latlng })
  }

  getLatLng(): LatLng {
    return this._latlng
  }

  setRadius(radius: number): this {
    this.options!.radius = this._radius = radius
    return this.redraw()
  }

  getRadius(): number {
    return this._radius
  }

  setStyle(options?: any): this {
    super.setStyle(options)
    if (options?.radius !== undefined)
    this.setRadius(options.radius)
    return this
  }

  _project(): void {
    this._point = this._map.latLngToLayerPoint(this._latlng)
    this._pxRadius = this._radius
    this._updateBounds()
  }

  _updateBounds(): void {
    const r = this._pxRadius as number
    const r2 = this._pxRadiusY ?? r
    const w = this._clickTolerance()
    const p: [number, number] = [r + w, r2 + w]
    this._pxBounds = new Bounds((this._point as Point).subtract(p), (this._point as Point).add(p))
  }

  _update(): void {
    if (this._map)
    this._updatePath()
  }

  _updatePath(): void {
    this._renderer._updateCircle(this)
  }

  _empty(): boolean {
    return !!this._pxRadius && !this._renderer._bounds.intersects(this._pxBounds)
  }

  _containsPoint(p: Point): boolean {
    return p.distanceTo(this._point as Point) <= (this._pxRadius as number) + this._clickTolerance()
  }
}

CircleMarker.setDefaultOptions( { fill: true, radius: 10 })
