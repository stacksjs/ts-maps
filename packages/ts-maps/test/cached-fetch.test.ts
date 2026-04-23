import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cachedFetch } from '../src/core-map/storage/cachedFetch'
import { TileCache } from '../src/core-map/storage/TileCache'

// Tests install a minimal `fetch` stub on `globalThis` per-case so cached
// and network paths can be distinguished without a real server.

describe('cachedFetch', () => {
  let originalFetch: typeof fetch | undefined
  let calls: string[] = []

  beforeEach(() => {
    originalFetch = globalThis.fetch
    calls = []
  })
  afterEach(() => {
    globalThis.fetch = originalFetch as typeof fetch
  })

  test('cache miss → fetches, writes to cache, returns fromCache=false', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    globalThis.fetch = ((url: string) => {
      calls.push(url)
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }))
    }) as unknown as typeof fetch

    const res = await cachedFetch('https://x/a.png', { cache })
    expect(res.fromCache).toBe(false)
    expect(res.data).toEqual(new Uint8Array([1, 2, 3]))
    expect(res.mime).toBe('image/png')
    expect(calls).toEqual(['https://x/a.png'])

    const cached = await cache.get('https://x/a.png')
    expect(cached?.bytes).toBe(3)
  })

  test('cache hit → short-circuits network (fromCache=true)', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    await cache.put('https://x/a.png', new Uint8Array([9, 9]), 'image/png')
    globalThis.fetch = ((url: string) => {
      calls.push(url)
      return Promise.resolve(new Response(new Uint8Array([0]), { status: 200 }))
    }) as unknown as typeof fetch

    const res = await cachedFetch('https://x/a.png', { cache })
    expect(res.fromCache).toBe(true)
    expect(res.data).toEqual(new Uint8Array([9, 9]))
    expect(calls).toEqual([])
  })

  test('offline fallback: network failure returns cached entry', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    await cache.put('https://x/a.png', new Uint8Array([7]), 'image/png')
    globalThis.fetch = ((_url: string) => {
      return Promise.reject(new Error('offline'))
    }) as unknown as typeof fetch

    const res = await cachedFetch('https://x/a.png', { cache, forceNetwork: true })
    expect(res.fromCache).toBe(true)
    expect(res.data).toEqual(new Uint8Array([7]))
  })

  test('network failure without cache rethrows', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    globalThis.fetch = ((_url: string) => Promise.reject(new Error('boom'))) as unknown as typeof fetch
    await expect(cachedFetch('https://x/nope.png', { cache })).rejects.toThrow('boom')
  })

  test('AbortSignal: pre-aborted signal throws AbortError', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    const ac = new AbortController()
    ac.abort()
    globalThis.fetch = (() => Promise.resolve(new Response(''))) as unknown as typeof fetch
    await expect(
      cachedFetch('https://x/a.png', { cache, signal: ac.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('noStore skips cache write', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    globalThis.fetch = (() =>
      Promise.resolve(new Response(new Uint8Array([5]), { status: 200 }))
    ) as unknown as typeof fetch
    await cachedFetch('https://x/a.png', { cache, noStore: true })
    expect(await cache.get('https://x/a.png')).toBeUndefined()
  })
})
