// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/geometry/TransformationSpec.js
import { beforeEach, describe, expect, it } from 'bun:test'
import { Point, Transformation } from './_harness'

describe('Transformation', () => {
  let t: Transformation, p: Point

  beforeEach(() => {
    t = new Transformation(1, 2, 3, 4)
    p = new Point(10, 20)
  })

  describe('#transform', () => {
    // Ported from TransformationSpec.js#L13
    it('performs a transformation', () => {
      const p2 = t.transform(p, 2)
      expect(p2).toEqual(new Point(24, 128))
    })

    // Ported from TransformationSpec.js#L18
    it('assumes a scale of 1 if not specified', () => {
      const p2 = t.transform(p)
      expect(p2).toEqual(new Point(12, 64))
    })
  })

  describe('#untransform', () => {
    // Ported from TransformationSpec.js#L25
    it('performs a reverse transformation', () => {
      const p2 = t.transform(p, 2)
      const p3 = t.untransform(p2, 2)
      expect(p3).toEqual(p)
    })

    // Ported from TransformationSpec.js#L31
    it('assumes a scale of 1 if not specified', () => {
      expect(t.untransform(new Point(12, 64))).toEqual(new Point(10, 20))
    })
  })

  describe('#constructor', () => {
    // Ported from TransformationSpec.js#L37
    it('allows an array property for a', () => {
      const t2 = new Transformation([1, 2, 3, 4])
      expect(t._a).toEqual(t2._a)
      expect(t._b).toEqual(t2._b)
      expect(t._c).toEqual(t2._c)
      expect(t._d).toEqual(t2._d)
    })
  })
})
