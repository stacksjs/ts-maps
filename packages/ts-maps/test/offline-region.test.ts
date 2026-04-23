import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { computeTileCoords, saveOfflineRegion } from '../src/core-map/storage/offlineRegion'
import { TileCache } from '../src/core-map/storage/TileCache'

describe('offline region', () => {
  let originalFetch: typeof fetch | undefined

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch as typeof fetch
  })

  test('computeTileCoords covers the bbox × zoom range', () => {
    // Tiny bbox around 0/0; at z=0 there's exactly one tile (0,0,0); at z=1
    // there are four covering quadrants but our tiny bbox near (0,0) touches
    // at least one — assert both dimensions.
    const coords = computeTileCoords(
      { west: -0.5, south: -0.5, east: 0.5, north: 0.5 },
      [0, 1],
    )
    expect(coords.some(c => c.z === 0 && c.x === 0 && c.y === 0)).toBe(true)
    expect(coords.some(c => c.z === 1)).toBe(true)
  })

  test('saveOfflineRegion downloads every tile in the coord set', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    const urls: string[] = []
    globalThis.fetch = ((url: string) => {
      urls.push(url)
      return Promise.resolve(new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'application/x-protobuf' },
      }))
    }) as unknown as typeof fetch

    const bounds = { west: -1, south: -1, east: 1, north: 1 }
    const zoomRange: [number, number] = [0, 1]
    const expected = computeTileCoords(bounds, zoomRange).length

    const result = await saveOfflineRegion({
      bounds,
      zoomRange,
      tileUrl: 'https://tiles/{z}/{x}/{y}.pbf',
      cache,
      concurrency: 3,
    })

    expect(result.saved).toBe(expected)
    expect(result.failed).toBe(0)
    expect(urls.length).toBe(expected)
    // Cache now contains that many entries.
    const size = await cache.size()
    expect(size.entries).toBe(expected)
  })

  test('uses shared default cache on second identical save', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    let requests = 0
    globalThis.fetch = ((_url: string) => {
      requests++
      return Promise.resolve(new Response(new Uint8Array([1]), { status: 200 }))
    }) as unknown as typeof fetch

    const opts = {
      bounds: { west: -1, south: -1, east: 1, north: 1 } as const,
      zoomRange: [0, 0] as [number, number],
      tileUrl: 'https://tiles/{z}/{x}/{y}.pbf',
      cache,
    }

    const first = await saveOfflineRegion(opts)
    expect(first.saved).toBeGreaterThan(0)
    const before = requests

    const second = await saveOfflineRegion(opts)
    expect(second.skipped).toBe(first.saved)
    // Second pass hit the cache — zero new network requests.
    expect(requests).toBe(before)
  })

  test('failed requests increment failed counter but do not throw', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    globalThis.fetch = ((_url: string) => Promise.reject(new Error('500'))) as unknown as typeof fetch

    const result = await saveOfflineRegion({
      bounds: [0, 0, 1, 1],
      zoomRange: [0, 0],
      tileUrl: 'https://tiles/{z}/{x}/{y}.pbf',
      cache,
    })

    expect(result.saved).toBe(0)
    expect(result.failed).toBeGreaterThan(0)
  })

  test('fires offline:progress on the supplied emitter', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    globalThis.fetch = (() => Promise.resolve(new Response(new Uint8Array([1]), { status: 200 }))) as unknown as typeof fetch
    const events: unknown[] = []
    const emitter = {
      fire(type: string, data?: Record<string, unknown>) {
        if (type === 'offline:progress')
          events.push(data)
        return emitter
      },
    }
    await saveOfflineRegion({
      bounds: { west: -1, south: -1, east: 1, north: 1 },
      zoomRange: [0, 0],
      tileUrl: 'https://tiles/{z}/{x}/{y}.pbf',
      cache,
    }, emitter)
    expect(events.length).toBeGreaterThan(0)
  })
})
