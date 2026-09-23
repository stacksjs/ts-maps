import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { GazetteerGeocoder } from '../../src/core-map/services'
import { buildGazetteer, createGazetteerHandler, Gazetteer, parseGazetteerQuery } from '../../src/gazetteer'
import { sources } from './fixture'

let handle: (request: Request) => Promise<Response | undefined>

beforeAll(() => {
  const db = new Database(':memory:')
  buildGazetteer(db, sources)
  handle = createGazetteerHandler(new Gazetteer(db), { basePath: '/api/geo/', headers: { 'Cache-Control': 'public, max-age=3600' } })
})

const get = (path: string, method = 'GET') => handle(new Request(`http://app.test${path}`, { method }))

describe('createGazetteerHandler', () => {
  test('answers search with ranked results and the configured headers', async () => {
    const res = (await get('/api/geo/search?q=Portland&lat=42.36&lng=-71.06&limit=2'))!
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    const { results } = await res.json() as { results: { text: string }[] }
    expect(results.map(r => r.text)).toEqual(['Portland, Maine, United States', 'Portland, Oregon, United States'])
  })

  test('answers reverse, and asks for coordinates it did not get', async () => {
    const res = (await get('/api/geo/reverse?lat=48.14&lng=11.58'))!
    expect((await res.json() as { results: { text: string }[] }).results[0].text).toBe('München, Bavaria, Germany')
    const missing = (await get('/api/geo/reverse?lat=48.14'))!
    expect(missing.status).toBe(422)
  })

  test('leaves other paths to the caller and refuses writes', async () => {
    expect(await get('/api/trails')).toBeUndefined()
    expect(await get('/api/geo/search/extra?q=x')).toBeUndefined()
    expect((await get('/api/geo/search?q=x', 'POST'))!.status).toBe(405)
  })
})

describe('parseGazetteerQuery', () => {
  const parse = (qs: string) => {
    const params = new URLSearchParams(qs)
    return parseGazetteerQuery(key => params.get(key))
  }

  test('keeps usable values and drops the rest', () => {
    expect(parse('q=San%20Diego&limit=3&lat=32.7&lng=-117.1&countries=us,,xyz,MX&bbox=-120,30,-110,35')).toEqual({
      query: 'San Diego',
      options: { limit: 3, proximity: { lat: 32.7, lng: -117.1 }, countries: ['US', 'MX'], bbox: [-120, 30, -110, 35] },
    })
    expect(parse('q=x&lat=abc&lng=1&bbox=1,2,3')).toEqual({ query: 'x', options: {} })
    expect(parse('lat=95&lng=0').options.proximity).toBeUndefined()
    expect(parse(`q=${'a'.repeat(500)}`).query).toHaveLength(200)
  })
})

describe('GazetteerGeocoder against the handler', () => {
  const originalFetch = globalThis.fetch
  const requested: string[] = []
  afterEach(() => {
    globalThis.fetch = originalFetch
    requested.length = 0
  })

  function route() {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      requested.push(url)
      return (await handle(new Request(url, init))) ?? new Response('not found', { status: 404, statusText: 'Not Found' })
    }) as typeof fetch
  }

  test('search sends the options the handler reads', async () => {
    route()
    const geocoder = new GazetteerGeocoder({ baseUrl: 'http://app.test/api/geo/' })
    const results = await geocoder.search(' Paris ', { limit: 1, countries: ['US'], proximity: { lat: 33, lng: -95 } })
    expect(results.map(r => r.text)).toEqual(['Paris, Texas, United States'])
    expect(requested[0]).toBe('http://app.test/api/geo/search?q=Paris&limit=1&lat=33&lng=-95&countries=US')
  })

  test('reverse, an empty query without a request, and a failing server', async () => {
    route()
    const geocoder = new GazetteerGeocoder({ baseUrl: 'http://app.test/api/geo' })
    expect((await geocoder.reverse({ lat: 32.72, lng: -117.16 }))[0].text).toBe('San Diego, California, United States')
    expect(await geocoder.search('   ')).toEqual([])
    expect(requested).toHaveLength(1)

    const broken = new GazetteerGeocoder({ baseUrl: 'http://app.test/nowhere' })
    await expect(broken.search('Paris')).rejects.toThrow(/Gazetteer search request failed: 404/)
    expect(() => new GazetteerGeocoder({ baseUrl: '' })).toThrow(/baseUrl/)
  })
})
