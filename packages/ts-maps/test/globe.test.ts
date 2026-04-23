import { describe, expect, test } from 'bun:test'
import { Globe } from '../src/core-map/geo/projection/Projection.Globe'
import { LatLng } from '../src/core-map/geo/LatLng'

describe('Globe projection — unit-sphere conversion', () => {
  test('the origin (0, 0) maps to (+z = 1)', () => {
    const v = Globe.toSphere(new LatLng(0, 0))
    expect(v.x).toBeCloseTo(0, 6)
    expect(v.y).toBeCloseTo(0, 6)
    expect(v.z).toBeCloseTo(1, 6)
  })

  test('the north pole maps to (+y = 1)', () => {
    const v = Globe.toSphere(new LatLng(90, 0))
    expect(v.y).toBeCloseTo(1, 6)
    // x and z are degenerate at the pole but should be ~0.
    expect(Math.abs(v.x)).toBeLessThan(1e-6)
    expect(Math.abs(v.z)).toBeLessThan(1e-6)
  })

  test('lng=90, lat=0 maps to (+x = 1)', () => {
    const v = Globe.toSphere(new LatLng(0, 90))
    expect(v.x).toBeCloseTo(1, 6)
    expect(v.z).toBeCloseTo(0, 6)
  })

  test('toSphere/fromSphere round-trips within epsilon', () => {
    const cases: Array<[number, number]> = [[37.7749, -122.4194], [-33.8688, 151.2093], [51.5074, -0.1278]]
    for (const [lat, lng] of cases) {
      const ll = new LatLng(lat, lng)
      const v = Globe.toSphere(ll)
      const back = Globe.fromSphere(v)
      expect(back.lat).toBeCloseTo(lat, 5)
      expect(back.lng).toBeCloseTo(lng, 5)
    }
  })
})

describe('Globe projection — mix function', () => {
  test('returns 1 at low zoom (fully globe)', () => {
    expect(Globe.globeToMercatorMix(0)).toBe(1)
    expect(Globe.globeToMercatorMix(5)).toBe(1)
  })

  test('returns 0 at high zoom (fully flat)', () => {
    expect(Globe.globeToMercatorMix(6)).toBe(0)
    expect(Globe.globeToMercatorMix(12)).toBe(0)
  })

  test('blends smoothly across the crossover window', () => {
    const mid = Globe.globeToMercatorMix((Globe.GLOBE_START_ZOOM + Globe.GLOBE_END_ZOOM) / 2)
    // Smoothstep at t=0.5 → 0.5 → mix = 1 - 0.5 = 0.5.
    expect(mid).toBeCloseTo(0.5, 2)
  })
})

describe('Globe projection — 2D shim', () => {
  test('project/unproject delegates to Mercator for tile-grid compatibility', () => {
    const ll = new LatLng(40, -74)
    const p = Globe.project(ll)
    const back = Globe.unproject(p)
    expect(back.lat).toBeCloseTo(40, 5)
    expect(back.lng).toBeCloseTo(-74, 5)
  })
})
