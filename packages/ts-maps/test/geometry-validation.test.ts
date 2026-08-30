import type { Ring } from '../src/core-map/geo/polygonClip'
import { describe, expect, test } from 'bun:test'
import { multiPolygonArea, ringArea } from '../src/core-map/geo/area'
import { TerritoryStore } from '../src/core-map/game/TerritoryStore'
import {
  InvalidGeometryError,
  prepareClaim,
  resolveSelfIntersections,
  selfIntersects,
  unwrapRing,
  validateRing,
} from '../src/core-map/geo/validate'

// Production geometry comes from a device in a pocket, in a tunnel, with a
// flat battery — or from a client someone has edited. Each case here silently
// produced a capture worth nothing, or worth the planet, before it was handled.

describe('validateRing', () => {
  test('accepts an ordinary ring', () => {
    expect(() => validateRing([[0, 0], [1, 0], [1, 1], [0, 0]])).not.toThrow()
  })

  test('rejects coordinates that are not numbers', () => {
    // A receiver losing lock reports NaN, and NaN spreads through every area
    // calculation to produce a capture worth nothing with nothing to say why.
    expect(() => validateRing([[0, 0], [Number.NaN, 1], [1, 1], [0, 0]]))
      .toThrow(InvalidGeometryError)
    expect(() => validateRing([[0, 0], [Infinity, 1], [1, 1], [0, 0]]))
      .toThrow('not finite')
  })

  test('the message names the position at fault', () => {
    expect(() => validateRing([[0, 0], [1, 0], [Number.NaN, 1], [0, 0]]))
      .toThrow('position 2')
  })

  test('rejects a ring too short to enclose anything', () => {
    expect(() => validateRing([[0, 0], [1, 1], [0, 0]])).toThrow('at least 4')
  })

  test('rejects a latitude off the globe', () => {
    expect(() => validateRing([[0, 0], [1, 0], [1, 91], [0, 0]])).toThrow('outside')
  })

  test('rejects a position that is not a pair', () => {
    expect(() => validateRing([[0, 0], [1] as any, [1, 1], [0, 0]])).toThrow('not a [lng, lat] pair')
  })
})

describe('unwrapRing', () => {
  test('leaves an ordinary ring alone', () => {
    const ring: Ring = [[0, 0], [1, 0], [1, 1], [0, 0]]
    expect(unwrapRing(ring)).toBe(ring)
  })

  test('makes longitudes continuous across the antimeridian', () => {
    const crossing: Ring = [[179.99, 0], [-179.99, 0], [-179.99, 0.01], [179.99, 0.01], [179.99, 0]]
    const unwrapped = unwrapRing(crossing)

    // Carried past 180 rather than jumping to the far side of the world.
    expect(unwrapped[1][0]).toBeCloseTo(180.01, 6)
    expect(unwrapped[2][0]).toBeCloseTo(180.01, 6)
    for (let i = 1; i < unwrapped.length; i++)
      expect(Math.abs(unwrapped[i][0] - unwrapped[i - 1][0])).toBeLessThan(180)
  })

  test('a strip off Fiji measures as a strip, not as the planet', () => {
    // Read literally, the wrap makes one edge span the globe: this measured
    // forty billion square metres before.
    const crossing: Ring = [[179.99, 0], [-179.99, 0], [-179.99, 0.01], [179.99, 0.01], [179.99, 0]]
    const area = Math.abs(ringArea(crossing))

    expect(area).toBeGreaterThan(2_000_000)
    expect(area).toBeLessThan(3_000_000)
  })

  test('area is the same whichever side of the antimeridian it is written from', () => {
    const crossing: Ring = [[179.99, 0], [-179.99, 0], [-179.99, 0.01], [179.99, 0.01], [179.99, 0]]
    const shifted: Ring = crossing.map(([lng, lat]) => [lng > 0 ? lng - 360 : lng, lat])
    expect(Math.abs(ringArea(crossing))).toBeCloseTo(Math.abs(ringArea(shifted)), 3)
  })
})

describe('selfIntersects', () => {
  test('a simple ring does not', () => {
    expect(selfIntersects([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])).toBe(false)
  })

  test('a figure of eight does', () => {
    expect(selfIntersects([[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]])).toBe(true)
  })

  test('touching at a shared vertex is not crossing', () => {
    // A ring is entitled to visit a point twice without crossing itself.
    expect(selfIntersects([[0, 0], [5, 5], [10, 0], [5, 5], [0, 0]])).toBe(false)
  })
})

describe('resolveSelfIntersections', () => {
  test('a figure of eight becomes both its lobes', () => {
    // Measured directly its lobes cancel, so a perfectly good run comes to
    // nothing. Both were run around, so both count.
    const fig8: Ring = [[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]]
    expect(Math.abs(ringArea(fig8))).toBeCloseTo(0, 6)

    const resolved = resolveSelfIntersections(fig8)
    expect(resolved.length).toBe(2)
    expect(multiPolygonArea(resolved)).toBeGreaterThan(0)
  })

  test('a simple ring passes through untouched', () => {
    const simple: Ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    const resolved = resolveSelfIntersections(simple)
    expect(resolved.length).toBe(1)
    expect(resolved[0][0].length).toBe(5)
  })

  test('an unclosed ring is closed', () => {
    const open: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]]
    const resolved = resolveSelfIntersections(open)
    const outer = resolved[0][0]
    expect(outer[0]).toEqual(outer[outer.length - 1])
  })
})

describe('prepareClaim', () => {
  test('validates before repairing', () => {
    // Repairing geometry that has not been checked is how a NaN ends up
    // inside a polygon instead of inside an error message.
    expect(() => prepareClaim([[0, 0], [Number.NaN, 0], [1, 1], [0, 0]]))
      .toThrow(InvalidGeometryError)
  })
})

describe('capture with awkward geometry', () => {
  const LAT = 34.02
  const mLat = 1 / 111320
  const mLng = 1 / (111320 * Math.cos((LAT * Math.PI) / 180))

  test('a lost-lock reading is refused rather than silently claiming nothing', () => {
    const store = new TerritoryStore()
    expect(() => store.capture('sam', [
      [-118.47, LAT],
      [Number.NaN, LAT],
      [-118.469, LAT + 0.001],
      [-118.47, LAT],
    ])).toThrow(InvalidGeometryError)

    // And nothing was recorded on the way to the error.
    expect(store.owners()).toEqual([])
  })

  test('a figure-of-eight run claims both lobes', () => {
    const store = new TerritoryStore()
    const s = 150
    const result = store.capture('sam', [
      [-118.47, LAT],
      [-118.47 + s * mLng, LAT + s * mLat],
      [-118.47 + s * mLng, LAT],
      [-118.47, LAT + s * mLat],
      [-118.47, LAT],
    ])

    expect(result.territory.length).toBe(2)
    expect(result.areaGained).toBeGreaterThan(0)
    expect(store.areaOf('sam')).toBeCloseTo(result.areaGained, 3)
  })

  test('a run across the antimeridian is worth what it enclosed', () => {
    const store = new TerritoryStore()
    const result = store.capture('sam', [
      [179.999, 0],
      [-179.999, 0],
      [-179.999, 0.002],
      [179.999, 0.002],
      [179.999, 0],
    ])

    // Roughly 222 m by 222 m.
    expect(result.areaClaimed).toBeGreaterThan(30_000)
    expect(result.areaClaimed).toBeLessThan(80_000)
  })

  test('preview refuses the same geometry capture would', () => {
    const store = new TerritoryStore()
    expect(() => store.preview('sam', [[0, 0], [Number.NaN, 0], [1, 1], [0, 0]]))
      .toThrow(InvalidGeometryError)
  })
})
