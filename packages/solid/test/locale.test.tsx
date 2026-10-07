import { describe, expect, test } from 'bun:test'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { Map, OfflineMaps, Search, ZoomControl } from '../src'

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0))

describe('@ts-maps/solid locale', () => {
  test('a map in German speaks German in its controls', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const dispose = render(() => (
      <Map center={[37.79, -122.4]} zoom={15} locale="de">
        <Search provider={null} offline={null} recents={false} details={null} />
        <ZoomControl position="topright" />
        <OfflineMaps />
      </Map>
    ), el)
    await settle()

    expect(el.querySelector('.tsmap-search-input')?.getAttribute('placeholder')).toBe('Karten durchsuchen')
    // The map's own zoom control, and one placed as a component.
    expect(el.querySelector('.tsmap-top.tsmap-left .tsmap-control-zoom-in')?.getAttribute('title')).toBe('Vergrößern')
    expect(el.querySelector('.tsmap-top.tsmap-right .tsmap-control-zoom-in')?.getAttribute('title')).toBe('Vergrößern')
    expect(el.querySelector('.tsmap-offline-button')?.getAttribute('title')).toBe('Karten offline')

    dispose()
    el.remove()
  })

  test('a control\'s own locale wins, and is followed as it changes', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const [locale, setLocale] = createSignal('en')
    const dispose = render(() => (
      <Map center={[37.79, -122.4]} zoom={15} locale="de">
        <Search provider={null} offline={null} recents={false} details={null} locale={locale()} />
        <ZoomControl position="topright" locale={locale()} />
      </Map>
    ), el)
    await settle()
    const input = (): Element | null => el.querySelector('.tsmap-search-input')
    const zoomIn = (): Element | null => el.querySelector('.tsmap-top.tsmap-right .tsmap-control-zoom-in')
    expect(input()?.getAttribute('placeholder')).toBe('Search Maps')
    expect(zoomIn()?.getAttribute('title')).toBe('Zoom in')

    setLocale('de')
    await settle()
    expect(input()?.getAttribute('placeholder')).toBe('Karten durchsuchen')
    expect(zoomIn()?.getAttribute('title')).toBe('Vergrößern')

    dispose()
    el.remove()
  })
})
