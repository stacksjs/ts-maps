// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/geometry/LineUtilSpec.js
import { beforeEach, describe, expect, it } from 'bun:test'
import { Bounds, EPSG3857, expectNearLatLng, LatLng, LineUtil, Point } from './_harness'

describe('LineUtil', () => {
  describe('#clipSegment', () => {
    let bounds: Bounds

    beforeEach(() => {
      bounds = new Bounds([5, 0], [15, 10])
    })

    // Ported from LineUtilSpec.js#L14
    it('clips a segment by bounds', () => {
      const a = new Point(0, 0)
      const b = new Point(15, 15)

      const segment = LineUtil.clipSegment(a, b, bounds) as [Point, Point]

      expect(segment[0]).toEqual(new Point(5, 5))
      expect(segment[1]).toEqual(new Point(10, 10))

      const c = new Point(5, -5)
      const d = new Point(20, 10)

      const segment2 = LineUtil.clipSegment(c, d, bounds) as [Point, Point]

      expect(segment2[0]).toEqual(new Point(10, 0))
      expect(segment2[1]).toEqual(new Point(15, 5))
    })

    // Ported from LineUtilSpec.js#L32
    it('uses last bit code and reject segments out of bounds', () => {
      const a = new Point(15, 15)
      const b = new Point(25, 20)
      const segment = LineUtil.clipSegment(a, b, bounds, true)

      expect(segment).toBe(false)
    })

    // Ported from LineUtilSpec.js#L40
    it('can round numbers in clipped bounds', () => {
      const a = new Point(4, 5)
      const b = new Point(8, 6)

      const segment1 = LineUtil.clipSegment(a, b, bounds) as [Point, Point]

      expect(segment1[0]).toEqual(new Point(5, 5.25))
      expect(segment1[1]).toEqual(b)

      const segment2 = LineUtil.clipSegment(a, b, bounds, false, true) as [Point, Point]

      expect(segment2[0]).toEqual(new Point(5, 5))
      expect(segment2[1]).toEqual(b)
    })
  })

  describe('#pointToSegmentDistance & #closestPointOnSegment', () => {
    const p1 = new Point(0, 10)
    const p2 = new Point(10, 0)
    const p = new Point(0, 0)

    // Ported from LineUtilSpec.js#L61
    it('calculates distance from new Point to segment', () => {
      expect(LineUtil.pointToSegmentDistance(p, p1, p2)).toEqual(Math.sqrt(200) / 2)
    })

    // Ported from LineUtilSpec.js#L65
    it('calculates new Point closest to segment', () => {
      expect(LineUtil.closestPointOnSegment(p, p1, p2)).toEqual(new Point(5, 5))
    })
  })

  describe('#simplify', () => {
    // Ported from LineUtilSpec.js#L71
    it('simplifies polylines according to tolerance', () => {
      const points = [
        new Point(0, 0),
        new Point(0.01, 0),
        new Point(0.5, 0.01),
        new Point(0.7, 0),
        new Point(1, 0),
        new Point(1.999, 0.999),
        new Point(2, 1),
      ]

      const simplified = LineUtil.simplify(points, 0.1)

      expect(simplified).toEqual([
        new Point(0, 0),
        new Point(1, 0),
        new Point(2, 1),
      ])
    })
  })

  describe('#isFlat', () => {
    // Ported from LineUtilSpec.js#L93
    it('should return true for an array of LatLngs', () => {
      expect(LineUtil.isFlat([new LatLng([0, 0])])).toBe(true)
    })

    // Ported from LineUtilSpec.js#L97
    it('should return true for an array of LatLngs arrays', () => {
      expect(LineUtil.isFlat([[0, 0]])).toBe(true)
    })

    // Ported from LineUtilSpec.js#L101
    it('should return true for an empty array', () => {
      expect(LineUtil.isFlat([])).toBe(true)
    })

    // Ported from LineUtilSpec.js#L105
    it('should return false for a nested array of LatLngs', () => {
      expect(LineUtil.isFlat([[new LatLng([0, 0])]])).toBe(false)
    })

    // Ported from LineUtilSpec.js#L109
    it('should return false for a nested empty array', () => {
      expect(LineUtil.isFlat([[]])).toBe(false)
    })
  })

  describe('#polylineCenter', () => {
    // Ported from LineUtilSpec.js#L114
    // Upstream builds a real Map (needs DOM layout). We exercise the same code
    // path by passing EPSG3857 — which is what `map.options.crs` defaults to —
    // directly. Assertions preserved; the Polyline `.addTo(map)` variants are
    // covered separately via PolylineSpec.
    const crs = EPSG3857

    // Ported from LineUtilSpec.js#L127
    it('computes center of line', () => {
      const latlngs: [number, number][] = [[80, 0], [80, 90]]
      const center = LineUtil.polylineCenter(latlngs, crs)
      expectNearLatLng(center, [80, 45])
    })

    // Ported from LineUtilSpec.js#L139
    it('throws error if latlngs not passed', () => {
      expect(() => {
        LineUtil.polylineCenter(null as any, crs)
      }).toThrow('latlngs not passed')
    })

    // Ported from LineUtilSpec.js#L145
    it('throws error if latlng array is empty', () => {
      expect(() => {
        LineUtil.polylineCenter([], crs)
      }).toThrow('latlngs not passed')
    })

    // Ported from LineUtilSpec.js#L164
    it('shows warning if latlngs is not flat', () => {
      const latlngs = [
        [[80, 0], [80, 90]],
      ]
      const originalWarn = console.warn
      let called = 0
      // eslint-disable-next-line no-console
      console.warn = (): void => { called++ }
      try {
        const center = LineUtil.polylineCenter(latlngs, crs)
        expect(called).toBe(1)
        expectNearLatLng(center, [80, 45])
      }
      finally {
        // eslint-disable-next-line no-console
        console.warn = originalWarn
      }
    })

    // Ported from LineUtilSpec.js#L175
    it('iterates only over the array values', () => {
      // eslint-disable-next-line no-extend-native
      ;(Array.prototype as any).foo = 'ABC'
      try {
        const latlngs = [
          [[80, 0], [80, 90]],
        ]
        // Suppress the expected "not flat" warning.
        const originalWarn = console.warn
        // eslint-disable-next-line no-console
        console.warn = (): void => {}
        try {
          const center = LineUtil.polylineCenter(latlngs, crs)
          expectNearLatLng(center, [80, 45])
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

    // Ported from LineUtilSpec.js#L133 — requires Polyline.addTo(map) with a real
    // rendered map (pixel-projection relies on the map pane position). Skipped
    // until we have a proper headless map test helper.
    it.skip('computes center of a small line — needs a real rendered map', () => {})
  })
})
