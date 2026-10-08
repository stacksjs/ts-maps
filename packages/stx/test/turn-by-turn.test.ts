import { describe, expect, test } from 'bun:test'
import { Map as MapInstance } from 'ts-maps'
import { mountChildren } from '../src/runtime'

const P = (north: number, east: number): [number, number] => [north * 0.0009, east * 0.0009]
const ll = (p: [number, number]) => ({ lat: p[0], lng: p[1] })
const route = {
  distance: 800,
  duration: 100,
  geometry: [P(0, 0), P(5, 0), P(5, 3)].map(ll),
  steps: [
    { distance: 500, duration: 60, instruction: '', geometry: [P(0, 0), P(5, 0)].map(ll), maneuver: 'depart', name: 'Main Street' },
    { distance: 300, duration: 40, instruction: '', geometry: [P(5, 0), P(5, 3)].map(ll), maneuver: 'turn-right', name: 'Market Street' },
    { distance: 0, duration: 0, instruction: '', geometry: [P(5, 3)].map(ll), maneuver: 'arrive' },
  ],
}

describe('turn-by-turn child', () => {
  test('is built from markup, previews, and reports through DOM events', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const mapEl = document.createElement('div')
    mapEl.style.width = '430px'
    mapEl.style.height = '800px'
    root.appendChild(mapEl)
    const map = new MapInstance(mapEl, { center: P(2, 0), zoom: 15 })

    // The provider is a live object markup cannot carry: the page hands it
    // over on `turnbyturn:ready`, before the first routes are fetched.
    const options = JSON.stringify({ from: P(0, 0), to: P(5, 3), voice: false })
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="turn-by-turn" data-options='${options}'></span>`)

    let nav: any = null
    const seen: string[] = []
    root.addEventListener('turnbyturn:ready', (e: any) => {
      nav = e.detail.nav
      nav.sync({ directions: { name: 'fake', getDirections: async () => [route] } })
    })
    for (const name of ['preview', 'start', 'progress'])
      root.addEventListener(`turnbyturn:${name}`, () => seen.push(name))

    const unmount = mountChildren(map, root)
    await new Promise(r => setTimeout(r, 0))
    expect(nav).not.toBeNull()
    expect(seen).toContain('preview')
    expect(root.querySelector('.tsmap-nav-preview')).not.toBeNull()

    await nav.sync({ from: P(0, 0), to: P(5, 3), active: true })
    nav.update({ ...ll(P(2, 0)), time: 0 })
    expect(seen).toEqual(['preview', 'start', 'progress'])

    unmount()
    expect(root.querySelector('.tsmap-nav-banner')).toBeNull()
    root.remove()
  })

  test('follows its props after mount, and keeps the provider the page gave it', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const mapEl = document.createElement('div')
    mapEl.style.width = '430px'
    mapEl.style.height = '800px'
    root.appendChild(mapEl)
    const map = new MapInstance(mapEl, { center: P(2, 0), zoom: 15 })
    const trip = { from: P(0, 0), to: P(5, 3), voice: false }
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="turn-by-turn" data-options='${JSON.stringify(trip)}'></span>`)
    const el = root.querySelector('[data-ts-map-child="turn-by-turn"]')!

    const asked: string[] = []
    const a = { name: 'a', getDirections: async (_: unknown, o: any) => { asked.push(`a:${o.profile}`); return [route] } }
    const b = { name: 'b', getDirections: async (_: unknown, o: any) => { asked.push(`b:${o.profile}`); return [route] } }
    let nav: any = null
    root.addEventListener('turnbyturn:ready', (e: any) => {
      nav = e.detail.nav
      nav.sync({ directions: a })
    })
    const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0))

    const unmount = mountChildren(map, root)
    await settle()
    el.setAttribute('data-options', JSON.stringify({ ...trip, profile: 'walking' }))
    await settle()
    await nav.sync({ from: trip.from, to: trip.to, directions: b })
    // Markup that does not mention the provider leaves the page's in place.
    el.setAttribute('data-options', JSON.stringify({ ...trip, profile: 'walking', destinationName: 'Market Street' }))
    await settle()
    expect(asked).toEqual(['a:driving', 'a:walking', 'b:walking'])
    expect(nav.options.directions).toBe(b)
    expect(nav.options.destinationName).toBe('Market Street')

    unmount()
    root.remove()
  })
})
