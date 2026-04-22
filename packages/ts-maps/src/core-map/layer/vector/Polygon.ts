import * as LineUtil from '../../geometry/LineUtil'
import * as PolyUtil from '../../geometry/PolyUtil'
import { LatLng } from '../../geo/LatLng'
import { Bounds } from '../../geometry/Bounds'
import { Point } from '../../geometry/Point'
import { Polyline } from './Polyline'

export class Polygon extends Polyline {
  isEmpty(): boolean {
    return !this._latlngs.length || !this._latlngs[0].length
  }

  getCenter(): LatLng {
    if (!this._map)
    throw new Error('Must add layer to map before using getCenter()')
    return PolyUtil.polygonCenter(this._defaultShape(), this._map.options.crs)
  }

  _convertLatLngs(latlngs: any[]): any[] {
    const result = super._convertLatLngs(latlngs)
    const len = result.length
    if (len >= 2 && result[0] instanceof LatLng && (result[0] as LatLng).equals(result[len - 1]))
    result.pop()
    return result
  }

  _setLatLngs(latlngs: any[]): void {
    super._setLatLngs(latlngs)
    if (LineUtil.isFlat(this._latlngs))
    this._latlngs = [this._latlngs]
  }

  _defaultShape(): any[] {
    return LineUtil.isFlat(this._latlngs[0]) ? this._latlngs[0] : this._latlngs[0][0]
  }

  _clipPoints(): void {
    let bounds = this._renderer._bounds
    const w = this.options!.weight
    const p = new Point(w, w)
    bounds = new Bounds(bounds.min.subtract(p), bounds.max.add(p))

    this._parts = []
    if (!this._pxBounds || !this._pxBounds.intersects(bounds))
    return

    if (this.options!.noClip) {
      this._parts = this._rings
      return
    }

    for (const ring of this._rings) {
      const clipped = PolyUtil.clipPolygon(ring as any, bounds, true)
      if (clipped.length)
      this._parts!.push(clipped)
    }
  }

  _updatePath(): void {
    this._renderer._updatePoly(this, true)
  }

  _containsPoint(p: Point): boolean {
    let inside = false

    if (!this._pxBounds || !this._pxBounds.contains(p))
    return false

    for (let i = 0, len = (this._parts as Point[][]).length; i < len; i++) {
      const part = (this._parts as Point[][])[i]
      for (let j = 0, len2 = part.length, k = len2 - 1; j < len2; k = j++) {
        const p1 = part[j]
        const p2 = part[k]
        if (((p1.y > p.y) !== (p2.y > p.y)) && (p.x < (p2.x - p1.x) * (p.y - p1.y) / (p2.y - p1.y) + p1.x))
        inside = !inside
      }
    }

    return inside || super._containsPoint(p, true)
  }
}

Polygon.setDefaultOptions( { fill: true })
