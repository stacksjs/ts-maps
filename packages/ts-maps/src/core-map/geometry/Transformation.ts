import { Point } from './Point'

export class Transformation {
  _a: number
  _b: number
  _c: number
  _d: number

  constructor(a: number | number[], b?: number, c?: number, d?: number) {
    if (Array.isArray(a)) {
      this._a = a[0]
      this._b = a[1]
      this._c = a[2]
      this._d = a[3]
      return
    }
    this._a = a
    this._b = b as number
    this._c = c as number
    this._d = d as number
  }

  transform(point: Point, scale?: number): Point {
    return this._transform(point.clone(), scale)
  }

  _transform(point: Point, scale?: number): Point {
    scale ||= 1
    point.x = scale * (this._a * point.x + this._b)
    point.y = scale * (this._c * point.y + this._d)
    return point
  }

  untransform(point: Point, scale?: number): Point {
    scale ||= 1
    return new Point(
    (point.x / scale - this._b) / this._a,
    (point.y / scale - this._d) / this._c,
    )
  }
}

export function toTransformation(a: number | number[], b?: number, c?: number, d?: number): Transformation {
  return new Transformation(a, b, c, d)
}
