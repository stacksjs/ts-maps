import type { ProjectionLike } from './Projection.LonLat'
import { Bounds } from '../../geometry/Bounds'
import { Point } from '../../geometry/Point'
import { LatLng } from '../LatLng'

const earthRadius = 6378137

interface MercatorProjection extends ProjectionLike {
  R: number
  R_MINOR: number
}

// Elliptical Mercator projection (EPSG:3395).
export const Mercator: MercatorProjection = {
  R: earthRadius,
  R_MINOR: 6356752.314245179,
  bounds: new Bounds([-20037508.34279, -15496570.73972], [20037508.34279, 18764656.23138]),

  project(latlng: any): Point {
    const ll = new LatLng(latlng)
    const d = Math.PI / 180
    const r = this.R
    const tmp = this.R_MINOR / r
    const e = Math.sqrt(1 - tmp * tmp)
    let y = ll.lat * d
    const con = e * Math.sin(y)
    const ts = Math.tan(Math.PI / 4 - y / 2) / ((1 - con) / (1 + con)) ** (e / 2)
    y = -r * Math.log(Math.max(ts, 1E-10))
    return new Point(ll.lng * d * r, y)
  },

  unproject(point: any): LatLng {
    const p = new Point(point)
    const d = 180 / Math.PI
    const r = this.R
    const tmp = this.R_MINOR / r
    const e = Math.sqrt(1 - tmp * tmp)
    const ts = Math.exp(-p.y / r)
    let phi = Math.PI / 2 - 2 * Math.atan(ts)
    let dphi = 0.1
    for (let i = 0; i < 15 && Math.abs(dphi) > 1e-7; i++) {
      let con = e * Math.sin(phi)
      con = ((1 - con) / (1 + con)) ** (e / 2)
      dphi = Math.PI / 2 - 2 * Math.atan(ts * con) - phi
      phi += dphi
    }
    return new LatLng(phi * d, p.x * d / r)
  },
}
