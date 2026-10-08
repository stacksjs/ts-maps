import { afterEach, describe, expect, test } from 'bun:test'
import type { DirectionsProvider, GeocoderProvider, Route } from '../src/core-map/services/types'
import { Map } from '../src/core-map'
import { OfflineMapsControl } from '../src/core-map/control/OfflineMapsControl'
import { SearchControl } from '../src/core-map/control/SearchControl'
import { Point } from '../src/core-map/geometry/Point'
import { TurnByTurn } from '../src/core-map/navigation/TurnByTurn'
import { MemoryOfflineStore, OfflineMaps, setOfflineMaps } from '../src/core-map/offline'
import { PhotonGeocoder } from '../src/core-map/services/providers/Photon'

// The bindings pass every prop to `sync` on every change. These pin what
// that does to options a control used to read only once, when it was added.

function makeMap(): Map {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const map = new Map(el, { center: [37.78, -122.42], zoom: 15, zoomAnimation: false })
  map._size = new Point(800, 600)
  map._sizeChanged = false
  map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
  return map
}

const corner = (control: { getContainer: () => HTMLElement | undefined }): string | undefined =>
  control.getContainer()?.parentElement?.className

const manager = (): OfflineMaps => new OfflineMaps({ store: new MemoryOfflineStore(), fetch: async () => new Response('') })

afterEach(() => {
  setOfflineMaps(null)
  document.body.replaceChildren()
})

describe('OfflineMapsControl.sync', () => {
  test('a new manager takes over the list and the listeners', async () => {
    const map = makeMap()
    const first = manager()
    const offline = new OfflineMapsControl({ maps: first }).addTo(map)
    const heard: string[] = []
    const stop = offline.listen(type => heard.push(type))

    const second = manager()
    offline.sync({ maps: second })
    expect(offline.maps).toBe(second)
    expect(heard).toEqual(['change'])

    // The old manager is no longer heard; the new one is.
    first.fire('progress', {})
    second.fire('progress', {})
    expect(heard).toEqual(['change', 'progress'])

    stop()
    second.fire('progress', {})
    expect(heard.length).toBe(2)
  })

  test('the same manager, or a key left out, changes nothing', () => {
    const map = makeMap()
    const maps = manager()
    const offline = new OfflineMapsControl({ maps }).addTo(map)
    const heard: string[] = []
    offline.listen(type => heard.push(type))
    offline.sync({ maps })
    offline.sync({ open: false })
    expect(offline.maps).toBe(maps)
    expect(heard).toEqual([])
  })

  test('follows position, title and resources', () => {
    const map = makeMap()
    const offline = new OfflineMapsControl({ maps: manager() }).addTo(map)
    expect(corner(offline)).toContain('tsmap-right')
    offline.sync({ position: 'bottomleft', title: 'Downloads', resources: ['https://tiles.test/tiles.json'] })
    expect(corner(offline)).toContain('tsmap-left')
    expect(corner(offline)).toContain('tsmap-bottom')
    expect(offline.getContainer()?.querySelector('a')?.getAttribute('aria-label')).toBe('Downloads')
    expect(offline.options.resources).toEqual(['https://tiles.test/tiles.json'])
    // Undefined is the default again.
    offline.sync({ position: undefined })
    expect(corner(offline)).toContain('tsmap-top')
  })
})

describe('OfflineMapsControl.sync state', () => {
  test('a panel closed from inside stays closed when another prop changes', () => {
    const map = makeMap()
    const offline = new OfflineMapsControl({ maps: manager() }).addTo(map)
    offline.sync({ open: true, title: 'Offline Maps' })
    expect(offline.isOpen).toBe(true)
    offline.close()
    offline.sync({ open: true, title: 'Downloads' })
    expect(offline.isOpen).toBe(false)
    // Until `open` itself changes.
    offline.sync({ open: false })
    offline.sync({ open: true })
    expect(offline.isOpen).toBe(true)
  })

  test('a new manager takes the mode asked for', () => {
    const map = makeMap()
    const offline = new OfflineMapsControl({ maps: manager() }).addTo(map)
    offline.sync({ onlyOffline: true })
    const next = manager()
    offline.sync({ maps: next, onlyOffline: true })
    expect(next.onlyOffline).toBe(true)
  })
})

describe('SearchControl.sync', () => {
  const geocoder = (name: string): GeocoderProvider => ({ name, search: async () => [], reverse: async () => [] })

  test('a new provider is asked from the next query on', () => {
    const map = makeMap()
    const a = geocoder('a')
    const search = new SearchControl({ provider: a }).addTo(map)
    expect(search.engine.provider).toBe(a)
    const b = geocoder('b')
    search.sync({ provider: b })
    expect(search.engine.provider).toBe(b)
    search.sync({ provider: null })
    expect(search.engine.provider).toBeNull()
    // Undefined is the default, Photon.
    search.sync({ provider: undefined })
    expect(search.engine.provider).toBeInstanceOf(PhotonGeocoder)
    const photon = search.engine.provider
    search.sync({ provider: undefined })
    expect(search.engine.provider).toBe(photon)
  })

  test('categories redraw Find Nearby in place, and an equal list does not', () => {
    const map = makeMap()
    const search = new SearchControl({ provider: null, offline: null }).addTo(map)
    search._show('home')
    const coffee = { id: 'coffee', label: 'Coffee', icon: 'cafe', kinds: ['cafe'], synonyms: [] }
    search.sync({ categories: [coffee] })
    const labels = (): string[] => [...search.getContainer()!.querySelectorAll('.tsmap-search-chip')].map(el => el.textContent?.trim() ?? '')
    expect(labels().join(' ')).toContain('Coffee')
    const body = search.getContainer()!.querySelector('.tsmap-search-body')!.innerHTML
    search.sync({ categories: [{ ...coffee }] })
    expect(search.getContainer()!.querySelector('.tsmap-search-body')!.innerHTML).toBe(body)
  })

  test('follows position and placeholder', () => {
    const map = makeMap()
    const search = new SearchControl({ provider: null, offline: null }).addTo(map)
    expect(corner(search)).toContain('tsmap-left')
    search.sync({ position: 'topright', placeholder: 'Find a trail' })
    expect(corner(search)).toContain('tsmap-right')
    expect(search.getContainer()!.querySelector('input')!.placeholder).toBe('Find a trail')
  })
})

describe('TurnByTurn.sync', () => {
  const P = (north: number, east: number) => ({ lat: north * 0.0009, lng: east * 0.0009 })
  const route: Route = {
    distance: 800,
    duration: 100,
    geometry: [P(0, 0), P(5, 0), P(5, 3)],
    steps: [
      { distance: 500, duration: 60, instruction: '', geometry: [P(0, 0), P(5, 0)], maneuver: 'depart', name: 'Main Street' },
      { distance: 300, duration: 40, instruction: '', geometry: [P(5, 0), P(5, 3)], maneuver: 'turn-right', name: 'Market Street' },
      { distance: 0, duration: 0, instruction: '', geometry: [P(5, 3)], maneuver: 'arrive' },
    ],
  }
  const provider = (): DirectionsProvider & { profiles: string[] } => {
    const p = { name: 'fake', profiles: [] as string[], getDirections: async (_: unknown, o?: { profile?: string }) => { p.profiles.push(o?.profile ?? ''); return [route] } }
    return p
  }

  test('another profile fetches the showing preview again', async () => {
    const map = makeMap()
    const directions = provider()
    const nav = new TurnByTurn(map, { directions, voice: false })
    await nav.sync({ from: P(0, 0), to: P(5, 3), directions })
    expect(directions.profiles).toEqual(['driving'])
    await nav.sync({ from: P(0, 0), to: P(5, 3), directions, profile: 'walking' })
    expect(directions.profiles).toEqual(['driving', 'walking'])
    // Nothing changed: nothing fetched.
    await nav.sync({ from: P(0, 0), to: P(5, 3), directions, profile: 'walking' })
    expect(directions.profiles.length).toBe(2)
  })

  test('another provider is asked for the routes', async () => {
    const map = makeMap()
    const a = provider()
    const b = provider()
    const nav = new TurnByTurn(map, { directions: a, voice: false })
    await nav.sync({ from: P(0, 0), to: P(5, 3), directions: a })
    await nav.sync({ from: P(0, 0), to: P(5, 3), directions: b })
    expect(a.profiles.length).toBe(1)
    expect(b.profiles.length).toBe(1)
  })

  test('units redraw the preview card in place', async () => {
    const map = makeMap()
    const directions = provider()
    const nav = new TurnByTurn(map, { directions, voice: false, units: 'metric' })
    await nav.sync({ from: P(0, 0), to: P(5, 3), directions, units: 'metric' })
    const card = (): string => map.getContainer().querySelector('.tsmap-nav-card')?.textContent ?? ''
    expect(card()).toContain('800 m')
    await nav.sync({ from: P(0, 0), to: P(5, 3), directions, units: 'imperial' })
    expect(card()).toMatch(/ft|mi/)
    expect(directions.profiles.length).toBe(1)
  })

  test('guidance started from the card is not ended by another prop changing', async () => {
    const map = makeMap()
    const directions = provider()
    const nav = new TurnByTurn(map, { directions, voice: false, simulate: { speed: 0 } })
    await nav.sync({ from: P(0, 0), to: P(5, 3), active: false, directions })
    nav.start()
    expect(nav.state).toBe('navigating')
    await nav.sync({ from: P(0, 0), to: P(5, 3), active: false, directions, units: 'imperial' })
    expect(nav.state).toBe('navigating')
    nav.stop()
  })
})
