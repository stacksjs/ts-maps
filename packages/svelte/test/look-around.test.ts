import type { StreetImage, StreetImageryProvider } from 'ts-maps'
import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'
import { metresBetween, styles } from 'ts-maps'

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

const settle = async (): Promise<void> => {
  flushSync()
  await new Promise(r => setTimeout(r, 20))
  flushSync()
}

describe('@ts-maps/svelte LookAround', () => {
  test('follows choosing and at, binds choosing back, reports opening, links to search, and removes itself', async () => {
    const WithLookAround = (await import('./fixtures/WithLookAround.svelte')).default
    const el = document.createElement('div')
    el.style.width = '430px'
    el.style.height = '800px'
    document.body.appendChild(el)
    const events: Array<[string, unknown]> = []
    const app = mount(WithLookAround, { target: el, props: { provider, events } }) as any

    await settle()
    expect(el.querySelector('.tsmap-lookaround-button')).not.toBeNull()
    const control = app.getControl()
    expect(app.getSearch().options.lookAround).toBe(control)
    control._map.setStyle(styles.light({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf' }))

    app.setChoosing(true)
    await settle()
    expect(control.choosing).toBe(true)
    expect(control._map.getStyle().sources['ts-maps-lookaround']).toBeDefined()

    app.setAt([48.86012, 2.3370])
    await settle()
    expect(el.querySelector('.tsmap-lookaround')).not.toBeNull()
    expect(control.image.id).toBe('p1')
    expect(events).toEqual([['open', 'p1']])
    // Opening ends choosing: the bound value follows.
    expect(app.state().choosing).toBe(false)

    unmount(app)
    flushSync()
    expect(el.querySelector('.tsmap-lookaround')).toBeNull()
    expect(el.querySelector('.tsmap-lookaround-button')).toBeNull()
    el.remove()
  })
})
