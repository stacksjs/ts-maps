import { describe, expect, test } from 'bun:test'
import { createApp, h, nextTick, ref } from 'vue'
import { Map, OfflineMaps, Search, ZoomControl } from '../src'

const settle = async (): Promise<void> => {
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

const search = (props: Record<string, unknown> = {}): unknown => h(Search as any, { provider: null, offline: null, recents: false, details: null, ...props })

describe('@ts-maps/vue locale', () => {
  test('a map in German speaks German in its controls', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(Map as any, { center: [37.79, -122.4], zoom: 15, locale: 'de' }, () => [
        search(),
        h(ZoomControl as any, { position: 'topright' }),
        h(OfflineMaps as any, {}),
      ]),
    })
    app.mount(host)
    await settle()

    expect(host.querySelector('.tsmap-search-input')?.getAttribute('placeholder')).toBe('Karten durchsuchen')
    // The map's own zoom control, and one placed as a component.
    expect(host.querySelector('.tsmap-top.tsmap-left .tsmap-control-zoom-in')?.getAttribute('title')).toBe('Vergrößern')
    expect(host.querySelector('.tsmap-top.tsmap-right .tsmap-control-zoom-in')?.getAttribute('title')).toBe('Vergrößern')
    expect(host.querySelector('.tsmap-offline-button')?.getAttribute('title')).toBe('Karten offline')

    app.unmount()
    host.remove()
  })

  test('a control\'s own locale wins, and is followed as it changes', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const locale = ref('en')
    const mapLocale = ref('de')
    let map: any
    const app = createApp({
      render: () => h(Map as any, { center: [37.79, -122.4], zoom: 15, locale: mapLocale.value, onLoadMap: (m: unknown) => (map = m) }, () => [
        search({ locale: locale.value }),
        h(ZoomControl as any, { position: 'topright', locale: locale.value }),
      ]),
    })
    app.mount(host)
    await settle()
    const input = (): Element | null => host.querySelector('.tsmap-search-input')
    const zoomIn = (): Element | null => host.querySelector('.tsmap-top.tsmap-right .tsmap-control-zoom-in')
    expect(input()?.getAttribute('placeholder')).toBe('Search Maps')
    expect(zoomIn()?.getAttribute('title')).toBe('Zoom in')

    locale.value = 'de'
    await settle()
    expect(input()?.getAttribute('placeholder')).toBe('Karten durchsuchen')
    expect(zoomIn()?.getAttribute('title')).toBe('Vergrößern')

    // The map's is the one a control without its own falls back to.
    mapLocale.value = 'en'
    await settle()
    expect(map.options.locale).toBe('en')

    app.unmount()
    host.remove()
  })
})
