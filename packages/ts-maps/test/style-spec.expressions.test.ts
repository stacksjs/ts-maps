import { describe, expect, test } from 'bun:test'
import { validateStyle } from '../src/core-map/style-spec'
import type { Style } from '../src/core-map/style-spec'

// A realistic style fragment that mixes literal colors, zoom-driven widths,
// data-driven color ramps, and filters. The point of this file is to exercise
// the full `validateStyle` → `matchesSchema` → `validateExpression` pipeline.

function styleWith(paint: Record<string, unknown>): Style {
  return {
    version: 8,
    sources: { vt: { type: 'vector', url: 'mapbox://example' } },
    layers: [
      {
        id: 'roads',
        type: 'line',
        source: 'vt',
        'source-layer': 'roads',
        paint: paint as never,
      },
    ],
  }
}

describe('style-spec + expressions integration', () => {
  test('zoom-driven line-width interpolation validates clean', () => {
    const s = styleWith({
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 14, 4, 20, 20],
    })
    expect(validateStyle(s)).toEqual([])
  })

  test('data-driven line-color with match validates clean', () => {
    const s = styleWith({
      'line-color': [
        'match',
        ['get', 'class'],
        ['motorway', 'trunk'], '#ff6600',
        ['residential'], '#888888',
        '#cccccc',
      ],
    })
    expect(validateStyle(s)).toEqual([])
  })

  test('case + coalesce fragment validates clean', () => {
    const s = styleWith({
      'line-color': [
        'case',
        ['==', ['geometry-type'], 'LineString'],
        ['coalesce', ['get', 'color'], '#0000ff'],
        '#000000',
      ],
    })
    expect(validateStyle(s)).toEqual([])
  })

  test('malformed interpolation is reported through validateStyle', () => {
    const s = styleWith({
      'line-width': ['interpolate', ['bogus'], ['zoom'], 0, 1, 10, 10],
    })
    const errors = validateStyle(s)
    expect(errors.length).toBeGreaterThan(0)
    const hit = errors.find(e => e.message.includes('Invalid expression'))
    expect(hit).toBeDefined()
    expect(hit && hit.path).toEqual(['layers', '0', 'paint', 'line-width'])
  })

  test('divide-by-zero is a compile-time-valid style (error deferred to eval)', () => {
    // Style-time validation should succeed — the error only arises at render
    // time on invalid numerics. The test guards against over-eager rejection.
    const s = styleWith({
      'line-width': ['/', 10, ['-', 1, 1]],
    })
    expect(validateStyle(s)).toEqual([])
  })
})
