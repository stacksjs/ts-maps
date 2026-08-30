import type { MultiPolygon } from '../src/core-map/geo/polygonClip'
import { describe, expect, test } from 'bun:test'
import { contains, difference, intersection, intersects, union, xor } from '../src/core-map/geo/polygonClip'

// These decide who owns what in a territory game, so they are tested against
// answers worked out by hand rather than against themselves. The cases that
// matter most are the degenerate ones: territories that grew against each
// other share their whole border, and a clipper that cannot handle coincident
// edges will hand a player ground they never ran around.

/** An axis-aligned box, as a one-polygon multipolygon. */
function box(x0: number, y0: number, x1: number, y1: number): MultiPolygon {
  return [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]]
}

/** Area in coordinate units, by the shoelace formula, holes subtracted. */
function area(multi: MultiPolygon): number {
  let total = 0
  for (const polygon of multi) {
    polygon.forEach((ring, index) => {
      let sum = 0
      for (let i = 0; i < ring.length - 1; i++)
        sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
      total += index === 0 ? Math.abs(sum / 2) : -Math.abs(sum / 2)
    })
  }
  return total
}

function ringCount(multi: MultiPolygon): number {
  return multi.reduce((n, polygon) => n + polygon.length, 0)
}

describe('union', () => {
  test('two overlapping boxes become one shape of the right size', () => {
    const result = union(box(0, 0, 10, 10), box(5, 5, 15, 15))
    // 100 + 100 − 25 overlap.
    expect(area(result)).toBeCloseTo(175, 6)
    expect(result.length).toBe(1)
  })

  test('disjoint boxes stay two polygons', () => {
    const result = union(box(0, 0, 10, 10), box(20, 20, 30, 30))
    expect(result.length).toBe(2)
    expect(area(result)).toBeCloseTo(200, 6)
  })

  test('boxes sharing an entire edge merge cleanly', () => {
    // The case that breaks naive clippers, and the normal case here: two
    // territories that grew until they met.
    const result = union(box(0, 0, 10, 10), box(10, 0, 20, 10))
    expect(area(result)).toBeCloseTo(200, 6)
    expect(result.length).toBe(1)
    expect(ringCount(result)).toBe(1)
  })

  test('a box inside another is absorbed', () => {
    const result = union(box(0, 0, 10, 10), box(2, 2, 4, 4))
    expect(area(result)).toBeCloseTo(100, 6)
    expect(ringCount(result)).toBe(1)
  })

  test('identical boxes give one box, not two', () => {
    const result = union(box(0, 0, 10, 10), box(0, 0, 10, 10))
    expect(area(result)).toBeCloseTo(100, 6)
    expect(ringCount(result)).toBe(1)
  })

  test('a ring of boxes around a gap leaves a hole', () => {
    // Four laps around a block, enclosing a courtyard nobody ran through.
    let result = union(box(0, 0, 30, 10), box(0, 20, 30, 30))
    result = union(result, box(0, 0, 10, 30))
    result = union(result, box(20, 0, 30, 30))

    expect(result.length).toBe(1)
    expect(result[0].length).toBe(2)
    // 900 total less the 10×10 courtyard.
    expect(area(result)).toBeCloseTo(800, 6)
  })

  test('an empty side is a no-op either way', () => {
    expect(area(union([], box(0, 0, 10, 10)))).toBeCloseTo(100, 6)
    expect(area(union(box(0, 0, 10, 10), []))).toBeCloseTo(100, 6)
    expect(union([], [])).toEqual([])
  })
})

describe('difference', () => {
  test('a bite out of one side', () => {
    const result = difference(box(0, 0, 10, 10), box(5, 5, 15, 15))
    expect(area(result)).toBeCloseTo(75, 6)
  })

  test('a hole punched clean through the middle', () => {
    const result = difference(box(0, 0, 10, 10), box(3, 3, 7, 7))
    expect(result.length).toBe(1)
    expect(result[0].length).toBe(2)
    expect(area(result)).toBeCloseTo(100 - 16, 6)
  })

  test('being covered entirely leaves nothing', () => {
    expect(difference(box(2, 2, 4, 4), box(0, 0, 10, 10))).toEqual([])
  })

  test('a cut straight across splits one territory into two', () => {
    const result = difference(box(0, 0, 10, 10), box(4, -5, 6, 15))
    expect(result.length).toBe(2)
    expect(area(result)).toBeCloseTo(80, 6)
  })

  test('subtracting a neighbour that only shares a border changes nothing', () => {
    const result = difference(box(0, 0, 10, 10), box(10, 0, 20, 10))
    expect(area(result)).toBeCloseTo(100, 6)
  })

  test('subtracting nothing, and subtracting from nothing', () => {
    expect(area(difference(box(0, 0, 10, 10), []))).toBeCloseTo(100, 6)
    expect(difference([], box(0, 0, 10, 10))).toEqual([])
  })

  test('subtracting an identical shape leaves nothing', () => {
    expect(difference(box(0, 0, 10, 10), box(0, 0, 10, 10))).toEqual([])
  })
})

describe('intersection', () => {
  test('the overlap of two boxes', () => {
    expect(area(intersection(box(0, 0, 10, 10), box(5, 5, 15, 15)))).toBeCloseTo(25, 6)
  })

  test('touching along an edge overlaps in nothing', () => {
    expect(area(intersection(box(0, 0, 10, 10), box(10, 0, 20, 10)))).toBeCloseTo(0, 6)
  })

  test('disjoint boxes intersect in nothing', () => {
    expect(intersection(box(0, 0, 10, 10), box(20, 20, 30, 30))).toEqual([])
  })

  test('containment gives back the smaller shape', () => {
    expect(area(intersection(box(0, 0, 10, 10), box(2, 2, 4, 4)))).toBeCloseTo(4, 6)
  })
})

describe('xor', () => {
  test('keeps what only one of them covers', () => {
    expect(area(xor(box(0, 0, 10, 10), box(5, 5, 15, 15)))).toBeCloseTo(150, 6)
  })

  test('identical shapes cancel out', () => {
    expect(xor(box(0, 0, 10, 10), box(0, 0, 10, 10))).toEqual([])
  })
})

describe('multipolygon inputs', () => {
  test('a scattered territory unions against a single claim', () => {
    const scattered: MultiPolygon = [...box(0, 0, 10, 10), ...box(20, 0, 30, 10)]
    const result = union(scattered, box(8, 0, 22, 10))
    // The new claim bridges the two, so it is one territory now.
    expect(result.length).toBe(1)
    expect(area(result)).toBeCloseTo(300, 6)
  })

  test('a claim can be taken out of several territories at once', () => {
    const scattered: MultiPolygon = [...box(0, 0, 10, 10), ...box(20, 0, 30, 10)]
    const result = difference(scattered, box(5, -5, 25, 15))
    expect(result.length).toBe(2)
    expect(area(result)).toBeCloseTo(100, 6)
  })

  test('a hole in the subject survives the operation', () => {
    const withHole: MultiPolygon = [[
      [[0, 0], [30, 0], [30, 30], [0, 30], [0, 0]],
      [[10, 10], [10, 20], [20, 20], [20, 10], [10, 10]],
    ]]
    const result = union(withHole, box(-5, -5, 5, 5))
    expect(area(result)).toBeCloseTo(900 - 100 + 75, 6)
  })

  test('a claim can fill in a hole', () => {
    const withHole: MultiPolygon = [[
      [[0, 0], [30, 0], [30, 30], [0, 30], [0, 0]],
      [[10, 10], [10, 20], [20, 20], [20, 10], [10, 10]],
    ]]
    const result = union(withHole, box(10, 10, 20, 20))
    expect(area(result)).toBeCloseTo(900, 6)
    expect(ringCount(result)).toBe(1)
  })
})

describe('winding', () => {
  test('the result is right-hand-rule regardless of the inputs', () => {
    // GeoJSON asks for counter-clockwise outer rings and clockwise holes, and
    // tracks recorded by runners come in both directions.
    const clockwise: MultiPolygon = [[[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]]]
    const result = difference(clockwise, box(3, 3, 7, 7))

    const shoelace = (ring: number[][]): number => {
      let sum = 0
      for (let i = 0; i < ring.length - 1; i++)
        sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
      return sum
    }

    expect(shoelace(result[0][0])).toBeGreaterThan(0)
    expect(shoelace(result[0][1])).toBeLessThan(0)
  })

  test('input winding does not change the area of the answer', () => {
    const ccw = box(0, 0, 10, 10)
    const cw: MultiPolygon = [[[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]]]
    expect(area(union(ccw, box(5, 5, 15, 15)))).toBeCloseTo(area(union(cw, box(5, 5, 15, 15))), 6)
  })
})

describe('robustness', () => {
  test('an unclosed ring is treated as closed', () => {
    const open: MultiPolygon = [[[[0, 0], [10, 0], [10, 10], [0, 10]]]]
    expect(area(union(open, box(5, 5, 15, 15)))).toBeCloseTo(175, 6)
  })

  test('repeated vertices are ignored', () => {
    const dupes: MultiPolygon = [[[[0, 0], [0, 0], [10, 0], [10, 10], [10, 10], [0, 10], [0, 0]]]]
    expect(area(union(dupes, box(5, 5, 15, 15)))).toBeCloseTo(175, 6)
  })

  test('degenerate input does not throw', () => {
    const line: MultiPolygon = [[[[0, 0], [10, 0], [0, 0]]]]
    expect(() => union(line, box(0, 0, 5, 5))).not.toThrow()
    const point: MultiPolygon = [[[[1, 1], [1, 1], [1, 1]]]]
    expect(() => union(point, box(0, 0, 5, 5))).not.toThrow()
  })

  test('works at real geographic coordinates', () => {
    // Small differences at six decimal places is what GPS actually gives.
    const a: MultiPolygon = [[[
      [-118.4700, 34.0200],
      [-118.4650, 34.0200],
      [-118.4650, 34.0250],
      [-118.4700, 34.0250],
      [-118.4700, 34.0200],
    ]]]
    const b: MultiPolygon = [[[
      [-118.4675, 34.0225],
      [-118.4625, 34.0225],
      [-118.4625, 34.0275],
      [-118.4675, 34.0275],
      [-118.4675, 34.0225],
    ]]]

    const merged = union(a, b)
    expect(merged.length).toBe(1)
    expect(area(merged)).toBeCloseTo(area(a) + area(b) - area(intersection(a, b)), 12)
  })

  test('many overlapping claims accumulate without drift', () => {
    // A season of running: repeated captures must not slowly corrupt a shape.
    let territory: MultiPolygon = []
    for (let i = 0; i < 25; i++)
      territory = union(territory, box(i, 0, i + 2, 10))

    expect(territory.length).toBe(1)
    expect(area(territory)).toBeCloseTo(26 * 10, 6)
  })
})

describe('contains', () => {
  test('inside, outside, and inside a hole', () => {
    const withHole: MultiPolygon = [[
      [[0, 0], [30, 0], [30, 30], [0, 30], [0, 0]],
      [[10, 10], [10, 20], [20, 20], [20, 10], [10, 10]],
    ]]

    expect(contains(withHole, [5, 5])).toBe(true)
    expect(contains(withHole, [15, 15])).toBe(false)
    expect(contains(withHole, [40, 40])).toBe(false)
  })

  test('an empty territory contains nothing', () => {
    expect(contains([], [0, 0])).toBe(false)
  })
})

describe('intersects', () => {
  test('answers the overlap question without measuring it', () => {
    expect(intersects(box(0, 0, 10, 10), box(5, 5, 15, 15))).toBe(true)
    expect(intersects(box(0, 0, 10, 10), box(20, 20, 30, 30))).toBe(false)
    // Sharing a border is not overlapping: neighbours do not steal from each
    // other by standing next to each other.
    expect(intersects(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(false)
  })
})
