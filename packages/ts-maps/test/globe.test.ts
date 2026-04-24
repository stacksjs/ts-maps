import { describe, expect, test } from 'bun:test'
import { Globe } from '../src/core-map/geo/projection/Projection.Globe'
import { LatLng } from '../src/core-map/geo/LatLng'
import { TsMap } from '../src/core-map/map/Map'
import { Point } from '../src/core-map/geometry/Point'

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

describe('Globe atmosphere halo overlay', () => {
  function createContainer(): HTMLElement {
    const c = document.createElement('div')
    c.style.width = '400px'
    c.style.height = '400px'
    document.body.appendChild(c)
    return c
  }

  test('paints a radial atmosphere gradient while inside the globe zoom window', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    map._size = new Point(400, 400)
    map._sizeChanged = false
    ;(map.options as any).projection = 'globe'

    map._updateAtmosphereOverlay()
    expect(map._atmosphereOverlay).toBeDefined()
    const bg = map._atmosphereOverlay!.style?.background ?? ''
    expect(bg).toContain('radial-gradient')
  })

  test('cross-fades away once zoom is past the Mercator threshold', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 8 })
    map._size = new Point(400, 400)
    map._sizeChanged = false
    ;(map.options as any).projection = 'globe'

    map._updateAtmosphereOverlay()
    // With no sky/fog set and zoom > 6, the overlay is removed outright.
    expect(map._atmosphereOverlay).toBeUndefined()
  })

  test('_isGlobeProjection detects options.projection === "globe"', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    ;(map.options as any).projection = 'globe'
    expect(map._isGlobeProjection()).toBe(true)
  })
})
