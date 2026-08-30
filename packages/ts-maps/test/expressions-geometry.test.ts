import type { EvaluationContext } from '../src/core-map/style-spec/expressions'
import { describe, expect, test } from 'bun:test'
import { evaluate, ExpressionError } from '../src/core-map/style-spec/expressions'
import { haversine, pointInPolygon, pointInRing } from '../src/core-map/style-spec/expressions/operators/geometry'

/** A square around Santa Monica, roughly 0.02° a side. */
const SQUARE = {
  type: 'Polygon',
  coordinates: [[
    [-118.50, 34.01],
    [-118.44, 34.01],
    [-118.44, 34.04],
    [-118.50, 34.04],
    [-118.50, 34.01],
  ]],
}

/** The same square with a hole cut out of the middle. */
const DONUT = {
  type: 'Polygon',
  coordinates: [
    [[-118.50, 34.01], [-118.44, 34.01], [-118.44, 34.04], [-118.50, 34.04], [-118.50, 34.01]],
    [[-118.48, 34.02], [-118.46, 34.02], [-118.46, 34.03], [-118.48, 34.03], [-118.48, 34.02]],
  ],
}

function ctxAt(geometry: unknown): EvaluationContext {
  return {
    zoom: 14,
    feature: {
      type: 1,
      properties: {},
      geometry: () => geometry,
    },
  }
}

function point(lng: number, lat: number): { type: 'Point', coordinates: [number, number] } {
  return { type: 'Point', coordinates: [lng, lat] }
}

describe('pointInRing', () => {
  const ring: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]

  test('inside and outside', () => {
    expect(pointInRing([5, 5], ring)).toBe(true)
    expect(pointInRing([15, 5], ring)).toBe(false)
    expect(pointInRing([5, -1], ring)).toBe(false)
  })

  test('a point on the boundary counts as inside', () => {
    // Two polygons sharing a border must agree about who owns the edge —
    // excluding it leaves seams unstyled on one side.
    expect(pointInRing([0, 5], ring)).toBe(true)
    expect(pointInRing([10, 5], ring)).toBe(true)
    expect(pointInRing([0, 0], ring)).toBe(true)
  })
})

describe('pointInPolygon', () => {
  test('a hole is not inside', () => {
    const outer: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    const hole: Array<[number, number]> = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]

    expect(pointInPolygon([1, 1], [outer, hole])).toBe(true)
    expect(pointInPolygon([5, 5], [outer, hole])).toBe(false)
  })
})

describe('haversine', () => {
  test('a degree of latitude is about 111km', () => {
    expect(haversine([0, 0], [0, 1])).toBeGreaterThan(110_000)
    expect(haversine([0, 0], [0, 1])).toBeLessThan(112_000)
  })

  test('a degree of longitude shrinks towards the pole', () => {
    // The reason this is not a planar approximation: at 60° a degree of
    // longitude is half what it is at the equator.
    const atEquator = haversine([0, 0], [1, 0])
    const atSixty = haversine([0, 60], [1, 60])
    expect(atSixty).toBeLessThan(atEquator * 0.55)
    expect(atSixty).toBeGreaterThan(atEquator * 0.45)
  })

  test('a point is no distance from itself', () => {
    expect(haversine([-118.47, 34.02], [-118.47, 34.02])).toBe(0)
  })
})

describe('within', () => {
  test('a point inside the polygon passes', () => {
    expect(evaluate(['within', SQUARE], ctxAt(point(-118.47, 34.02)))).toBe(true)
  })

  test('a point outside fails', () => {
    expect(evaluate(['within', SQUARE], ctxAt(point(-118.60, 34.02)))).toBe(false)
  })

  test('a hole is outside', () => {
    expect(evaluate(['within', DONUT], ctxAt(point(-118.47, 34.025)))).toBe(false)
    expect(evaluate(['within', DONUT], ctxAt(point(-118.495, 34.015)))).toBe(true)
  })

  test('a line only counts when every vertex is inside', () => {
    const inside = { type: 'LineString', coordinates: [[-118.49, 34.02], [-118.45, 34.03]] }
    const straddling = { type: 'LineString', coordinates: [[-118.49, 34.02], [-118.30, 34.03]] }

    expect(evaluate(['within', SQUARE], ctxAt(inside))).toBe(true)
    expect(evaluate(['within', SQUARE], ctxAt(straddling))).toBe(false)
  })

  test('a MultiPolygon argument works', () => {
    const multi = { type: 'MultiPolygon', coordinates: [SQUARE.coordinates, [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }
    expect(evaluate(['within', multi], ctxAt(point(0.5, 0.5)))).toBe(true)
    expect(evaluate(['within', multi], ctxAt(point(-118.47, 34.02)))).toBe(true)
  })

  test('without geometry it answers false rather than guessing', () => {
    // A caller that cannot supply coordinates gets the answer that leaves the
    // feature unstyled, not one that styles it wrongly.
    expect(evaluate(['within', SQUARE], { zoom: 14, feature: { type: 1, properties: {} } })).toBe(false)
  })

  test('a non-polygon argument is rejected at compile time', () => {
    expect(() => evaluate(['within', point(0, 0)], ctxAt(point(0, 0)))).toThrow(ExpressionError)
    expect(() => evaluate(['within'], ctxAt(point(0, 0)))).toThrow(ExpressionError)
  })
})

describe('distance', () => {
  test('measures to the nearest vertex, in metres', () => {
    const target = point(-118.47, 34.02)
    const result = evaluate(['distance', target], ctxAt(point(-118.47, 34.03))) as number

    // A hundredth of a degree of latitude is a bit over a kilometre.
    expect(result).toBeGreaterThan(1000)
    expect(result).toBeLessThan(1200)
  })

  test('zero at the same place', () => {
    expect(evaluate(['distance', point(-118.47, 34.02)], ctxAt(point(-118.47, 34.02)))).toBe(0)
  })

  test('takes the nearest of a multi-part target', () => {
    const far = point(0, 0)
    const near = point(-118.47, 34.021)
    const multi = { type: 'MultiPoint', coordinates: [far.coordinates, near.coordinates] }

    const result = evaluate(['distance', multi], ctxAt(point(-118.47, 34.02))) as number
    expect(result).toBeLessThan(200)
  })

  test('without geometry it answers Infinity', () => {
    expect(evaluate(['distance', point(0, 0)], { zoom: 14, feature: { type: 1, properties: {} } })).toBe(Infinity)
  })

  test('composes with the rest of the language', () => {
    // The point of having it: fade something by how far away it is.
    const expr = ['step', ['distance', point(-118.47, 34.02)], '#f00', 500, '#0f0']
    expect(evaluate(expr, ctxAt(point(-118.47, 34.0201)))).toBe('#f00')
    expect(evaluate(expr, ctxAt(point(-118.47, 34.05)))).toBe('#0f0')
  })
})
