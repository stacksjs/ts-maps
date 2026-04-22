import { Transformation } from '../../geometry/Transformation'
import { SphericalMercator } from '../projection/Projection.SphericalMercator'
import { EarthCRS } from './EarthCRS'

export class EPSG3857 extends EarthCRS {
  static code = 'EPSG:3857'
  static projection: any = SphericalMercator
  static transformation: Transformation = (() => {
    const scale = 0.5 / (Math.PI * SphericalMercator.R)
    return new Transformation(scale, 0.5, -scale, 0.5)
  })()
}

export class EPSG900913 extends EPSG3857 {
  static code = 'EPSG:900913'
}
