import { describe, expect, test } from 'bun:test'
import { resolveTileJSON, styles, TsMap } from '../src/core-map'
import { validateStyle } from '../src/core-map/style-spec/validate'
import { resolveStyleSources, tileJSONSources } from '../src/core-map/styles/tilejson'

type Answer = Record<string, unknown> | number | 'hang' | 'throw'

function stubFetch(answers: Record<string, Answer>): { fetch: typeof fetch, asked: string[] } {
  const asked: string[] = []
  const fetcher = (async (input: string, init?: RequestInit) => {
    const url = String(input)
    asked.push(url)
    const answer = answers[url] ?? 'throw'
    if (answer === 'throw')
      throw new TypeError('network')
    if (answer === 'hang') {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }
    if (typeof answer === 'number')
      return new Response('', { status: answer })
    return new Response(JSON.stringify(answer), { headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  return { fetch: fetcher, asked }
}

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>()
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const WILDLOOP = {
  tilejson: '3.0.0',
  tiles: ['https://tiles.wildloop.org/planet/20261006/{z}/{x}/{y}.pbf'],
  minzoom: 0,
  maxzoom: 14,
  bounds: [-180, -85.0511287, 180, 85.0511287],
  attribution: '© OpenMapTiles © OpenStreetMap contributors',
}

describe('resolveTileJSON', () => {
  test('reads the tiles, zooms, bounds and credit of the first source that answers', async () => {
    const { fetch, asked } = stubFetch({
      'https://tiles.wildloop.org/tiles.json': WILDLOOP,
      'https://tiles.openfreemap.org/planet': { tiles: ['https://tiles.openfreemap.org/planet/x/{z}/{x}/{y}.pbf'] },
    })
    const found = await resolveTileJSON(['https://tiles.wildloop.org/tiles.json', 'https://tiles.openfreemap.org/planet'], { fetch, storage: null })
    expect(found).toEqual({
      tiles: 'https://tiles.wildloop.org/planet/20261006/{z}/{x}/{y}.pbf',
      source: 'https://tiles.wildloop.org/tiles.json',
      attribution: '© OpenMapTiles © OpenStreetMap contributors',
      minzoom: 0,
      maxzoom: 14,
      bounds: [-180, -85.0511287, 180, 85.0511287],
    })
    expect(asked).toEqual(['https://tiles.wildloop.org/tiles.json'])
  })

  test('falls through a network error, a bad status and a hang', async () => {
    const { fetch, asked } = stubFetch({
      'https://a.example/tiles.json': 503,
      'https://b.example/tiles.json': 'hang',
      'https://c.example/tiles.json': { tiles: ['https://c.example/{z}/{x}/{y}.pbf'] },
    })
    const found = await resolveTileJSON('https://down.example/tiles.json, https://a.example/tiles.json,https://b.example/tiles.json,https://c.example/tiles.json', { fetch, storage: null, timeoutMs: 20 })
    expect(found?.tiles).toBe('https://c.example/{z}/{x}/{y}.pbf')
    expect(asked.length).toBe(4)
  })

  test('is null when nothing answers with tiles', async () => {
    const { fetch } = stubFetch({ 'https://a.example/tiles.json': { tiles: [] } })
    expect(await resolveTileJSON(['https://a.example/tiles.json'], { fetch, storage: null })).toBeNull()
    expect(await resolveTileJSON([], { fetch, storage: null })).toBeNull()
  })

  test('asks once per session, per list of sources', async () => {
    const storage = memoryStorage()
    const { fetch, asked } = stubFetch({ 'https://a.example/tiles.json': { tiles: ['https://a.example/{z}/{x}/{y}.pbf'] } })
    await resolveTileJSON(['https://a.example/tiles.json'], { fetch, storage })
    expect((await resolveTileJSON(['https://a.example/tiles.json'], { fetch, storage }))?.tiles).toBe('https://a.example/{z}/{x}/{y}.pbf')
    expect(asked.length).toBe(1)
    await resolveTileJSON(['https://a.example/tiles.json'], { fetch, storage, cacheKey: false })
    expect(asked.length).toBe(2)
  })
})

describe('basemap style options', () => {
  const TILES = 'https://example.test/{z}/{x}/{y}.pbf'

  test('fonts replace each label face', () => {
    const style = styles.light({ tiles: TILES, fonts: { regular: ['Geist Medium'], semibold: ['Geist Semibold'] } })
    const font = (id: string): unknown => (style.layers.find(l => l.id === id)?.layout as Record<string, unknown>)['text-font']
    expect(font('road-label')).toEqual(['Geist Medium'])
    expect(font('poi')).toEqual(['Geist Medium'])
    expect(font('place-label')).toEqual(['Geist Semibold'])
    // A face left out keeps the style's own.
    expect(font('water-label')).toEqual(['Italic'])
  })

  test('offlineCache reaches the source, vector and raster', () => {
    expect(styles.dark({ tiles: TILES, offlineCache: true }).sources.basemap).toMatchObject({ offlineCache: true })
    expect(styles.dark({ tiles: TILES, mode: 'raster', offlineCache: true }).sources.basemap).toMatchObject({ offlineCache: true })
    expect('offlineCache' in styles.dark({ tiles: TILES }).sources.basemap!).toBe(false)
  })
})

describe('TileJSON sources in a style', () => {
  const TILEJSON = { tiles: ['https://tiles.test/planet/20261006/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, attribution: '© OpenMapTiles' }

  test('resolveStyleSources fills in the tiles, keeping what the source says itself', async () => {
    const { fetch: fetcher, asked } = stubFetch({ 'https://tiles.test/planet': TILEJSON, 'https://dem.test/tiles.json': { tiles: ['./dem/{z}/{x}/{y}.png'], encoding: 'terrarium' } })
    const style = {
      version: 8,
      sources: {
        basemap: { type: 'vector', url: 'https://tiles.test/planet', maxzoom: 12 },
        dem: { type: 'raster-dem', url: 'https://dem.test/tiles.json' },
        archive: { type: 'vector', url: 'pmtiles://https://x.test/a.pmtiles' },
        local: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      },
      layers: [],
    }
    expect(tileJSONSources(style)).toEqual(['basemap', 'dem'])
    const resolved = await resolveStyleSources(style, url => fetcher(url))
    expect(resolved.sources.basemap as unknown).toEqual({ type: 'vector', url: 'https://tiles.test/planet', tiles: TILEJSON.tiles, minzoom: 0, maxzoom: 12, attribution: '© OpenMapTiles' })
    // Relative to the TileJSON, and its encoding carried over.
    expect((resolved.sources.dem as any).tiles).toEqual(['https://dem.test/dem/{z}/{x}/{y}.png'])
    expect((resolved.sources.dem as any).encoding).toBe('terrarium')
    expect(resolved.sources.archive).toBe(style.sources.archive)
    expect(asked.sort()).toEqual(['https://dem.test/tiles.json', 'https://tiles.test/planet'])
  })

  test('a TileJSON that cannot be read says which source', async () => {
    const { fetch: fetcher } = stubFetch({ 'https://tiles.test/planet': 503 })
    await expect(resolveStyleSources({ sources: { basemap: { type: 'vector', url: 'https://tiles.test/planet' } } }, url => fetcher(url))).rejects.toThrow('source "basemap"')
  })

  test('the basemap styles take a TileJSON url instead of tiles', () => {
    const style = styles.light({ url: 'https://tiles.test/planet' })
    expect(style.sources.basemap).toEqual({ type: 'vector', url: 'https://tiles.test/planet' })
    expect(validateStyle(style)).toEqual([])
    expect(() => styles.light({})).toThrow('`tiles` or `url`')
  })

  test('setStyle reads the TileJSON, then sets the style', async () => {
    const real = globalThis.fetch
    const { fetch: fetcher } = stubFetch({ 'https://tiles.test/planet': TILEJSON })
    globalThis.fetch = fetcher
    try {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const map = new TsMap(container, { center: [0, 0], zoom: 2 })
      const set = new Promise(resolve => map.once('styledata', resolve))
      map.setStyle(styles.light({ url: 'https://tiles.test/planet' }))
      await set
      expect((map.getStyle()!.sources.basemap as any).tiles).toEqual(TILEJSON.tiles)
      container.remove()
    }
    finally {
      globalThis.fetch = real
    }
  })
})
