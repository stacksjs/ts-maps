import { afterEach, describe, expect, test } from 'bun:test'
import { getDefaultCache, resetDefaultCache, TileCache } from '../src/core-map/storage/index'
import { TsMap } from '../src/core-map/map/index'

describe('TileCache.close', () => {
  test('is safe to call on a fresh cache', async () => {
    const c = new TileCache()
    await c.close()
  })

  test('resets the backend — subsequent calls build a fresh one', async () => {
    const c = new TileCache()
    await c.put('k', new Uint8Array([1]), 'x')
    expect(await c.get('k')).toBeDefined()
    await c.close()
    // After close, the cache is usable again via lazy re-init.
    await c.put('k2', new Uint8Array([2]), 'x')
    expect(await c.get('k2')).toBeDefined()
  })

  test('invokes backend.close() when provided', async () => {
    let closed = 0
    const store = new Map<string, any>()
    const c = new TileCache({
      backend: {
        get: async k => store.get(k),
        put: async tile => void store.set(tile.key, tile),
        delete: async k => void store.delete(k),
        clear: async () => store.clear(),
        all: async () => [...store.values()],
        close: () => { closed++ },
      },
    })
    await c.put('k', new Uint8Array([1]), 'x')
    await c.close()
    expect(closed).toBe(1)
  })
})

describe('resetDefaultCache', () => {
  afterEach(async () => { await resetDefaultCache() })

  test('drops the singleton so getDefaultCache() rebuilds', async () => {
    const a = getDefaultCache()
    await resetDefaultCache()
    const b = getDefaultCache()
    expect(a).not.toBe(b)
  })

  test('is idempotent — calling twice is safe', async () => {
    await resetDefaultCache()
    await resetDefaultCache()
    // No throw.
  })
})

describe('Map.remove cleanup', () => {
  test('removes the terrain overlay + atmosphere overlay from the container', () => {
    const container = document.createElement('div')
    container.style.width = '300px'
    container.style.height = '200px'
    document.body.appendChild(container)

    const map = new TsMap(container, { center: [0, 0], zoom: 3, pitch: 40 })
    map.setSky({ 'sky-color': '#2563eb' })
    map.setTerrain({ source: 'dem' })

    // Both overlays are attached inside the container.
    let sawAtmos = false
    let sawTerrain = false
    for (let i = 0; i < container.children.length; i++) {
      const c = (container.children[i] as HTMLElement).className ?? ''
      if (c.includes('ts-maps-atmosphere'))
        sawAtmos = true
      if (c.includes('ts-maps-terrain-overlay'))
        sawTerrain = true
    }
    expect(sawAtmos || sawTerrain).toBe(true)

    map.remove()

    // After remove, both should be gone.
    for (let i = 0; i < container.children.length; i++) {
      const c = (container.children[i] as HTMLElement).className ?? ''
      expect(c.includes('ts-maps-atmosphere')).toBe(false)
      expect(c.includes('ts-maps-terrain-overlay')).toBe(false)
    }
    container.remove()
  })
})
