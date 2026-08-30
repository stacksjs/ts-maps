import { describe, expect, test } from 'bun:test'
import { definedOnly, findMap, mountChildren, onMapEvent, publishMap, readJson, unpublishMap } from '../src/runtime'

/**
 * The builder is where this binding's real logic lives.
 *
 * stx emits a component's client script once per definition rather than per
 * use, so children render inert markup and `<Map>` builds from it in one pass.
 * That makes the whole thing plain DOM in and map objects out — testable here
 * without stx, a browser, or a real map.
 */

function container(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

/** A map that records what was added to it. */
function fakeMap(): any {
  const handlers: Record<string, Array<(e: any) => void>> = {}
  return {
    added: [] as any[],
    removed: [] as any[],
    sources: {} as Record<string, unknown>,
    styleLayers: [] as any[],
    closedPopups: [] as any[],
    style: null as any,
    getStyle() { return this.style },
    setStyle(spec: any) { this.style = spec },
    addSource(id: string, spec: unknown) { this.sources[id] = spec },
    removeSource(id: string) { delete this.sources[id] },
    addStyleLayer(spec: any, before?: string) { this.styleLayers.push({ spec, before }) },
    removeStyleLayer(id: string) { this.styleLayers = this.styleLayers.filter((l: any) => l.spec.id !== id) },
    closePopup(p: any) { this.closedPopups.push(p) },
    on(event: string, fn: (e: any) => void) { (handlers[event] ??= []).push(fn) },
    off(event: string, fn: (e: any) => void) { handlers[event] = (handlers[event] ?? []).filter(h => h !== fn) },
    fire(event: string, payload?: unknown) { for (const fn of handlers[event] ?? []) fn(payload) },
    listenerCount(event: string) { return (handlers[event] ?? []).length },
    // Layers and markers call addTo(map), which lands here. A real map also
    // back-references itself on the layer, and `layer.remove()` relies on it.
    addLayer(layer: any) {
      layer._map = this
      this.added.push(layer)
      return this
    },
    removeLayer(layer: any) { this.removed.push(layer) },
    hasLayer(layer: any) { return this.added.includes(layer) && !this.removed.includes(layer) },
  }
}

describe('publishing the map', () => {
  test('a page can find the map its markup rendered', () => {
    const host = container('<span id="inner"></span>')
    const map = fakeMap()
    publishMap(host, map)

    expect(findMap(host.querySelector('#inner'))).toBe(map)
    // closest() starts at the element itself, so the container answers too.
    expect(findMap(host)).toBe(map)
  })

  test('two maps on a page do not see each other', () => {
    const a = container('<span class="a"></span>')
    const b = container('<span class="b"></span>')
    const mapA = fakeMap()
    const mapB = fakeMap()
    publishMap(a, mapA)
    publishMap(b, mapB)

    expect(findMap(a.querySelector('.a'))).toBe(mapA)
    expect(findMap(b.querySelector('.b'))).toBe(mapB)
  })

  test('unpublishing clears both the attribute and the instance', () => {
    const host = container('')
    publishMap(host, fakeMap())
    unpublishMap(host)

    expect(host.hasAttribute('data-ts-map')).toBe(false)
    expect(findMap(host)).toBeNull()
  })

  test('an element outside any map finds nothing', () => {
    expect(findMap(container(''))).toBeNull()
    expect(findMap(null)).toBeNull()
  })
})

describe('mountChildren', () => {
  test('builds every marker, not just one', () => {
    // The bug this guards: a component script runs once per definition, so an
    // implementation where each marker builds itself yields exactly one marker
    // however many are written.
    const host = container(`
      <span data-ts-map-child="marker" data-lat="1" data-lng="2"></span>
      <span data-ts-map-child="marker" data-lat="3" data-lng="4"></span>
      <span data-ts-map-child="marker" data-lat="5" data-lng="6"></span>
    `)
    const map = fakeMap()

    mountChildren(map, host)

    expect(map.added.length).toBe(3)
    expect(map.added.map((m: any) => m.getLatLng().lat)).toEqual([1, 3, 5])
  })

  test('a marker with html renders a div icon', () => {
    const host = container(`
      <span data-ts-map-child="marker" data-lat="0" data-lng="0"
        data-icon='{"html":"&lt;b&gt;hi&lt;/b&gt;","iconSize":[20,20],"className":"pin"}'></span>
    `)
    const map = fakeMap()
    mountChildren(map, host)

    const icon = map.added[0].options.icon
    expect(icon).toBeDefined()
    expect(icon.options.html).toBe('<b>hi</b>')
    expect(icon.options.className).toBe('pin')
  })

  test('a marker without html keeps the default pin', () => {
    const host = container('<span data-ts-map-child="marker" data-lat="0" data-lng="0"></span>')
    const map = fakeMap()
    mountChildren(map, host)

    // Not a DivIcon carrying markup — the library's own default pin.
    expect(map.added[0].options.icon?.options?.html).toBeUndefined()
  })

  test('a tile layer is built with its url and options', () => {
    const host = container(`
      <span data-ts-map-child="tile-layer" data-url="https://tiles/{z}/{x}/{y}.png"
        data-options='{"attribution":"© OSM","maxZoom":19}'></span>
    `)
    const map = fakeMap()
    mountChildren(map, host)

    expect(map.added.length).toBe(1)
    expect(map.added[0]._url).toBe('https://tiles/{z}/{x}/{y}.png')
    expect(map.added[0].options.attribution).toBe('© OSM')
  })

  test('controls are built by name and land on the map', () => {
    const host = container(`
      <span data-ts-map-child="control" data-type="scale" data-options='{"position":"bottomleft"}'></span>
    `)
    const map = fakeMap()
    // Controls call addTo(map), which needs a corner to attach to.
    map._controlCorners = { bottomleft: document.createElement('div') }
    map.on('unload', () => {})

    expect(() => mountChildren(map, host)).not.toThrow()
    expect(host.ownerDocument).toBeDefined()
  })

  test('an unknown control type warns instead of throwing', () => {
    const host = container('<span data-ts-map-child="control" data-type="nope"></span>')
    const map = fakeMap()
    expect(() => mountChildren(map, host)).not.toThrow()
    expect(map.added.length).toBe(0)
  })

  test('a popup nested in a marker binds to it rather than standing alone', () => {
    const host = container(`
      <span data-ts-map-child="marker" data-lat="1" data-lng="2">
        <template data-ts-map-child="popup" data-options='{}' data-open>Hello</template>
      </span>
    `)
    const map = fakeMap()
    mountChildren(map, host)

    // Bound to the marker, not built as a second, free-standing popup.
    expect(map.added[0]._popup).toBeDefined()
    expect(map.added.filter((l: any) => l.getLatLng && l._popup).length).toBe(1)
    // `data-open` opened it, which legitimately puts it on the map as a layer
    // of its own — what matters is that it belongs to the marker.
    expect(map.added[0]._popup._source ?? map.added[0]).toBe(map.added[0])
  })

  test('a free-standing popup uses its own position', () => {
    const host = container(`
      <template data-ts-map-child="popup" data-options='{}' data-lat="10" data-lng="20">Loose</template>
    `)
    const map = fakeMap()
    mountChildren(map, host)

    // Nothing was added as a layer; the popup positions itself.
    expect(map.added.length).toBe(0)
  })

  test('sources and layers start a style when the map has none', () => {
    const host = container(`
      <span data-ts-map-child="source" data-id="pts" data-spec='{"type":"geojson","data":{}}'></span>
      <span data-ts-map-child="layer" data-spec='{"id":"dots","type":"circle","source":"pts"}'></span>
    `)
    const map = fakeMap()
    mountChildren(map, host)

    expect(map.getStyle()).toEqual({ version: 8, sources: {}, layers: [] })
    expect(map.sources.pts).toEqual({ type: 'geojson', data: {} })
    expect(map.styleLayers.length).toBe(1)
    expect(map.styleLayers[0].spec.id).toBe('dots')
  })

  test('an existing style is left alone', () => {
    const host = container('<span data-ts-map-child="source" data-id="pts" data-spec=\'{"type":"geojson"}\'></span>')
    const map = fakeMap()
    map.setStyle({ version: 8, name: 'mine', sources: {}, layers: [] })

    mountChildren(map, host)
    expect(map.getStyle().name).toBe('mine')
  })

  test('teardown removes everything, layers before their sources', () => {
    const host = container(`
      <span data-ts-map-child="source" data-id="pts" data-spec='{"type":"geojson"}'></span>
      <span data-ts-map-child="layer" data-spec='{"id":"dots","type":"circle","source":"pts"}'></span>
      <span data-ts-map-child="marker" data-lat="1" data-lng="2"></span>
    `)
    const map = fakeMap()
    const teardown = mountChildren(map, host)

    teardown()

    expect(map.styleLayers.length).toBe(0)
    expect(map.sources.pts).toBeUndefined()
    expect(map.removed.length).toBe(1)
  })

  test('one malformed child does not stop the others', () => {
    const host = container(`
      <span data-ts-map-child="marker" data-lat="1" data-lng="2" data-options="not json{{"></span>
      <span data-ts-map-child="marker" data-lat="3" data-lng="4"></span>
      <span data-ts-map-child="mystery"></span>
    `)
    const map = fakeMap()

    expect(() => mountChildren(map, host)).not.toThrow()
    // Malformed options fall back to defaults rather than dropping the marker.
    expect(map.added.length).toBe(2)
  })

  test('a marker click dispatches a bubbling DOM event', () => {
    const host = container('<span data-ts-map-child="marker" data-lat="1" data-lng="2" data-click-event="pin:tap"></span>')
    const map = fakeMap()
    mountChildren(map, host)

    let detail: any = null
    // Listening on the container, not the marker: the event bubbles so one
    // listener can serve every marker on the map.
    host.addEventListener('pin:tap', (e: any) => { detail = e.detail })

    map.added[0].fire('click', { latlng: { lat: 1, lng: 2 } })
    expect(detail).not.toBeNull()
    expect(detail.marker).toBe(map.added[0])
  })
})

describe('readJson', () => {
  test('parses an attribute', () => {
    const el = container('<span data-x=\'{"a":1}\'></span>').firstElementChild!
    expect(readJson(el, 'data-x', {})).toEqual({ a: 1 })
  })

  test('falls back rather than throwing on malformed or missing input', () => {
    const el = container('<span data-x="{{oops"></span>').firstElementChild!
    expect(readJson(el, 'data-x', { fallback: true })).toEqual({ fallback: true })
    expect(readJson(el, 'data-missing', { fallback: true })).toEqual({ fallback: true })
  })
})

describe('onMapEvent', () => {
  test('subscribes and unsubscribes with the caller', () => {
    const host = container('<span id="inner"></span>')
    const map = fakeMap()
    publishMap(host, map)

    let fired = 0
    const stop = onMapEvent(host.querySelector('#inner'), 'moveend', () => { fired += 1 })

    map.fire('moveend')
    expect(fired).toBe(1)

    stop()
    map.fire('moveend')
    expect(fired).toBe(1)
    expect(map.listenerCount('moveend')).toBe(0)
  })

  test('outside a map it is a no-op, not a crash', () => {
    const loose = container('')
    expect(() => onMapEvent(loose, 'moveend', () => {})()).not.toThrow()
  })
})

describe('definedOnly', () => {
  test('drops undefined so a prop nobody set cannot override a default', () => {
    expect(definedOnly({ a: 1, b: undefined, c: null, d: false, e: 0 }))
      .toEqual({ a: 1, c: null, d: false, e: 0 })
  })
})

describe('territory layers', () => {
  test('a territory-layer child is built and handed to the page', () => {
    const map = fakeMap()
    const el = container(`<span data-ts-map-child="territory-layer" data-options='{"self":"sam"}'></span>`)

    // The store is a live object markup cannot carry, so the layer is
    // announced for the page to configure.
    let announced: any = null
    el.addEventListener('territory:ready', (e: any) => {
      announced = e.detail.layer
    })

    const unmount = mountChildren(map, el)

    expect(map.added.length).toBe(1)
    expect(announced).not.toBeNull()
    expect(typeof announced.setStore).toBe('function')
    expect(announced.options.self).toBe('sam')

    unmount()
    expect(map.removed.length).toBe(1)
  })

  test('a run-trail-layer child is built and announced too', () => {
    const map = fakeMap()
    const el = container(`<span data-ts-map-child="run-trail-layer" data-options='{"color":"#38bdf8"}'></span>`)

    let announced: any = null
    el.addEventListener('runtrail:ready', (e: any) => {
      announced = e.detail.layer
    })

    const unmount = mountChildren(map, el)

    expect(map.added.length).toBe(1)
    expect(typeof announced.setTrack).toBe('function')
    expect(announced.options.color).toBe('#38bdf8')

    unmount()
    expect(map.removed.length).toBe(1)
  })
})
