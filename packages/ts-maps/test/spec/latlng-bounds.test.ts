// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/geo/LatLngBoundsSpec.js
import { beforeEach, describe, expect, it } from 'bun:test'
import { LatLng, LatLngBounds } from './_harness'

describe('LatLngBounds', () => {
  let a: LatLngBounds, c: LatLngBounds

  beforeEach(() => {
    a = new LatLngBounds(
      new LatLng(14, 12),
      new LatLng(30, 40),
    )
    c = new LatLngBounds()
  })

  describe('constructor', () => {
    // Ported from LatLngBoundsSpec.js#L16
    it('instantiates either passing two latlngs or an array of latlngs', () => {
      const b = new LatLngBounds([
        new LatLng(14, 12),
        new LatLng(30, 40),
      ])
      expect(b).toEqual(a)
      expect(b.getNorthWest()).toEqual(new LatLng(30, 12))
    })

    // Ported from LatLngBoundsSpec.js#L25
    it('returns an empty bounds when not argument is given', () => {
      const bounds = new LatLngBounds()
      expect(bounds instanceof LatLngBounds).toBe(true)
    })

    // Ported from LatLngBoundsSpec.js#L30
    it('returns an empty bounds when not argument is given to factory', () => {
      const bounds = new LatLngBounds()
      expect(bounds instanceof LatLngBounds).toBe(true)
    })
  })

  describe('#extend', () => {
    // Ported from LatLngBoundsSpec.js#L38
    it('extends the bounds by a given point', () => {
      a.extend(new LatLng(20, 50))
      expect(a.getNorthEast()).toEqual(new LatLng(30, 50))
    })

    // Ported from LatLngBoundsSpec.js#L43
    it('extends the bounds by given bounds', () => {
      a.extend([[20, 50], [8, 40]])
      expect(a.getSouthEast()).toEqual(new LatLng(8, 50))
    })

    // Ported from LatLngBoundsSpec.js#L48
    it('extends the bounds by undefined', () => {
      expect((a.extend as any)()).toEqual(a)
    })

    // Ported from LatLngBoundsSpec.js#L52
    it('extends the bounds by raw object', () => {
      a.extend({ lat: 20, lng: 50 })
      expect(a.getNorthEast()).toEqual(new LatLng(30, 50))
    })

    // Ported from LatLngBoundsSpec.js#L57
    it('extend the bounds by an empty bounds object', () => {
      expect(a.extend(new LatLngBounds())).toEqual(a)
    })
  })

  describe('#getCenter', () => {
    // Ported from LatLngBoundsSpec.js#L63
    it('returns the bounds center', () => {
      expect(a.getCenter()).toEqual(new LatLng(22, 26))
    })
  })

  describe('#pad', () => {
    // Ported from LatLngBoundsSpec.js#L69
    it('pads the bounds by a given ratio', () => {
      const b = a.pad(0.5)

      expect(b).toEqual(new LatLngBounds([[6, -2], [38, 54]]))
    })
  })

  describe('#equals', () => {
    // Ported from LatLngBoundsSpec.js#L77
    it('returns true if bounds equal', () => {
      expect(a.equals([[14, 12], [30, 40]])).toEqual(true)
      expect(a.equals([[14, 13], [30, 40]])).toEqual(false)
      expect(a.equals(null)).toEqual(false)
    })

    // Ported from LatLngBoundsSpec.js#L83
    it('returns true if compared objects are equal within a certain margin', () => {
      expect(a.equals([[15, 11], [29, 41]], 1)).toEqual(true)
    })

    // Ported from LatLngBoundsSpec.js#L87
    it('returns false if compared objects are not equal within a certain margin', () => {
      expect(a.equals([[15, 11], [29, 41]], 0.5)).toEqual(false)
    })
  })

  describe('#isValid', () => {
    // Ported from LatLngBoundsSpec.js#L93
    it('returns true if properly set up', () => {
      expect(a.isValid()).toBe(true)
    })

    // Ported from LatLngBoundsSpec.js#L97
    it('returns false if is invalid', () => {
      expect(c.isValid()).toBe(false)
    })

    // Ported from LatLngBoundsSpec.js#L101
    it('returns true if extended', () => {
      c.extend([0, 0])
      expect(c.isValid()).toBe(true)
    })
  })

  describe('#getWest', () => {
    // Ported from LatLngBoundsSpec.js#L108
    it('returns a proper bbox west value', () => {
      expect(a.getWest()).toEqual(12)
    })
  })

  describe('#getSouth', () => {
    // Ported from LatLngBoundsSpec.js#L114
    it('returns a proper bbox south value', () => {
      expect(a.getSouth()).toEqual(14)
    })
  })

  describe('#getEast', () => {
    // Ported from LatLngBoundsSpec.js#L120
    it('returns a proper bbox east value', () => {
      expect(a.getEast()).toEqual(40)
    })
  })

  describe('#getNorth', () => {
    // Ported from LatLngBoundsSpec.js#L126
    it('returns a proper bbox north value', () => {
      expect(a.getNorth()).toEqual(30)
    })
  })

  describe('#toBBoxString', () => {
    // Ported from LatLngBoundsSpec.js#L132
    it('returns a proper left,bottom,right,top bbox', () => {
      expect(a.toBBoxString()).toEqual('12,14,40,30')
    })
  })

  describe('#getNorthWest', () => {
    // Ported from LatLngBoundsSpec.js#L138
    it('returns a proper north-west LatLng', () => {
      expect(a.getNorthWest()).toEqual(new LatLng(a.getNorth(), a.getWest()))
    })
  })

  describe('#getSouthEast', () => {
    // Ported from LatLngBoundsSpec.js#L144
    it('returns a proper south-east LatLng', () => {
      expect(a.getSouthEast()).toEqual(new LatLng(a.getSouth(), a.getEast()))
    })
  })

  describe('#contains', () => {
    // Ported from LatLngBoundsSpec.js#L150
    it('returns true if contains latlng point as array', () => {
      expect(a.contains([16, 20])).toEqual(true)
      expect(new LatLngBounds(a).contains([5, 20])).toEqual(false)
    })

    // Ported from LatLngBoundsSpec.js#L155
    it('returns true if contains latlng point as {lat:, lng:} object', () => {
      expect(a.contains({ lat: 16, lng: 20 })).toEqual(true)
      expect(new LatLngBounds(a).contains({ lat: 5, lng: 20 })).toEqual(false)
    })

    // Ported from LatLngBoundsSpec.js#L160
    it('returns true if contains latlng point as LatLng instance', () => {
      expect(a.contains(new LatLng([16, 20]))).toEqual(true)
      expect(new LatLngBounds(a).contains(new LatLng([5, 20]))).toEqual(false)
    })

    // Ported from LatLngBoundsSpec.js#L165
    it('returns true if contains bounds', () => {
      expect(a.contains([[16, 20], [20, 40]])).toEqual(true)
      expect(a.contains([[16, 50], [8, 40]])).toEqual(false)
    })
  })

  describe('#intersects', () => {
    // Ported from LatLngBoundsSpec.js#L172
    it('returns true if intersects the given bounds', () => {
      expect(a.intersects([[16, 20], [50, 60]])).toEqual(true)
      expect(a.contains([[40, 50], [50, 60]])).toEqual(false)
    })

    // Ported from LatLngBoundsSpec.js#L177
    it('returns true if just touches the boundary of the given bounds', () => {
      expect(a.intersects([[25, 40], [55, 50]])).toEqual(true)
    })
  })

  describe('#overlaps', () => {
    // Ported from LatLngBoundsSpec.js#L183
    it('returns true if overlaps the given bounds', () => {
      expect(a.overlaps([[16, 20], [50, 60]])).toEqual(true)
    })

    // Ported from LatLngBoundsSpec.js#L187
    it('returns false if just touches the boundary of the given bounds', () => {
      expect(a.overlaps([[25, 40], [55, 50]])).toEqual(false)
    })
  })
})
