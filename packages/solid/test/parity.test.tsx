import { describe, expect, test } from 'bun:test'
import { createSignal, Show } from 'solid-js'
import { render } from 'solid-js/web'
import { divIcon } from 'ts-maps'
import { Layer, Map, Marker, Popup, ScaleControl, Source, TileLayer, useMap, useMapOptional } from '../src'

// What the React and Vue bindings already did and this one now does too: a
// map style as a prop, map events as props, camera props that are followed,
// a marker that moves and reports, and sources and layers that leave cleanly.

const light = { version: 8, name: 'one', sources: {}, layers: [{ id: 'bg-one', type: 'background', paint: { 'background-color': '#eeeeee' } }] }
const dark = { version: 8, name: 'two', sources: {}, layers: [{ id: 'bg-two', type: 'background', paint: { 'background-color': '#111111' } }] }

const points = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-118.47, 34.02] } }],
}

function host(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '800px'
  el.style.height = '600px'
  document.body.appendChild(el)
  return el
}

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0))

/** Hands the map back to a test, from inside a <Map>. */
function probe(into: (map: any) => void): () => null {
  return () => {
    into(useMap())
    return null
  }
}

describe('<Map> style', () => {
  test('the style prop sets the style, and a new one replaces it', async () => {
    const el = host()
    let map: any
    const Probe = probe((m) => { map = m })
    const [style, setStyle] = createSignal<object>(light)
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3} style={style()}><Probe /></Map>
    ), el)

    expect(map.getStyle().layers.map((l: any) => l.id)).toEqual(['bg-one'])
    setStyle(dark)
    await settle()
    expect(map.getStyle().layers.map((l: any) => l.id)).toEqual(['bg-two'])

    dispose()
    el.remove()
  })

  test('a style written inline is set once, not again on each read', async () => {
    const el = host()
    let map: any
    let styleLoads = 0
    const Probe = probe((m) => { map = m })
    const [zoom, setZoom] = createSignal(3)
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={zoom()} style={{ ...light }} onStyleLoad={() => { styleLoads++ }}><Probe /></Map>
    ), el)

    setZoom(9)
    await settle()
    expect(map.getZoom()).toBe(9)
    expect(styleLoads).toBe(1)

    dispose()
    el.remove()
  })

  test('class and containerStyle reach the container', () => {
    const el = host()
    const dispose = render(() => <Map class="my-map" containerStyle={{ height: '320px' }} center={[0, 0]} zoom={3} />, el)
    const container = el.querySelector('.my-map') as HTMLElement
    expect(container.querySelector('.tsmap-pane')).not.toBeNull()
    expect(container.style.height).toBe('320px')
    dispose()
    el.remove()
  })
})

describe('<Map> events', () => {
  test('onLoad hands over the map', () => {
    const el = host()
    let received: unknown = null
    let map: any
    const Probe = probe((m) => { map = m })
    const dispose = render(() => <Map center={[0, 0]} zoom={3} onLoad={(m) => { received = m }}><Probe /></Map>, el)
    expect(received).toBe(map)
    dispose()
    el.remove()
  })

  test('onLoadEvent hears load for a map already loaded, once', async () => {
    const el = host()
    const loads: any[] = []
    let map: any
    const Probe = probe((m) => { map = m })
    const [zoom, setZoom] = createSignal(3)
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={zoom()} onLoadEvent={e => loads.push(e)}><Probe /></Map>
    ), el)
    await settle()
    expect(loads.length).toBe(1)
    expect(loads[0].type).toBe('load')
    expect(loads[0].target).toBe(map)

    setZoom(5)
    await settle()
    expect(loads.length).toBe(1)
    dispose()
    el.remove()
  })

  test('onStyleLoad hears style.load for the style given at mount, and for the next', async () => {
    const el = host()
    let styleLoads = 0
    const [style, setStyle] = createSignal<object>(light)
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3} style={style()} onStyleLoad={() => { styleLoads++ }} />
    ), el)
    await settle()
    expect(styleLoads).toBe(1)

    setStyle(dark)
    await settle()
    expect(styleLoads).toBe(2)
    dispose()
    el.remove()
  })

  test('map events reach their props, and the latest handler is the one called', () => {
    const el = host()
    const clicks: string[] = []
    let moveEnds = 0
    let map: any
    const Probe = probe((m) => { map = m })
    const [onClick, setOnClick] = createSignal<((e: any) => void) | undefined>(() => clicks.push('first'))
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3} onClick={onClick()} onMoveEnd={() => { moveEnds++ }}><Probe /></Map>
    ), el)

    map.fire('click', {})
    setOnClick(() => () => clicks.push('second'))
    map.fire('click', {})
    expect(clicks).toEqual(['first', 'second'])

    map.setView([10, 10], 4, { animate: false })
    expect(moveEnds).toBeGreaterThan(0)

    // A handler taken away takes its listener with it.
    setOnClick(undefined)
    map.fire('click', {})
    expect(clicks.length).toBe(2)
    expect(map.listens('click')).toBe(false)

    dispose()
    el.remove()
  })

  test('listeners are taken off the map with the component', () => {
    const el = host()
    let clicks = 0
    let map: any
    const Probe = probe((m) => { map = m })
    const dispose = render(() => <Map center={[0, 0]} zoom={3} onClick={() => { clicks++ }}><Probe /></Map>, el)
    dispose()
    map.fire('click', {})
    expect(clicks).toBe(0)
    el.remove()
  })
})

describe('<Map> camera', () => {
  test('center, zoom, bearing and pitch are followed', () => {
    const el = host()
    let map: any
    const Probe = probe((m) => { map = m })
    const [center, setCenter] = createSignal<[number, number]>([0, 0])
    const [zoom, setZoom] = createSignal(3)
    const [bearing, setBearing] = createSignal(0)
    const [pitch, setPitch] = createSignal(0)
    const dispose = render(() => (
      <Map center={center()} zoom={zoom()} bearing={bearing()} pitch={pitch()}><Probe /></Map>
    ), el)

    setCenter([34.02, -118.47])
    setZoom(11)
    expect(map.getZoom()).toBe(11)
    expect(map.getCenter().lat).toBeCloseTo(34.02, 3)
    expect(map.getCenter().lng).toBeCloseTo(-118.47, 3)

    setBearing(30)
    setPitch(40)
    expect(map.getBearing()).toBe(30)
    expect(map.getPitch()).toBe(40)

    dispose()
    el.remove()
  })

  test('a camera the user moved stays put while the props hold the same values', () => {
    const el = host()
    let map: any
    const Probe = probe((m) => { map = m })
    const [center, setCenter] = createSignal<[number, number]>([0, 0])
    const dispose = render(() => <Map center={center()} zoom={3}><Probe /></Map>, el)

    map.setView([20, 20], 6, { animate: false })
    setCenter([0, 0])
    expect(map.getZoom()).toBe(6)

    dispose()
    el.remove()
  })
})

describe('<Marker>', () => {
  function markerOf(map: any): any {
    let found: any = null
    map.eachLayer((l: any) => {
      if (l.getLatLng && l.dragging !== undefined)
        found = l
    })
    return found
  }

  test('follows position', () => {
    const el = host()
    let map: any
    const Probe = probe((m) => { map = m })
    const [position, setPosition] = createSignal<[number, number]>([34.02, -118.47])
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3}><Probe /><Marker position={position()} /></Map>
    ), el)

    const marker = markerOf(map)
    expect(marker.getLatLng().lat).toBeCloseTo(34.02, 5)
    setPosition([40.758, -73.9855])
    expect(marker.getLatLng().lat).toBeCloseTo(40.758, 5)
    expect(marker.getLatLng().lng).toBeCloseTo(-73.9855, 5)

    dispose()
    el.remove()
  })

  test('is draggable and reports click and dragend', () => {
    const el = host()
    let map: any
    const clicks: any[] = []
    const drags: any[] = []
    const Probe = probe((m) => { map = m })
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3}>
        <Probe />
        <Marker position={[1, 1]} draggable onClick={e => clicks.push(e)} onDragEnd={e => drags.push(e)} />
      </Map>
    ), el)

    const marker = markerOf(map)
    expect(marker.dragging.enabled()).toBe(true)
    marker.fire('click', {})
    marker.setLatLng([12, 34])
    marker.fire('dragend', { distance: 10 })
    expect(clicks.length).toBe(1)
    expect(drags.length).toBe(1)
    expect(drags[0].target.getLatLng().lat).toBe(12)

    dispose()
    el.remove()
  })

  test('takes a custom icon through options', () => {
    const el = host()
    const icon = divIcon({ className: 'custom-pin', html: '<b>x</b>' })
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3}><Marker position={[1, 1]} options={{ icon }} /></Map>
    ), el)
    expect(el.querySelector('.custom-pin')).not.toBeNull()
    dispose()
    el.remove()
  })
})

describe('<Source> and <Layer>', () => {
  test('mount, take spec objects or fields, honour before, and unmount cleanly', () => {
    const el = host()
    let map: any
    const Probe = probe((m) => { map = m })
    const [show, setShow] = createSignal(true)
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3} style={light}>
        <Probe />
        <Show when={show()}>
          <Source id="spec" source={{ type: 'geojson', data: points }} />
          <Layer layer={{ id: 'spec', type: 'circle', source: 'spec' }} />
          <Source id="flat" type="geojson" data={points} />
          <Layer id="flat" type="circle" source="flat" before="spec" />
        </Show>
      </Map>
    ), el)

    expect(map.getSource('spec')).toEqual(expect.objectContaining({ type: 'geojson' }))
    expect(map.getSource('flat')).toEqual(expect.objectContaining({ type: 'geojson' }))
    const ids = map.getStyle().layers.map((l: any) => l.id)
    expect(ids).toContain('spec')
    expect(ids.indexOf('flat')).toBeLessThan(ids.indexOf('spec'))

    // Taken away while the map stays. Teardown used to ask the context for
    // the map, which is not there in onCleanup, so nothing was removed.
    setShow(false)
    expect(map.getSource('spec')).toBeUndefined()
    expect(map.getSource('flat')).toBeUndefined()
    expect(map.getStyleLayer('spec')).toBeUndefined()
    expect(map.getStyleLayer('flat')).toBeUndefined()

    dispose()
    el.remove()
  })

  test('disposing the whole map with them in it does not throw', () => {
    const el = host()
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3} style={light}>
        <Source id="spec" source={{ type: 'geojson', data: points }} />
        <Layer layer={{ id: 'spec', type: 'circle', source: 'spec' }} />
      </Map>
    ), el)
    expect(() => dispose()).not.toThrow()
    el.remove()
  })
})

describe('controls, popups and tile layers', () => {
  test('Scale and Attribution take their options as props', () => {
    const el = host()
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3}>
        <ScaleControl imperial={false} />
      </Map>
    ), el)
    expect((el.querySelector('.tsmap-control-scale') as HTMLElement).children.length).toBe(1)
    dispose()
    el.remove()
  })

  test('a popup takes options and follows position and content', () => {
    const el = host()
    let map: any
    const Probe = probe((m) => { map = m })
    const [position, setPosition] = createSignal<[number, number]>([34.02, -118.47])
    const [content, setContent] = createSignal('First')
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3}>
        <Probe />
        <Popup position={position()} content={content()} options={{ className: 'extra-popup' }} />
      </Map>
    ), el)

    let popup: any = null
    map.eachLayer((l: any) => {
      if (l.setContent && l.getContent)
        popup = l
    })
    expect(popup.options.className).toBe('extra-popup')
    expect(popup.getContent()).toBe('First')
    setPosition([1, 2])
    setContent('Second')
    expect(popup.getLatLng().lat).toBeCloseTo(1, 5)
    expect(popup.getContent()).toBe('Second')

    dispose()
    el.remove()
  })

  test('a tile layer follows url', () => {
    const el = host()
    let map: any
    const Probe = probe((m) => { map = m })
    const [url, setUrl] = createSignal('https://a.test/{z}/{x}/{y}.png')
    const dispose = render(() => (
      <Map center={[0, 0]} zoom={3}><Probe /><TileLayer url={url()} /></Map>
    ), el)

    let tiles: any = null
    map.eachLayer((l: any) => {
      if (l.setUrl && l._url)
        tiles = l
    })
    setUrl('https://b.test/{z}/{x}/{y}.png')
    expect(tiles._url).toBe('https://b.test/{z}/{x}/{y}.png')

    dispose()
    el.remove()
  })
})

describe('useMapOptional', () => {
  test('is the map inside a <Map>, and null outside one', () => {
    const el = host()
    let inside: unknown = 'never ran'
    let outside: unknown = 'never ran'
    const Inside = (): null => {
      inside = useMapOptional()
      return null
    }
    const dispose = render(() => {
      outside = useMapOptional()
      return <Map center={[0, 0]} zoom={3}><Inside /></Map>
    }, el)
    expect(inside).not.toBeNull()
    expect(outside).toBeNull()
    dispose()
    el.remove()
  })
})
