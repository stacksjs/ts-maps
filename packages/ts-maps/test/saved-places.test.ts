import { afterEach, describe, expect, test } from 'bun:test'
import type { SearchPlace } from '../src/core-map/search'
import { control, TsMap } from '../src/core-map'
import { MemorySavedPlaces, SavedPlaces } from '../src/core-map/search'

const tartine: SearchPlace = { id: 'tartine', name: 'Tartine Bakery', center: { lat: 37.7614, lng: -122.4241 }, kind: 'bakery', icon: 'bakery', source: 'map', rank: 5 }
const dolores: SearchPlace = { id: 'dolores', name: 'Dolores Park', center: { lat: 37.7596, lng: -122.4269 }, kind: 'park', icon: 'park', source: 'map', rank: 3 }

describe('SavedPlaces', () => {
  test('keeps favorites, newest first, and guides, each place once', async () => {
    const saved = new SavedPlaces({ backend: new MemorySavedPlaces() })
    await saved.favorite(tartine)
    await saved.favorite(dolores)
    expect(saved.favorites.map(p => p.name)).toEqual(['Dolores Park', 'Tartine Bakery'])
    const guide = await saved.createGuide('Mission', [tartine])
    await saved.addToGuide(guide.id, dolores)
    expect(saved.guidePlaces(guide.id).map(p => p.id)).toEqual(['tartine', 'dolores'])
    // A favorite in a guide too is one record.
    expect(Object.keys(saved._data.places)).toEqual(['tartine', 'dolores'])
    await saved.unfavorite('tartine')
    expect(saved.isFavorite('tartine')).toBe(false)
    expect(saved.isSaved('tartine')).toBe(true)
    await saved.deleteGuide(guide.id)
    expect(saved.get('tartine')).toBeUndefined()
    expect(saved.get('dolores')).toBeDefined()
  })

  test('survives a reload, through its backend', async () => {
    const backend = new MemorySavedPlaces()
    const first = new SavedPlaces({ backend })
    await first.favorite(tartine)
    await first.createGuide('Coffee to try', [dolores])
    const second = new SavedPlaces({ backend })
    await second.ready()
    expect(second.favorites.map(p => p.id)).toEqual(['tartine'])
    expect(second.guides.map(g => g.name)).toEqual(['Coffee to try'])
  })

  test('travels as GeoJSON', async () => {
    const saved = new SavedPlaces({ backend: new MemorySavedPlaces() })
    const guide = await saved.createGuide('Mission', [tartine, dolores])
    const geojson = saved.toGeoJSON(guide.id)
    expect(geojson.name).toBe('Mission')
    expect(geojson.features[0]).toMatchObject({ geometry: { type: 'Point', coordinates: [-122.4241, 37.7614] }, properties: { name: 'Tartine Bakery', kind: 'bakery' } })
    const other = new SavedPlaces({ backend: new MemorySavedPlaces() })
    const imported = await other.importGeoJSON({ ...geojson, features: [...geojson.features, { type: 'Feature', geometry: { type: 'LineString' }, properties: { name: 'skipped' } }] })
    expect(imported.name).toBe('Mission')
    expect(other.guidePlaces(imported.id).map(p => p.name)).toEqual(['Tartine Bakery', 'Dolores Park'])
  })

  test('says when it changed', async () => {
    const saved = new SavedPlaces({ backend: new MemorySavedPlaces() })
    let heard = 0
    saved.on('change', () => heard++)
    await saved.toggleFavorite(tartine)
    await saved.toggleFavorite(tartine)
    expect(heard).toBe(2)
    expect(saved.favorites).toEqual([])
  })
})

function makeMap(): TsMap {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 430 })
  Object.defineProperty(container, 'clientHeight', { value: 800 })
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false, fadeAnimation: false })
  map.setView([37.7605, -122.4255], 15)
  return map
}

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  document.body.replaceChildren()
})

describe('saved places in search', () => {
  test('Save on the card adds a favorite, and says so', async () => {
    const saved = new SavedPlaces({ backend: new MemorySavedPlaces() })
    const map = makeMap()
    const search = control.search({ provider: null, offline: null, recents: false, saved }).addTo(map)
    const events: string[] = []
    search.listen(type => (type === 'save' || type === 'unsave') && events.push(type))
    search.select(tartine)
    const save = (): HTMLElement => map.getContainer().querySelector<HTMLElement>('[data-action="save"]')!
    expect(save().textContent).toContain('Save')
    save().click()
    await tick()
    expect(saved.isFavorite('tartine')).toBe(true)
    expect(save().getAttribute('aria-pressed')).toBe('true')
    expect(save().textContent).toContain('Saved')
    save().click()
    await tick()
    expect(events).toEqual(['save', 'unsave'])
  })

  test('favorites are stars on the map, and above Recents with Guides', async () => {
    const saved = new SavedPlaces({ backend: new MemorySavedPlaces() })
    await saved.favorite(tartine)
    await saved.createGuide('Parks', [dolores])
    const map = makeMap()
    const search = control.search({ provider: null, offline: null, recents: false, saved }).addTo(map)
    await tick()
    expect(map.getContainer().querySelectorAll('.tsmap-search-star')).toHaveLength(1)
    search._show('home')
    const sections = [...map.getContainer().querySelectorAll('.tsmap-search-section')].map(s => s.textContent?.trim())
    expect(sections).toEqual(['Find Nearby', 'Favorites', 'Guides'])
    // A guide opens as results.
    const guideRow = [...map.getContainer().querySelectorAll<HTMLElement>('.tsmap-search-row')].find(r => r.textContent?.includes('Parks'))!
    guideRow.click()
    await tick()
    expect(search.results.map(p => p.name)).toEqual(['Dolores Park'])
    expect(map.getContainer().querySelector('.tsmap-search-title')?.textContent).toBe('Parks')
  })

  test('none, with saved: null', () => {
    const map = makeMap()
    const search = control.search({ provider: null, offline: null, recents: false, saved: null }).addTo(map)
    search.select(tartine)
    expect(map.getContainer().querySelector('[data-action="save"]')).toBeNull()
  })
})
