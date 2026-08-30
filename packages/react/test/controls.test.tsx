import { afterEach, describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AttributionControl,
  FullscreenControl,
  GeocoderControl,
  LocateControl,
  Map,
  NavigationControl,
  ScaleControl,
  ZoomControl,
} from '../src'

/**
 * Controls used to be reachable only through `useMap()` and a hand-written
 * effect. These cover the declarative wrappers: that each one attaches to the
 * map, detaches when unmounted, and passes its props through.
 */

const roots: Array<{ root: ReturnType<typeof createRoot>, host: HTMLElement }> = []

function mount(children: React.ReactNode): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push({ root, host })

  act(() => {
    root.render(createElement(Map, {
      center: [34.02, -118.47],
      zoom: 12,
      containerStyle: { width: '400px', height: '300px' },
    }, children))
  })

  return host
}

function controlsIn(host: HTMLElement): Element[] {
  return [...host.querySelectorAll('.tsmap-control')]
}

afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
})

describe('@ts-maps/react controls', () => {
  test('every control is exported as a component', () => {
    for (const Control of [
      ZoomControl,
      NavigationControl,
      GeocoderControl,
      FullscreenControl,
      LocateControl,
      ScaleControl,
      AttributionControl,
    ])
      expect(typeof Control).toBe('function')
  })

  test('a control mounts into the map', () => {
    const host = mount(createElement(NavigationControl, { position: 'topright' }))
    const nav = host.querySelector('.tsmap-control-navigation')

    expect(nav).not.toBeNull()
    // Landed in the corner it asked for, not the default.
    expect(nav!.closest('.tsmap-top.tsmap-right')).not.toBeNull()
  })

  test('unmounting a control removes it from the map', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(createElement(Map, { center: [0, 0], zoom: 4 }, createElement(ScaleControl, {})))
    })
    expect(host.querySelector('.tsmap-control-scale')).not.toBeNull()

    act(() => {
      root.render(createElement(Map, { center: [0, 0], zoom: 4 }))
    })
    expect(host.querySelector('.tsmap-control-scale')).toBeNull()

    act(() => root.unmount())
    host.remove()
  })

  test('props reach the underlying control', () => {
    const host = mount(createElement(GeocoderControl, { placeholder: 'Find a place' }))
    const input = host.querySelector('.tsmap-control-geocoder-input') as HTMLInputElement

    expect(input).not.toBeNull()
    expect(input.placeholder).toBe('Find a place')
  })

  test('options passes through anything not named as a prop', () => {
    const host = mount(createElement(NavigationControl, { options: { showCompass: false } }))

    expect(host.querySelector('.tsmap-control-navigation')).not.toBeNull()
    expect(host.querySelector('.tsmap-compass-needle')).toBeNull()
  })

  test('several controls coexist', () => {
    const host = mount([
      createElement(NavigationControl, { key: 'nav', position: 'topright' }),
      createElement(ScaleControl, { key: 'scale', position: 'bottomleft' }),
      createElement(FullscreenControl, { key: 'fs', position: 'topright' }),
    ])

    expect(host.querySelector('.tsmap-control-navigation')).not.toBeNull()
    expect(host.querySelector('.tsmap-control-scale')).not.toBeNull()
    expect(host.querySelector('.tsmap-control-fullscreen')).not.toBeNull()
    expect(controlsIn(host).length).toBeGreaterThanOrEqual(3)
  })

  test('a re-render with the same position does not rebuild the control', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const render = (label: string): void => {
      act(() => {
        root.render(createElement(Map, { center: [0, 0], zoom: 4 }, createElement(GeocoderControl, {
          // A fresh object literal every render — the normal way to write this.
          options: { placeholder: label },
        })))
      })
    }

    render('one')
    const first = host.querySelector('.tsmap-control-geocoder')
    render('two')
    const second = host.querySelector('.tsmap-control-geocoder')

    // Same DOM node: the control was not torn down and rebuilt just because a
    // prop object had a new identity.
    expect(second).toBe(first)

    act(() => root.unmount())
    host.remove()
  })
})
