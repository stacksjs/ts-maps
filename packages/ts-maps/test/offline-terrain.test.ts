import { afterEach, describe, expect, test } from 'bun:test'
import { MemoryOfflineStore, OfflineMaps, planArea, setOfflineMaps } from '../src/core-map/offline'
import { latToUnit, lngToUnit } from '../src/core-map/offline/plan'
import { TsMap } from '../src/core-map/map/index'

// Yosemite Valley: terrain is the point of the place.
const BOUNDS: [number, number, number, number] = [-119.60, 37.72, -119.55, 37.75]
const DEM = 'https://dem.test/{z}/{x}/{y}.png'

function terrainMap(source: Record<string, unknown> = {}): TsMap {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const map = new TsMap(el, { center: [37.74, -119.58], zoom: 12 })
  map.setStyle({ version: 8, sources: { dem: { type: 'raster-dem', tiles: [DEM], maxzoom: 14, ...source } as any }, layers: [] })
  map.setTerrain({ source: 'dem' })
  return map
}

const demZooms = (urls: string[]): number[] => [...new Set(urls.filter(u => u.startsWith('https://dem.test')).map(u => Number(u.split('/')[3])))].sort((a, b) => a - b)

afterEach(() => {
  setOfflineMaps(null)
  document.body.replaceChildren()
})

describe('terrain in an offline area', () => {
  test('is planned when terrain is on, on the vector tiles\' grid, capped', () => {
    const map = terrainMap()
    const planned = planArea({ bounds: BOUNDS, minZoom: 10, maxZoom: 16, map })
    const plan = planned.build()
    // Map zooms 10-16 are DEM grid zooms 9-15; the DEM stops at 14, the
    // default cap at 12.
    expect(demZooms(plan.urls)).toEqual([9, 10, 11, 12])
    expect(planned.kinds.terrain).toBe(plan.terrain!.length)
    expect(planned.count).toBe(plan.urls.length)
    expect(demZooms(planArea({ bounds: BOUNDS, minZoom: 10, maxZoom: 16, map, terrainMaxZoom: 14 }).build().urls)).toEqual([9, 10, 11, 12, 13, 14])
  })

  test('is not planned when terrain is off', () => {
    const map = terrainMap()
    map.setTerrain(null)
    expect(planArea({ bounds: BOUNDS, minZoom: 10, maxZoom: 14, map }).kinds.terrain).toBe(0)
  })

  test('counts in the estimate at a DEM tile\'s size, not a vector tile\'s', () => {
    const map = terrainMap()
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: async () => new Response('') })
    const area = { bounds: BOUNDS, minZoom: 10, maxZoom: 14, map }
    const planned = maps.plan(area)
    expect(maps.quickEstimate(area).bytes).toBe(planned.kinds.terrain * 100_000 + (planned.count - planned.kinds.terrain) * 32_000)
  })

  test('downloads, and is read back with no network', async () => {
    const map = terrainMap()
    const requests: string[] = []
    const maps = new OfflineMaps({
      store: new MemoryOfflineStore(),
      fetch: async (url: string) => {
        requests.push(url)
        return new Response(new Uint8Array([137, 80, 78, 71]) as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })
      },
    })
    const region = await maps.download({ bounds: BOUNDS, minZoom: 12, maxZoom: 13, map })
    expect(region.status).toBe('complete')
    expect(demZooms(requests)).toEqual([11, 12])
    const z = 12
    const x = Math.floor(lngToUnit(-119.58) * 2 ** z)
    const y = Math.floor(latToUnit(37.74) * 2 ** z)
    expect((await maps.lookup(`https://dem.test/${z}/${x}/${y}.png`))?.mime).toBe('image/png')
  })
})

describe('terrain past the DEM\'s top zoom', () => {
  test('asks for the nearest ancestor and draws its part, unsmoothed', async () => {
    const map = terrainMap({ maxzoom: 12 })
    const asked: string[] = []
    const drawn: number[][] = []
    const realFetch = globalThis.fetch
    const realImage = (globalThis as any).Image
    const realCreate = document.createElement.bind(document)
    globalThis.fetch = (async (url: string) => {
      asked.push(String(url))
      return new Response(new Uint8Array([137, 80, 78, 71]) as unknown as BodyInit, { headers: { 'content-type': 'image/png' } })
    }) as unknown as typeof fetch
    ;(globalThis as any).Image = class {
      width = 256
      height = 256
      onload: (() => void) | null = null
      set src(_: string) { queueMicrotask(() => this.onload?.()) }
    }
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (...args: any[]) => { drawn.push(args.slice(1).map(Number)); expect(ctx.imageSmoothingEnabled).toBe(false) },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    }
    ;(document as any).createElement = (tag: string) => tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx } : realCreate(tag)
    const loaded = new Promise(resolve => map.once('terrainload', resolve))
    try {
      // Grid zoom 14, two below the DEM's top: tile (5, 6) of the 4x4 under (1, 1).
      map._maybeFetchTerrainTile({ z: 14, x: 4 * 1 + 1, y: 4 * 1 + 2 })
      await loaded
    }
    finally {
      globalThis.fetch = realFetch
      ;(globalThis as any).Image = realImage
      ;(document as any).createElement = realCreate
    }
    expect(asked).toEqual(['https://dem.test/12/1/1.png'])
    // The (1, 2) square of a 4x4 grid over the 256px ancestor.
    expect(drawn).toEqual([[64, 128, 64, 64, 0, 0, 256, 256]])
    expect(map.getTerrainSource()!.hasTile({ z: 14, x: 5, y: 6 })).toBe(true)
  })
})
