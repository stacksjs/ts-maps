import type { StreetImage, StreetImageryProvider } from 'ts-maps'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { metresBetween, styles } from 'ts-maps'
import { LookAround, Map, Search } from '../src'

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

const tick = (): Promise<void> => new Promise(r => setTimeout(r, 20))

const roots: Array<{ root: ReturnType<typeof createRoot>, host: HTMLElement }> = []
afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
})

function mount(): { host: HTMLElement, root: ReturnType<typeof createRoot>, render: (props: Record<string, unknown>, search?: Record<string, unknown>) => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push({ root, host })
  return {
    host,
    root,
    render: (props, search) => act(() => {
      root.render(createElement(Map, { center: [48.8601, 2.3370], zoom: 17, containerStyle: { width: '430px', height: '800px' } },
        search && createElement(Search, { provider: null, offline: null, recents: false, details: null, saved: null, ...search }),
        createElement(LookAround, { provider, miniMap: false, ...props } as any)))
    }),
  }
}

describe('@ts-maps/react LookAround', () => {
  test('follows choosing and at, reports opening, and removes itself', async () => {
    const { host, root, render } = mount()
    const opened: string[] = []
    let control: any
    const handlers = { onOpen: (e: any) => opened.push(e.image.id), onReady: (c: any) => (control = c) }
    render(handlers)
    expect(host.querySelector('.tsmap-lookaround-button')).not.toBeNull()
    control._map.setStyle(styles.light({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf' }))

    render({ ...handlers, choosing: true })
    expect(control.choosing).toBe(true)
    expect(control._map.getStyle().sources['ts-maps-lookaround']).toBeDefined()

    await act(async () => {
      render({ ...handlers, choosing: true, at: [48.86012, 2.3370] })
      await tick()
    })
    expect(host.querySelector('.tsmap-lookaround')).not.toBeNull()
    expect(control.image.id).toBe('p1')
    expect(opened).toEqual(['p1'])

    act(() => root.unmount())
    roots.splice(0)
    expect(host.querySelector('.tsmap-lookaround')).toBeNull()
    expect(host.querySelector('.tsmap-lookaround-button')).toBeNull()
    host.remove()
  })

  test('is offered on a place card through Search', () => {
    const { render } = mount()
    let look: any
    let search: any
    const searchProps = { onReady: (c: any) => (search = c) }
    render({ onReady: (c: any) => (look = c) }, searchProps)
    render({}, { ...searchProps, lookAround: look })
    expect(search.options.lookAround).toBe(look)
  })
})
