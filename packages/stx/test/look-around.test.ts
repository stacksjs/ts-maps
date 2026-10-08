import type { StreetImage, StreetImageryProvider } from 'ts-maps'
import { afterEach, describe, expect, test } from 'bun:test'
import { Map as MapInstance, metresBetween, styles } from 'ts-maps'
import { mountChildren } from '../src/runtime'

// A street running north from the Louvre, a picture every ~10 m.
const STREET: StreetImage[] = [0, 1, 2, 3].map(i => ({
  id: `p${i}`,
  provider: 'test',
  lat: 48.8600 + i * 0.00009,
  lng: 2.3370,
  heading: 0,
  fov: 360,
  url: `https://img.test/p${i}.jpg`,
}))

const provider: StreetImageryProvider = {
  name: 'test',
  attribution: '© test',
  async near(at, options = {}) {
    const p = Array.isArray(at) ? { lat: at[0], lng: at[1] } : at as { lat: number, lng: number }
    return STREET
      .filter(i => metresBetween(p, i) <= (options.radius ?? 50))
      .sort((a, b) => metresBetween(p, a) - metresBetween(p, b))
      .slice(0, options.limit ?? 20)
  },
  async get(id) {
    return STREET.find(i => i.id === id)
  },
  coverage: () => ({ tiles: 'https://cover.test/{z}/{x}/{y}.mvt', minzoom: 0, maxzoom: 15, lines: 'sequences', points: 'pictures' }),
}

afterEach(() => {
  document.body.replaceChildren()
})

const tick = (): Promise<void> => new Promise(r => setTimeout(r, 20))

describe('look-around child', () => {
  test('is built from plain options, follows choosing and at, reports through DOM events, and links to Search', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const mapEl = document.createElement('div')
    mapEl.style.width = '430px'
    mapEl.style.height = '800px'
    root.appendChild(mapEl)
    const map = new MapInstance(mapEl, { center: [48.8601, 2.3370], zoom: 17 })
    map.setStyle(styles.light({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf' }))

    // LookAround written before Search: they are linked all the same.
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="look-around" data-options='${JSON.stringify({ miniMap: false })}'></span>`)
    root.insertAdjacentHTML('beforeend', `<span hidden data-ts-map-child="search" data-options='${JSON.stringify({ recents: false })}'></span>`)
    const el = root.querySelector('[data-ts-map-child="look-around"]')!

    let control: any = null
    let search: any = null
    const opened: string[] = []
    root.addEventListener('lookaround:ready', (e: any) => {
      control = e.detail.control
      // A live provider cannot come from markup: the page hands it over.
      control.sync({ provider })
    })
    root.addEventListener('search:ready', (e: any) => { search = e.detail.control })
    root.addEventListener('lookaround:open', (e: any) => opened.push(e.detail.image.id))

    const unmount = mountChildren(map, root)
    expect(control).not.toBeNull()
    expect(control.provider.name).toBe('test')
    expect(root.querySelector('.tsmap-lookaround-button')).not.toBeNull()
    expect(search.options.lookAround).toBe(control)

    el.setAttribute('data-options', JSON.stringify({ miniMap: false, choosing: true }))
    await tick()
    expect(control.choosing).toBe(true)
    expect(map.getStyle()!.sources['ts-maps-lookaround']).toBeDefined()
    // The provider the page handed over stays.
    expect(control.provider).toBe(provider)

    el.setAttribute('data-options', JSON.stringify({ miniMap: false, choosing: true, at: [48.86012, 2.3370] }))
    await tick()
    await tick()
    expect(root.querySelector('.tsmap-lookaround')).not.toBeNull()
    expect(control.image.id).toBe('p1')
    expect(opened).toEqual(['p1'])

    // A named provider is built in the browser.
    el.setAttribute('data-options', JSON.stringify({ miniMap: false, provider: 'mapillary', accessToken: 'MLY|1|abc', at: null }))
    await tick()
    expect(control.provider.name).toBe('mapillary')
    expect(root.querySelector('.tsmap-lookaround')).toBeNull()

    unmount()
    expect(root.querySelector('.tsmap-lookaround-button')).toBeNull()
    root.remove()
  })
})
