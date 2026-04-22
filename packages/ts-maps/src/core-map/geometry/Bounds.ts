import type { PointLike } from './Point'
import { Point, toPoint } from './Point'

export type BoundsLike = Bounds | [PointLike, PointLike] | Point[] | PointLike[]

// Represents a rectangular area in pixel coordinates.
export class Bounds {
  min!: Point
  max!: Point

  constructor(a?: BoundsLike | PointLike, b?: PointLike) {
    if (!a)
    return

    if (a instanceof Bounds) {
      // eslint-disable-next-line no-constructor-return
      return a as Bounds
    }

    const points = (b ? [a, b] : a) as any[]
    for (const point of points) {
      this.extend(point)
    }
  }

  extend(obj: any): this {
    let min2: Point
    let max2: Point
    if (!obj)
    return this

    if (obj instanceof Point || (Array.isArray(obj) && typeof obj[0] === 'number') || (obj && 'x' in obj)) {
      min2 = max2 = toPoint(obj)
    }
    else {
      const b = new Bounds(obj)
      min2 = b.min
      max2 = b.max
      if (!min2 || !max2)
      return this
    }

    if (!this.min && !this.max) {
      this.min = min2.clone()
      this.max = max2.clone()
    }
    else {
      this.min.x = Math.min(min2.x, this.min.x)
      this.max.x = Math.max(max2.x, this.max.x)
      this.min.y = Math.min(min2.y, this.min.y)
      this.max.y = Math.max(max2.y, this.max.y)
    }
    return this
  }

  getCenter(round?: boolean): Point {
    return new Point((this.min.x + this.max.x) / 2, (this.min.y + this.max.y) / 2, round)
  }

  getBottomLeft(): Point {
    return new Point(this.min.x, this.max.y)
  }

  getTopRight(): Point {
    return new Point(this.max.x, this.min.y)
  }

  getTopLeft(): Point {
    return this.min
  }

  getBottomRight(): Point {
    return this.max
  }

  getSize(): Point {
    return this.max.subtract(this.min)
  }

  contains(obj: any): boolean {
    let min: Point, max: Point
    let target: any = obj

    if ((Array.isArray(target) && typeof target[0] === 'number') || target instanceof Point) {
      target = toPoint(target)
    }
    else {
      target = new Bounds(target)
    }

    if (target instanceof Bounds) {
      min = target.min
      max = target.max
    }
    else {
      min = max = target
    }

    return min.x >= this.min.x && max.x <= this.max.x && min.y >= this.min.y && max.y <= this.max.y
  }

  intersects(bounds: BoundsLike | PointLike): boolean {
    const b = new Bounds(bounds as any)
    const min = this.min
    const max = this.max
    const min2 = b.min
    const max2 = b.max
    const xIntersects = max2.x >= min.x && min2.x <= max.x
    const yIntersects = max2.y >= min.y && min2.y <= max.y
    return xIntersects && yIntersects
  }

  overlaps(bounds: BoundsLike | PointLike): boolean {
    const b = new Bounds(bounds as any)
    const min = this.min
    const max = this.max
    const min2 = b.min
    const max2 = b.max
    const xOverlaps = max2.x > min.x && min2.x < max.x
    const yOverlaps = max2.y > min.y && min2.y < max.y
    return xOverlaps && yOverlaps
  }

  isValid(): boolean {
    return !!(this.min && this.max)
  }

  pad(bufferRatio: number): Bounds {
    const min = this.min
    const max = this.max
    const heightBuffer = Math.abs(min.x - max.x) * bufferRatio
    const widthBuffer = Math.abs(min.y - max.y) * bufferRatio
    return new Bounds(
    new Point(min.x - heightBuffer, min.y - widthBuffer),
    new Point(max.x + heightBuffer, max.y + widthBuffer),
    )
  }

  equals(bounds: BoundsLike | PointLike | null | undefined): boolean {
    if (!bounds)
    return false
    const b = new Bounds(bounds as any)
    return this.min.equals(b.getTopLeft()) && this.max.equals(b.getBottomRight())
  }
}

export function toBounds(a?: BoundsLike | PointLike, b?: PointLike): Bounds {
  if (!a || a instanceof Bounds)
  return a as Bounds
  return new Bounds(a, b)
}
