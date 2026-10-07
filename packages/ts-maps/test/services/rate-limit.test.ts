import { describe, expect, test } from 'bun:test'
import { GeocoderChain } from '../../src/core-map/services/providers/Chain'
import { PhotonGeocoder } from '../../src/core-map/services/providers/Photon'
import { RateLimiter, RateLimitError, retryAfterMs } from '../../src/core-map/services/rate-limit'
import { SearchEngine } from '../../src/core-map/search/SearchEngine'
import type { GeocoderProvider, GeocodingResult } from '../../src/core-map/services/types'

const PARIS = { type: 'FeatureCollection', features: [{ geometry: { type: 'Point', coordinates: [2.35, 48.85] }, properties: { name: 'Paris', country: 'France', osm_key: 'place', osm_value: 'city' } }] }

/** A fetch that answers from a script, one response per call, and counts. */
function scripted(...answers: Array<number | [number, Record<string, string>] | object>): { fetch: typeof fetch, calls: string[] } {
  const calls: string[] = []
  const fetcher = (async (input: string) => {
    calls.push(String(input))
    const next = answers[Math.min(calls.length - 1, answers.length - 1)]
    if (typeof next === 'number')
      return new Response('', { status: next })
    if (Array.isArray(next))
      return new Response('', { status: next[0], headers: next[1] })
    return new Response(JSON.stringify(next), { headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { fetch: fetcher, calls }
}

function fixed(name: string, results: GeocodingResult[] | Error): GeocoderProvider & { asked: number } {
  const provider = {
    name,
    asked: 0,
    async search(): Promise<GeocodingResult[]> {
      provider.asked++
      if (results instanceof Error)
        throw results
      return results
    },
    async reverse(): Promise<GeocodingResult[]> {
      return provider.search()
    },
  }
  return provider
}

const result = (text: string): GeocodingResult => ({ text, center: { lat: 0, lng: 0 } })

describe('retryAfterMs', () => {
  test('reads seconds and HTTP dates', () => {
    expect(retryAfterMs(new Response('', { status: 429, headers: { 'Retry-After': '3' } }))).toBe(3000)
    const now = Date.parse('2026-10-07T12:00:00Z')
    expect(retryAfterMs(new Response('', { status: 429, headers: { 'Retry-After': 'Wed, 07 Oct 2026 12:00:10 GMT' } }), now)).toBe(10_000)
    expect(retryAfterMs(new Response('', { status: 429 }))).toBeUndefined()
  })
})

describe('RateLimiter', () => {
  test('retries a short 429 once and gets the answer', async () => {
    const { fetch, calls } = scripted([429, { 'Retry-After': '0' }], PARIS)
    const limiter = new RateLimiter('photon')
    const res = await limiter.fetch('https://photon.test/api', {}, fetch)
    expect(res.status).toBe(200)
    expect(calls.length).toBe(2)
    expect(limiter.limited).toBe(false)
  })

  test('a long Retry-After is not waited out: it backs off, asking nothing', async () => {
    const { fetch, calls } = scripted([429, { 'Retry-After': '120' }])
    const limiter = new RateLimiter('photon')
    const err = await limiter.fetch('https://photon.test/api', {}, fetch).catch(e => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as RateLimitError).retryAfter).toBeGreaterThanOrEqual(119_000)
    expect(limiter.limited).toBe(true)
    await expect(limiter.fetch('https://photon.test/api', {}, fetch)).rejects.toBeInstanceOf(RateLimitError)
    expect(calls.length).toBe(1)
  })

  test('backs off longer for each limit in a row, and forgets after a success', async () => {
    const limiter = new RateLimiter('photon', { retries: 0, cooldown: 1000 })
    const { fetch } = scripted(429)
    await limiter.fetch('u', {}, fetch).catch(() => {})
    const first = limiter.until - Date.now()
    limiter.until = 0
    await limiter.fetch('u', {}, fetch).catch(() => {})
    const second = limiter.until - Date.now()
    expect(first).toBeLessThanOrEqual(1000)
    expect(second).toBeGreaterThan(1500)
    limiter.until = 0
    await limiter.fetch('u', {}, scripted(PARIS).fetch)
    await limiter.fetch('u', {}, fetch).catch(() => {})
    expect(limiter.until - Date.now()).toBeLessThanOrEqual(1000)
  })

  test('an abort during the wait is an abort, not a rate limit', async () => {
    const { fetch } = scripted([429, { 'Retry-After': '1' }], PARIS)
    const controller = new AbortController()
    const pending = new RateLimiter('photon').fetch('u', { signal: controller.signal }, fetch)
    controller.abort()
    const err = await pending.catch(e => e)
    expect((err as Error).name).toBe('AbortError')
  })
})

describe('PhotonGeocoder on a 429', () => {
  test('retries a short limit, then answers', async () => {
    const { fetch } = scripted([429, { 'Retry-After': '0' }], PARIS)
    const photon = new PhotonGeocoder({ baseUrl: 'https://photon.test', fetch })
    const results = await photon.search('paris')
    expect(results[0]?.text).toContain('Paris')
  })

  test('search falls back to what the map knows, silently', async () => {
    const { fetch, calls } = scripted([429, { 'Retry-After': '600' }])
    const photon = new PhotonGeocoder({ baseUrl: 'https://photon.test', fetch })
    const engine = new SearchEngine({ provider: photon, offline: null })
    expect(await engine.search('paris')).toEqual([])
    expect(photon.rateLimited).toBe(true)
    // While it backs off, typing on asks nothing.
    expect(await engine.search('paris fr')).toEqual([])
    expect(calls.length).toBe(1)
  })
})

describe('GeocoderChain', () => {
  test('asks the next provider when one fails', async () => {
    const a = fixed('a', new Error('down'))
    const b = fixed('b', [result('B')])
    expect(await new GeocoderChain([a, b]).search('x')).toEqual([result('B')])
    expect(a.asked + b.asked).toBe(2)
  })

  test('an empty answer is the answer, unless fallThroughOnEmpty', async () => {
    const a = fixed('a', [])
    const b = fixed('b', [result('B')])
    expect(await new GeocoderChain([a, b]).search('x')).toEqual([])
    expect(b.asked).toBe(0)
    expect(await new GeocoderChain([a, b], { fallThroughOnEmpty: true }).search('x')).toEqual([result('B')])
  })

  test('skips a rate-limited provider until it may be asked again', async () => {
    const a = fixed('a', new RateLimitError('a', 60_000))
    const b = fixed('b', [result('B')])
    const chain = new GeocoderChain([a, b])
    await chain.search('x')
    await chain.search('y')
    expect(a.asked).toBe(1)
    expect(b.asked).toBe(2)
  })

  test('throws the last failure when every provider fails', async () => {
    const chain = new GeocoderChain([fixed('a', new Error('one')), fixed('b', new Error('two'))])
    await expect(chain.search('x')).rejects.toThrow('two')
    expect(chain.name).toBe('chain(a,b)')
  })

  test('an abort stops the chain', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    const b = fixed('b', [result('B')])
    await expect(new GeocoderChain([fixed('a', abort), b]).search('x')).rejects.toBe(abort)
    expect(b.asked).toBe(0)
  })
})
