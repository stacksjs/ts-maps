import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { NominatimGeocoder } from '../../src/core-map/services/providers/Nominatim'

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
    const call: FetchCall = { url, init }
    calls.push(call)
    const body = handler(call)
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
    } as Response
  }) as typeof fetch
  return { calls }
}

const parisResponse = [
  {
    place_id: 1,
    osm_type: 'relation',
    osm_id: 7444,
    lat: '48.8566',
    lon: '2.3522',
    display_name: 'Paris, Île-de-France, France',
    class: 'boundary',
    type: 'administrative',
    importance: 0.85,
    boundingbox: ['48.815573', '48.902145', '2.224199', '2.469921'],
    address: { city: 'Paris', country: 'France', country_code: 'fr' },
  },
]

const reverseResponse = {
  place_id: 42,
  osm_type: 'way',
  osm_id: 100,
  lat: '48.8584',
  lon: '2.2945',
  display_name: 'Eiffel Tower, Paris, France',
  class: 'tourism',
  type: 'attraction',
  importance: 0.5,
  boundingbox: ['48.858', '48.859', '2.294', '2.295'],
  address: { tourism: 'Eiffel Tower' },
}

describe('NominatimGeocoder', () => {
  beforeEach(() => {
    // fresh handler per test
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('exposes stable provider name', () => {
    expect(new NominatimGeocoder().name).toBe('nominatim')
  })

  test('returns empty array for empty query without calling fetch', async () => {
    const { calls } = mockFetch(() => [])
    const geo = new NominatimGeocoder()
    const out = await geo.search('')
    expect(out).toEqual([])
    expect(calls.length).toBe(0)
  })

  test('search parses Nominatim shape into GeocodingResult', async () => {
    mockFetch(() => parisResponse)
    const geo = new NominatimGeocoder()
    const results = await geo.search('Paris')
    expect(results.length).toBe(1)
    const r = results[0]
    expect(r.text).toBe('Paris, Île-de-France, France')
    expect(r.center).toEqual({ lat: 48.8566, lng: 2.3522 })
    expect(r.bbox).toEqual([2.224199, 48.815573, 2.469921, 48.902145])
    expect(r.placeType).toBe('region')
    expect(r.relevance).toBeCloseTo(0.85, 5)
  })

  test('search composes URL params correctly', async () => {
    const { calls } = mockFetch(() => [])
    const geo = new NominatimGeocoder()
    await geo.search('Berlin', { limit: 3, language: 'en', countries: ['de'], bbox: [13, 52, 14, 53] })
    expect(calls.length).toBe(1)
    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/search')
    expect(url.searchParams.get('q')).toBe('Berlin')
    expect(url.searchParams.get('limit')).toBe('3')
    expect(url.searchParams.get('accept-language')).toBe('en')
    expect(url.searchParams.get('countrycodes')).toBe('de')
    expect(url.searchParams.get('viewbox')).toBe('13,53,14,52')
    expect(url.searchParams.get('bounded')).toBe('1')
  })

  test('sends polite User-Agent header', async () => {
    const { calls } = mockFetch(() => [])
    const geo = new NominatimGeocoder({ userAgent: 'my-app/1.0' })
    await geo.search('Tokyo')
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>
    expect(headers['User-Agent']).toBe('my-app/1.0')
  })

  test('defaults User-Agent to ts-maps', async () => {
    const { calls } = mockFetch(() => [])
    await new NominatimGeocoder().search('NYC')
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>
    expect(headers['User-Agent']).toBe('ts-maps')
  })

  test('reverse returns single result', async () => {
    mockFetch(() => reverseResponse)
    const geo = new NominatimGeocoder()
    const out = await geo.reverse({ lat: 48.8584, lng: 2.2945 })
    expect(out.length).toBe(1)
    expect(out[0].text).toBe('Eiffel Tower, Paris, France')
    expect(out[0].placeType).toBe('poi')
  })

  test('reverse returns empty when server reports an error', async () => {
    mockFetch(() => ({ error: 'Unable to geocode' }))
    const out = await new NominatimGeocoder().reverse({ lat: 0, lng: 0 })
    expect(out).toEqual([])
  })

  test('rejects on non-ok response', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({}),
    } as Response)) as unknown as typeof fetch
    const geo = new NominatimGeocoder()
    await expect(geo.search('Lagos')).rejects.toThrow(/429/)
  })

  test('supports AbortSignal', async () => {
    globalThis.fetch = (async (_input: FetchInput, init?: FetchInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }) as typeof fetch
    const geo = new NominatimGeocoder()
    const controller = new AbortController()
    const p = geo.search('Cairo', { signal: controller.signal })
    controller.abort()
    await expect(p).rejects.toThrow(/aborted/)
  })

  test('respects custom baseUrl', async () => {
    const { calls } = mockFetch(() => [])
    const geo = new NominatimGeocoder({ baseUrl: 'https://nominatim.example.com/' })
    await geo.search('Rome')
    expect(calls[0].url.startsWith('https://nominatim.example.com/search?')).toBe(true)
  })
})
