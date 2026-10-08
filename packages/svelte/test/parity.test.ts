import { describe, expect, test } from 'bun:test'
import { flushSync, mount, unmount } from 'svelte'
import { divIcon } from 'ts-maps'
import WithParity from './fixtures/WithParity.svelte'

// What the React and Vue bindings already did and this one now does too: a
// map style as a prop, map events as props, camera props that are followed,
// a marker that moves and reports, and sources and layers that leave cleanly.

const light = { version: 8, name: 'one', sources: {}, layers: [{ id: 'bg-one', type: 'background', paint: { 'background-color': '#eeeeee' } }] }
const dark = { version: 8, name: 'two', sources: {}, layers: [{ id: 'bg-two', type: 'background', paint: { 'background-color': '#111111' } }] }

function host(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '800px'
  el.style.height = '600px'
  document.body.appendChild(el)
  return el
}

async function settle(): Promise<void> {
  flushSync()
  await new Promise(r => setTimeout(r, 0))
  flushSync()
}

function setup(props: Record<string, unknown>): { app: any, el: HTMLDivElement, map: () => any } {
  const el = host()
  let map: any = null
  const app = mount(WithParity, {
    target: el,
    props: { ...props, onmap: (m: unknown) => { map = m } },
  }) as any
  flushSync()
  return { app, el, map: () => map }
}

function teardown(app: any, el: HTMLDivElement): void {
  unmount(app)
  flushSync()
  el.remove()
}

describe('<Map> style', () => {
  test('the style prop sets the style, and a new one replaces it', async () => {
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3, style: light } })
    expect(map().getStyle().layers.map((l: any) => l.id)).toEqual(['bg-one'])

    app.setMap({ style: dark })
    await settle()
    expect(map().getStyle().layers.map((l: any) => l.id)).toEqual(['bg-two'])

    teardown(app, el)
  })

  test('the same style again is not set again', async () => {
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3, style: light } })
    let sets = 0
    const original = map().setStyle.bind(map())
    map().setStyle = (...args: any[]) => {
      sets++
      return original(...args)
    }

    app.setMap({ zoom: 4 })
    await settle()
    expect(sets).toBe(0)

    teardown(app, el)
  })

  test('class and containerStyle reach the container', () => {
    const { app, el } = setup({ mapProps: { center: [0, 0], zoom: 3, class: 'my-map', containerStyle: 'height: 320px' } })
    const container = el.querySelector('.ts-map') as HTMLElement
    expect(container.classList.contains('my-map')).toBe(true)
    expect(container.getAttribute('style')).toContain('height: 320px')
    teardown(app, el)
  })
})

describe('<Map> events', () => {
  test('onLoad hands over the map', () => {
    let received: unknown = null
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3, onLoad: (m: unknown) => { received = m } } })
    expect(received).toBe(map())
    teardown(app, el)
  })

  test('onLoadEvent hears load for a map already loaded', async () => {
    const loads: any[] = []
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3, onLoadEvent: (e: any) => loads.push(e) } })
    await settle()
    expect(loads.length).toBe(1)
    expect(loads[0].type).toBe('load')
    expect(loads[0].target).toBe(map())

    // Not again when another prop changes.
    app.setMap({ zoom: 5 })
    await settle()
    expect(loads.length).toBe(1)
    teardown(app, el)
  })

  test('onStyleLoad hears style.load for the style given at mount, and for the next', async () => {
    let styleLoads = 0
    const { app, el } = setup({ mapProps: { center: [0, 0], zoom: 3, style: light, onStyleLoad: () => { styleLoads++ } } })
    await settle()
    expect(styleLoads).toBe(1)

    app.setMap({ style: dark })
    await settle()
    expect(styleLoads).toBe(2)
    teardown(app, el)
  })

  test('map events reach their props, and the latest handler is the one called', async () => {
    const clicks: any[] = []
    let moveEnds = 0
    const { app, el, map } = setup({
      mapProps: { center: [0, 0], zoom: 3, onClick: (e: any) => clicks.push(['first', e]), onMoveEnd: () => { moveEnds++ } },
    })

    map().fire('click', { latlng: { lat: 1, lng: 2 } })
    expect(clicks.length).toBe(1)
    expect(clicks[0][1].latlng).toEqual({ lat: 1, lng: 2 })

    app.setMap({ onClick: (e: any) => clicks.push(['second', e]) })
    await settle()
    map().fire('click', {})
    expect(clicks.map(c => c[0])).toEqual(['first', 'second'])

    map().setView([10, 10], 4, { animate: false })
    expect(moveEnds).toBeGreaterThan(0)

    // A handler taken away takes its listener with it.
    app.setMap({ onClick: undefined })
    await settle()
    map().fire('click', {})
    expect(clicks.length).toBe(2)

    teardown(app, el)
  })

  test('listeners are taken off the map with the component', () => {
    let clicks = 0
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3, onClick: () => { clicks++ } } })
    const m = map()
    teardown(app, el)
    m.fire('click', {})
    expect(clicks).toBe(0)
  })
})

describe('<Map> camera', () => {
  test('center, zoom, bearing and pitch are followed', async () => {
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3 } })

    app.setMap({ center: [34.02, -118.47], zoom: 11 })
    await settle()
    expect(map().getZoom()).toBe(11)
    expect(map().getCenter().lat).toBeCloseTo(34.02, 3)
    expect(map().getCenter().lng).toBeCloseTo(-118.47, 3)

    app.setMap({ bearing: 30, pitch: 40 })
    await settle()
    expect(map().getBearing()).toBe(30)
    expect(map().getPitch()).toBe(40)

    teardown(app, el)
  })

  test('a camera the user moved stays put while the props stay the same', async () => {
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3 } })
    map().setView([20, 20], 6, { animate: false })

    app.setMap({ center: [0, 0], style: light })
    await settle()
    expect(map().getZoom()).toBe(6)

    teardown(app, el)
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

  test('follows position', async () => {
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3 }, withMarker: true })
    const marker = markerOf(map())
    expect(marker.getLatLng().lat).toBeCloseTo(34.02, 5)

    app.setMarkerPosition([40.758, -73.9855])
    await settle()
    expect(marker.getLatLng().lat).toBeCloseTo(40.758, 5)
    expect(marker.getLatLng().lng).toBeCloseTo(-73.9855, 5)

    teardown(app, el)
  })

  test('is draggable, reports click and dragend, and writes a drag back to bind:position', async () => {
    const clicks: any[] = []
    const drags: any[] = []
    const { app, el, map } = setup({
      mapProps: { center: [0, 0], zoom: 3 },
      withMarker: true,
      markerProps: { draggable: true, onClick: (e: any) => clicks.push(e), onDragEnd: (e: any) => drags.push(e) },
    })
    const marker = markerOf(map())
    expect(marker.dragging.enabled()).toBe(true)

    marker.fire('click', {})
    expect(clicks.length).toBe(1)

    // What a drag leaves behind: the marker somewhere new, then `dragend`.
    marker.setLatLng([12, 34])
    marker.fire('dragend', { distance: 10 })
    await settle()
    expect(drags.length).toBe(1)
    expect(app.getMarkerPosition()).toEqual([12, 34])

    teardown(app, el)
  })

  test('takes a custom icon through options', () => {
    const icon = divIcon({ className: 'custom-pin', html: '<b>x</b>' })
    const { app, el } = setup({ mapProps: { center: [0, 0], zoom: 3 }, withMarker: true, markerProps: { options: { icon } } })
    expect(el.querySelector('.custom-pin')).not.toBeNull()
    teardown(app, el)
  })
})

describe('<Source> and <Layer>', () => {
  test('mount, take spec objects or fields, honour before, and unmount cleanly', async () => {
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3, style: light }, withData: true })
    const m = map()
    expect(m.getSource('spec')).toEqual(expect.objectContaining({ type: 'geojson' }))
    expect(m.getSource('flat')).toEqual(expect.objectContaining({ type: 'geojson' }))
    const ids = m.getStyle().layers.map((l: any) => l.id)
    expect(ids).toContain('spec')
    expect(ids.indexOf('flat')).toBeLessThan(ids.indexOf('spec'))

    // Taken away while the map stays: everything they added goes. Under
    // Svelte 5 this threw, from getContext in onDestroy.
    expect(() => {
      app.setData(false)
      flushSync()
    }).not.toThrow()
    expect(m.getSource('spec')).toBeUndefined()
    expect(m.getSource('flat')).toBeUndefined()
    expect(m.getStyleLayer('spec')).toBeUndefined()
    expect(m.getStyleLayer('flat')).toBeUndefined()

    teardown(app, el)
  })

  test('unmounting the whole map with them in it does not throw', () => {
    const { app, el } = setup({ mapProps: { center: [0, 0], zoom: 3, style: light }, withData: true })
    expect(() => teardown(app, el)).not.toThrow()
  })
})

describe('controls, popups and tile layers', () => {
  test('a control takes its options as props, and moves when position changes', async () => {
    const { app, el } = setup({ mapProps: { center: [0, 0], zoom: 3 }, withExtras: true })
    const scale = (): HTMLElement => el.querySelector('.tsmap-control-scale') as HTMLElement
    // `imperial={false}`, given as a prop, leaves the metric line alone.
    expect(scale().children.length).toBe(1)
    expect(el.querySelector('.tsmap-bottom.tsmap-left .tsmap-control-scale')).not.toBeNull()

    app.setExtras({ scalePosition: 'topleft' })
    await settle()
    expect(el.querySelector('.tsmap-top.tsmap-left .tsmap-control-scale')).not.toBeNull()
    expect(el.querySelectorAll('.tsmap-control-scale').length).toBe(1)

    teardown(app, el)
  })

  test('a popup takes options and follows position and content', async () => {
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3 }, withExtras: true })
    let popup: any = null
    map().eachLayer((l: any) => {
      if (l.setContent && l.getContent)
        popup = l
    })
    expect(popup.options.className).toBe('extra-popup')
    expect(popup.getContent()).toBe('First')

    app.setExtras({ popupPosition: [1, 2], popupContent: 'Second' })
    await settle()
    expect(popup.getLatLng().lat).toBeCloseTo(1, 5)
    expect(popup.getContent()).toBe('Second')

    teardown(app, el)
  })

  test('a tile layer follows url', async () => {
    const { app, el, map } = setup({ mapProps: { center: [0, 0], zoom: 3 }, withExtras: true })
    let tiles: any = null
    map().eachLayer((l: any) => {
      if (l.setUrl && l._url)
        tiles = l
    })
    expect(tiles._url).toBe('https://a.test/{z}/{x}/{y}.png')

    app.setExtras({ tileUrl: 'https://b.test/{z}/{x}/{y}.png' })
    await settle()
    expect(tiles._url).toBe('https://b.test/{z}/{x}/{y}.png')

    teardown(app, el)
  })
})

describe('written as attributes', () => {
  test('style and class reach the map and its container', async () => {
    const WithStyle = (await import('./fixtures/WithStyle.svelte')).default
    const el = host()
    let map: any = null
    const app = mount(WithStyle, { target: el, props: { basemap: light, onmap: (m: unknown) => { map = m } } })
    flushSync()
    expect(map.getStyle().layers.map((l: any) => l.id)).toEqual(['bg-one'])
    expect(el.querySelector('.ts-map.written-out')).not.toBeNull()
    teardown(app, el)
  })
})
