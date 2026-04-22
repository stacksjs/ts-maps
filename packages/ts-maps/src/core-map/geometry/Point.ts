import { formatNum } from '../core/Util'

export type PointTuple = [number, number]
export type PointLike = Point | PointTuple | { x: number, y: number } | number

// Represents a point with `x` and `y` coordinates in pixels.
export class Point {
  x!: number
  y!: number

  constructor(x: PointLike | number[], y?: number, round?: boolean) {
    const valid = Point.validate(x, y)
    if (!valid) {
      throw new Error(`Invalid Point object: (${x}, ${y})`)
    }

    let _x: number
    let _y: number
    if (x instanceof Point) {
      // eslint-disable-next-line no-constructor-return
      return x as Point
    }
    else if (Array.isArray(x)) {
      _x = x[0]
      _y = x[1]
    }
    else if (typeof x === 'object' && x !== null && 'x' in x && 'y' in x) {
      _x = (x as any).x
      _y = (x as any).y
    }
    else {
      _x = x as number
      _y = y as number
    }

    this.x = round ? Math.round(_x) : _x
    this.y = round ? Math.round(_y) : _y
  }

  static validate(x: any, y?: any): boolean {
    if (x instanceof Point || Array.isArray(x))
    return true
    if (x && typeof x === 'object' && 'x' in x && 'y' in x)
    return true
    if ((x || x === 0) && (y || y === 0))
    return true
    return false
  }

  clone(): Point {
    const p = new Point(0, 0)
    p.x = this.x
    p.y = this.y
    return p
  }

  add(point: PointLike | number[]): Point {
    return this.clone()._add(new Point(point as any))
  }

  _add(point: Point): this {
    this.x += point.x
    this.y += point.y
    return this
  }

  subtract(point: PointLike | number[]): Point {
    return this.clone()._subtract(new Point(point as any))
  }

  _subtract(point: Point): this {
    this.x -= point.x
    this.y -= point.y
    return this
  }

  divideBy(num: number): Point {
    return this.clone()._divideBy(num)
  }

  _divideBy(num: number): this {
    this.x /= num
    this.y /= num
    return this
  }

  multiplyBy(num: number): Point {
    return this.clone()._multiplyBy(num)
  }

  _multiplyBy(num: number): this {
    this.x *= num
    this.y *= num
    return this
  }

  scaleBy(point: Point): Point {
    return new Point(this.x * point.x, this.y * point.y)
  }

  unscaleBy(point: Point): Point {
    return new Point(this.x / point.x, this.y / point.y)
  }

  round(): Point {
    return this.clone()._round()
  }

  _round(): this {
    this.x = Math.round(this.x)
    this.y = Math.round(this.y)
    return this
  }

  floor(): Point {
    return this.clone()._floor()
  }

  _floor(): this {
    this.x = Math.floor(this.x)
    this.y = Math.floor(this.y)
    return this
  }

  ceil(): Point {
    return this.clone()._ceil()
  }

  _ceil(): this {
    this.x = Math.ceil(this.x)
    this.y = Math.ceil(this.y)
    return this
  }

  trunc(): Point {
    return this.clone()._trunc()
  }

  _trunc(): this {
    this.x = Math.trunc(this.x)
    this.y = Math.trunc(this.y)
    return this
  }

  distanceTo(point: PointLike | number[]): number {
    const p = new Point(point as any)
    const x = p.x - this.x
    const y = p.y - this.y
    return Math.sqrt(x * x + y * y)
  }

  equals(point: PointLike | number[]): boolean {
    const p = new Point(point as any)
    return p.x === this.x && p.y === this.y
  }

  contains(point: PointLike | number[]): boolean {
    const p = new Point(point as any)
    return Math.abs(p.x) <= Math.abs(this.x) && Math.abs(p.y) <= Math.abs(this.y)
  }

  toString(): string {
    return `Point(${formatNum(this.x)}, ${formatNum(this.y)})`
  }
}

// Helper that normalizes any accepted input to a Point. Useful for public API methods
// that accept coordinate pairs in multiple forms.
export function toPoint(x: PointLike | number[] | null | undefined, y?: number, round?: boolean): Point {
  if (x instanceof Point)
  return x
  if (Array.isArray(x))
  return new Point(x[0], x[1])
  if (x === undefined || x === null)
  return x as any
  if (typeof x === 'object' && 'x' in x && 'y' in x)
  return new Point((x as any).x, (x as any).y)
  return new Point(x as number, y as number, round)
}
