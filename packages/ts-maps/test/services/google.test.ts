import { afterEach, describe, expect, test } from 'bun:test'
import { GoogleDirections, GoogleGeocoder } from '../../src/core-map/services/providers/Google'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

interface FetchCall {
  url: string
  init?: FetchInit
}

const originalFetch = globalThis.fetch

function mockFetch(handler: (req: FetchCall) => unknown): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    calls.push({ url, init })
    const body = handler({ url, init })
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
    } as Response
  }) as typeof fetch
  return { calls }
}

const key = 'abc123'

describe('Google providers', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('GoogleGeocoder throws without apiKey', () => {
    expect(() => new GoogleGeocoder({ apiKey: '' })).toThrow(/apiKey/)
  })

  test('GoogleGeocoder.search appends key= param and parses results', async () => {
    const { calls } = mockFetch(() => ({
      status: 'OK',
      results: [
        {
          formatted_address: 'Paris, France',
          geometry: {
            location: { lat: 48.85, lng: 2.35 },
            bounds: {
              northeast: { lat: 48.9, lng: 2.5 },
              southwest: { lat: 48.8, lng: 2.2 },
            },
          },
          types: ['locality', 'political'],
          place_id: 'chIJ',
        },
      ],
    }))
    const geo = new GoogleGeocoder({ apiKey: key })
    const results = await geo.search('Paris')
    const url = new URL(calls[0].url)
    expect(url.searchParams.get('key')).toBe(key)
    expect(url.searchParams.get('address')).toBe('Paris')
    expect(results[0].text).toBe('Paris, France')
    expect(results[0].center).toEqual({ lat: 48.85, lng: 2.35 })
    expect(results[0].bbox).toEqual([2.2, 48.8, 2.5, 48.9])
    expect(results[0].placeType).toBe('place')
  })

  test('GoogleGeocoder.search honors countries and language', async () => {
    const { calls } = mockFetch(() => ({ status: 'OK', results: [] }))
    await new GoogleGeocoder({ apiKey: key }).search('Test', {
      language: 'fr',
      countries: ['us', 'ca'],
    })
    const url = new URL(calls[0].url)
    expect(url.searchParams.get('language')).toBe('fr')
    expect(url.searchParams.get('components')).toBe('country:us|country:ca')
  })

  test('GoogleGeocoder.search respects limit slicing', async () => {
    mockFetch(() => ({
      status: 'OK',
      results: Array.from({ length: 5 }, (_, i) => ({
        formatted_address: `R${i}`,
        geometry: { location: { lat: i, lng: i } },
      })),
    }))
    const out = await new GoogleGeocoder({ apiKey: key }).search('X', { limit: 2 })
    expect(out.length).toBe(2)
  })

  test('GoogleGeocoder.reverse uses latlng param', async () => {
    const { calls } = mockFetch(() => ({ status: 'OK', results: [] }))
    await new GoogleGeocoder({ apiKey: key }).reverse({ lat: 10, lng: 20 })
    const url = new URL(calls[0].url)
    expect(url.searchParams.get('latlng')).toBe('10,20')
    expect(url.searchParams.get('key')).toBe(key)
  })

  test('GoogleGeocoder throws on non-OK status (not ZERO_RESULTS)', async () => {
    mockFetch(() => ({ status: 'OVER_QUERY_LIMIT', error_message: 'quota' }))
    await expect(
      new GoogleGeocoder({ apiKey: key }).search('x'),
    ).rejects.toThrow(/OVER_QUERY_LIMIT/)
  })

  test('GoogleGeocoder returns empty for ZERO_RESULTS', async () => {
    mockFetch(() => ({ status: 'ZERO_RESULTS', results: [] }))
    const out = await new GoogleGeocoder({ apiKey: key }).search('nowhere')
    expect(out).toEqual([])
  })

  test('GoogleDirections throws without apiKey', () => {
    expect(() => new GoogleDirections({ apiKey: '' })).toThrow(/apiKey/)
  })

  test('GoogleDirections builds origin/destination/waypoints', async () => {
    const { calls } = mockFetch(() => ({
      status: 'OK',
      routes: [
        {
          legs: [{ distance: { value: 100 }, duration: { value: 10 }, steps: [] }],
        },
      ],
    }))
    await new GoogleDirections({ apiKey: key }).getDirections(
      [{ lat: 0, lng: 0 }, { lat: 5, lng: 5 }, { lat: 10, lng: 10 }],
    )
    const url = new URL(calls[0].url)
    expect(url.searchParams.get('key')).toBe(key)
    expect(url.searchParams.get('origin')).toBe('0,0')
    expect(url.searchParams.get('destination')).toBe('10,10')
    expect(url.searchParams.get('waypoints')).toBe('5,5')
    expect(url.searchParams.get('mode')).toBe('driving')
  })

  test('GoogleDirections parses html_instructions and polyline', async () => {
    mockFetch(() => ({
      status: 'OK',
      routes: [
        {
          overview_polyline: { points: '??' },
          legs: [
            {
              distance: { value: 100 },
              duration: { value: 10 },
              steps: [
                {
                  distance: { value: 50 },
                  duration: { value: 5 },
                  html_instructions: 'Turn <b>left</b> onto Main St',
                  polyline: { points: '??' },
                  maneuver: 'turn-left',
                },
              ],
            },
          ],
        },
      ],
    }))
    const routes = await new GoogleDirections({ apiKey: key }).getDirections(
      [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
    )
    expect(routes[0].distance).toBe(100)
    expect(routes[0].steps[0].instruction).toBe('Turn left onto Main St')
    expect(routes[0].steps[0].maneuver).toBe('turn-left')
  })

  test('GoogleDirections throws on non-OK status', async () => {
    mockFetch(() => ({ status: 'REQUEST_DENIED', error_message: 'bad key' }))
    await expect(
      new GoogleDirections({ apiKey: key }).getDirections([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]),
    ).rejects.toThrow(/REQUEST_DENIED/)
  })
})
