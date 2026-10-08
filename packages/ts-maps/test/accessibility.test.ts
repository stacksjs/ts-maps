import { afterEach, describe, expect, test } from 'bun:test'
import type { DirectionsProvider, Route } from '../src/core-map/services/types'
import type { SearchPlace } from '../src/core-map/search'
import { control, TileLayer, Map, TurnByTurn } from '../src/core-map'
import { areaSize } from '../src/core-map/control/OfflineMapsControl'
import { Point } from '../src/core-map/geometry/Point'
import { MemoryOfflineStore, OfflineMaps } from '../src/core-map/offline'

/**
 * What a screen reader needs from a panel, checked the way an automated
 * checker would: every button and link has a name, every id referred to
 * exists, and decorative icons are hidden.
 */
function a11yIssues(root: Element): string[] {
  const issues: string[] = []
  for (const el of root.querySelectorAll<HTMLElement>('button, a[href], [role="button"], [role="option"]')) {
    const name = el.getAttribute('aria-label') ?? el.textContent?.trim()
    if (!name)
      issues.push(`${el.tagName.toLowerCase()}.${el.className} has no accessible name`)
  }
  for (const el of root.querySelectorAll<HTMLElement>('[aria-activedescendant], [aria-controls], [aria-describedby]')) {
    for (const attr of ['aria-activedescendant', 'aria-controls', 'aria-describedby']) {
      const id = el.getAttribute(attr)
      if (id && !root.ownerDocument.getElementById(id))
        issues.push(`${attr}="${id}" points at nothing`)
    }
  }
  for (const svg of root.querySelectorAll('svg')) {
    if (svg.getAttribute('aria-hidden') !== 'true' && !svg.getAttribute('aria-label'))
      issues.push('an icon is neither hidden nor named')
  }
  for (const bar of root.querySelectorAll('[role="progressbar"]')) {
    if (!bar.getAttribute('aria-valuenow') || !bar.getAttribute('aria-label'))
      issues.push('a progress bar has no value or name')
  }
  return issues
}

function makeMap(): Map {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 430 })
  Object.defineProperty(container, 'clientHeight', { value: 800 })
  document.body.appendChild(container)
  const map = new Map(container, { zoomAnimation: false, fadeAnimation: false })
  map.setView([37.78, -122.42], 15)
  return map
}

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
const realMatchMedia = globalThis.matchMedia

afterEach(() => {
  document.body.replaceChildren()
  globalThis.matchMedia = realMatchMedia
})

const cafe = (i: number): SearchPlace => ({ id: `c${i}`, name: `Café ${i}`, center: { lat: 37.78 + i * 0.001, lng: -122.42 }, kind: 'cafe', icon: 'cafe', source: 'map', rank: i })

describe('search', () => {
  test('is a combobox: the field names the row highlighted, and results are announced', () => {
    const map = makeMap()
    const search = control.search({ provider: null, offline: null, recents: false, saved: null }).addTo(map)
    const input = map.getContainer().querySelector<HTMLInputElement>('.tsmap-search-input')!
    const list = map.getContainer().querySelector('[role="listbox"]')!
    expect(input.getAttribute('aria-controls')).toBe(list.id)

    search._showResults([cafe(1), cafe(2), cafe(3)], { query: 'coffee' })
    const live = map.getContainer().querySelector('.tsmap-sr-only')!
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toBe('3 results for coffee')

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    const active = input.getAttribute('aria-activedescendant')!
    expect(document.getElementById(active)?.getAttribute('aria-selected')).toBe('true')
    expect(a11yIssues(map.getContainer().querySelector('.tsmap-search')!)).toEqual([])
  })

  test('closing a place card puts the keyboard back in the field', () => {
    const map = makeMap()
    const search = control.search({ provider: null, offline: null, recents: false, saved: null }).addTo(map)
    search.select(cafe(1))
    expect(map.getContainer().querySelector('.tsmap-sr-only')!.textContent).toBe('Café 1, Café')
    expect(a11yIssues(map.getContainer().querySelector('.tsmap-search')!)).toEqual([])
    map.getContainer().querySelector<HTMLElement>('[data-action="close-place"]')!.click()
    expect(document.activeElement).toBe(map.getContainer().querySelector('.tsmap-search-input'))
  })
})

describe('offline maps', () => {
  test('the panel is a dialog: focus goes in from the button and back to it on Escape', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: async () => new Response(new Uint8Array(4) as unknown as BodyInit) })
    await maps.download({ bounds: [-122.425, 37.775, -122.415, 37.785], minZoom: 14, maxZoom: 14, sources: [{ url: 'https://img.test/{z}/{x}/{y}.png' }], name: 'San Francisco' })
    const map = makeMap()
    const offline = control.offlineMaps({ maps }).addTo(map)
    const button = map.getContainer().querySelector<HTMLElement>('.tsmap-offline-button')!
    button.focus()
    offline.open()
    await tick()
    const card = map.getContainer().querySelector<HTMLElement>('.tsmap-offline-card')!
    expect(card.getAttribute('role')).toBe('dialog')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(card.contains(document.activeElement)).toBe(true)
    expect(card.querySelector('[data-action="delete"]')!.getAttribute('aria-label')).toBe('Delete San Francisco')
    expect(a11yIssues(card)).toEqual([])
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(offline.isOpen).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  test('a download in progress is a progress bar with its value', () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore() })
    const map = makeMap()
    const offline = control.offlineMaps({ maps }).addTo(map)
    const html = offline._row({ id: 'r', name: 'Mission', bounds: [0, 0, 1, 1], minZoom: 0, maxZoom: 1, sources: [], status: 'downloading', tiles: 200, downloaded: 50, bytes: 1000, createdAt: 0, updatedAt: 0 })
    const row = document.createElement('div')
    row.innerHTML = html
    const bar = row.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('25')
    expect(bar.getAttribute('aria-label')).toBe('Downloading Mission')
    expect(row.querySelector('[data-action="pause"]')!.getAttribute('aria-label')).toBe('Pause Mission download')
  })

  test('the area picker\'s corners move with the arrow keys, and the area is described', () => {
    const map = makeMap()
    new TileLayer('https://img.test/{z}/{x}/{y}.png').addTo(map)
    const offline = control.offlineMaps({ maps: new OfflineMaps({ store: new MemoryOfflineStore() }) }).addTo(map)
    offline.selectArea()
    const corner = map.getContainer().querySelector<HTMLElement>('[data-corner="nw"]')!
    expect(corner.getAttribute('tabindex')).toBe('0')
    expect(corner.getAttribute('aria-label')).toBe('Move the top-left corner of the area')
    const before = offline.selectedBounds()!
    corner.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }))
    expect(offline.selectedBounds()![0]).toBeGreaterThan(before[0])
    const estimate = map.getContainer().querySelector('.tsmap-offline-estimate')!
    expect(estimate.getAttribute('aria-live')).toBe('polite')
    expect(estimate.textContent).toMatch(/^About .+ × .+ · Estimated size/)
    expect(a11yIssues(map.getContainer().querySelector('.tsmap-offline-select')!)).toEqual([])
  })

  test('an area is said in the units of the place', () => {
    expect(areaSize([-122.43, 37.77, -122.41, 37.79], 'metric')).toBe('About 1.8 × 2.2 km')
    expect(areaSize([-122.43, 37.77, -122.41, 37.79], 'imperial')).toBe('About 1.1 × 1.4 mi')
  })
})

describe('turn-by-turn', () => {
  const route: Route = {
    distance: 800,
    duration: 100,
    geometry: [{ lat: 0, lng: 0 }, { lat: 0.0045, lng: 0 }],
    steps: [
      { distance: 800, duration: 100, instruction: '', geometry: [{ lat: 0, lng: 0 }, { lat: 0.0045, lng: 0 }], maneuver: 'depart', name: 'Main Street' },
      { distance: 0, duration: 0, instruction: '', geometry: [{ lat: 0.0045, lng: 0 }], maneuver: 'arrive' },
    ],
  }
  const directions: DirectionsProvider = { name: 'fake', getDirections: async () => [route] }

  test('the banner is a polite live region, and End and mute say what they do', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const map = new Map(el, { center: [0.002, 0], zoom: 15 })
    map._size = new Point(430, 860)
    map._sizeChanged = false
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
    const nav = new TurnByTurn(map, { directions, voice: false, simulate: { speed: 0 } })
    await nav.preview({ lat: 0, lng: 0 }, { lat: 0.0045, lng: 0 })
    expect(a11yIssues(map.getContainer().querySelector('.tsmap-nav-card')!)).toEqual([])
    nav.start()
    const banner = map.getContainer().querySelector('.tsmap-nav-banner')!
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.getAttribute('aria-live')).toBe('polite')
    const mute = map.getContainer().querySelector<HTMLElement>('.tsmap-nav-mute')!
    expect(mute.getAttribute('aria-label')).toBe('Mute voice guidance')
    mute.click()
    expect(mute.getAttribute('aria-pressed')).toBe('true')
    expect(map.getContainer().querySelector('.tsmap-nav-end')!.getAttribute('aria-label')).toBe('End route')
    nav.stop()
  })
})

describe('reduced motion', () => {
  test('a flight is a jump when the reader asks for less motion, unless essential', () => {
    globalThis.matchMedia = ((query: string) => ({ matches: query.includes('reduced-motion'), addEventListener: () => {}, removeEventListener: () => {} })) as any
    const map = makeMap()
    map.flyTo([37.8, -122.4], 14)
    expect(map.getCenter().lat).toBeCloseTo(37.8, 5)
    expect(map.getZoom()).toBe(14)
    map.easeTo({ center: [37.7, -122.5], zoom: 13 })
    expect(map.getCenter().lat).toBeCloseTo(37.7, 5)
  })
})
