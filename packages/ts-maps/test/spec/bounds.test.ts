// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/geometry/BoundsSpec.js
import { beforeEach, describe, expect, it } from 'bun:test'
import { Bounds, Point } from './_harness'

describe('Bounds', () => {
  let a: Bounds, b: Bounds, c: Bounds

  beforeEach(() => {
    a = new Bounds([14, 12], [30, 40])
    b = new Bounds([
      [20, 12],
      [14, 20],
      [30, 40],
    ])
    c = new Bounds()
  })

  describe('constructor', () => {
    // Ported from BoundsSpec.js#L20
    it('creates bounds with proper min & max on (Point, Point)', () => {
      expect(a.min).toEqual(new Point(14, 12))
      expect(a.max).toEqual(new Point(30, 40))
    })

    // Ported from BoundsSpec.js#L25
    it('creates bounds with proper min & max on (Point[])', () => {
      expect(b.min).toEqual(new Point(14, 12))
      expect(b.max).toEqual(new Point(30, 40))
    })
  })

  describe('#extend', () => {
    // Ported from BoundsSpec.js#L32
    it('extends the bounds to contain the given point', () => {
      a.extend([50, 20])
      expect(a.min).toEqual(new Point(14, 12))
      expect(a.max).toEqual(new Point(50, 40))

      b.extend([25, 50])
      expect(b.min).toEqual(new Point(14, 12))
      expect(b.max).toEqual(new Point(30, 50))
    })

    // Ported from BoundsSpec.js#L42
    it('extends the bounds by given bounds', () => {
      a.extend([20, 50])
      expect(a.max).toEqual(new Point(30, 50))
    })

    // Ported from BoundsSpec.js#L47
    it('extends the bounds by given bounds (nested)', () => {
      a.extend([[20, 50], [8, 40]])
      expect(a.getBottomLeft()).toEqual(new Point(8, 50))
    })

    // Ported from BoundsSpec.js#L52
    it('extends the bounds by undefined', () => {
      expect((a.extend as any)()).toEqual(a)
    })

    // Ported from BoundsSpec.js#L56
    it('extends the bounds by raw object', () => {
      a.extend({ x: 20, y: 50 })
      expect(a.max).toEqual(new Point(30, 50))
    })

    // Ported from BoundsSpec.js#L61
    it('extend the bounds by an empty bounds object', () => {
      expect(a.extend(new Bounds())).toEqual(a)
    })
  })

  describe('#getCenter', () => {
    // Ported from BoundsSpec.js#L67
    it('returns the center point', () => {
      expect(a.getCenter()).toEqual(new Point(22, 26))
    })
  })

  describe('#pad', () => {
    // Ported from BoundsSpec.js#L73
    it('pads the bounds by a given ratio', () => {
      expect(a.pad(0.5)).toEqual(new Bounds([[6, -2], [38, 54]]))
    })
  })

  describe('#contains', () => {
    // Ported from BoundsSpec.js#L79
    it('contains other bounds or point', () => {
      a.extend([50, 10])
      expect(a.contains(b)).toBe(true)
      expect(b.contains(a)).toBe(false)
      expect(a.contains([24, 25])).toBe(true)
      expect(a.contains([54, 65])).toBe(false)
    })
  })

  describe('#isValid', () => {
    // Ported from BoundsSpec.js#L89
    it('returns true if properly set up', () => {
      expect(a.isValid()).toBe(true)
    })

    // Ported from BoundsSpec.js#L93
    it('returns false if is invalid', () => {
      expect(c.isValid()).toBe(false)
    })

    // Ported from BoundsSpec.js#L97
    it('returns true if extended', () => {
      c.extend([0, 0])
      expect(c.isValid()).toBe(true)
    })
  })

  describe('#getSize', () => {
    // Ported from BoundsSpec.js#L104
    it('returns the size of the bounds as point', () => {
      expect(a.getSize()).toEqual(new Point(16, 28))
    })
  })

  describe('#intersects', () => {
    // Ported from BoundsSpec.js#L110
    it('returns true if bounds intersect', () => {
      expect(a.intersects(b)).toBe(true)
    })

    // Ported from BoundsSpec.js#L114
    it('two bounds intersect if they have at least one point in common', () => {
      expect(a.intersects([[14, 12], [6, 5]])).toBe(true)
    })

    // Ported from BoundsSpec.js#L118
    it('returns false if bounds not intersect', () => {
      expect(a.intersects([[100, 100], [120, 120]])).toEqual(false)
    })
  })

  describe('#overlaps', () => {
    // Ported from BoundsSpec.js#L124
    it('returns true if bounds overlaps', () => {
      expect(a.overlaps(b)).toBe(true)
    })

    // Ported from BoundsSpec.js#L128
    it('two bounds overlaps if their intersection is an area', () => {
      expect(a.overlaps([[14, 12], [6, 5]])).toBe(false)
      expect(a.overlaps([[30, 12], [35, 25]])).toBe(false)
    })

    // Ported from BoundsSpec.js#L135
    it('returns false if bounds not overlaps', () => {
      expect(a.overlaps([[100, 100], [120, 120]])).toEqual(false)
    })
  })

  describe('#getBottomLeft', () => {
    // Ported from BoundsSpec.js#L141
    it('returns the proper bounds bottom-left value', () => {
      expect(a.getBottomLeft()).toEqual(new Point(14, 40))
    })
  })

  describe('#getTopRight', () => {
    // Ported from BoundsSpec.js#L147
    it('returns the proper bounds top-right value', () => {
      expect(a.getTopRight()).toEqual(new Point(30, 12))
    })
  })

  describe('#getTopLeft', () => {
    // Ported from BoundsSpec.js#L153
    it('returns the proper bounds top-left value', () => {
      expect(a.getTopLeft()).toEqual(new Point(14, 12))
    })
  })

  describe('#getBottomRight', () => {
    // Ported from BoundsSpec.js#L159
    it('returns the proper bounds bottom-right value', () => {
      expect(a.getBottomRight()).toEqual(new Point(30, 40))
    })
  })

  describe('Bounds creation', () => {
    // Ported from BoundsSpec.js#L165
    it('creates bounds from array of number arrays', () => {
      expect(new Bounds([[14, 12], [30, 40]])).toEqual(a)
    })
  })

  describe('#equals', () => {
    // Ported from BoundsSpec.js#L171
    it('returns true if bounds equal', () => {
      expect(a.equals([[14, 12], [30, 40]])).toEqual(true)
      expect(a.equals([[14, 13], [30, 40]])).toEqual(false)
      expect(a.equals(null)).toEqual(false)
    })
  })
})
