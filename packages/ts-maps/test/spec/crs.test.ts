// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/geo/crs/CRSSpec.js
import { describe, expect, it } from 'bun:test'
import {
  CRS,
  EarthCRS,
  EPSG3395,
  EPSG3857,
  EPSG4326,
  expectNear,
  expectNearLatLng,
  LatLng,
  LatLngBounds,
  Point,
  SimpleCRS,
  Util,
} from './_harness'

describe('EPSG3857', () => {
  const crs = EPSG3857

  describe('#latLngToPoint', () => {
    // Ported from CRSSpec.js#L9
    it('projects a center point', () => {
      expectNear(crs.latLngToPoint(new LatLng(0, 0), 0), [128, 128], 0.01)
    })

    // Ported from CRSSpec.js#L13
    it('projects the northeast corner of the world', () => {
      expectNear(crs.latLngToPoint(new LatLng(85.0511287798, 180), 0), [256, 0])
    })
  })

  describe('#pointToLatLng', () => {
    // Ported from CRSSpec.js#L19
    it('reprojects a center point', () => {
      expectNearLatLng(crs.pointToLatLng(new Point(128, 128), 0), [0, 0], 0.01)
    })

    // Ported from CRSSpec.js#L23
    it('reprojects the northeast corner of the world', () => {
      expectNearLatLng(crs.pointToLatLng(new Point(256, 0), 0), [85.0511287798, 180])
    })
  })

  describe('project', () => {
    // Ported from CRSSpec.js#L29
    it('projects geo coords into meter coords correctly', () => {
      expectNear(crs.project(new LatLng(50, 30)), [3339584.7238, 6446275.84102])
      expectNear(crs.project(new LatLng(85.0511287798, 180)), [20037508.34279, 20037508.34278])
      expectNear(crs.project(new LatLng(-85.0511287798, -180)), [-20037508.34279, -20037508.34278])
    })
  })

  describe('unproject', () => {
    // Ported from CRSSpec.js#L37
    it('unprojects meter coords into geo coords correctly', () => {
      expectNearLatLng(crs.unproject(new Point(3339584.7238, 6446275.84102)), [50, 30])
      expectNearLatLng(crs.unproject(new Point(20037508.34279, 20037508.34278)), [85.051129, 180])
      expectNearLatLng(crs.unproject(new Point(-20037508.34279, -20037508.34278)), [-85.051129, -180])
    })
  })

  describe('#getProjectedBounds', () => {
    // Ported from CRSSpec.js#L45
    it('gives correct size', () => {
      let worldSize = 256
      for (let i = 0; i <= 22; i++) {
        const crsSize = crs.getProjectedBounds(i)!.getSize()
        expect(crsSize.x).toBe(worldSize)
        expect(crsSize.y).toBe(worldSize)
        worldSize *= 2
      }
    })
  })

  describe('#wrapLatLng', () => {
    // Ported from CRSSpec.js#L59
    it('wraps longitude to lie between -180 and 180 by default', () => {
      expect(crs.wrapLatLng(new LatLng(0, 190)).lng).toEqual(-170)
      expect(crs.wrapLatLng(new LatLng(0, 360)).lng).toEqual(0)
      expect(crs.wrapLatLng(new LatLng(0, 380)).lng).toEqual(20)
      expect(crs.wrapLatLng(new LatLng(0, -190)).lng).toEqual(170)
      expect(crs.wrapLatLng(new LatLng(0, -360)).lng).toEqual(0)
      expect(crs.wrapLatLng(new LatLng(0, -380)).lng).toEqual(-20)
      expect(crs.wrapLatLng(new LatLng(0, 90)).lng).toEqual(90)
      expect(crs.wrapLatLng(new LatLng(0, 180)).lng).toEqual(180)
    })

    // Ported from CRSSpec.js#L70
    it('does not drop altitude', () => {
      expect(crs.wrapLatLng(new LatLng(0, 190, 1234)).lng).toEqual(-170)
      expect(crs.wrapLatLng(new LatLng(0, 190, 1234)).alt).toEqual(1234)

      expect(crs.wrapLatLng(new LatLng(0, 380, 1234)).lng).toEqual(20)
      expect(crs.wrapLatLng(new LatLng(0, 380, 1234)).alt).toEqual(1234)
    })
  })

  describe('#wrapLatLngBounds', () => {
    // Ported from CRSSpec.js#L80
    it('does not wrap bounds between -180 and 180 longitude', () => {
      let bounds1 = new LatLngBounds([-10, -10], [10, 10])
      let bounds2 = new LatLngBounds([-80, -180], [-70, -170])
      let bounds3 = new LatLngBounds([70, 170], [80, 180])

      bounds1 = crs.wrapLatLngBounds(bounds1)
      bounds2 = crs.wrapLatLngBounds(bounds2)
      bounds3 = crs.wrapLatLngBounds(bounds3)

      expect(bounds1.getSouth()).toEqual(-10)
      expect(bounds1.getWest()).toEqual(-10)
      expect(bounds1.getNorth()).toEqual(10)
      expect(bounds1.getEast()).toEqual(10)

      expect(bounds2.getSouth()).toEqual(-80)
      expect(bounds2.getWest()).toEqual(-180)
      expect(bounds2.getNorth()).toEqual(-70)
      expect(bounds2.getEast()).toEqual(-170)

      expect(bounds3.getSouth()).toEqual(70)
      expect(bounds3.getWest()).toEqual(170)
      expect(bounds3.getNorth()).toEqual(80)
      expect(bounds3.getEast()).toEqual(180)
    })

    // Ported from CRSSpec.js#L107
    it('wraps bounds when center longitude is less than -180', () => {
      let bounds1 = new LatLngBounds([0, -185], [10, -170])
      let bounds2 = new LatLngBounds([0, -190], [10, -175])

      bounds1 = crs.wrapLatLngBounds(bounds1)
      bounds2 = crs.wrapLatLngBounds(bounds2)

      expect(bounds1.getSouth()).toEqual(0)
      expect(bounds1.getWest()).toEqual(-185)
      expect(bounds1.getNorth()).toEqual(10)
      expect(bounds1.getEast()).toEqual(-170)

      expect(bounds2.getSouth()).toEqual(0)
      expect(bounds2.getWest()).toEqual(170)
      expect(bounds2.getNorth()).toEqual(10)
      expect(bounds2.getEast()).toEqual(185)
    })

    // Ported from CRSSpec.js#L125
    it('wraps bounds when center longitude is larger than +180', () => {
      let bounds1 = new LatLngBounds([0, 185], [10, 170])
      let bounds2 = new LatLngBounds([0, 190], [10, 175])

      bounds1 = crs.wrapLatLngBounds(bounds1)
      bounds2 = crs.wrapLatLngBounds(bounds2)

      expect(bounds1.getSouth()).toEqual(0)
      expect(bounds1.getWest()).toEqual(170)
      expect(bounds1.getNorth()).toEqual(10)
      expect(bounds1.getEast()).toEqual(185)

      expect(bounds2.getSouth()).toEqual(0)
      expect(bounds2.getWest()).toEqual(-185)
      expect(bounds2.getNorth()).toEqual(10)
      expect(bounds2.getEast()).toEqual(-170)
    })
  })
})

describe('EPSG4326', () => {
  const crs = EPSG4326

  describe('#getSize', () => {
    // Ported from CRSSpec.js#L151
    it('gives correct size', () => {
      let worldSize = 256
      for (let i = 0; i <= 22; i++) {
        const crsSize = crs.getProjectedBounds(i)!.getSize()
        expect(crsSize.x).toBe(worldSize * 2)
        expect(crsSize.y).toBe(worldSize)
        worldSize *= 2
      }
    })
  })
})

describe('EPSG3395', () => {
  const crs = EPSG3395

  describe('#latLngToPoint', () => {
    // Ported from CRSSpec.js#L170
    it('projects a center point', () => {
      expectNear(crs.latLngToPoint(new LatLng(0, 0), 0), [128, 128], 0.01)
    })

    // Ported from CRSSpec.js#L174
    it('projects the northeast corner of the world', () => {
      expectNear(crs.latLngToPoint(new LatLng(85.0840591556, 180), 0), [256, 0])
    })
  })

  describe('#pointToLatLng', () => {
    // Ported from CRSSpec.js#L180
    it('reprojects a center point', () => {
      expectNearLatLng(crs.pointToLatLng(new Point(128, 128), 0), [0, 0], 0.01)
    })

    // Ported from CRSSpec.js#L184
    it('reprojects the northeast corner of the world', () => {
      expectNearLatLng(crs.pointToLatLng(new Point(256, 0), 0), [85.0840591556, 180])
    })
  })
})

describe('SimpleCRS', () => {
  const crs = SimpleCRS

  describe('#latLngToPoint', () => {
    // Ported from CRSSpec.js#L194
    it('converts LatLng coords to pixels', () => {
      expectNear(crs.latLngToPoint(new LatLng(0, 0), 0), [0, 0])
      expectNear(crs.latLngToPoint(new LatLng(700, 300), 0), [300, -700])
      expectNear(crs.latLngToPoint(new LatLng(-200, 1000), 1), [2000, 400])
    })
  })

  describe('#pointToLatLng', () => {
    // Ported from CRSSpec.js#L202
    it('converts pixels to LatLng coords', () => {
      expectNearLatLng(crs.pointToLatLng(new Point(0, 0), 0), [0, 0])
      expectNearLatLng(crs.pointToLatLng(new Point(300, -700), 0), [700, 300])
      expectNearLatLng(crs.pointToLatLng(new Point(2000, 400), 1), [-200, 1000])
    })
  })

  describe('getProjectedBounds', () => {
    // Ported from CRSSpec.js#L210
    it('returns nothing', () => {
      expect(crs.getProjectedBounds(5)).toBe(null)
    })
  })

  describe('wrapLatLng', () => {
    // Ported from CRSSpec.js#L216
    it('returns coords as is', () => {
      expect(crs.wrapLatLng(new LatLng(270, 400)).equals(new LatLng(270, 400))).toBe(true)
    })

    // Ported from CRSSpec.js#L220
    it('wraps coords if configured', () => {
      class WrappedCRS extends SimpleCRS {
        static wrapLng: [number, number] = [-200, 200]
        static wrapLat: [number, number] = [-200, 200]
      }

      expectNearLatLng(WrappedCRS.wrapLatLng(new LatLng(300, -250)), [-100, 150])
    })
  })
})

describe('CRS', () => {
  const crs = CRS

  describe('#zoom && #scale', () => {
    // Ported from CRSSpec.js#L235
    it('convert zoom to scale and vice-versa and return the same values', () => {
      const zoom = 2.5
      const scale = crs.scale(zoom)
      const zoom2 = crs.zoom(scale)
      expect(Util.formatNum(zoom2)).toEqual(zoom)
    })
  })
})

describe('CRS.ZoomNotPowerOfTwo', () => {
  // Ported from CRSSpec.js#L245
  const crs = {
    scale(zoom: number): number {
      return 256 * 1.5 ** zoom
    },
    zoom(scale: number): number {
      return Math.log(scale / 256) / Math.log(1.5)
    },
  }

  describe('#scale', () => {
    // Ported from CRSSpec.js#L255
    it('of zoom levels are related by a power of 1.5', () => {
      const zoom = 5
      const scale = crs.scale(zoom)
      expect(crs.scale(zoom + 1)).toEqual(1.5 * scale)
      expect(crs.zoom(1.5 * scale)).toEqual(zoom + 1)
    })
  })

  describe('#zoom && #scale', () => {
    // Ported from CRSSpec.js#L264
    it('convert zoom to scale and vice-versa and return the same values', () => {
      const zoom = 2
      const scale = crs.scale(zoom)
      expect(crs.zoom(scale)).toEqual(zoom)
    })
  })
})

describe('EarthCRS', () => {
  describe('#distance', () => {
    // Ported from CRSSpec.js#L273
    it('calculates great-circle distance on Earth', () => {
      const p1 = new LatLng(36.12, -86.67)
      const p2 = new LatLng(33.94, -118.40)
      const d = EarthCRS.distance(p1, p2)
      expect(d).toBeGreaterThanOrEqual(2886444.43)
      expect(d).toBeLessThanOrEqual(2886444.45)
    })
  })
})
