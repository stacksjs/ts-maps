import type { ProjectionLike } from './Projection.LonLat'
import { Bounds } from '../../geometry/Bounds'
import { Point } from '../../geometry/Point'
import { LatLng } from '../LatLng'

const earthRadius = 6378137

interface SphericalMercatorProjection extends ProjectionLike {
  R: number
  MAX_LATITUDE: number
}

// Spherical Mercator projection — the most common for online maps (EPSG:3857).
export const SphericalMercator: SphericalMercatorProjection = {
  R: earthRadius,
  MAX_LATITUDE: 85.0511287798,

  project(latlng: any): Point {
    const ll = new LatLng(latlng)
    const d = Math.PI / 180
    const max = this.MAX_LATITUDE
    const lat = Math.max(Math.min(max, ll.lat), -max)
    const sin = Math.sin(lat * d)
    return new Point(
    this.R * ll.lng * d,
    this.R * Math.log((1 + sin) / (1 - sin)) / 2,
    )
  },

  unproject(point: any): LatLng {
    const p = new Point(point)
    const d = 180 / Math.PI
    return new LatLng(
    (2 * Math.atan(Math.exp(p.y / this.R)) - (Math.PI / 2)) * d,
    p.x * d / this.R,
    )
  },

  bounds: ((): Bounds => {
    const d = earthRadius * Math.PI
    return new Bounds([-d, -d], [d, d])
  })(),
}
