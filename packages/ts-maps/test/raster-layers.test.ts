import { describe, expect, test } from 'bun:test'
import { rasterCssFilter, rasterLayerAt, rasterPaintValue, StyleRasterLayer } from '../src/core-map/layer/tile/StyleRasterLayer'
import { Map } from '../src/core-map/map/Map'

const RELIEF = { type: 'raster' as const, tiles: ['https://example.com/relief/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 6 }

function makeMap(layers: any[], zoom = 3): Map {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return new Map(container, {
    center: [40, 0],
    zoom,
    zoomAnimation: false,
    fadeAnimation: false,
    style: { version: 8, sources: { relief: RELIEF }, layers } as any,
  })
}

function host(map: Map): StyleRasterLayer | undefined {
  return map._style!.sourceLayers.get('relief') as StyleRasterLayer | undefined
}

// OpenFreeMap Liberty's layer over `ne2_shaded`.
const NATURAL_EARTH = { id: 'natural_earth', type: 'raster', source: 'relief', maxzoom: 7, paint: { 'raster-opacity': ['interpolate', ['exponential', 1.5], ['zoom'], 0, 0.6, 6, 0.1] } }

describe('raster sources draw through their raster layers', () => {
  test('a raster source with no raster layer draws nothing', () => {
    const map = makeMap([])
    expect(host(map)).toBeUndefined()
    expect(map.getSource('relief')).toBeDefined()
  })

  test('a layer\'s maxzoom hides it above, and stops its tiles loading', () => {
    const map = makeMap([NATURAL_EARTH], 3)
    const layer = host(map)!
    expect(layer).toBeInstanceOf(StyleRasterLayer)
    expect(layer.getContainer()!.style.display).toBe('')
    expect(layer._tileZoomFor(3)).toBe(3)
    map.setZoom(14)
    expect(layer.getContainer()!.style.display).toBe('none')
    expect(layer._tileZoomFor(14)).toBeUndefined()
    // maxzoom is exclusive, as in Mapbox.
    expect(layer._tileZoomFor(7)).toBeUndefined()
    map.setZoom(4)
    expect(layer.getContainer()!.style.display).toBe('')
  })

  test('raster-opacity, including a zoom expression, sets the layer\'s opacity', () => {
    const map = makeMap([NATURAL_EARTH], 0)
    expect(host(map)!.options!.opacity).toBeCloseTo(0.6)
    map.setZoom(6)
    expect(host(map)!.options!.opacity).toBeCloseTo(0.1)
    map.setPaintProperty('natural_earth', 'raster-opacity', 0.25)
    expect(host(map)!.options!.opacity).toBe(0.25)
    expect(host(map)!.getContainer()!.style.opacity).toBe('0.25')
  })

  test('visibility and the zoom range follow setLayoutProperty and setLayerZoomRange', () => {
    const map = makeMap([{ id: 'r', type: 'raster', source: 'relief' }], 10)
    const layer = host(map)!
    expect(layer.getContainer()!.style.display).toBe('')
    map.setLayoutProperty('r', 'visibility', 'none')
    expect(layer.getContainer()!.style.display).toBe('none')
    map.setLayoutProperty('r', 'visibility', 'visible')
    expect(layer.getContainer()!.style.display).toBe('')
    map.setLayerZoomRange('r', 12, 16)
    expect(map.getStyleLayer('r')).toMatchObject({ minzoom: 12, maxzoom: 16 })
    expect(layer.getContainer()!.style.display).toBe('none')
  })

  test('adding the first raster layer draws the source; removing the last hides it', () => {
    const map = makeMap([])
    map.addStyleLayer({ id: 'r', type: 'raster', source: 'relief', paint: { 'raster-opacity': 0.5 } } as any)
    const layer = host(map)!
    expect(layer).toBeDefined()
    expect(layer.options!.opacity).toBe(0.5)
    map.removeStyleLayer('r')
    expect(layer.getContainer()!.style.display).toBe('none')
  })

  test('colour adjustments become a CSS filter', () => {
    const map = makeMap([{ id: 'r', type: 'raster', source: 'relief', paint: { 'raster-saturation': -1, 'raster-hue-rotate': 90 } }])
    expect(host(map)!.getContainer()!.style.filter).toBe('hue-rotate(90deg) saturate(0)')
  })
})

describe('raster style helpers', () => {
  test('rasterLayerAt: minzoom inclusive, maxzoom exclusive, hidden layers skipped', () => {
    const a = { id: 'a', type: 'raster', source: 's', minzoom: 2, maxzoom: 5 } as any
    const b = { id: 'b', type: 'raster', source: 's', layout: { visibility: 'none' } } as any
    expect(rasterLayerAt([a, b], 2)).toBe(a)
    expect(rasterLayerAt([a, b], 5)).toBeUndefined()
    expect(rasterLayerAt([a, b], 1.9)).toBeUndefined()
  })

  test('rasterPaintValue reads numbers and zoom expressions', () => {
    expect(rasterPaintValue(0.4, 3, 1)).toBe(0.4)
    expect(rasterPaintValue(undefined, 3, 1)).toBe(1)
    expect(rasterPaintValue(['interpolate', ['linear'], ['zoom'], 0, 0, 10, 1], 5, 1)).toBeCloseTo(0.5)
    expect(rasterPaintValue(['step', ['zoom'], 0, 4, 1], 5, 1)).toBe(1)
    // Not a number: the default.
    expect(rasterPaintValue(['get', 'x'], 5, 1)).toBe(1)
  })

  test('rasterCssFilter: nothing for the defaults, a brightness range otherwise', () => {
    expect(rasterCssFilter({}, 0)).toBe('')
    expect(rasterCssFilter({ 'raster-brightness-max': 0.5 }, 0)).toBe('brightness(0.5)')
    expect(rasterCssFilter({ 'raster-contrast': 0.5 }, 0)).toBe('contrast(2)')
    expect(rasterCssFilter({ 'raster-brightness-min': 0.25 }, 0)).toBe('brightness(1.5) contrast(0.5)')
  })
})
