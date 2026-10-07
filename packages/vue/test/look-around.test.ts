import type { StreetImage, StreetImageryProvider } from 'ts-maps'
import { describe, expect, test } from 'bun:test'
import { metresBetween, styles } from 'ts-maps'
import { createApp, h, nextTick, ref, shallowRef } from 'vue'
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

const settle = async (): Promise<void> => {
  await nextTick()
  await new Promise(r => setTimeout(r, 20))
  await nextTick()
}

describe('@ts-maps/vue LookAround', () => {
  test('follows choosing and at, reports them for v-model, links to search, and removes itself', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const choosing = ref(false)
    const at = ref<[number, number] | undefined>(undefined)
    const look = shallowRef<any>(null)
    const opened: string[] = []
    const updates: unknown[] = []
    let search: any
    const app = createApp({
      render: () => h(Map as any, { containerClass: 'ts-map-host', center: [48.8601, 2.3370], zoom: 17 }, () => [
        h(LookAround as any, {
          provider,
          'miniMap': false,
          'choosing': choosing.value,
          'at': at.value,
          'onOpen': (e: any) => opened.push(e.image.id),
          'onUpdate:choosing': (v: boolean) => updates.push(v),
          'onReady': (c: any) => (look.value = c),
        }),
        h(Search as any, { provider: null, offline: null, recents: false, details: null, saved: null, lookAround: look.value, onReady: (c: any) => (search = c) }),
      ]),
    })
    app.mount(host)
    await settle()
    expect(host.querySelector('.tsmap-lookaround-button')).not.toBeNull()
    expect(search.options.lookAround).toBe(look.value)
    const control = look.value
    control._map.setStyle(styles.light({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf' }))

    choosing.value = true
    await settle()
    expect(control.choosing).toBe(true)
    expect(control._map.getStyle().sources['ts-maps-lookaround']).toBeDefined()

    at.value = [48.86012, 2.3370]
    await settle()
    expect(host.querySelector('.tsmap-lookaround')).not.toBeNull()
    expect(control.image.id).toBe('p1')
    expect(opened).toEqual(['p1'])
    // Opening ends choosing, reported for v-model.
    expect(updates).toEqual([true, false])

    app.unmount()
    expect(host.querySelector('.tsmap-lookaround')).toBeNull()
    expect(host.querySelector('.tsmap-lookaround-button')).toBeNull()
    host.remove()
  })
})
