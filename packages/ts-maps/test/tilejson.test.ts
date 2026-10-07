import { describe, expect, test } from 'bun:test'
import { resolveTileJSON, styles } from '../src/core-map'

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
