import { describe, expect, test } from 'bun:test'
import { CircleMarker, divIcon, marker, Polyline, styles, TsMap } from 'ts-maps'
import { basemapStyle, drawRoute, pageTheme, RASTER_FALLBACK, resolveTileJson, routeMarkerHtml, watchPageTheme } from '../src/route'
import { attachBasemap, mapOptionsFrom, mountChildren } from '../src/runtime'

/**
 * A route on a real map (very-happy-dom gives it a container), and the tile
 * resolution behind the basemap with `fetch` and storage stubbed, so the
 * fallback chain is exercised without a network.
 */

const maps = { Polyline, CircleMarker, marker, divIcon }

function mapElement(): { root: HTMLElement, el: HTMLElement } {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const el = document.createElement('div')
  el.style.width = '400px'
  el.style.height = '300px'
  root.appendChild(el)
  return { root, el }
}

const LOOP: Array<[number, number]> = [
  [32.7712, -117.2520],
  [32.7966, -117.2573],
  [32.7895, -117.2330],
  [32.7640, -117.2220],
  [32.7712, -117.2520],
]

/** A fetch that answers per URL: a TileJSON body, a status, or a hang. */
function stubFetch(answers: Record<string, { tiles?: string[], attribution?: string } | number | 'hang'>): { fetch: typeof fetch, asked: string[] } {
  const asked: string[] = []
  const fn = (async (input: any, init?: any) => {
    const url = String(input)
    asked.push(url)
    const answer = answers[url]
    if (answer === 'hang') {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    if (answer === undefined)
      throw new Error('offline')
    if (typeof answer === 'number')
      return new Response('nope', { status: answer })
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  return { fetch: fn, asked }
}

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size },
  } as Storage
}

describe('resolveTileJson', () => {
  test('takes the first source that answers', async () => {
    const { fetch, asked } = stubFetch({
      'https://own.example/tiles.json': { tiles: ['https://own.example/2026-10-01/{z}/{x}/{y}.pbf'], attribution: 'Own' },
      'https://backup.example/planet': { tiles: ['https://backup.example/{z}/{x}/{y}.pbf'] },
    })
    const found = await resolveTileJson(['https://own.example/tiles.json', 'https://backup.example/planet'], { fetch, storage: null })
    expect(found).toEqual({ tiles: 'https://own.example/2026-10-01/{z}/{x}/{y}.pbf', source: 'https://own.example/tiles.json', attribution: 'Own' })
    expect(asked).toEqual(['https://own.example/tiles.json'])
  })

  test('falls through an error, a bad status and a hang to the next source', async () => {
    const { fetch, asked } = stubFetch({
      'https://a.example/tiles.json': 503,
      'https://b.example/tiles.json': 'hang',
      'https://c.example/tiles.json': { tiles: ['https://c.example/{z}/{x}/{y}.pbf'] },
    })
    const found = await resolveTileJson('https://offline.example/tiles.json, https://a.example/tiles.json,https://b.example/tiles.json,https://c.example/tiles.json', { fetch, storage: null, timeoutMs: 20 })
    expect(found?.tiles).toBe('https://c.example/{z}/{x}/{y}.pbf')
    expect(asked.length).toBe(4)
  })

  test('is null when nothing answers, so the caller draws its raster fallback', async () => {
    const { fetch } = stubFetch({ 'https://a.example/tiles.json': { tiles: [] } })
    expect(await resolveTileJson(['https://a.example/tiles.json'], { fetch, storage: null })).toBeNull()
    expect(await resolveTileJson([], { fetch, storage: null })).toBeNull()
  })

  test('asks once per session, per list of sources', async () => {
    const storage = memoryStorage()
    const { fetch, asked } = stubFetch({ 'https://a.example/tiles.json': { tiles: ['https://a.example/{z}/{x}/{y}.pbf'] } })
    await resolveTileJson(['https://a.example/tiles.json'], { fetch, storage })
    const again = await resolveTileJson(['https://a.example/tiles.json'], { fetch, storage })
    expect(again?.tiles).toBe('https://a.example/{z}/{x}/{y}.pbf')
    expect(asked.length).toBe(1)
    // A different list is a different question.
    await resolveTileJson(['https://other.example/tiles.json', 'https://a.example/tiles.json'], { fetch, storage })
    expect(asked.length).toBe(3)
  })
})

describe('basemapStyle', () => {
  test('vector tiles in the asked theme, with the palette applied', () => {
    const spec: any = basemapStyle(styles, { theme: 'dark', tiles: 'https://t.example/{z}/{x}/{y}.pbf', palette: { dark: { water: '#010203' } } })
    expect(spec.sources.basemap.type).toBe('vector')
    expect(JSON.stringify(spec)).toContain('#010203')
  })

  test('raster fallback when there are no vector tiles', () => {
    const spec: any = basemapStyle(styles, { theme: 'light', tiles: null })
    expect(spec.sources.basemap.type).toBe('raster')
    expect(JSON.stringify(spec.sources.basemap.tiles)).toContain('voyager')
    const own: any = basemapStyle(styles, { theme: 'dark', tiles: null, rasterFallback: { dark: 'https://r.example/{z}/{x}/{y}.png' } })
    expect(JSON.stringify(own.sources.basemap.tiles)).toContain('r.example')
    expect(RASTER_FALLBACK.dark).toContain('dark_all')
  })
})

describe('pageTheme', () => {
  test('reads a dark class on <html> and follows it', async () => {
    const root = document.documentElement
    root.classList.remove('dark')
    expect(pageTheme()).toBe('light')
    const seen: string[] = []
    const stop = watchPageTheme(theme => seen.push(theme))
    root.classList.add('dark')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(pageTheme()).toBe('dark')
    root.classList.remove('dark')
    await new Promise(resolve => setTimeout(resolve, 0))
    stop()
    expect(seen).toEqual(['dark', 'light'])
  })
})

describe('drawRoute', () => {
  test('draws casing, line, markers, finish and start, and removes them all', () => {
    const { root, el } = mapElement()
    const map = new TsMap(el, { center: [32.78, -117.24], zoom: 12 })
    const route = drawRoute(maps, map, LOOP, { markers: [{ lat: 32.79, lng: -117.25, label: '5' }], fit: false })
    expect(el.querySelectorAll('.ts-map-route-marker').length).toBe(1)
    expect(el.querySelector('.ts-map-route-marker')?.textContent).toBe('5')

    route.setCursor([32.78, -117.24])
    route.setCursor([32.77, -117.23])
    route.setCursor(null)

    route.remove()
    expect(el.querySelectorAll('.ts-map-route-marker').length).toBe(0)
    map.remove()
    root.remove()
  })

  test('frames the route', () => {
    const { root, el } = mapElement()
    const map = new TsMap(el, { center: [0, 0], zoom: 2 })
    const route = drawRoute(maps, map, LOOP)
    const centre = map.getCenter()
    expect(centre.lat).toBeGreaterThan(32.7)
    expect(centre.lat).toBeLessThan(32.82)
    expect(centre.lng).toBeGreaterThan(-117.27)
    expect(centre.lng).toBeLessThan(-117.21)
    expect(route.showingFit()).toBe(true)
    map.setView([10, 10], 5)
    expect(route.showingFit()).toBe(false)
    map.remove()
    root.remove()
  })

  test('replaces the route in place, and ignores points that are not coordinates', () => {
    const { root, el } = mapElement()
    const map = new TsMap(el, { center: [0, 0], zoom: 2 })
    const route = drawRoute(maps, map, [], { fit: false })
    route.setRoute([[32.77, -117.25], [Number.NaN, 1] as any, [32.79, -117.25]], [{ lat: 32.78, lng: -117.25, label: '1' }])
    expect(el.querySelectorAll('.ts-map-route-marker').length).toBe(1)
    route.setTheme('dark')
    expect(el.querySelectorAll('.ts-map-route-marker').length).toBe(1)
    route.remove()
    map.remove()
    root.remove()
  })

  test('escapes a marker label', () => {
    expect(routeMarkerHtml('<b>5</b>')).not.toContain('<b>')
  })
})

describe('route child', () => {
  test('is built from markup and handed to the page', () => {
    const { root, el } = mapElement()
    const map = new TsMap(el, { center: [0, 0], zoom: 2 })
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="route" data-coords='${JSON.stringify(LOOP)}' data-options='${JSON.stringify({ theme: 'light', markers: [{ lat: 32.79, lng: -117.25, label: '2' }] })}'></span>`)
    let handed: any = null
    root.addEventListener('route:ready', (e: any) => {
      handed = e.detail.route
    })
    const unmount = mountChildren(map, root)
    expect(handed).not.toBeNull()
    expect(typeof handed.setCursor).toBe('function')
    expect(el.querySelectorAll('.ts-map-route-marker').length).toBe(1)
    unmount()
    expect(el.querySelectorAll('.ts-map-route-marker').length).toBe(0)
    map.remove()
    root.remove()
  })
})

describe('attachBasemap', () => {
  test('holds the style until the TileJSON answers, then draws its tiles', async () => {
    const props = { basemap: 'light' as const, tilejson: ['https://a.example/tiles.json'] }
    expect(mapOptionsFrom(props).style).toBeUndefined()
    const styled: any[] = []
    const map: any = { setStyle: (spec: any) => styled.push(spec), setTheme: () => {} }
    const { fetch } = stubFetch({ 'https://a.example/tiles.json': { tiles: ['https://a.example/{z}/{x}/{y}.pbf'] } })
    const detach = attachBasemap(map, props, { fetch, storage: null })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(styled.length).toBe(1)
    expect(styled[0].sources.basemap.type).toBe('vector')
    detach()
  })

  test('falls back to raster when no source answers', async () => {
    const styled: any[] = []
    const map: any = { setStyle: (spec: any) => styled.push(spec) }
    const { fetch } = stubFetch({})
    attachBasemap(map, { basemap: 'dark', tilejson: 'https://offline.example/tiles.json' }, { fetch, storage: null })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(styled[0].sources.basemap.type).toBe('raster')
  })

  test('follows the page between light and dark on `basemap="auto"`', async () => {
    document.documentElement.classList.remove('dark')
    const styled: any[] = []
    const themes: string[] = []
    const map: any = { setStyle: (spec: any) => styled.push(spec), setTheme: (t: string) => themes.push(t) }
    const detach = attachBasemap(map, { basemap: 'auto', tiles: 'https://t.example/{z}/{x}/{y}.pbf' })
    document.documentElement.classList.add('dark')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(themes).toEqual(['dark'])
    expect(styled.length).toBe(1)
    detach()
    document.documentElement.classList.remove('dark')
  })

  test('does nothing for a map with a fixed basemap and tiles', () => {
    const map: any = { setStyle: () => { throw new Error('should not restyle') } }
    attachBasemap(map, { basemap: 'light', tiles: 'https://t.example/{z}/{x}/{y}.pbf' })()
  })
})
