import { afterEach, describe, expect, test } from 'bun:test'
import { styles, TsMap } from '../src/core-map'
import { validateStyle } from '../src/core-map/style-spec/validate'

const TILES = 'https://example.test/tiles/{z}/{x}/{y}.pbf'

/** Let a fetch chain (fetch → json → apply) settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++)
    await Promise.resolve()
}

function makeMap(options: Record<string, unknown> = {}): TsMap {
  const container = document.createElement('div')
  container.style.width = '400px'
  container.style.height = '400px'
  document.body.appendChild(container)
  return new TsMap(container, { zoomAnimation: false, ...options })
}

describe('built-in basemap styles', () => {
  test('both presets validate against the style spec', () => {
    expect(validateStyle(styles.dark({ tiles: TILES }))).toEqual([])
    expect(validateStyle(styles.light({ tiles: TILES }))).toEqual([])
  })

  test('raster mode validates too', () => {
    const style = styles.dark({ tiles: 'https://example.test/{z}/{x}/{y}.png', mode: 'raster' })
    expect(validateStyle(style)).toEqual([])
    expect(style.sources.basemap.type).toBe('raster')
  })

  test('light and dark share one layer skeleton, differing only in colour', () => {
    const darkStyle = styles.dark({ tiles: TILES })
    const lightStyle = styles.light({ tiles: TILES })

    // The drift this guards against: one theme quietly gaining a layer.
    expect(darkStyle.layers.map(l => l.id)).toEqual(lightStyle.layers.map(l => l.id))

    const darkBg = darkStyle.layers[0] as any
    const lightBg = lightStyle.layers[0] as any
    expect(darkBg.paint['background-color']).not.toBe(lightBg.paint['background-color'])
  })

  test('layers are ordered ground first, labels last', () => {
    const ids = styles.dark({ tiles: TILES }).layers.map(l => l.id)
    expect(ids[0]).toBe('background')
    expect(ids.indexOf('water')).toBeLessThan(ids.indexOf('road-major'))
    expect(ids.indexOf('road-casing')).toBeLessThan(ids.indexOf('road-major'))
    expect(ids.indexOf('building')).toBeLessThan(ids.indexOf('place-label'))
    expect(ids[ids.length - 1]).toBe('place-label')
  })

  test('source-layer names can be remapped onto another schema', () => {
    const style = styles.dark({ tiles: TILES, sourceLayers: { water: 'hydrology', place: 'places' } })
    const byId = Object.fromEntries(style.layers.map(l => [l.id, l as any]))

    expect(byId.water['source-layer']).toBe('hydrology')
    expect(byId['place-label']['source-layer']).toBe('places')
    // Unremapped names keep the OpenMapTiles default.
    expect(byId.building['source-layer']).toBe('building')
  })

  test('individual palette entries can be overridden', () => {
    const style = styles.dark({ tiles: TILES, palette: { water: '#ff0000' } })
    const water = style.layers.find(l => l.id === 'water') as any
    expect(water.paint['fill-color']).toBe('#ff0000')
  })

  test('attribution and tile array pass through to the source', () => {
    const style = styles.light({ tiles: [TILES], attribution: '© OpenStreetMap' })
    // Narrowed because SourceSpecification is a union, and the geojson member
    // has no `tiles`.
    const source = style.sources.basemap as { tiles: string[], attribution?: string }
    expect(source.tiles).toEqual([TILES])
    expect(source.attribution).toBe('© OpenStreetMap')
  })
})

describe('setStyle with a URL', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test('fetches the document and applies it', async () => {
    const style = styles.dark({ tiles: TILES })
    globalThis.fetch = (async () => ({ ok: true, json: async () => style })) as any

    const map = makeMap()
    let loaded = false
    map.on('styledata', () => { loaded = true })

    map.setStyle('https://example.test/style.json')
    await flush()

    expect(loaded).toBe(true)
    expect(map.getStyle()?.name).toBe('ts-maps dark')
  })

  test('a failed load reports an error and leaves the map alone', async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 404 })) as any

    const map = makeMap()
    let failure: any
    map.on('error', (event: any) => { failure = event })

    map.setStyle('https://example.test/missing.json')
    await flush()

    expect(failure?.error?.message).toContain('404')
    expect(map.getStyle()).toBeUndefined()
  })

  test('a slow first response cannot overwrite a later style', async () => {
    const slow = styles.dark({ tiles: TILES })
    const fast = styles.light({ tiles: TILES })

    let releaseSlow: (value: any) => void = () => {}
    let call = 0
    globalThis.fetch = ((): any => {
      call += 1
      if (call === 1)
        return new Promise((resolve) => { releaseSlow = resolve })
      return Promise.resolve({ ok: true, json: async () => fast })
    }) as any

    const map = makeMap()
    map.setStyle('https://example.test/slow.json')
    map.setStyle('https://example.test/fast.json')

    await flush()
    expect(map.getStyle()?.name).toBe('ts-maps light')

    // The stale document arrives last and must be discarded.
    releaseSlow({ ok: true, json: async () => slow })
    await flush()

    expect(map.getStyle()?.name).toBe('ts-maps light')
  })

  test('a diffed swap reports the style that was actually set', () => {
    const map = makeMap({ style: styles.dark({ tiles: TILES }) })
    // Same sources and layer ids, so this takes the incremental path rather
    // than a full reset — the case where the reported name used to go stale.
    map.setStyle(styles.light({ tiles: TILES }))

    const style = map.getStyle()!
    expect(style.name).toBe('ts-maps light')
    const background = style.layers.find(l => l.id === 'background') as any
    expect(background.paint['background-color']).toBe('#f3f2ee')
  })

  test('a swapped style reaches the layer that draws, not just the style doc', () => {
    const map = makeMap({ style: styles.dark({ tiles: TILES }) })

    map.setStyle(styles.light({ tiles: TILES }))

    // Read the host back rather than holding the old reference: the renderer
    // keeps its own converted copies of the style layers, and what matters is
    // that whatever is hosting the source now paints the new colours.
    const host: any = (map as any)._style.sourceLayers.get('basemap')
    const water = host._styleLayers.find((l: any) => l.id === 'water')
    expect(water.paint['fill-color']).toBe('#c3d7e8')
  })

  test('setPaintProperty repaints without refetching tiles', () => {
    const map = makeMap({ style: styles.dark({ tiles: TILES }) })
    const host: any = (map as any)._style.sourceLayers.get('basemap')

    let refetched = 0
    let repainted = 0
    host.redraw = () => { refetched += 1 }
    host._repaintDecodedTiles = () => { repainted += 1 }

    map.setPaintProperty('water', 'fill-color', '#ff0000')

    expect(host._styleLayers.find((l: any) => l.id === 'water').paint['fill-color']).toBe('#ff0000')
    expect(repainted).toBe(1)
    // Colour cannot change the tile bytes, so re-downloading them is waste.
    expect(refetched).toBe(0)
  })

  test('the style map option applies at construction', () => {
    const map = makeMap({ style: styles.light({ tiles: TILES }) })
    expect(map.getStyle()?.name).toBe('ts-maps light')
  })
})

describe('backdrop colour', () => {
  function makeMap(options: Record<string, unknown> = {}): TsMap {
    const container = document.createElement('div')
    container.style.width = '400px'
    container.style.height = '400px'
    document.body.appendChild(container)
    return new TsMap(container, { zoomAnimation: false, ...options })
  }

  test('the container takes the style\'s background colour', () => {
    // A tile grid is briefly incomplete during a zoom, and whatever is behind
    // it shows through. When that differs from the style\'s own background,
    // every gap flashes a different shade — which reads as flicker.
    const map = makeMap({ style: styles.dark({ tiles: TILES }) })
    const background = map.getStyle()!.layers.find(l => l.id === 'background') as any

    expect(map.getContainer().style.backgroundColor).toBe(background.paint['background-color'])
  })

  test('swapping the style repaints the backdrop with it', () => {
    const map = makeMap({ style: styles.dark({ tiles: TILES }) })
    const dark = map.getContainer().style.backgroundColor

    map.setStyle(styles.light({ tiles: TILES }))
    const light = map.getContainer().style.backgroundColor

    expect(light).not.toBe(dark)
    const background = map.getStyle()!.layers.find(l => l.id === 'background') as any
    expect(light).toBe(background.paint['background-color'])
  })

  test('setPaintProperty on the background layer follows', () => {
    const map = makeMap({ style: styles.dark({ tiles: TILES }) })
    map.setPaintProperty('background', 'background-color', '#001122')

    expect(map.getContainer().style.backgroundColor).toBe('#001122')
  })

  test('a style with no background layer leaves the chrome default alone', () => {
    const map = makeMap({
      style: { version: 8, sources: {}, layers: [] } as any,
    })
    // Nothing inline, so the theme token behind it still governs. The test
    // DOM reports an unset inline style as undefined rather than ''.
    expect(map.getContainer().style.backgroundColor || '').toBe('')
  })

  test('a zoom-driven background resolves at the current zoom', () => {
    const map = makeMap({
      style: {
        version: 8,
        sources: {},
        layers: [{
          id: 'background',
          type: 'background',
          paint: { 'background-color': ['step', ['zoom'], '#111111', 10, '#222222'] },
        }],
      } as any,
    })
    map.setView([0, 0], 4)
    map.fire('zoomend')
    expect(map.getContainer().style.backgroundColor).toBe('#111111')

    map.setView([0, 0], 12)
    map.fire('zoomend')
    expect(map.getContainer().style.backgroundColor).toBe('#222222')
  })
})

describe('overzooming past a source\'s top zoom', () => {
  function hostFor(style: any, options: Record<string, unknown> = {}): any {
    const container = document.createElement('div')
    container.style.width = '400px'
    container.style.height = '400px'
    document.body.appendChild(container)
    const map = new TsMap(container, { zoomAnimation: false, maxZoom: 20, ...options, style })
    return { map, host: (map as any)._style.sourceLayers.get('basemap') }
  }

  test('a vector source subdivides past its top zoom rather than hiding', () => {
    // The bug this guards: `maxzoom` in a style means "tiles stop here,
    // overzoom above it", while Leaflet's `maxZoom` means "hide the layer
    // above here". Passing one as the other blanked the basemap the moment
    // you zoomed past 14 — which is where a typical vector source tops out.
    const { host } = hostFor(styles.dark({ tiles: TILES }))

    // 512px tiles sit one grid zoom above the server's, so a server maxzoom
    // of 14 is grid 15.
    expect(host.options.sourceMaxZoom).toBe(15)
    // Not clamped: the grid keeps going and each tile renders its own share
    // of the ancestor, which is what keeps it sharp.
    expect(host.options.maxNativeZoom).toBeUndefined()
    expect(host.options.maxZoom).toBeGreaterThan(15)
  })

  test('the grid keeps subdividing past the source maximum', () => {
    const { host } = hostFor(styles.dark({ tiles: TILES }))

    // Below the cap, nothing changes.
    expect(host._clampZoom(12)).toBe(12)
    expect(host._subTile({ x: 3, y: 5, z: 12 })).toMatchObject({ z: 12, x: 3, y: 5, f: 1, sx: 0, sy: 0 })

    // Above it the grid still advances — no clamp, no blank.
    expect(host._clampZoom(18)).toBe(18)
  })

  test('an overzoomed tile draws its own quadrant of the published ancestor', () => {
    const { host } = hostFor(styles.dark({ tiles: TILES }))

    // Grid 18 is three levels past the cap of 15, so one published tile now
    // covers 8x8 of them.
    const sub = host._subTile({ x: 27, y: 43, z: 18 })
    expect(sub).toMatchObject({ z: 15, f: 8 })
    expect(sub.x).toBe(3)
    expect(sub.y).toBe(5)
    // 27 - 3*8 = 3, 43 - 5*8 = 3.
    expect(sub.sx).toBe(3)
    expect(sub.sy).toBe(3)
  })

  test('every sibling asks the server for the same ancestor tile', () => {
    // Which is what lets the HTTP cache serve 63 of the 64 for free.
    const { host } = hostFor(styles.dark({ tiles: TILES }))
    const a = host.getTileUrl({ x: 24, y: 40, z: 18 } as any)
    const b = host.getTileUrl({ x: 27, y: 43, z: 18 } as any)

    expect(a).toBe(b)
    // Grid 15 → server 14, the top zoom such a source publishes.
    expect(a).toContain('/14/')
  })

  test('a raster source overzooms too', () => {
    const { host } = hostFor(styles.dark({
      tiles: 'https://example.test/{z}/{x}/{y}.png',
      mode: 'raster',
    }))

    expect(host.options.maxNativeZoom).toBe(19)
    expect(host.options.maxZoom === undefined || host.options.maxZoom > 19).toBe(true)
  })
})
