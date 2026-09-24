import { describe, expect, test } from 'bun:test'
import { TsMap } from 'ts-maps'
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
    const map = new TsMap(mapEl, { center: P(2, 0), zoom: 15 })

    // The provider is a live object markup cannot carry: the page swaps it in
    // on `turnbyturn:ready`, before the first routes are fetched.
    const options = JSON.stringify({ from: P(0, 0), to: P(5, 3), voice: false })
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="turn-by-turn" data-options='${options}'></span>`)

    let nav: any = null
    const seen: string[] = []
    root.addEventListener('turnbyturn:ready', (e: any) => {
      nav = e.detail.nav
      nav.options.directions = { name: 'fake', getDirections: async () => [route] }
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
})
