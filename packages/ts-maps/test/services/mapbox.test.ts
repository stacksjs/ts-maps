import { afterEach, describe, expect, test } from 'bun:test'
import {
  MapboxDirections,
  MapboxGeocoder,
  MapboxIsochrone,
  MapboxMatrix,
} from '../../src/core-map/services/providers/Mapbox'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

interface FetchCall {
  url: string
  init?: FetchInit
}

const originalFetch = globalThis.fetch

function mockFetch(handler: (req: FetchCall) => unknown, opts?: { ok?: boolean, status?: number }): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    calls.push({ url, init })
    const body = handler({ url, init })
    return {
      ok: opts?.ok ?? true,
      status: opts?.status ?? 200,
      statusText: 'OK',
      json: async () => body,
    } as Response
  }) as typeof fetch
  return { calls }
}

const token = 'pk.test'

describe('Mapbox providers', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('MapboxGeocoder throws without an accessToken', () => {
    expect(() => new MapboxGeocoder({ accessToken: '' })).toThrow(/accessToken/)
  })

  test('MapboxGeocoder.search appends access_token param and parses features', async () => {
    const { calls } = mockFetch(() => ({
      features: [
        {
          geometry: { type: 'Point', coordinates: [2.35, 48.85] },
          properties: {
            name: 'Paris',
            full_address: 'Paris, France',
            feature_type: 'place',
            bbox: [2.2, 48.8, 2.5, 48.9],
          },
          relevance: 0.9,
        },
      ],
    }))
    const geo = new MapboxGeocoder({ accessToken: token })
    const results = await geo.search('Paris', { limit: 3 })
    expect(calls.length).toBe(1)
    const url = new URL(calls[0].url)
    expect(url.pathname.endsWith('/search/geocode/v6/forward')).toBe(true)
    expect(url.searchParams.get('access_token')).toBe(token)
    expect(url.searchParams.get('limit')).toBe('3')
    expect(results[0]).toMatchObject({
      text: 'Paris, France',
      center: { lat: 48.85, lng: 2.35 },
      placeType: 'place',
      bbox: [2.2, 48.8, 2.5, 48.9],
      relevance: 0.9,
    })
  })

  test('MapboxGeocoder.reverse composes longitude/latitude params', async () => {
    const { calls } = mockFetch(() => ({ features: [] }))
    await new MapboxGeocoder({ accessToken: token }).reverse({ lat: 10, lng: 20 })
    const url = new URL(calls[0].url)
    expect(url.pathname.endsWith('/search/geocode/v6/reverse')).toBe(true)
    expect(url.searchParams.get('longitude')).toBe('20')
    expect(url.searchParams.get('latitude')).toBe('10')
    expect(url.searchParams.get('access_token')).toBe(token)
  })

  test('MapboxDirections throws without accessToken', () => {
    expect(() => new MapboxDirections({ accessToken: '' })).toThrow(/accessToken/)
  })

  test('MapboxDirections.getDirections parses routes and uses profile in URL', async () => {
    const { calls } = mockFetch(() => ({
      code: 'Ok',
      routes: [
        {
          distance: 100,
          duration: 10,
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
          legs: [
            {
              distance: 100,
              duration: 10,
              steps: [
                {
                  distance: 50,
                  duration: 5,
                  geometry: { type: 'LineString', coordinates: [[0, 0], [0.5, 0.5]] },
                  maneuver: { type: 'turn', modifier: 'right', instruction: 'Turn right' },
                  name: 'Main St',
                },
              ],
            },
          ],
        },
      ],
    }))
    const d = new MapboxDirections({ accessToken: token })
    const routes = await d.getDirections(
      [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
      { profile: 'walking' },
    )
    expect(calls[0].url).toContain('/directions/v5/mapbox/walking/')
    expect(new URL(calls[0].url).searchParams.get('access_token')).toBe(token)
    expect(routes[0].steps[0].instruction).toBe('Turn right')
    expect(routes[0].steps[0].maneuver).toBe('turn-right')
  })

  test('MapboxDirections rejects on non-Ok code', async () => {
    mockFetch(() => ({ code: 'NoRoute', message: 'no path' }))
    await expect(
      new MapboxDirections({ accessToken: token }).getDirections(
        [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
      ),
    ).rejects.toThrow(/NoRoute/)
  })

  test('MapboxIsochrone parses polygon features and uses minutes', async () => {
    const { calls } = mockFetch(() => ({
      features: [
        {
          type: 'Feature',
          properties: { contour: 10 },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
      ],
    }))
    const iso = new MapboxIsochrone({ accessToken: token })
    const polys = await iso.getIsochrones({ lat: 5, lng: 5 }, { contours: [10, 20] })
    const url = new URL(calls[0].url)
    expect(url.pathname.endsWith('/isochrone/v1/mapbox/driving/5,5')).toBe(true)
    expect(url.searchParams.get('contours_minutes')).toBe('10,20')
    expect(url.searchParams.get('polygons')).toBe('true')
    expect(polys[0].contour).toBe(10)
    expect(polys[0].geometry.length).toBe(4)
  })

  test('MapboxIsochrone uses contours_meters when metric=distance', async () => {
    const { calls } = mockFetch(() => ({ features: [] }))
    await new MapboxIsochrone({ accessToken: token }).getIsochrones(
      { lat: 0, lng: 0 },
      { contours: [500], contourMetric: 'distance' },
    )
    const url = new URL(calls[0].url)
    expect(url.searchParams.get('contours_meters')).toBe('500')
    expect(url.searchParams.get('contours_minutes')).toBeNull()
  })

  test('MapboxMatrix composes sources/destinations indexing', async () => {
    const { calls } = mockFetch(() => ({
      code: 'Ok',
      durations: [[0, 100], [100, 0]],
      distances: [[0, 1000], [1000, 0]],
    }))
    const m = await new MapboxMatrix({ accessToken: token }).getMatrix(
      [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
      [{ lat: 2, lng: 2 }, { lat: 3, lng: 3 }],
    )
    const url = new URL(calls[0].url)
    expect(url.pathname).toContain('/directions-matrix/v1/mapbox/driving/')
    expect(url.searchParams.get('sources')).toBe('0;1')
    expect(url.searchParams.get('destinations')).toBe('2;3')
    expect(m.durations?.[0][1]).toBe(100)
    expect(m.distances?.[0][1]).toBe(1000)
  })

  test('all providers reject when accessToken is missing', () => {
    expect(() => new MapboxIsochrone({ accessToken: '' })).toThrow(/accessToken/)
    expect(() => new MapboxMatrix({ accessToken: '' })).toThrow(/accessToken/)
  })
})
