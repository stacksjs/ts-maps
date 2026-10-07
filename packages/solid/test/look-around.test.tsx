import type { StreetImage, StreetImageryProvider } from 'ts-maps'
import { describe, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { metresBetween, styles } from 'ts-maps'
import { LookAround } from '../src/LookAround'
import { Map } from '../src/Map'
import { Search } from '../src/Search'

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

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 20))

describe('@ts-maps/solid LookAround', () => {
  test('follows choosing and at, reports opening, links to search, and removes itself', async () => {
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const [choosing, setChoosing] = createSignal(false)
    const [at, setAt] = createSignal<[number, number] | undefined>(undefined)
    const [look, setLook] = createSignal<any>(null)
    const opened: string[] = []
    let search: any
    const dispose = render(() => (
      <Map class="map" center={[48.8601, 2.3370]} zoom={17}>
        <LookAround
          provider={provider}
          miniMap={false}
          choosing={choosing()}
          at={at()}
          onReady={c => setLook(c)}
          onOpen={e => opened.push(e.image.id)}
        />
        <Search provider={null} offline={null} recents={false} details={null} saved={null} lookAround={look()} onReady={(c) => { search = c }} />
      </Map>
    ), el)

    await settle()
    expect(el.querySelector('.tsmap-lookaround-button')).not.toBeNull()
    const control = look()
    expect(search.options.lookAround).toBe(control)
    control._map.setStyle(styles.light({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf' }))

    setChoosing(true)
    await settle()
    expect(control.choosing).toBe(true)
    expect(control._map.getStyle().sources['ts-maps-lookaround']).toBeDefined()

    setAt([48.86012, 2.3370])
    await settle()
    expect(el.querySelector('.tsmap-lookaround')).not.toBeNull()
    expect(control.image.id).toBe('p1')
    expect(opened).toEqual(['p1'])

    dispose()
    expect(el.querySelector('.tsmap-lookaround')).toBeNull()
    expect(el.querySelector('.tsmap-lookaround-button')).toBeNull()
    el.remove()
  })
})
