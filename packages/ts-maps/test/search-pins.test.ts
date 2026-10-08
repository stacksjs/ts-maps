import { afterEach, describe, expect, test } from 'bun:test'
import type { SearchPlace } from '../src/core-map/search'
import { control, Map } from '../src/core-map'
import { clusterPins } from '../src/core-map/search/pins'

describe('clusterPins', () => {
  test('gathers pins nearer than the radius, around the most important', () => {
    const clusters = clusterPins([
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 110, y: 105 },
      { id: 'c', x: 300, y: 100 },
      { id: 'd', x: 95, y: 120 },
    ], 36)
    expect(clusters.map(c => c.ids)).toEqual([['a', 'b', 'd'], ['c']])
    expect(clusters[0]).toMatchObject({ x: 100, y: 100 })
  })

  test('never gathers the chosen pin, and never into it', () => {
    const clusters = clusterPins([
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 110, y: 105 },
      { id: 'c', x: 104, y: 98 },
    ], 36, 'a')
    expect(clusters.map(c => c.ids)).toEqual([['a'], ['b', 'c']])
  })
})

// Chinatown, San Francisco: two dozen restaurants inside a few blocks.
const CENTER = { lat: 37.7941, lng: -122.4078 }
function restaurants(count: number, spread: number): SearchPlace[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    name: `Restaurant ${i}`,
    center: { lat: CENTER.lat + Math.sin(i) * spread, lng: CENTER.lng + Math.cos(i) * spread },
    kind: 'restaurant',
    icon: 'restaurant',
    source: 'map' as const,
    rank: i,
  }))
}

function makeMap(zoom: number): Map {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 430 })
  Object.defineProperty(container, 'clientHeight', { value: 800 })
  document.body.appendChild(container)
  const map = new Map(container, { zoomAnimation: false, fadeAnimation: false })
  map.setView([CENTER.lat, CENTER.lng], zoom)
  return map
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('search result pins', () => {
  test('in a dense area, gather into numbered bubbles, and come apart zoomed in', () => {
    const map = makeMap(15)
    const search = control.search({ provider: null, offline: null, recents: false }).addTo(map)
    const places = restaurants(24, 0.0015)
    search._showResults(places, { query: 'restaurants' })
    const container = map.getContainer()
    const bubbles = [...container.querySelectorAll<HTMLElement>('.tsmap-search-cluster')]
    const pins = container.querySelectorAll('.tsmap-search-pin')
    expect(bubbles.length).toBeGreaterThan(0)
    // Every result is on the map, alone or in a bubble's count.
    expect(pins.length + bubbles.reduce((sum, b) => sum + Number(b.textContent), 0)).toBe(24)
    expect(bubbles[0]!.getAttribute('aria-label')).toMatch(/^\d+ results$/)

    map.setZoom(19)
    map.fire('zoomend')
    expect(container.querySelectorAll('.tsmap-search-cluster').length).toBeLessThan(bubbles.length)
    expect(container.querySelectorAll('.tsmap-search-pin').length).toBeGreaterThan(pins.length)
  })

  test('the chosen one is never in a bubble', () => {
    const map = makeMap(14)
    const search = control.search({ provider: null, offline: null, recents: false }).addTo(map)
    const places = restaurants(10, 0.0003)
    search._showResults(places, { query: 'restaurants' })
    expect(map.getContainer().querySelectorAll('.tsmap-search-pin')).toHaveLength(0)
    search.select(places[4]!)
    map.setView([CENTER.lat, CENTER.lng], 14)
    map.fire('zoomend')
    const selected = map.getContainer().querySelectorAll('.tsmap-search-pin-selected')
    expect(selected).toHaveLength(1)
    expect(selected[0]!.parentElement!.getAttribute('title')).toBe('Restaurant 4')
    expect(Number(map.getContainer().querySelector('.tsmap-search-cluster')!.textContent)).toBe(9)
  })

  test('tapping a bubble zooms to what is in it', () => {
    const map = makeMap(14)
    const search = control.search({ provider: null, offline: null, recents: false }).addTo(map)
    search._showResults(restaurants(6, 0.0004), { query: 'restaurants' })
    const before = map.getZoom()
    ;(map.getContainer().querySelector('.tsmap-search-cluster')!.parentElement as HTMLElement).click()
    expect(map.getZoom()).toBeGreaterThan(before)
  })
})
