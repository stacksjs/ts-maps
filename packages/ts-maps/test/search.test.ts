import type { GeocoderProvider, GeocodingResult } from '../src/core-map/services/types'
import { afterEach, describe, expect, test } from 'bun:test'
import { control, SEARCH_EVENTS, SearchControl, TsMap } from '../src/core-map'
import { VectorTile } from '../src/core-map/mvt'
import { MemoryOfflineStore, OfflineMaps } from '../src/core-map/offline'
import { latToUnit, lngToUnit, unitToLat, unitToLng } from '../src/core-map/offline/plan'
import { Pbf } from '../src/core-map/proto'
import {
  categoriesMatching,
  categoryForQuery,
  describePlace,
  iconForKind,
  kindLabel,
  mergeSearchResults,
  placeFromResult,
  SEARCH_CATEGORIES,
  SearchEngine,
  SearchHistory,
} from '../src/core-map/search'
import type { SearchPlace } from '../src/core-map/search'
import { encodeTile, road } from './helpers/mvt'

// Union Square, San Francisco, at the zoom the tiles carry every place.
const Z = 14
const X = Math.floor(lngToUnit(-122.4075) * 2 ** Z)
const Y = Math.floor(latToUnit(37.788) * 2 ** Z)
const at = (px: number, py: number): { lat: number, lng: number } => ({
  lat: unitToLat((Y + py / 4096) / 2 ** Z),
  lng: unitToLng((X + px / 4096) / 2 ** Z),
})
const point = (props: Record<string, string | number>, x: number, y: number) => ({ type: 1 as const, props, lines: [[[x, y] as [number, number]]] })

const TILE = encodeTile({
  poi: [
    point({ name: 'Blue Bottle Coffee', class: 'cafe', subclass: 'cafe', rank: 5 }, 2000, 2000),
    point({ name: 'Sightglass', class: 'cafe', subclass: 'cafe', rank: 8 }, 3000, 3000),
    point({ name: 'Bluestem Brasserie', class: 'restaurant', subclass: 'restaurant', rank: 3 }, 1000, 1000),
    point({ name: 'Walgreens', class: 'pharmacy', subclass: 'pharmacy', rank: 10 }, 2500, 1500),
  ],
  place: [point({ name: 'Union Square', class: 'neighbourhood', rank: 8 }, 2100, 2100)],
  transportation_name: [road({ name: 'Market Street', class: 'primary' }, [500, 2040], [3500, 2040])],
})

/** A map's tile host, as the engine reads one: decoded features and where they are. */
function fakeHost(bytes: Uint8Array) {
  const tile = new VectorTile(new Pbf(bytes))
  return {
    querySourceFeatures: ({ sourceLayer }: { sourceLayer: string }) => {
      const layer = tile.layers[sourceLayer]
      return layer ? Array.from({ length: layer.length }, (_, i) => ({ feature: layer.feature(i), tile: { x: X, y: Y, z: Z } })) : []
    },
    _subTile: (c: { x: number, y: number, z: number }) => ({ ...c, f: 1, sx: 0, sy: 0 }),
    _getZoomForUrl: (z: number) => z,
  }
}

function fakeMap(center = at(2000, 2000)) {
  return {
    _style: { sourceLayers: new Map([['basemap', fakeHost(TILE)]]) },
    getCenter: () => center,
    getZoom: () => 16,
    getBounds: () => ({ getWest: () => at(0, 0).lng, getEast: () => at(4096, 0).lng, getNorth: () => at(0, 0).lat, getSouth: () => at(0, 4096).lat }),
  }
}

function provider(results: GeocodingResult[] | Error): GeocoderProvider & { calls: string[] } {
  const calls: string[] = []
  return {
    name: 'fake',
    calls,
    search: async (q) => {
      calls.push(q)
      if (results instanceof Error)
        throw results
      return results
    },
    reverse: async () => [],
  }
}

describe('categories', () => {
  test('a query names a category by its label or a synonym', () => {
    expect(categoryForQuery('Coffee')?.id).toBe('coffee')
    expect(categoryForQuery('petrol')?.id).toBe('gas')
    expect(categoryForQuery('Blue Bottle')).toBeUndefined()
    expect(categoriesMatching('cof').map(c => c.id)).toEqual(['coffee'])
    expect(categoriesMatching('c')).toEqual([])
  })

  test('kinds read as people say them, and wear the map\'s badges', () => {
    expect(kindLabel('cafe')).toBe('Café')
    expect(kindLabel('fast_food')).toBe('Fast Food')
    expect(kindLabel('bicycle_rental')).toBe('Bicycle Rental')
    expect(iconForKind('cafe')).toBe('cafe')
    expect(iconForKind('fuel')).toBe('car')
    expect(iconForKind('nonsense')).toBe('place')
    expect(SEARCH_CATEGORIES.every(c => c.kinds.length && c.label)).toBe(true)
  })
})

describe('SearchEngine', () => {
  test('finds places on the map by name, nearest and best-matching first, with no network', async () => {
    const online = provider([])
    const engine = new SearchEngine({ map: fakeMap(), provider: online, offline: null })
    const places = await engine.suggest('blue', { online: false })
    expect(places.map(p => p.name)).toEqual(['Blue Bottle Coffee', 'Bluestem Brasserie'])
    expect(places[0]).toMatchObject({ kind: 'cafe', icon: 'cafe', source: 'map' })
    expect(places[0]!.center.lat).toBeCloseTo(at(2000, 2000).lat, 6)
    expect(places[0]!.distance).toBeLessThan(5)
    expect(online.calls).toEqual([])
  })

  test('merges the online answers in, keeping one result per place with the address', async () => {
    const bottle = at(2002, 2001)
    const engine = new SearchEngine({
      map: fakeMap(),
      offline: null,
      provider: provider([
        { text: 'Blue Bottle Coffee', center: bottle, properties: { name: 'Blue Bottle Coffee', street: 'Mint Plaza', housenumber: '66', city: 'San Francisco', osm_key: 'amenity', osm_value: 'cafe' } },
        { text: 'Blue Bottle Coffee', center: { lat: 40.7, lng: -74 }, properties: { name: 'Blue Bottle Coffee', city: 'New York', osm_key: 'amenity', osm_value: 'cafe' } },
      ]),
    })
    const heard: string[][] = []
    const places = await engine.suggest('blue bottle', { onLocal: local => heard.push(local.map(p => p.name)) })
    // The map's answer came first, on its own.
    expect(heard).toEqual([['Blue Bottle Coffee']])
    const sf = places.filter(p => p.name === 'Blue Bottle Coffee')
    expect(sf).toHaveLength(2)
    expect(sf[0]!.address).toBe('66 Mint Plaza, San Francisco')
    expect(sf[1]!.address).toBe('New York')
  })

  test('an online failure leaves what the map knows', async () => {
    const engine = new SearchEngine({ map: fakeMap(), offline: null, provider: provider(new TypeError('Failed to fetch')) })
    expect((await engine.suggest('sight')).map(p => p.name)).toEqual(['Sightglass'])
  })

  test('nearby finds a category in the area, nearest first', async () => {
    const engine = new SearchEngine({ map: fakeMap(at(3100, 3100)), offline: null, provider: null })
    const coffee = await engine.nearby(categoryForQuery('coffee')!)
    expect(coffee.map(p => p.name)).toEqual(['Sightglass', 'Blue Bottle Coffee'])
    expect(coffee[0]!.distance!).toBeLessThan(coffee[1]!.distance!)
    const pharmacies = await engine.nearby(categoryForQuery('pharmacy')!)
    expect(pharmacies.map(p => p.name)).toEqual(['Walgreens'])
  })

  test('nearby asks online when the map has too little', async () => {
    const online = provider([{ text: 'Shell, 1 Main St', center: at(1500, 1500), properties: { name: 'Shell', osm_value: 'fuel' } }])
    const engine = new SearchEngine({ map: fakeMap(), offline: null, provider: online })
    const gas = await engine.nearby(categoryForQuery('gas')!)
    expect(online.calls).toEqual(['Gas Stations'])
    expect(gas.map(p => [p.name, p.icon])).toEqual([['Shell', 'car']])
  })

  test('downloaded maps are searched too', async () => {
    const offline = new OfflineMaps({ store: new MemoryOfflineStore() })
    const place = at(100, 100)
    await offline.store.putRegion({ id: 'r', name: 'R', bounds: [-180, -85, 180, 85], minZoom: 0, maxZoom: 14, sources: [], status: 'complete', tiles: 1, downloaded: 1, bytes: 1, createdAt: 1, updatedAt: 1 })
    await offline.store.putIndex('r', { places: [{ name: 'Tartine Manufactory', lat: place.lat, lng: place.lng, kind: 'bakery', rank: 14 }], roads: [] })
    const engine = new SearchEngine({ map: fakeMap(), offline, provider: null })
    const [found] = await engine.suggest('tartine')
    expect(found).toMatchObject({ name: 'Tartine Manufactory', source: 'offline', icon: 'food' })
  })

  test('gives places from the map the street they are on', async () => {
    const engine = new SearchEngine({ map: fakeMap(), offline: null, provider: null })
    const places = engine.addStreets(await engine.suggest('blue bottle'))
    expect(places[0]!.address).toBe('Market Street')
    expect(describePlace(places[0]!, m => `${Math.round(m)} m`)).toBe('Café · 0 m · Market Street')
  })

  test('merge keeps one result for the same name close together', () => {
    const a: SearchPlace & { score: number } = { id: 'a', name: 'Café X', center: at(0, 0), kind: 'cafe', icon: 'cafe', source: 'map', rank: 1, score: 5 }
    const b = { ...a, id: 'b', center: at(10, 10), address: '1 A St', source: 'online' as const, score: 3 }
    const far = { ...a, id: 'c', center: at(4000, 4000), score: 2 }
    const merged = mergeSearchResults([b, a, far])
    expect(merged.map(p => p.id)).toEqual(['a', 'c'])
    expect(merged[0]!.address).toBe('1 A St')
  })

  test('a provider\'s result splits into name and address', () => {
    const place = placeFromResult({ text: 'Ferry Building, The Embarcadero, San Francisco, United States', center: { lat: 1, lng: 2 } }, 0)
    expect(place).toMatchObject({ name: 'Ferry Building', address: 'The Embarcadero, San Francisco', source: 'online' })
  })
})

describe('SearchHistory', () => {
  test('keeps the latest first, once each, up to its limit', () => {
    const history = new SearchHistory(`test-${Math.random()}`, 3)
    history.add({ query: 'coffee' })
    history.add({ query: 'tacos' })
    history.add({ query: 'Coffee' })
    history.add({ query: 'parks' })
    history.add({ query: 'museums' })
    expect(history.list().map(e => e.query)).toEqual(['museums', 'parks', 'Coffee'])
    history.clear()
    expect(history.list()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The control
// ---------------------------------------------------------------------------

function makeMap(): TsMap {
  const container = document.createElement('div')
  container.style.width = '430px'
  container.style.height = '800px'
  Object.defineProperty(container, 'clientWidth', { value: 430 })
  Object.defineProperty(container, 'clientHeight', { value: 800 })
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false, fadeAnimation: false })
  map.setView([at(2000, 2000).lat, at(2000, 2000).lng], 15)
  return map
}

/** The control, reading the fake tiles through the real map. */
function addSearch(map: TsMap, options: Record<string, unknown> = {}) {
  const search = control.search({ provider: null, offline: null, recents: false, units: 'metric', ...options }).addTo(map)
  search.engine.map = Object.assign(Object.create(map), { _style: fakeMap()._style })
  return search
}

const tick = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('SearchControl', () => {
  test('focused and empty, offers Find Nearby', () => {
    const map = makeMap()
    addSearch(map)
    const container = map.getContainer()
    container.querySelector<HTMLInputElement>('.tsmap-search-input')!.dispatchEvent(new Event('focus'))
    const chips = [...container.querySelectorAll('.tsmap-search-chip')].map(c => c.textContent!.trim())
    expect(chips).toEqual(SEARCH_CATEGORIES.slice(0, 8).map(c => c.label))
    expect(container.querySelector('.tsmap-search-open')).not.toBeNull()
  })

  test('suggests as you type, then shows a place\'s card', async () => {
    const map = makeMap()
    const search = addSearch(map)
    const selected: string[] = []
    search.listen((type, e) => type === 'select' && selected.push(e.place.name))
    const container = map.getContainer()
    const input = container.querySelector<HTMLInputElement>('.tsmap-search-input')!
    input.value = 'blue'
    input.dispatchEvent(new Event('input'))
    await tick(250)
    const rows = [...container.querySelectorAll('.tsmap-search-row')].map(r => r.querySelector('.tsmap-search-row-title')!.textContent)
    expect(rows).toEqual(['blue', 'Blue Bottle Coffee', 'Bluestem Brasserie'])
    // The typed part in bold, in the name's own case.
    expect(container.querySelector('.tsmap-search-row-title b')?.textContent).toBe('Blue')

    // Down twice, to the café, and Enter.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(container.querySelector('.tsmap-search-place-name')?.textContent).toBe('Blue Bottle Coffee')
    expect(container.querySelector('.tsmap-search-place-kind')?.textContent).toContain('Café')
    expect(container.querySelectorAll('.tsmap-search-pin')).toHaveLength(1)
    expect(selected).toEqual(['Blue Bottle Coffee'])

    // Escape closes it all.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(container.querySelector('.tsmap-search-place')).toBeNull()
    expect(container.querySelectorAll('.tsmap-search-pin')).toHaveLength(0)
  })

  test('a category drops a pin per result and lists them; a result keeps its siblings', async () => {
    const map = makeMap()
    const search = addSearch(map)
    const results: number[] = []
    search.listen((type, e) => type === 'results' && results.push(e.places.length))
    const container = map.getContainer()
    container.querySelector<HTMLInputElement>('.tsmap-search-input')!.dispatchEvent(new Event('focus'))
    container.querySelectorAll<HTMLElement>('.tsmap-search-chip')[2]!.click()
    await tick()
    expect(results).toEqual([2])
    expect(container.querySelector('.tsmap-search-title')?.textContent).toBe('Coffee')
    expect(container.querySelector('.tsmap-search-count')?.textContent).toBe('2 results')
    expect(container.querySelectorAll('.tsmap-search-pin')).toHaveLength(2)

    container.querySelector<HTMLElement>('.tsmap-search-row')!.click()
    expect(container.querySelector('.tsmap-search-place')).not.toBeNull()
    expect(container.querySelectorAll('.tsmap-search-pin')).toHaveLength(2)
    expect(container.querySelectorAll('.tsmap-search-pin-selected')).toHaveLength(1)
    // Back to the list.
    container.querySelector<HTMLElement>('[data-action="close-place"]')!.click()
    expect(container.querySelector('.tsmap-search-count')?.textContent).toBe('2 results')
  })

  test('typing a category\'s name and Search runs the category', async () => {
    const map = makeMap()
    const search = addSearch(map)
    const places = await search.search('pharmacy')
    expect(places.map(p => p.name)).toEqual(['Walgreens'])
    expect(map.getContainer().querySelector('.tsmap-search-title')?.textContent).toBe('Pharmacies')
  })

  test('moving the map offers Search This Area', async () => {
    const map = makeMap()
    const search = addSearch(map)
    await search.searchCategory(categoryForQuery('coffee')!)
    map.panBy([0, 400], { animate: false })
    map.fire('moveend')
    const button = map.getContainer().querySelector<HTMLElement>('.tsmap-search-area')
    expect(button?.textContent).toBe('Search This Area')
    button!.click()
    await tick()
    expect(map.getContainer().querySelector('.tsmap-search-area')).toBeNull()
  })

  test('Directions previews the route on TurnByTurn, to the place', async () => {
    const map = makeMap()
    const previews: Array<[unknown, unknown]> = []
    const nav = { options: {} as { destinationName?: string }, preview: async (from: unknown, to: unknown) => { previews.push([from, to]) } }
    const directions: string[] = []
    const search = addSearch(map, { turnByTurn: nav, origin: () => at(0, 0), onDirections: (p: any) => directions.push(p.name) })
    const [place] = await search.search('sightglass')
    search.select(place!)
    map.getContainer().querySelector<HTMLElement>('[data-action="directions"]')!.click()
    await tick()
    expect(directions).toEqual(['Sightglass'])
    expect(nav.options.destinationName).toBe('Sightglass')
    expect(previews).toEqual([[at(0, 0), place!.center]])
  })

  test('Recents remember what was chosen', async () => {
    const map = makeMap()
    const search = addSearch(map, { recents: true })
    search.history = new SearchHistory(`test-${Math.random()}`)
    const [place] = await search.search('bluestem')
    search.select(place!)
    search.cancel()
    const input = map.getContainer().querySelector<HTMLInputElement>('.tsmap-search-input')!
    input.dispatchEvent(new Event('focus'))
    const recents = [...map.getContainer().querySelectorAll('.tsmap-search-rows .tsmap-search-row-title')].map(r => r.textContent)
    expect(recents).toEqual(['Bluestem Brasserie', 'bluestem'])
  })
})

describe('for the framework bindings', () => {
  test('sync searches for a query once, runs a category by name, and clears on empty', async () => {
    const map = makeMap()
    const search = addSearch(map)
    const results: string[] = []
    let clears = 0
    search.listen((type, e) => {
      if (type === 'results')
        results.push(e.category?.id ?? e.query)
      else if (type === 'clear')
        clears++
    })
    search.sync({ query: 'bluestem' })
    search.sync({ query: 'bluestem' })
    await tick()
    search.sync({ query: 'coffee' })
    await tick()
    search.sync({})
    expect(results).toEqual(['bluestem', 'coffee'])
    search.sync({ query: '' })
    expect(clears).toBe(1)
    expect(map.getContainer().querySelectorAll('.tsmap-search-pin')).toHaveLength(0)
  })

  test('events reduce to plain data', () => {
    const place = { id: 'p', name: 'P', center: { lat: 1, lng: 2 }, kind: 'cafe', icon: 'cafe', source: 'map' as const, rank: 1 }
    const coffee = categoryForQuery('coffee')!
    expect(SearchControl.plainEvent('results', { category: coffee, places: [place] })).toEqual({ query: undefined, category: { id: 'coffee', label: 'Coffee' }, places: [place] })
    expect(SearchControl.plainEvent('select', { place })).toEqual({ place })
    expect(SearchControl.plainEvent('clear', {})).toEqual({})
    expect(Object.keys(SEARCH_EVENTS)).toEqual(['results', 'select', 'directions', 'clear'])
  })
})
