import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Map, OfflineMaps, Search, ZoomControl } from '../src'

const roots: Array<{ root: ReturnType<typeof createRoot>, host: HTMLElement }> = []
afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
})

function mount(): { host: HTMLElement, render: (mapProps: Record<string, unknown>, ...children: any[]) => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push({ root, host })
  return {
    host,
    render: (mapProps, ...children) => act(() => {
      root.render(createElement(Map, { center: [37.79, -122.40], zoom: 15, containerStyle: { width: '430px', height: '800px' }, ...mapProps }, ...children))
    }),
  }
}

const search = (props: Record<string, unknown> = {}): any => createElement(Search, { key: 'search', provider: null, offline: null, recents: false, details: null, ...props })

describe('@ts-maps/react locale', () => {
  test('a map in German speaks German in its controls', () => {
    const { host, render } = mount()
    render({ locale: 'de' }, search(), createElement(ZoomControl, { key: 'zoom', position: 'topright' }), createElement(OfflineMaps, { key: 'offline' }))

    expect(host.querySelector('.tsmap-search-input')?.getAttribute('placeholder')).toBe('Karten durchsuchen')
    // The map's own zoom control, and one placed as a component.
    expect(host.querySelector('.tsmap-top.tsmap-left .tsmap-control-zoom-in')?.getAttribute('title')).toBe('Vergrößern')
    expect(host.querySelector('.tsmap-top.tsmap-right .tsmap-control-zoom-in')?.getAttribute('title')).toBe('Vergrößern')
    expect(host.querySelector('.tsmap-offline-button')?.getAttribute('title')).toBe('Karten offline')
  })

  test('a control\'s own locale wins, and is followed as it changes', () => {
    const { host, render } = mount()
    render({ locale: 'de' }, search({ locale: 'en' }), createElement(ZoomControl, { key: 'zoom', locale: 'en', position: 'topright' }))
    const input = (): Element | null => host.querySelector('.tsmap-search-input')
    const zoomIn = (): Element | null => host.querySelector('.tsmap-top.tsmap-right .tsmap-control-zoom-in')
    expect(input()?.getAttribute('placeholder')).toBe('Search Maps')
    expect(zoomIn()?.getAttribute('title')).toBe('Zoom in')

    render({ locale: 'de' }, search({ locale: 'de' }), createElement(ZoomControl, { key: 'zoom', locale: 'de', position: 'topright' }))
    expect(input()?.getAttribute('placeholder')).toBe('Karten durchsuchen')
    expect(zoomIn()?.getAttribute('title')).toBe('Vergrößern')
  })

  test('a changed map locale is the one controls fall back to', () => {
    const { render } = mount()
    let map: any
    const onLoad = (m: unknown): void => { map = m }
    render({ locale: 'en', onLoad })
    expect(map.options.locale).toBe('en')
    render({ locale: 'de', onLoad })
    expect(map.options.locale).toBe('de')
  })
})
