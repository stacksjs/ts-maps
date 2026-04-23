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
