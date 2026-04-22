// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/geometry/PolyUtilSpec.js
import { describe, expect, it } from 'bun:test'
import { Bounds, EPSG3857, expectNearLatLng, Point, PolyUtil } from './_harness'

describe('PolyUtil', () => {
  describe('#clipPolygon', () => {
    // Ported from PolyUtilSpec.js#L8
    it('clips polygon by bounds', () => {
      const bounds = new Bounds([0, 0], [10, 10])

      const points = [
        new Point(5, 5),
        new Point(15, 10),
        new Point(10, 15),
      ]

      const clipped = PolyUtil.clipPolygon(points, bounds)

      for (const c of clipped) {
        delete (c as any)._code
      }

      expect(clipped).toEqual([
        new Point(7.5, 10),
        new Point(5, 5),
        new Point(10, 7.5),
        new Point(10, 10),
      ])

      const clippedRounded = PolyUtil.clipPolygon(points, bounds, true)

      for (const c of clippedRounded) {
        delete (c as any)._code
      }

      expect(clippedRounded).toEqual([
        new Point(8, 10),
        new Point(5, 5),
        new Point(10, 8),
        new Point(10, 10),
      ])
    })
  })

  describe('#polygonCenter', () => {
    // Ported from PolyUtilSpec.js#L47
    // We exercise the pure math path with EPSG3857 (the map's default CRS),
    // sidestepping the real-Map DOM harness used upstream. See LineUtilSpec.
    const crs = EPSG3857

    // Ported from PolyUtilSpec.js#L61
    it('computes center of polygon', () => {
      const latlngs: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]
      const center = PolyUtil.polygonCenter(latlngs, crs)
      expectNearLatLng(center, [5.019148099025293, 5])
    })

    // Ported from PolyUtilSpec.js#L79
    it('throws error if latlngs not passed', () => {
      expect(() => {
        PolyUtil.polygonCenter(null as any, crs)
      }).toThrow('latlngs not passed')
    })

    // Ported from PolyUtilSpec.js#L85
    it('throws error if latlng array is empty', () => {
      expect(() => {
        PolyUtil.polygonCenter([], crs)
      }).toThrow('latlngs not passed')
    })

    // Ported from PolyUtilSpec.js#L91
    it('shows warning if latlngs is not flat', () => {
      const latlngs = [
        [[0, 0], [10, 0], [10, 10], [0, 10]],
      ]
      const originalWarn = console.warn
      let called = 0
      // eslint-disable-next-line no-console
      console.warn = (): void => { called++ }
      try {
        const center = PolyUtil.polygonCenter(latlngs, crs)
        expect(called).toBe(1)
        expectNearLatLng(center, [5.019148099025293, 5])
      }
      finally {
        // eslint-disable-next-line no-console
        console.warn = originalWarn
      }
    })

    // Ported from PolyUtilSpec.js#L102
    it('iterates only over the array values', () => {
      // eslint-disable-next-line no-extend-native
      ;(Array.prototype as any).foo = 'ABC'
      try {
        const latlngs = [
          [[0, 0], [10, 0], [10, 10], [0, 10]],
        ]
        const originalWarn = console.warn
        // eslint-disable-next-line no-console
        console.warn = (): void => {}
        try {
          const center = PolyUtil.polygonCenter(latlngs, crs)
          expectNearLatLng(center, [5.019148099025293, 5])
        }
        finally {
          // eslint-disable-next-line no-console
          console.warn = originalWarn
        }
      }
      finally {
        delete (Array.prototype as any).foo
      }
    })

    // Ported from PolyUtilSpec.js#L67, #L73 — rely on `Polygon.addTo(map)` with
    // a real rendered map. Skipped until we have a proper headless map test helper.
    it.skip('computes center of a small polygon — needs a real rendered map', () => {})
    it.skip('computes center of a big polygon — needs a real rendered map', () => {})
  })
})
