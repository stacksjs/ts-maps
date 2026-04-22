import * as Util from '../../core/Util'
import * as LineUtil from '../../geometry/LineUtil'
import { LatLng } from '../../geo/LatLng'
import { LatLngBounds } from '../../geo/LatLngBounds'
import { Bounds } from '../../geometry/Bounds'
import { Point } from '../../geometry/Point'
import { Path } from './Path'

export class Polyline extends Path {
  declare _latlngs: any[]
  declare _bounds: LatLngBounds
  declare _rings: Point[][]
  declare _rawPxBounds?: Bounds

  initialize(latlngs: any[], options?: any): void {
    Util.setOptions(this as any, options)
    this._setLatLngs(latlngs)
  }

  getLatLngs(): any[] {
    return this._latlngs
  }

  setLatLngs(latlngs: any[]): this {
    this._setLatLngs(latlngs)
    return this.redraw()
  }

  isEmpty(): boolean {
    return !this._latlngs.length
  }

  closestLayerPoint(p: Point): (Point & { distance?: number }) | null {
    p = new Point(p)
    let minDistance = Infinity
    let minPoint: (Point & { distance?: number }) | null = null
    const closest = LineUtil._sqClosestPointOnSegment

    for (const points of this._parts as Point[][]) {
      for (let i = 1, len = points.length; i < len; i++) {
        const p1 = points[i - 1]
        const p2 = points[i]
        const sqDist = closest(p, p1, p2, true) as number
        if (sqDist < minDistance) {
          minDistance = sqDist
          minPoint = closest(p, p1, p2) as Point
        }
      }
    }
    if (minPoint)
    minPoint.distance = Math.sqrt(minDistance)
    return minPoint
  }

  getCenter(): LatLng {
    if (!this._map)
    throw new Error('Must add layer to map before using getCenter()')
    return LineUtil.polylineCenter(this._defaultShape(), this._map.options.crs)
  }

  getBounds(): LatLngBounds {
    return this._bounds
  }

  addLatLng(latlng: any, latlngs?: any[]): this {
    const arr = latlngs ?? this._defaultShape()
    const ll = new LatLng(latlng)
    arr.push(ll)
    this._bounds.extend(ll)
    return this.redraw()
  }

  _setLatLngs(latlngs: any[]): void {
    this._bounds = new LatLngBounds()
    this._latlngs = this._convertLatLngs(latlngs)
  }

  _defaultShape(): any[] {
    return LineUtil.isFlat(this._latlngs) ? this._latlngs : this._latlngs[0]
  }

  _convertLatLngs(latlngs: any[]): any[] {
    const result: any[] = []
    const flat = LineUtil.isFlat(latlngs)

    for (let i = 0, len = latlngs.length; i < len; i++) {
      if (flat) {
        result[i] = new LatLng(latlngs[i])
        this._bounds.extend(result[i])
      }
      else {
        result[i] = this._convertLatLngs(latlngs[i])
      }
    }

    return result
  }

  _project(): void {
    const pxBounds = new Bounds()
    this._rings = []
    this._projectLatlngs(this._latlngs, this._rings, pxBounds)

    if (this._bounds.isValid() && pxBounds.isValid()) {
      this._rawPxBounds = pxBounds
      this._updateBounds()
    }
  }

  _updateBounds(): void {
    const w = this._clickTolerance()
    const p = new Point(w, w)
    if (!this._rawPxBounds)
    return
    this._pxBounds = new Bounds([
    this._rawPxBounds.min.subtract(p),
    this._rawPxBounds.max.add(p),
    ])
  }

  _projectLatlngs(latlngs: any[], result: Point[][], projectedBounds: Bounds): void {
    const flat = latlngs[0] instanceof LatLng

    if (flat) {
      const ring = latlngs.map((latlng: any) => this._map.latLngToLayerPoint(latlng))
      ring.forEach((r: Point) => projectedBounds.extend(r))
      result.push(ring)
    }
    else {
      latlngs.forEach((latlng: any) => this._projectLatlngs(latlng, result, projectedBounds))
    }
  }

  _clipPoints(): void {
    const bounds = this._renderer._bounds
    this._parts = []
    if (!this._pxBounds || !this._pxBounds.intersects(bounds))
    return

    if (this.options!.noClip) {
      this._parts = this._rings
      return
    }

    const parts = this._parts

    for (let i = 0, k = 0, len = this._rings.length; i < len; i++) {
      const points = this._rings[i]
      for (let j = 0, len2 = points.length; j < len2 - 1; j++) {
        const segment = LineUtil.clipSegment(points[j], points[j + 1], bounds, !!j, true)
        if (!segment)
        continue

        parts[k] ??= []
        parts[k].push(segment[0])

        if (segment[1] !== points[j + 1] || j === len2 - 2) {
          parts[k].push(segment[1])
          k++
        }
      }
    }
  }

  _simplifyPoints(): void {
    const parts = this._parts as Point[][]
    const tolerance = this.options!.smoothFactor
    for (let i = 0, len = parts.length; i < len; i++)
    parts[i] = LineUtil.simplify(parts[i], tolerance)
  }

  _update(): void {
    if (!this._map)
    return
    this._clipPoints()
    this._simplifyPoints()
    this._updatePath()
  }

  _updatePath(): void {
    this._renderer._updatePoly(this)
  }

  _containsPoint(p: Point, closed?: boolean): boolean {
    const w = this._clickTolerance()

    if (!this._pxBounds || !this._pxBounds.contains(p))
    return false

    for (let i = 0, len = (this._parts as Point[][]).length; i < len; i++) {
      const part = (this._parts as Point[][])[i]
      for (let j = 0, len2 = part.length, k = len2 - 1; j < len2; k = j++) {
        if (!closed && j === 0)
        continue
        if (LineUtil.pointToSegmentDistance(p, part[k], part[j]) <= w)
        return true
      }
    }
    return false
  }
}

Polyline.setDefaultOptions( { smoothFactor: 0.5, noClip: false })
