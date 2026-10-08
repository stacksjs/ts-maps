import { afterEach, describe, expect, test } from 'bun:test'
import { TsMap } from '../src/core-map/map/Map'
import type { Style as StyleSpec } from '../src/core-map/style-spec/types'

function createContainer(): HTMLElement {
  const el = document.createElement('div')
  el.style.width = '400px'
  el.style.height = '300px'
  document.body.appendChild(el)
  return el
}

const cleanup: HTMLElement[] = []
afterEach(() => { for (const c of cleanup.splice(0)) c.remove() })

function makeMap(opts?: Record<string, unknown>): TsMap {
  const c = createContainer()
  cleanup.push(c)
  return new TsMap(c, { center: [0, 0], zoom: 4, ...(opts ?? {}) })
}

const minimalStyle: StyleSpec = {
  version: 8,
  sources: {},
  layers: [],
}

describe('map.setStyle', () => {
  test('loads a minimal style and reports isStyleLoaded', () => {
    const map = makeMap()
    expect(map.isStyleLoaded()).toBe(false)
    map.setStyle(minimalStyle)
    expect(map.isStyleLoaded()).toBe(true)
    expect(map.getStyle()?.version).toBe(8)
  })

  test('fires styledata when style is applied', () => {
    const map = makeMap()
    let count = 0
    map.on('styledata', () => { count++ })
    map.setStyle(minimalStyle)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('fires style.load once the style is in, each time it changes', () => {
    const map = makeMap()
    const seen: string[] = []
    map.on('styledata', () => seen.push('styledata'))
    map.on('style.load', () => seen.push('style.load'))
    map.setStyle(minimalStyle)
    // Again, with a change: the diff path.
    map.setStyle({ ...minimalStyle, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#fff' } }] } as StyleSpec)
    // Once for each, after the style's own styledata.
    expect(seen.filter(e => e === 'style.load').length).toBe(2)
    expect(seen.at(-1)).toBe('style.load')
    expect(seen.slice(0, 2)).toEqual(['styledata', 'style.load'])
  })

  test('rejects an invalid style when validate=true', () => {
    const map = makeMap()
    expect(() => map.setStyle({ version: 7 } as any)).toThrow()
  })

  test('accepts an invalid style when validate=false', () => {
    const map = makeMap()
    expect(() => map.setStyle({ version: 7 } as any, { validate: false })).not.toThrow()
  })
})

describe('map.addSource / removeSource', () => {
  test('adds a raster source and instantiates a TileLayer host', () => {
    const map = makeMap()
    map.setStyle(minimalStyle)
    map.addSource('osm', {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
    })
    expect(map.getSource('osm')).toBeDefined()
    expect(map.getStyle()?.sources.osm).toBeDefined()
  })

  test('removeSource tears down the host', () => {
    const map = makeMap()
    map.setStyle(minimalStyle)
    map.addSource('osm', {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
    })
    map.removeSource('osm')
    expect(map.getSource('osm')).toBeUndefined()
  })
})

describe('map.addStyleLayer / getStyleLayer / removeStyleLayer', () => {
  test('adds a style layer referencing a source', () => {
    const map = makeMap()
    map.setStyle(minimalStyle)
    map.addSource('osm', {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
    })
    map.addStyleLayer({
      id: 'osm-bg',
      type: 'raster',
      source: 'osm',
    } as any)
    expect(map.getStyleLayer('osm-bg')).toBeDefined()
  })

  test('removeStyleLayer pops it from the spec', () => {
    const map = makeMap()
    map.setStyle(minimalStyle)
    map.addSource('osm', {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
    })
    map.addStyleLayer({ id: 'osm-bg', type: 'raster', source: 'osm' } as any)
    map.removeStyleLayer('osm-bg')
    expect(map.getStyleLayer('osm-bg')).toBeUndefined()
  })
})

describe('map.setPaintProperty / setLayoutProperty / setFilter', () => {
  test('setPaintProperty mutates the serialized style', () => {
    const map = makeMap()
    map.setStyle({
      version: 8,
      sources: {},
      layers: [{ id: 'bg', type: 'background' } as any],
    })
    map.setPaintProperty('bg', 'background-color', '#123456')
    const style = map.getStyle()!
    expect((style.layers[0] as any).paint?.['background-color']).toBe('#123456')
  })

  test('setLayoutProperty mutates the serialized style', () => {
    const map = makeMap()
    map.setStyle({
      version: 8,
      sources: {},
      layers: [{ id: 'bg', type: 'background' } as any],
    })
    map.setLayoutProperty('bg', 'visibility', 'none')
    const style = map.getStyle()!
    expect((style.layers[0] as any).layout?.visibility).toBe('none')
  })

  test('setFilter mutates the serialized style', () => {
    const map = makeMap()
    map.setStyle({
      version: 8,
      sources: {
        osm: { type: 'raster', tiles: ['https://tile.osm/{z}/{x}/{y}.png'] } as any,
      },
      layers: [{ id: 'osm-bg', type: 'raster', source: 'osm' } as any],
    })
    map.setFilter('osm-bg', ['==', ['get', 'k'], 'v'])
    const style = map.getStyle()!
    expect((style.layers[0] as any).filter).toEqual(['==', ['get', 'k'], 'v'])
  })
})

describe('geojson sources added after the style', () => {
  test('draw at a fractional zoom, from whole tile levels, under the source\'s own layer', () => {
    const map = makeMap({ center: [40.76, -73.98], zoom: 13.5 })
    map.setStyle({ version: 8, sources: {}, layers: [] } as unknown as StyleSpec)
    map.addSource('area', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-73.99, 40.75], [-73.97, 40.75], [-73.97, 40.77], [-73.99, 40.75]]] } },
    } as any)
    map.addStyleLayer({ id: 'area', type: 'fill', source: 'area', paint: { 'fill-color': '#4f46e5' } } as any)
    const host = (map as any)._geoJSONSources.area.layer
    const entries = [...host._decodedTiles.values()] as Array<{ coords: { z: number }, tile: unknown }>
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every(e => Number.isInteger(e.coords.z))).toBe(true)
    // The polygon is in view, so some tile has it, under the layer the
    // style layer draws from: the source's own id.
    expect(entries.some(e => e.tile)).toBe(true)
    expect(host._styleLayers.map((l: { sourceLayer: string }) => l.sourceLayer)).toEqual(['area'])
  })

  test('their tiles are marked loaded, so they show', async () => {
    const map = makeMap({ center: [40.76, -73.98], zoom: 14 })
    map.setStyle({ version: 8, sources: {}, layers: [] } as unknown as StyleSpec)
    map.addSource('area', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-73.98, 40.76] } } } as any)
    map.addStyleLayer({ id: 'area', type: 'circle', source: 'area', paint: { 'circle-radius': 6 } } as any)
    await Promise.resolve()
    const host = (map as any)._geoJSONSources.area.layer
    const tiles = Object.values(host._tiles) as Array<{ el: HTMLElement }>
    expect(tiles.length).toBeGreaterThan(0)
    // A tile left without this is `visibility: hidden` in ts-maps.css.
    expect(tiles.every(t => t.el.classList.contains('tsmap-tile-loaded'))).toBe(true)
  })
})

describe('a source given its first drawing layer later', () => {
  test('a raster-dem added for terrain gets a hillshade when one is added', () => {
    const map = makeMap({ center: [45.97, 7.65], zoom: 11 })
    map.setStyle({ version: 8, sources: {}, layers: [] } as unknown as StyleSpec)
    map.addSource('dem', { type: 'raster-dem', tiles: ['https://dem.test/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium' } as any)
    expect((map as any)._style.sourceLayers.get('dem')).toBeUndefined()
    map.addStyleLayer({ id: 'hillshade', type: 'hillshade', source: 'dem' } as any)
    const host = (map as any)._style.sourceLayers.get('dem')
    expect(host).toBeDefined()
    expect(map.hasLayer(host)).toBe(true)
  })
})
