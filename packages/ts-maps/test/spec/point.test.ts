// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/geometry/PointSpec.js
import { describe, expect, it } from 'bun:test'
import { Point } from './_harness'

describe('Point', () => {
  describe('constructor', () => {
    // Ported from PointSpec.js#L6
    it('creates a point with the given x and y', () => {
      const p = new Point(1.5, 2.5)
      expect(p.x).toEqual(1.5)
      expect(p.y).toEqual(2.5)
    })

    // Ported from PointSpec.js#L12
    it('rounds the given x and y if the third argument is true', () => {
      const p = new Point(1.3, 2.7, true)
      expect(p.x).toEqual(1)
      expect(p.y).toEqual(3)
    })
  })

  describe('#subtract', () => {
    // Ported from PointSpec.js#L20
    it('subtracts the given point from this one', () => {
      const a = new Point(50, 30)
      const b = new Point(20, 10)
      expect(a.subtract(b)).toEqual(new Point(30, 20))
    })
  })

  describe('#add', () => {
    // Ported from PointSpec.js#L28
    it('adds given point to this one', () => {
      expect(new Point(50, 30).add(new Point(20, 10))).toEqual(new Point(70, 40))
    })
  })

  describe('#divideBy', () => {
    // Ported from PointSpec.js#L34
    it('divides this point by the given amount', () => {
      expect(new Point(50, 30).divideBy(5)).toEqual(new Point(10, 6))
    })
  })

  describe('#multiplyBy', () => {
    // Ported from PointSpec.js#L40
    it('multiplies this point by the given amount', () => {
      expect(new Point(50, 30).multiplyBy(2)).toEqual(new Point(100, 60))
    })
  })

  describe('#floor', () => {
    // Ported from PointSpec.js#L46
    it('returns a new point with floored coordinates', () => {
      expect(new Point(50.56, 30.123).floor()).toEqual(new Point(50, 30))
      expect(new Point(-50.56, -30.123).floor()).toEqual(new Point(-51, -31))
    })
  })

  describe('#trunc', () => {
    // Ported from PointSpec.js#L53
    it('returns a new point with truncated coordinates', () => {
      expect(new Point(50.56, 30.123).trunc()).toEqual(new Point(50, 30))
      expect(new Point(-50.56, -30.123).trunc()).toEqual(new Point(-50, -30))
    })
  })

  describe('#distanceTo', () => {
    // Ported from PointSpec.js#L60
    it('calculates distance between two points', () => {
      const p1 = new Point(0, 30)
      const p2 = new Point(40, 0)
      expect(p1.distanceTo(p2)).toEqual(50.0)
    })
  })

  describe('#equals', () => {
    // Ported from PointSpec.js#L68
    it('returns true if points are equal', () => {
      const p1 = new Point(20.4, 50.12)
      const p2 = new Point(20.4, 50.12)
      const p3 = new Point(20.5, 50.13)

      expect(p1.equals(p2)).toBe(true)
      expect(p1.equals(p3)).toBe(false)
    })
  })

  describe('#contains', () => {
    // Ported from PointSpec.js#L79
    it('returns true if the point is bigger in absolute dimensions than the passed one', () => {
      const p1 = new Point(50, 30)
      const p2 = new Point(-40, 20)
      const p3 = new Point(60, -20)
      const p4 = new Point(-40, -40)

      expect(p1.contains(p2)).toBe(true)
      expect(p1.contains(p3)).toBe(false)
      expect(p1.contains(p4)).toBe(false)
    })
  })

  describe('#toString', () => {
    // Ported from PointSpec.js#L92
    it('formats a string out of point coordinates', () => {
      expect(`${new Point(50, 30)}`).toEqual('Point(50, 30)')
      expect(`${new Point(50.1234567, 30.1234567)}`).toEqual('Point(50.123457, 30.123457)')
    })
  })

  describe('Point creation', () => {
    // Ported from PointSpec.js#L99
    it('leaves Point instances as is', () => {
      const p = new Point(50, 30)
      expect(new Point(p)).toBe(p)
    })

    // Ported from PointSpec.js#L104
    it('creates a point out of three arguments', () => {
      expect(new Point(50.1, 30.1, true)).toEqual(new Point(50, 30))
    })

    // Ported from PointSpec.js#L108
    it('creates a point from an array of coordinates', () => {
      expect(new Point([50, 30])).toEqual(new Point(50, 30))
    })

    // Ported from PointSpec.js#L112
    it('creates a point from an object with x and y properties', () => {
      expect(new Point({ x: 50, y: 30 })).toEqual(new Point(50, 30))
    })

    // Ported from PointSpec.js#L116
    it('does not fail on invalid arguments', () => {
      expect(() => new Point(undefined as any)).toThrow()
      expect(() => new Point(null as any)).toThrow()
    })
  })
})
