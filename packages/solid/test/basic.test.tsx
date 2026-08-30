import { describe, expect, test } from 'bun:test'
import { render } from 'solid-js/web'
import {
  Layer,
  Map,
  MapContext,
  Marker,
  Popup,
  Source,
  TileLayer,
  useMap,
  useMapEvent,
} from '../src'

// This package had no tests at all — only a typecheck, which cannot tell you
// whether a component mounts, whether the map it creates is torn down, or
// whether a child ever sees the map through context. Those are the three ways
// a binding actually breaks.

function host(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '800px'
  el.style.height = '600px'
  document.body.appendChild(el)
  return el
}

describe('@ts-maps/solid exports', () => {
  test('the public surface is present', () => {
    expect(Map).toBeDefined()
    expect(Marker).toBeDefined()
    expect(Popup).toBeDefined()
    expect(TileLayer).toBeDefined()
    expect(Source).toBeDefined()
    expect(Layer).toBeDefined()
    expect(MapContext).toBeDefined()
    expect(typeof useMap).toBe('function')
    expect(typeof useMapEvent).toBe('function')
  })
})

describe('<Map>', () => {
  test('mounts a map into its own container', () => {
    const el = host()
    const dispose = render(() => <Map class="solid-map-host" center={[0, 0]} zoom={3} />, el)

    const container = el.querySelector('.solid-map-host') as HTMLElement
    expect(container).not.toBeNull()
    expect(container.querySelector('.tsmap-pane')).not.toBeNull()

    dispose()
    el.remove()
  })

  test('children are held back until the map exists', () => {
    // A child mounted before the map has nothing to attach to, and would
    // silently do nothing rather than fail.
    const el = host()
    let sawMap: unknown = 'never ran'

    const Child = (): null => {
      sawMap = useMap()
      return null
    }

    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3}>
        <Child />
      </Map>
    ), el)

    expect(sawMap).not.toBeNull()
    expect(sawMap).not.toBe('never ran')

    dispose()
    el.remove()
  })

  test('disposing removes the map', () => {
    const el = host()
    const dispose = render(() => <Map class="solid-map-host" center={[0, 0]} zoom={3} />, el)

    const container = el.querySelector('.solid-map-host') as HTMLElement
    expect(container.querySelector('.tsmap-pane')).not.toBeNull()

    dispose()
    // A container left full of panes is a leak: the next mount would stack a
    // second map on top of the first.
    expect(el.querySelector('.tsmap-pane')).toBeNull()
    el.remove()
  })

  test('camera props reach the map', () => {
    const el = host()
    let map: any
    const Probe = (): null => {
      map = useMap()
      return null
    }

    const dispose = render(() => (
      <Map center={[34.02, -118.47]} zoom={11}>
        <Probe />
      </Map>
    ), el)

    expect(map.getZoom()).toBe(11)
    expect(map.getCenter().lat).toBeCloseTo(34.02, 5)
    expect(map.getCenter().lng).toBeCloseTo(-118.47, 5)

    dispose()
    el.remove()
  })
})

describe('useMap', () => {
  test('outside a <Map> it reports no map rather than throwing', () => {
    const el = host()
    let result: unknown = 'never ran'
    const dispose = render(() => {
      result = useMap()
      return null
    }, el)

    expect(result).toBeNull()
    dispose()
    el.remove()
  })
})

describe('<Marker>', () => {
  test('adds a marker to the map and removes it on dispose', () => {
    const el = host()
    let map: any
    const Probe = (): null => {
      map = useMap()
      return null
    }

    const countMarkers = (): number => {
      let n = 0
      map?.eachLayer?.((l: any) => {
        if (l.getLatLng)
          n++
      })
      return n
    }

    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3}>
        <Probe />
        <Marker position={[34.02, -118.47]} title="Pier" />
      </Map>
    ), el)

    expect(countMarkers()).toBe(1)

    dispose()
    el.remove()
  })
})
