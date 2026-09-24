import { describe, expect, test } from 'bun:test'
import { TsMap } from 'ts-maps'
import { mountChildren } from '../src/runtime'

const place = { text: 'Ferry Building, The Embarcadero, San Francisco', center: { lat: 37.7955, lng: -122.3937 }, properties: { name: 'Ferry Building', osm_value: 'attraction' } }

describe('search child', () => {
  test('is built from markup, searches, reports through DOM events, and links to TurnByTurn', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const mapEl = document.createElement('div')
    mapEl.style.width = '430px'
    mapEl.style.height = '800px'
    root.appendChild(mapEl)
    const map = new TsMap(mapEl, { center: [37.79, -122.4], zoom: 15 })

    // Search written before TurnByTurn: they are linked all the same.
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="search" data-options='${JSON.stringify({ query: 'ferry', recents: false })}'></span>`)
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="turn-by-turn" data-options='${JSON.stringify({ voice: false })}'></span>`)

    let control: any = null
    let nav: any = null
    const seen: Array<[string, unknown]> = []
    root.addEventListener('search:ready', (e: any) => {
      control = e.detail.control
      // A live provider cannot come from markup: the page swaps it in.
      control.engine.provider = { name: 'fake', search: async () => [place], reverse: async () => [] }
      control.engine.offline = null
    })
    root.addEventListener('turnbyturn:ready', (e: any) => { nav = e.detail.nav })
    for (const name of ['results', 'select'])
      root.addEventListener(`search:${name}`, (e: any) => seen.push([name, name === 'results' ? e.detail.places.length : e.detail.place.name]))

    const unmount = mountChildren(map, root)
    await new Promise(r => setTimeout(r, 0))
    expect(control).not.toBeNull()
    expect(root.querySelector('.tsmap-search-input')).not.toBeNull()
    expect(seen).toContainEqual(['results', 1])
    expect(control.options.turnByTurn).toBe(nav)

    control.select(control.results[0])
    expect(seen).toContainEqual(['select', 'Ferry Building'])
    expect(root.querySelector('[data-action="directions"]')).not.toBeNull()

    unmount()
    expect(root.querySelector('.tsmap-search-input')).toBeNull()
    root.remove()
  })
})
