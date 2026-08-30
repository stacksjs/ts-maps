import { describe, expect, test } from 'bun:test'
import { TsMap } from '../src/core-map'
import { HeatmapLayer } from '../src/core-map/layer/HeatmapLayer'
import { RasterDEMLayer } from '../src/core-map/layer/tile/RasterDEMLayer'
import { heatmapGradient, heatmapPoints, heatmapWeightKey } from '../src/core-map/map/heatmapStyle'
import { validateStyle } from '../src/core-map/style-spec'

// `heatmap` and `hillshade` had renderers all along; what they lacked was a
// way in. A style declaring either got a validation error, and a `raster-dem`
// source was drawn as a picture — its RGB is elevation, so that shows as
// coloured noise over the map.

function makeMap(style?: any): TsMap {
  const container = document.createElement('div')
  container.style.width = '400px'
  container.style.height = '400px'
  document.body.appendChild(container)
  return new TsMap(container, { zoomAnimation: false, fadeAnimation: false, style })
}

const POINTS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-118.49, 34.02] }, properties: { mag: 3 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-118.48, 34.01] }, properties: { mag: 5 } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
  ],
}

describe('heatmap through the style spec', () => {
  test('a heatmap layer validates', () => {
    const errors = validateStyle({
      version: 8,
      sources: { quakes: { type: 'geojson', data: POINTS } },
      layers: [{
        id: 'heat',
        type: 'heatmap',
        source: 'quakes',
        paint: { 'heatmap-radius': 20, 'heatmap-opacity': 0.8 },
      }],
    } as any)
    expect(errors).toEqual([])
  })

  test('a heatmap layer builds a HeatmapLayer fed by the source', () => {
    const map = makeMap({
      version: 8,
      sources: { quakes: { type: 'geojson', data: POINTS } },
      layers: [{ id: 'heat', type: 'heatmap', source: 'quakes', paint: { 'heatmap-radius': 20 } }],
    })

    let heatmap: HeatmapLayer | undefined
    map.eachLayer((l: any) => {
      if (l instanceof HeatmapLayer)
        heatmap = l
    })

    expect(heatmap).toBeDefined()
    expect(heatmap!.options!.radius).toBe(20)
    // Two points; the line in the same collection contributes nothing, since
    // a density field is about where points are.
    expect((heatmap as any)._data.length).toBe(2)
  })

  test('new source data reaches the heatmap', () => {
    const map = makeMap({
      version: 8,
      sources: { quakes: { type: 'geojson', data: POINTS } },
      layers: [{ id: 'heat', type: 'heatmap', source: 'quakes' }],
    })

    let heatmap: any
    map.eachLayer((l: any) => {
      if (l instanceof HeatmapLayer)
        heatmap = l
    })
    expect(heatmap._data.length).toBe(2)

    map.setSourceData('quakes', {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }],
    })
    expect(heatmap._data.length).toBe(1)
  })

  test('a per-feature weight is read from the property it names', () => {
    const map = makeMap({
      version: 8,
      sources: { quakes: { type: 'geojson', data: POINTS } },
      layers: [{
        id: 'heat',
        type: 'heatmap',
        source: 'quakes',
        paint: { 'heatmap-weight': ['get', 'mag'] },
      }],
    })

    let heatmap: any
    map.eachLayer((l: any) => {
      if (l instanceof HeatmapLayer)
        heatmap = l
    })
    expect(heatmap._data.map((p: any) => p.weight)).toEqual([3, 5])
  })

  test('the heatmap layer is not also drawn as features', () => {
    // Otherwise every point renders twice: once as density, once as whatever
    // the vector renderer makes of a heatmap paint block.
    const map = makeMap({
      version: 8,
      sources: { quakes: { type: 'geojson', data: POINTS } },
      layers: [{ id: 'heat', type: 'heatmap', source: 'quakes' }],
    })

    let vector: any
    map.eachLayer((l: any) => {
      if (l._styleLayers)
        vector = l
    })
    expect(vector._styleLayers.map((l: any) => l.id)).not.toContain('heat')
  })
})

describe('heatmapGradient', () => {
  test('samples an interpolate ramp into stops', () => {
    const gradient = heatmapGradient([
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      'rgba(0, 0, 255, 0)',
      1,
      'rgb(255, 0, 0)',
    ])

    expect(gradient).toBeDefined()
    expect(Object.keys(gradient!).length).toBeGreaterThan(2)
    expect(gradient![1]).toBe('rgb(255, 0, 0)')
  })

  test('a plain colour is a flat ramp', () => {
    expect(heatmapGradient('#ff0000')).toEqual({ 0: '#ff0000', 1: '#ff0000' })
  })

  test('nothing to sample leaves the layer default in place', () => {
    expect(heatmapGradient(undefined)).toBeUndefined()
    expect(heatmapGradient(['not-an-operator'])).toBeUndefined()
  })
})

describe('heatmapPoints', () => {
  test('takes points and multipoints, and skips other geometry', () => {
    const points = heatmapPoints({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
        { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[3, 4], [5, 6]] }, properties: {} },
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: {} },
      ],
    })

    expect(points).toEqual([
      { lng: 1, lat: 2, weight: undefined },
      { lng: 3, lat: 4, weight: undefined },
      { lng: 5, lat: 6, weight: undefined },
    ])
  })

  test('a non-numeric weight is left for the layer to default', () => {
    const points = heatmapPoints({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { w: 'heavy' } }],
    }, 'w')
    expect(points[0].weight).toBeUndefined()
  })

  test('an empty or absent collection is not an error', () => {
    expect(heatmapPoints(undefined)).toEqual([])
    expect(heatmapPoints({ type: 'FeatureCollection', features: [] })).toEqual([])
  })
})

describe('heatmapWeightKey', () => {
  test('recognises a plain property lookup and nothing else', () => {
    expect(heatmapWeightKey(['get', 'mag'])).toBe('mag')
    expect(heatmapWeightKey(2)).toBeUndefined()
    expect(heatmapWeightKey(['interpolate', ['linear'], ['get', 'mag'], 0, 0, 6, 1])).toBeUndefined()
  })
})

describe('hillshade through the style spec', () => {
  const dem = { type: 'raster-dem', tiles: ['https://example.com/dem/{z}/{x}/{y}.png'], tileSize: 512 }

  test('a hillshade layer validates', () => {
    const errors = validateStyle({
      version: 8,
      sources: { terrain: dem },
      layers: [{
        id: 'shade',
        type: 'hillshade',
        source: 'terrain',
        paint: { 'hillshade-exaggeration': 0.6, 'hillshade-shadow-color': '#000044' },
      }],
    } as any)
    expect(errors).toEqual([])
  })

  test('a hillshade layer builds a RasterDEMLayer carrying its paint', () => {
    const map = makeMap({
      version: 8,
      sources: { terrain: dem },
      layers: [{
        id: 'shade',
        type: 'hillshade',
        source: 'terrain',
        paint: {
          'hillshade-exaggeration': 0.6,
          'hillshade-illumination-direction': 300,
          'hillshade-shadow-color': '#000044',
          'hillshade-highlight-color': '#ffddaa',
        },
      }],
    })

    let shade: any
    map.eachLayer((l: any) => {
      if (l instanceof RasterDEMLayer)
        shade = l
    })

    expect(shade).toBeDefined()
    expect(shade.options.exaggeration).toBe(0.6)
    expect(shade.options.azimuth).toBe(300)
    expect(shade.options.shadowColor).toBe('#000044')
    expect(shade.options.accentColor).toBe('#ffddaa')
  })

  test('the encoding comes from the source', () => {
    const map = makeMap({
      version: 8,
      sources: { terrain: { ...dem, encoding: 'terrarium' } },
      layers: [{ id: 'shade', type: 'hillshade', source: 'terrain' }],
    })

    let shade: any
    map.eachLayer((l: any) => {
      if (l instanceof RasterDEMLayer)
        shade = l
    })
    expect(shade.options.encoding).toBe('terrarium')
  })

  test('a dem with no hillshade over it draws nothing', () => {
    // Its RGB is elevation, not colour. Drawing it straight is the coloured
    // noise you see when a style is wired up wrong — and the source is still
    // there for `setTerrain`, which reads the spec rather than a layer.
    const map = makeMap({ version: 8, sources: { terrain: dem }, layers: [] })

    let found = false
    map.eachLayer((l: any) => {
      if (l instanceof RasterDEMLayer)
        found = true
    })
    expect(found).toBe(false)
    expect(map.getSource('terrain')).toBeDefined()
  })

  test('a hidden hillshade layer draws nothing either', () => {
    const map = makeMap({
      version: 8,
      sources: { terrain: dem },
      layers: [{ id: 'shade', type: 'hillshade', source: 'terrain', layout: { visibility: 'none' } }],
    })

    let found = false
    map.eachLayer((l: any) => {
      if (l instanceof RasterDEMLayer)
        found = true
    })
    expect(found).toBe(false)
  })
})
