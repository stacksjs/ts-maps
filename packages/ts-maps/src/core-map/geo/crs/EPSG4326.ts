import { Transformation } from '../../geometry/Transformation'
import { LonLat } from '../projection/Projection.LonLat'
import { EarthCRS } from './EarthCRS'

export class EPSG4326 extends EarthCRS {
  static code = 'EPSG:4326'
  static projection: any = LonLat
  static transformation: Transformation = new Transformation(1 / 180, 1, -1 / 180, 0.5)
}
