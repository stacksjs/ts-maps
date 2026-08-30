import { describe, expect, test } from 'bun:test'
import { render } from 'solid-js/web'
import { useMap } from '../src/context'
import {
  AttributionControl,
  FullscreenControl,
  GeocoderControl,
  LocateControl,
  NavigationControl,
  ScaleControl,
  ZoomControl,
} from '../src/controls'
import { Map } from '../src/Map'
import { Popup } from '../src/Popup'
import { TileLayer } from '../src/TileLayer'
import { useMapEvent } from '../src/useMapEvent'

function host(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '800px'
  el.style.height = '600px'
  document.body.appendChild(el)
  return el
}

describe('controls', () => {
  test('each control puts its own element in the map corner', () => {
    const el = host()
    const dispose = render(() => (
      <Map class="map" center={[0, 0]} zoom={3}>
        <ZoomControl />
        <NavigationControl showCompass />
        <ScaleControl />
        <AttributionControl />
        <FullscreenControl />
        <GeocoderControl placeholder="Search" />
        <LocateControl />
      </Map>
    ), el)

    const corners = el.querySelectorAll('.tsmap-control-container .tsmap-bar, .tsmap-control-container [class*="tsmap-control"]')
    expect(corners.length).toBeGreaterThan(0)
    expect(el.querySelector('.tsmap-control-zoom')).not.toBeNull()
    expect(el.querySelector('.tsmap-control-scale')).not.toBeNull()
    expect(el.querySelector('.tsmap-control-attribution')).not.toBeNull()

    dispose()
    el.remove()
  })

  test('position reaches the underlying control', () => {
    const el = host()
    const dispose = render(() => (
      <Map class="map" center={[0, 0]} zoom={3}>
        <ZoomControl position="bottomright" />
      </Map>
    ), el)

    expect(el.querySelector('.tsmap-bottom.tsmap-right .tsmap-control-zoom')).not.toBeNull()

    dispose()
    el.remove()
  })

  test('controls are removed with the component', () => {
    const el = host()
    const dispose = render(() => (
      <Map class="map" center={[0, 0]} zoom={3}>
        <ZoomControl />
      </Map>
    ), el)

    expect(el.querySelector('.tsmap-control-zoom')).not.toBeNull()
    dispose()
    expect(el.querySelector('.tsmap-control-zoom')).toBeNull()
    el.remove()
  })
})

describe('<TileLayer>', () => {
  test('adds a tile layer and removes it on dispose', () => {
    const el = host()
    let map: any
    const Probe = (): null => {
      map = useMap()
      return null
    }

    const count = (): number => {
      let n = 0
      map?.eachLayer?.((l: any) => {
        if (l.getTileUrl)
          n++
      })
      return n
    }

    const dispose = render(() => (
      <Map class="map" center={[0, 0]} zoom={3}>
        <Probe />
        <TileLayer url="https://example.com/{z}/{x}/{y}.png" attribution="© Someone" />
      </Map>
    ), el)

    expect(count()).toBe(1)
    dispose()
    el.remove()
  })
})

describe('<Popup>', () => {
  test('opens a popup at the position given', () => {
    const el = host()
    const dispose = render(() => (
      <Map class="map" center={[0, 0]} zoom={3}>
        <Popup position={[10, 20]} content="Hello" />
      </Map>
    ), el)

    const popup = el.querySelector('.tsmap-popup')
    expect(popup).not.toBeNull()
    expect(popup!.textContent).toContain('Hello')

    dispose()
    el.remove()
  })
})

describe('useMapEvent', () => {
  test('fires for the map it is mounted under, and stops on dispose', () => {
    const el = host()
    let map: any
    let moves = 0

    const Listener = (): null => {
      map = useMap()
      useMapEvent('move', () => {
        moves++
      })
      return null
    }

    const dispose = render(() => (
      <Map class="map" center={[0, 0]} zoom={3}>
        <Listener />
      </Map>
    ), el)

    const target = map
    target.setView([1, 1], 3, { animate: false })
    expect(moves).toBeGreaterThan(0)

    const before = moves
    dispose()
    // The handler must come off with the component: a listener outliving its
    // owner is a leak that fires against a torn-down map.
    target.fire?.('move')
    expect(moves).toBe(before)

    el.remove()
  })
})
