import { describe, expect, test } from 'bun:test'
import { Bounds, LatLng, Point } from '../src/core-map'

describe('geometry primitives', () => {
  test('Point.distanceTo computes Euclidean distance', () => {
    expect(new Point(3, 4).distanceTo([0, 0])).toBe(5)
  })

  test('LatLng.equals accepts an array literal', () => {
    expect(new LatLng(10, 20).equals([10, 20])).toBe(true)
  })

  test('Bounds.contains returns true for a point inside the box', () => {
    expect(new Bounds([0, 0], [5, 5]).contains([3, 3])).toBe(true)
  })
})
