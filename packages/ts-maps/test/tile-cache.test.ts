import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { TileCache } from '../src/core-map/storage/TileCache'

// NB: very-happy-dom does not provide `indexedDB`, so these tests exercise
// the in-memory backend. The IndexedDB path is covered by integration — it
// shares the same `Backend` shape, and the `Promise`-oriented public API
// behaves identically regardless of which backend is selected.

describe('TileCache', () => {
  let originalIDB: unknown
  beforeEach(() => {
    originalIDB = (globalThis as any).indexedDB
    // Ensure the fallback path is exercised.
    ;(globalThis as any).indexedDB = undefined
  })
  afterEach(() => {
    ;(globalThis as any).indexedDB = originalIDB
  })

  test('put / get / delete round-trip', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    await cache.put('a', new Uint8Array([1, 2, 3]), 'image/png')
    const got = await cache.get('a')
    expect(got?.data).toEqual(new Uint8Array([1, 2, 3]))
    expect(got?.mime).toBe('image/png')
    await cache.delete('a')
    expect(await cache.get('a')).toBeUndefined()
  })

  test('clear wipes all entries', async () => {
    const cache = new TileCache({ ttlMs: 0 })
    await cache.put('a', new Uint8Array([1]), 'x')
    await cache.put('b', new Uint8Array([2, 2]), 'x')
    const before = await cache.size()
    expect(before.entries).toBe(2)
    expect(before.bytes).toBe(3)
    await cache.clear()
    const after = await cache.size()
    expect(after).toEqual({ entries: 0, bytes: 0 })
  })

  test('prune enforces maxEntries (LRU)', async () => {
    const cache = new TileCache({ ttlMs: 0, maxEntries: 2, maxBytes: 1e9 })
    await cache.put('oldest', new Uint8Array([1]), 'x')
    await new Promise(r => setTimeout(r, 2))
    await cache.put('middle', new Uint8Array([2]), 'x')
    await new Promise(r => setTimeout(r, 2))
    await cache.put('newest', new Uint8Array([3]), 'x')
    await cache.prune()
    expect(await cache.get('oldest')).toBeUndefined()
    expect(await cache.get('middle')).toBeDefined()
    expect(await cache.get('newest')).toBeDefined()
  })

  test('prune enforces maxBytes (LRU)', async () => {
    const cache = new TileCache({ ttlMs: 0, maxBytes: 5, maxEntries: 1e6 })
    await cache.put('a', new Uint8Array(4), 'x')
    await new Promise(r => setTimeout(r, 2))
    await cache.put('b', new Uint8Array(4), 'x')
    await cache.prune()
    // 8 bytes total; cap is 5 → oldest drops.
    expect(await cache.get('a')).toBeUndefined()
    expect(await cache.get('b')).toBeDefined()
    const { bytes } = await cache.size()
    expect(bytes).toBe(4)
  })

  test('ttl-expired entries are pruned and hidden from get()', async () => {
    const cache = new TileCache({ ttlMs: 10 })
    await cache.put('a', new Uint8Array([1]), 'x')
    await new Promise(r => setTimeout(r, 20))
    // get() alone drops the expired entry.
    expect(await cache.get('a')).toBeUndefined()
    await cache.put('b', new Uint8Array([2]), 'x')
    await new Promise(r => setTimeout(r, 20))
    await cache.prune()
    expect(await cache.get('b')).toBeUndefined()
  })

  test('in-memory fallback works when indexedDB is absent', async () => {
    expect((globalThis as any).indexedDB).toBeUndefined()
    const cache = new TileCache({ ttlMs: 0 })
    await cache.put('k', new Uint8Array([9, 9]), 'x')
    const got = await cache.get('k')
    expect(got?.bytes).toBe(2)
  })
})
