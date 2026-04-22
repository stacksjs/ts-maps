// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/geo/LatLngSpec.js
import { describe, expect, it } from 'bun:test'
import { LatLng } from './_harness'

describe('LatLng', () => {
  describe('constructor', () => {
    // Ported from LatLngSpec.js#L6
    it('sets lat and lng', () => {
      const a = new LatLng(25, 74)
      expect(a.lat).toEqual(25)
      expect(a.lng).toEqual(74)

      const b = new LatLng(-25, -74)
      expect(b.lat).toEqual(-25)
      expect(b.lng).toEqual(-74)
    })

    // Ported from LatLngSpec.js#L16
    it('throws an error if invalid lat or lng', () => {
      expect(() => {
        // eslint-disable-next-line no-new
        new LatLng(Number.NaN, Number.NaN)
      }).toThrow()
    })

    // Ported from LatLngSpec.js#L22
    it('does not set altitude if undefined', () => {
      const a = new LatLng(25, 74)
      expect(typeof a.alt).toEqual('undefined')
    })

    // Ported from LatLngSpec.js#L27
    it('sets altitude', () => {
      const a = new LatLng(25, 74, 50)
      expect(a.alt).toEqual(50)

      const b = new LatLng(-25, -74, -50)
      expect(b.alt).toEqual(-50)
    })
  })

  describe('#equals', () => {
    // Ported from LatLngSpec.js#L37
    it('returns true if compared objects are equal within a certain margin', () => {
      const a = new LatLng(10, 20)
      const b = new LatLng(10 + 1.0E-10, 20 - 1.0E-10)
      expect(a.equals(b)).toEqual(true)
    })

    // Ported from LatLngSpec.js#L43
    it('returns false if compared objects are not equal within a certain margin', () => {
      const a = new LatLng(10, 20)
      const b = new LatLng(10, 23.3)
      expect(a.equals(b)).toEqual(false)
    })

    // Ported from LatLngSpec.js#L49
    it('returns false if passed non-valid object', () => {
      const a = new LatLng(10, 20)
      expect(a.equals(null as any)).toEqual(false)
    })
  })

  describe('#toString', () => {
    // Ported from LatLngSpec.js#L56
    it('formats a string', () => {
      const a = new LatLng(10.333333333, 20.2222222)
      expect(a.toString(3)).toEqual('LatLng(10.333, 20.222)')
      expect(a.toString()).toEqual('LatLng(10.333333, 20.222222)')
    })
  })

  describe('#distanceTo', () => {
    // Ported from LatLngSpec.js#L64
    it('calculates distance in meters', () => {
      const a = new LatLng(50.5, 30.5)
      const b = new LatLng(50, 1)

      expect(Math.abs(Math.round(a.distanceTo(b) / 1000) - 2084) < 5).toEqual(true)
    })

    // Ported from LatLngSpec.js#L70
    it('does not return NaN if input points are equal', () => {
      const a = new LatLng(50.5, 30.5)
      const b = new LatLng(50.5, 30.5)

      expect(a.distanceTo(b)).toEqual(0)
    })
  })

  describe('LatLng creation', () => {
    // Ported from LatLngSpec.js#L79
    it('returns LatLng instance as is', () => {
      const a = new LatLng(50, 30)

      expect(new LatLng(a)).toEqual(a)
    })

    // Ported from LatLngSpec.js#L85
    it('accepts an array of coordinates', () => {
      expect(() => new LatLng([] as any)).toThrow()
      expect(() => new LatLng([50] as any)).toThrow()
      expect(new LatLng([50, 30])).toEqual(new LatLng(50, 30))
      expect(new LatLng([50, 30, 100])).toEqual(new LatLng(50, 30, 100))
    })

    // Ported from LatLngSpec.js#L92
    it('passes null or undefined as is', () => {
      expect(() => new LatLng(undefined as any)).toThrow()
      expect(() => new LatLng(null as any)).toThrow()
    })

    // Ported from LatLngSpec.js#L97
    it('creates a LatLng object from two coordinates', () => {
      expect(new LatLng(50, 30)).toEqual(new LatLng(50, 30))
    })

    // Ported from LatLngSpec.js#L101
    it('accepts an object with lat/lng', () => {
      expect(new LatLng({ lat: 50, lng: 30 })).toEqual(new LatLng(50, 30))
    })

    // Ported from LatLngSpec.js#L105
    it('accepts an object with lat/lon', () => {
      expect(new LatLng({ lat: 50, lon: 30 } as any)).toEqual(new LatLng(50, 30))
    })

    // Ported from LatLngSpec.js#L109
    it('returns null if lng not specified', () => {
      expect(() => new LatLng(50)).toThrow()
    })

    // Ported from LatLngSpec.js#L113
    it('accepts altitude as third parameter', () => {
      expect(new LatLng(50, 30, 100)).toEqual(new LatLng(50, 30, 100))
    })

    // Ported from LatLngSpec.js#L117
    it('accepts an object with alt', () => {
      expect(new LatLng({ lat: 50, lng: 30, alt: 100 })).toEqual(new LatLng(50, 30, 100))
      expect(new LatLng({ lat: 50, lon: 30, alt: 100 } as any)).toEqual(new LatLng(50, 30, 100))
    })
  })

  describe('#clone', () => {
    // Ported from LatLngSpec.js#L124
    it('should clone attributes', () => {
      const a = new LatLng(50.5, 30.5, 100)
      const b = a.clone()

      expect(b.lat).toBe(50.5)
      expect(b.lng).toBe(30.5)
      expect(b.alt).toBe(100)
    })

    // Ported from LatLngSpec.js#L133
    it('should create another reference', () => {
      const a = new LatLng(50.5, 30.5, 100)
      const b = a.clone()

      expect(a === b).toBe(false)
    })
  })
})
