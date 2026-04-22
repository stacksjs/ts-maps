import { Bounds } from '../../geometry/Bounds'
import { Point } from '../../geometry/Point'
import { LatLng } from '../LatLng'

export interface ProjectionLike {
  bounds: Bounds
  project: (latlng: any) => Point
  unproject: (point: any) => LatLng
  [k: string]: any
}

// Equirectangular (Plate Carree) projection.
export const LonLat: ProjectionLike = {
  project(latlng: any): Point {
    const ll = new LatLng(latlng)
    return new Point(ll.lng, ll.lat)
  },
  unproject(point: any): LatLng {
    const p = new Point(point)
    return new LatLng(p.y, p.x)
  },
  bounds: new Bounds([-180, -90], [180, 90]),
}
