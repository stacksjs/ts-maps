import { describe, expect, test } from 'bun:test'
import {
  diffStyles,
  validateLayer,
  validateLayoutProperty,
  validatePaintProperty,
  validateSource,
  validateStyle,
} from '../src/core-map/style-spec'
import type { Style } from '../src/core-map/style-spec'

// ---------- fixtures ----------

function minimalStyle(): Style {
  return {
    version: 8,
    sources: {
      vt: { type: 'vector', url: 'mapbox://example' },
    },
    layers: [
      {
        id: 'fills',
        type: 'fill',
        source: 'vt',
        'source-layer': 'landcover',
        paint: { 'fill-color': '#abc' },
      },
    ],
  }
}

// ---------- validateStyle ----------

describe('validateStyle — valid documents', () => {
  test('minimal valid style produces zero errors', () => {
    const errors = validateStyle(minimalStyle())
    expect(errors).toEqual([])
  })

  test('expression arrays for fill-color are accepted', () => {
    const style = minimalStyle()
    style.layers[0] = {
      ...style.layers[0],
      paint: {
        'fill-color': ['interpolate', ['linear'], ['zoom'], 0, 'red', 10, 'blue'],
      },
    } as typeof style.layers[0]
    const errors = validateStyle(style)
    expect(errors).toEqual([])
  })

  test('background layer without a source is valid', () => {
    const style: Style = {
      version: 8,
      sources: {},
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#fff' } },
      ],
    }
    expect(validateStyle(style)).toEqual([])
  })
})

describe('validateStyle — structural errors', () => {
  test('missing version → error with path ["version"]', () => {
    const style = { sources: {}, layers: [] }
    const errors = validateStyle(style)
    expect(errors.some(e => e.message.includes('version') && (e.path || [])[0] === 'version')).toBe(true)
  })

  test('version: 7 → clear unsupported message', () => {
    const style = { version: 7, sources: {}, layers: [] }
    const errors = validateStyle(style)
    const hit = errors.find(e => (e.path || [])[0] === 'version')
    expect(hit).toBeDefined()
    expect(hit && hit.message).toContain('Unsupported style version')
  })

  test('layer referencing a missing source → error with path ["layers", N, "source"]', () => {
    const style: unknown = {
      version: 8,
      sources: { vt: { type: 'vector', url: 'u' } },
      layers: [
        { id: 'a', type: 'fill', source: 'vt' },
        { id: 'b', type: 'fill', source: 'missing' },
      ],
    }
    const errors = validateStyle(style)
    const hit = errors.find(e => e.message.includes('undefined source'))
    expect(hit).toBeDefined()
    expect(hit && hit.path).toEqual(['layers', '1', 'source'])
  })

  test('duplicate layer ids → error', () => {
    const style: unknown = {
      version: 8,
      sources: { vt: { type: 'vector', url: 'u' } },
      layers: [
        { id: 'dup', type: 'fill', source: 'vt' },
        { id: 'dup', type: 'fill', source: 'vt' },
      ],
    }
    const errors = validateStyle(style)
    expect(errors.some(e => e.message.includes('Duplicate layer id'))).toBe(true)
  })

  test('unknown layer type → error', () => {
    const style: unknown = {
      version: 8,
      sources: {},
      layers: [{ id: 'x', type: 'not-a-real-type' }],
    }
    const errors = validateStyle(style)
    expect(errors.some(e => e.message.includes('Unknown layer type'))).toBe(true)
  })

  test('unknown paint property (line-color on fill) → error', () => {
    const style: unknown = {
      version: 8,
      sources: { vt: { type: 'vector', url: 'u' } },
      layers: [
        {
          id: 'a',
          type: 'fill',
          source: 'vt',
          paint: { 'line-color': '#fff' },
        },
      ],
    }
    const errors = validateStyle(style)
    const hit = errors.find(e => e.message.includes('Unknown paint property'))
    expect(hit).toBeDefined()
    expect(hit && hit.path).toEqual(['layers', '0', 'paint', 'line-color'])
  })

  test('wrong literal type (fill-opacity as string) → error', () => {
    const style: unknown = {
      version: 8,
      sources: { vt: { type: 'vector', url: 'u' } },
      layers: [
        {
          id: 'a',
          type: 'fill',
          source: 'vt',
          paint: { 'fill-opacity': 'half' },
        },
      ],
    }
    const errors = validateStyle(style)
    const hit = errors.find(e => e.message.includes('Invalid value for paint property "fill-opacity"'))
    expect(hit).toBeDefined()
  })

  test('numeric bounds are enforced on literal values', () => {
    const style: unknown = {
      version: 8,
      sources: { vt: { type: 'vector', url: 'u' } },
      layers: [
        {
          id: 'a',
          type: 'fill',
          source: 'vt',
          paint: { 'fill-opacity': 5 },
        },
      ],
    }
    const errors = validateStyle(style)
    expect(errors.some(e => e.message.includes('fill-opacity'))).toBe(true)
  })

  test('non-object root → error', () => {
    expect(validateStyle(null).length).toBeGreaterThan(0)
    expect(validateStyle([]).length).toBeGreaterThan(0)
    expect(validateStyle('ok').length).toBeGreaterThan(0)
  })
})

describe('validateSource', () => {
  test('vector source with neither url nor tiles → error', () => {
    const errors = validateSource({ type: 'vector' }, 'vt')
    expect(errors.some(e => e.message.includes('must define either "url"'))).toBe(true)
  })

  test('vector source with tiles is valid', () => {
    const errors = validateSource({ type: 'vector', tiles: ['https://t/{z}/{x}/{y}'] }, 'vt')
    expect(errors).toEqual([])
  })

  test('unknown source type → error', () => {
    const errors = validateSource({ type: 'webp-grid' }, 's')
    expect(errors.some(e => e.message.includes('Unknown source type'))).toBe(true)
  })

  test('geojson source without data → error', () => {
    const errors = validateSource({ type: 'geojson' }, 'g')
    expect(errors.some(e => e.message.includes('GeoJSON source'))).toBe(true)
  })
})

describe('validateLayer', () => {
  test('fill layer with good source map is valid', () => {
    const errors = validateLayer(
      { id: 'a', type: 'fill', source: 'vt', paint: { 'fill-color': '#123' } },
      { vt: { type: 'vector', url: 'u' } },
    )
    expect(errors).toEqual([])
  })

  test('layer without type → error', () => {
    const errors = validateLayer({ id: 'a' })
    expect(errors.some(e => e.message.includes('"type"'))).toBe(true)
  })
})

describe('validatePaintProperty / validateLayoutProperty', () => {
  test('fill-color accepts string literal', () => {
    expect(validatePaintProperty('fill', 'fill-color', '#fff')).toEqual([])
  })

  test('line-cap accepts valid enum value', () => {
    expect(validateLayoutProperty('line', 'line-cap', 'round')).toEqual([])
  })

  test('line-cap rejects out-of-enum value', () => {
    const errors = validateLayoutProperty('line', 'line-cap', 'slanted')
    expect(errors.length).toBeGreaterThan(0)
  })

  test('unknown property name returns error', () => {
    const errors = validatePaintProperty('fill', 'nonsense', 1)
    expect(errors.some(e => e.message.includes('Unknown paint property'))).toBe(true)
  })
})

// ---------- diffStyles ----------

describe('diffStyles', () => {
  test('identical styles → empty diff', () => {
    const a = minimalStyle()
    const b = minimalStyle()
    expect(diffStyles(a, b).commands).toEqual([])
  })

  test('adding a layer → addLayer command', () => {
    const a = minimalStyle()
    const b = minimalStyle()
    b.layers.push({
      id: 'outlines',
      type: 'line',
      source: 'vt',
      paint: { 'line-color': '#000' },
    })
    const diff = diffStyles(a, b)
    const add = diff.commands.find(c => c.command === 'addLayer')
    expect(add).toBeDefined()
    if (add && add.command === 'addLayer')
      expect(add.args[0].id).toBe('outlines')
  })

  test('removing a layer → removeLayer command', () => {
    const a = minimalStyle()
    const b = minimalStyle()
    b.layers = []
    const diff = diffStyles(a, b)
    expect(diff.commands.some(c => c.command === 'removeLayer')).toBe(true)
  })

  test('changing a paint property → setPaintProperty command', () => {
    const a = minimalStyle()
    const b = minimalStyle()
    b.layers[0] = { ...a.layers[0], paint: { 'fill-color': '#f00' } } as typeof a.layers[0]
    const diff = diffStyles(a, b)
    const hit = diff.commands.find(c => c.command === 'setPaintProperty')
    expect(hit).toBeDefined()
    if (hit && hit.command === 'setPaintProperty')
      expect(hit.args).toEqual(['fills', 'fill-color', '#f00'])
  })

  test('changing geojson source data → setSourceData command', () => {
    const a: Style = {
      version: 8,
      sources: {
        pts: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      },
      layers: [
        { id: 'c', type: 'circle', source: 'pts', paint: { 'circle-radius': 4 } },
      ],
    }
    const b: Style = {
      version: 8,
      sources: {
        pts: {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
            ],
          },
        },
      },
      layers: a.layers,
    }
    const diff = diffStyles(a, b)
    const hit = diff.commands.find(c => c.command === 'setSourceData')
    expect(hit).toBeDefined()
    if (hit && hit.command === 'setSourceData')
      expect(hit.args[0]).toBe('pts')
  })

  test('incompatible reorder → single setStyle command fallback', () => {
    const a: Style = {
      version: 8,
      sources: { vt: { type: 'vector', url: 'u' } },
      layers: [
        { id: 'a', type: 'fill', source: 'vt' },
        { id: 'b', type: 'fill', source: 'vt' },
      ],
    }
    const b: Style = {
      version: 8,
      sources: { vt: { type: 'vector', url: 'u' } },
      layers: [
        { id: 'b', type: 'fill', source: 'vt' },
        { id: 'a', type: 'fill', source: 'vt' },
      ],
    }
    const diff = diffStyles(a, b)
    expect(diff.commands.length).toBe(1)
    expect(diff.commands[0].command).toBe('setStyle')
  })

  test('version change → single setStyle command', () => {
    const a = minimalStyle()
    const b = { ...minimalStyle(), version: 9 as unknown as 8 }
    const diff = diffStyles(a, b)
    expect(diff.commands.length).toBe(1)
    expect(diff.commands[0].command).toBe('setStyle')
  })

  test('adding a new source → addSource command', () => {
    const a = minimalStyle()
    const b = minimalStyle()
    b.sources.extra = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
    const diff = diffStyles(a, b)
    const hit = diff.commands.find(c => c.command === 'addSource')
    expect(hit).toBeDefined()
    if (hit && hit.command === 'addSource')
      expect(hit.args[0]).toBe('extra')
  })

  test('removing a source → removeSource command', () => {
    const a = minimalStyle()
    a.sources.extra = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
    const b = minimalStyle()
    const diff = diffStyles(a, b)
    expect(diff.commands.some(c => c.command === 'removeSource')).toBe(true)
  })

  test('zoom-range change → setLayerZoomRange command', () => {
    const a = minimalStyle()
    const b = minimalStyle()
    b.layers[0] = { ...a.layers[0], minzoom: 3, maxzoom: 18 } as typeof a.layers[0]
    const diff = diffStyles(a, b)
    const hit = diff.commands.find(c => c.command === 'setLayerZoomRange')
    expect(hit).toBeDefined()
    if (hit && hit.command === 'setLayerZoomRange')
      expect(hit.args).toEqual(['fills', 3, 18])
  })

  test('filter change → setFilter command', () => {
    const a = minimalStyle()
    const b = minimalStyle()
    b.layers[0] = { ...a.layers[0], filter: ['==', 'class', 'road'] } as typeof a.layers[0]
    const diff = diffStyles(a, b)
    expect(diff.commands.some(c => c.command === 'setFilter')).toBe(true)
  })
})
