import { describe, expect, test } from 'bun:test'
import type { DirectionsProvider, Route } from '../src/core-map/services/types'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'
import { formatDuration, TurnByTurn } from '../src/core-map/navigation/TurnByTurn'

const P = (north: number, east: number) => ({ lat: north * 0.0009, lng: east * 0.0009 })
const fast: Route = {
  distance: 800,
  duration: 100,
  geometry: [P(0, 0), P(5, 0), P(5, 3)],
  steps: [
    { distance: 500, duration: 60, instruction: '', geometry: [P(0, 0), P(5, 0)], maneuver: 'depart', name: 'Main Street' },
    { distance: 300, duration: 40, instruction: '', geometry: [P(5, 0), P(5, 3)], maneuver: 'turn-right', name: 'Market Street' },
    { distance: 0, duration: 0, instruction: '', geometry: [P(5, 3)], maneuver: 'arrive' },
  ],
}
const slow: Route = { ...fast, duration: 400, distance: 900 }

const provider = (routes: Route[]): DirectionsProvider & { calls: number } => {
  const p = { name: 'fake', calls: 0, getDirections: async () => { p.calls++; return routes } }
  return p
}

function makeMap(): TsMap {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const map = new TsMap(el, { center: [0.002, 0.001], zoom: 15 })
  map._size = new Point(430, 860)
  map._sizeChanged = false
  map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
  return map
}

describe('TurnByTurn', () => {
  test('preview shows every route and a Go button, fastest first', async () => {
    const map = makeMap()
    const nav = new TurnByTurn(map, { directions: provider([fast, slow]), voice: false, units: 'metric', destinationName: 'Ferry Building' })
    await nav.preview(P(0, 0), P(5, 3))
    const card = map.getContainer().querySelector('.tsmap-nav-preview')!
    expect(card.textContent).toContain('Directions to Ferry Building')
    expect(card.querySelectorAll('.tsmap-nav-option').length).toBe(2)
    expect(card.querySelector('.tsmap-nav-option')!.textContent).toContain('Fastest')
    expect(card.querySelector('.tsmap-nav-go')).not.toBeNull()
    expect(nav.state).toBe('preview')
  })

  test('another route can be chosen before setting off', async () => {
    const map = makeMap()
    const nav = new TurnByTurn(map, { directions: provider([fast, slow]), voice: false })
    await nav.preview(P(0, 0), P(5, 3))
    nav.selectRoute(1)
    expect(nav.route).toBe(slow)
    expect(map.getContainer().querySelectorAll('.tsmap-nav-option')[1]!.classList.contains('tsmap-selected')).toBe(true)
  })

  test('guidance shows the next maneuver, and the trip card what is left', async () => {
    const map = makeMap()
    const nav = new TurnByTurn(map, { directions: provider([fast]), voice: false, units: 'metric' })
    await nav.preview(P(0, 0), P(5, 3))
    nav.start()
    expect(nav.state).toBe('navigating')
    nav.update({ ...P(2, 0), time: 0 })
    const banner = map.getContainer().querySelector('.tsmap-nav-banner')!
    expect(banner.querySelector('.tsmap-nav-distance')!.textContent).toBe('300 m')
    expect(banner.querySelector('.tsmap-nav-road')!.textContent).toBe('Market St')
    expect(banner.querySelector('svg')).not.toBeNull()
    const trip = map.getContainer().querySelector('.tsmap-nav-trip')!
    expect(trip.querySelector('.tsmap-nav-left')!.textContent).toBe('600')
    // Preview's card gives way to the trip card.
    expect(map.getContainer().querySelector('.tsmap-nav-preview')).toBeNull()
    nav.stop()
  })

  test('arriving says so', async () => {
    const map = makeMap()
    const nav = new TurnByTurn(map, { directions: provider([fast]), voice: false })
    await nav.preview(P(0, 0), P(5, 3))
    nav.start()
    let arrived = false
    nav.on('arrive', () => { arrived = true })
    nav.update({ ...P(5, 2.95), time: 0 })
    expect(arrived).toBe(true)
    expect(map.getContainer().querySelector('.tsmap-nav-banner')!.textContent).toContain('Arrived')
    nav.stop()
  })

  test('leaving the route fetches a new one from where you are', async () => {
    const map = makeMap()
    const directions = provider([fast])
    const nav = new TurnByTurn(map, { directions, voice: false })
    await nav.preview(P(0, 0), P(5, 3))
    nav.start()
    for (let t = 0; t <= 5; t++)
      nav.update({ ...P(2, 2), time: t * 1000 })
    await new Promise(r => setTimeout(r, 0))
    expect(directions.calls).toBe(2)
    nav.stop()
  })

  test('End clears everything off the map', async () => {
    const map = makeMap()
    const nav = new TurnByTurn(map, { directions: provider([fast]), voice: false })
    await nav.preview(P(0, 0), P(5, 3))
    nav.start()
    nav.stop()
    const container = map.getContainer()
    for (const selector of ['.tsmap-nav-banner', '.tsmap-nav-card', '.tsmap-nav-puck', '.tsmap-nav-pin'])
      expect(container.querySelector(selector)).toBeNull()
    expect(nav.state).toBe('idle')
  })

  test('durations read the way the card shows them', () => {
    expect(formatDuration(30)).toBe('1 min')
    expect(formatDuration(12 * 60)).toBe('12 min')
    expect(formatDuration(65 * 60)).toBe('1 hr 5 min')
  })
})

describe('camera pans', () => {
  test('moving the centre without zooming re-lays the layers', () => {
    const map = makeMap()
    const events: any[] = []
    map.on('zoom', (e: any) => events.push(e))
    map.jumpTo({ center: [0.003, 0.001] })
    expect(events.length).toBe(1)
    expect(events[0].relayout).toBe(true)
  })
})
