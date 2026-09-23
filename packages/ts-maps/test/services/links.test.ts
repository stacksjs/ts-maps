import { describe, expect, test } from 'bun:test'
import { appleMapsDirectionsUrl, directionsLinks, formatCoordinate, googleMapsDirectionsUrl } from '../../src/core-map/services'

const trailhead = { lat: 32.8894161, lng: -117.2518543 }

describe('directions hand-off links', () => {
  test('default to driving from the device location', () => {
    expect(directionsLinks(trailhead)).toEqual({
      apple: 'https://maps.apple.com/?daddr=32.889416%2C-117.251854&dirflg=d',
      google: 'https://www.google.com/maps/dir/?api=1&destination=32.889416%2C-117.251854&travelmode=driving',
    })
  })

  test('map each travel mode to what the app understands', () => {
    expect(appleMapsDirectionsUrl(trailhead, { mode: 'walking' })).toContain('dirflg=w')
    expect(appleMapsDirectionsUrl(trailhead, { mode: 'transit' })).toContain('dirflg=r')
    // No cycling flag exists for Apple Maps links: none is better than driving.
    expect(appleMapsDirectionsUrl(trailhead, { mode: 'cycling' })).not.toContain('dirflg')
    expect(googleMapsDirectionsUrl(trailhead, { mode: 'cycling' })).toContain('travelmode=bicycling')
    expect(googleMapsDirectionsUrl(trailhead, { mode: 'transit' })).toContain('travelmode=transit')
  })

  test('include an explicit origin', () => {
    const origin = { lat: 32.7157, lng: -117.1611 }
    expect(appleMapsDirectionsUrl(trailhead, { origin })).toBe('https://maps.apple.com/?saddr=32.7157%2C-117.1611&daddr=32.889416%2C-117.251854&dirflg=d')
    expect(googleMapsDirectionsUrl(trailhead, { origin })).toContain('origin=32.7157%2C-117.1611&destination=')
  })

  test('refuse coordinates no app can navigate to', () => {
    for (const bad of [{ lat: Number.NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: Infinity, lng: 0 }])
      expect(() => directionsLinks(bad)).toThrow(RangeError)
  })

  test('formatCoordinate rounds to six places without trailing zeros or -0', () => {
    expect(formatCoordinate({ lat: 1.5, lng: -0.0000001 })).toBe('1.5,0')
    expect(formatCoordinate({ lat: -33.8688197, lng: 151.2092958 })).toBe('-33.86882,151.209296')
  })
})
