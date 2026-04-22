import type { LatLng } from '../LatLng'
import { Transformation } from '../../geometry/Transformation'
import { LonLat } from '../projection/Projection.LonLat'
import { CRS } from './CRS'

export class SimpleCRS extends CRS {
  static projection: any = LonLat
  static transformation: Transformation = new Transformation(1, 0, -1, 0)
  static infinite = true

  static scale(zoom: number): number {
    return 2 ** zoom
  }

  static zoom(scale: number): number {
    return Math.log(scale) / Math.LN2
  }

  static distance(latlng1: LatLng, latlng2: LatLng): number {
    const dx = latlng2.lng - latlng1.lng
    const dy = latlng2.lat - latlng1.lat
    return Math.sqrt(dx * dx + dy * dy)
  }
}
