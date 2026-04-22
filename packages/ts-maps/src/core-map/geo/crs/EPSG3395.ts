import { Transformation } from '../../geometry/Transformation'
import { Mercator } from '../projection/Projection.Mercator'
import { EarthCRS } from './EarthCRS'

export class EPSG3395 extends EarthCRS {
  static code = 'EPSG:3395'
  static projection: any = Mercator
  static transformation: Transformation = (() => {
    const scale = 0.5 / (Math.PI * Mercator.R)
    return new Transformation(scale, 0.5, -scale, 0.5)
  })()
}
