import { describe, expect, test } from 'bun:test'
import { compile, evaluate } from '../src/core-map/style-spec/expressions'
import type { EvaluationContext } from '../src/core-map/style-spec/expressions'
import { Pbf } from '../src/core-map/proto/Pbf'
import { VectorTile } from '../src/core-map/mvt/VectorTile'
import { VectorTileMapLayer } from '../src/core-map'
import type { VectorTileStyleLayer } from '../src/core-map'

// ---------------------------------------------------------------------------
// Helpers — small MVT fixture generator for a single linestring layer so the
// gradient draw path can be exercised end-to-end without a real tile server.
// ---------------------------------------------------------------------------

function zz(n: number): number {
  return (n << 1) ^ (n >> 31)
}

function cmd(id: number, count: number): number {
  return (id & 0x7) | (count << 3)
}

// A simple horizontal line from (0,0) to (4000, 0) in tile-extent coords.
function makeLineMVT(): Uint8Array {
  const pbf = new Pbf()
  pbf.writeMessage(3, (_layer, p) => {
    p.writeVarintField(15, 2) // version
    p.writeStringField(1, 'road')

    p.writeMessage(2, (_feat, fp) => {
      fp.writeVarintField(1, 1) // feature id
      fp.writeVarintField(3, 2) // type = LineString
      fp.writePackedVarint(4, [
        cmd(1, 1), zz(0), zz(0),
        cmd(2, 1), zz(4000), zz(0),
      ])
    }, {})

    p.writeVarintField(5, 4096) // extent
  }, {})
  return pbf.finish()
}

function ctx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return { zoom: 0, ...overrides }
}

// Wrap `createLinearGradient` on a specific canvas instance (the prototype
// isn't populated on very-happy-dom) so we can assert it was invoked.
function spyCreateLinearGradient(canvas: HTMLCanvasElement): { calls: number } {
  const result = { calls: 0 }
  const ctx2d = canvas.getContext('2d') as any
  if (!ctx2d)
    return result
  const orig = ctx2d.createLinearGradient?.bind(ctx2d)
  ctx2d.createLinearGradient = (x0: number, y0: number, x1: number, y1: number) => {
    result.calls++
    if (orig)
      return orig(x0, y0, x1, y1)
    // Fallback stub implementing just the addColorStop sink we need.
    return { addColorStop: () => {} }
  }
  return result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('line-progress expression', () => {
  test('compiles as a number-returning expression', () => {
    const c = compile(['line-progress'], 'number')
    expect(c.returnType).toBe('number')
    expect(c.dependsOnFeature).toBe(false)
    expect(c.dependsOnZoom).toBe(false)
  })

  test('resolves to ctx.lineProgress when set', () => {
    expect(evaluate(['line-progress'], ctx({ lineProgress: 0.5 }), 'number')).toBe(0.5)
    expect(evaluate(['line-progress'], ctx({ lineProgress: 1 }), 'number')).toBe(1)
  })

  test('defaults to 0 when not set', () => {
    expect(evaluate(['line-progress'], ctx(), 'number')).toBe(0)
  })

  test('interpolates along line-progress stops', () => {
    const expr = ['interpolate', ['linear'], ['line-progress'], 0, 'blue', 1, 'red']
    const c = compile(expr, 'color')
    expect(c.returnType).toBe('color')
    // Midpoint should blend to a purple-ish hue rather than returning the
    // endpoint literal — the blend path is what `line-gradient` relies on.
    const mid = c.evaluate(ctx({ lineProgress: 0.5 })) as string
    expect(mid).toMatch(/rgba/)
  })
})

describe('line-gradient paint', () => {
  test('drawing with a line-gradient invokes createLinearGradient', () => {
    const styleLayer: VectorTileStyleLayer = {
      id: 'road',
      type: 'line',
      sourceLayer: 'road',
      paint: {
        'line-width': 4,
        'line-gradient': [
          'interpolate',
          ['linear'],
          ['line-progress'],
          0, 'blue',
          0.5, 'yellow',
          1, 'red',
        ],
      },
    }

    const layer = new VectorTileMapLayer({
      url: 'https://example.com/{z}/{x}/{y}.pbf',
      layers: [styleLayer],
    })

    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 256
    canvas.height = 256
    const spy = spyCreateLinearGradient(canvas)

    const mvt = makeLineMVT()
    const tile = new VectorTile(new Pbf(mvt))

    // Directly invoke the draw path — the _drawTile body exercises the
    // gradient sampler even without a fully-attached map.
    expect(() => {
      ;(layer as any)._drawTile(canvas, tile, { x: 0, y: 0, z: 0 })
    }).not.toThrow()

    expect(spy.calls).toBeGreaterThan(0)
  })

  test('omitting line-gradient is a solid stroke (no gradient call)', () => {
    const styleLayer: VectorTileStyleLayer = {
      id: 'road',
      type: 'line',
      sourceLayer: 'road',
      paint: { 'line-width': 4, 'line-color': '#ff00ff' },
    }

    const layer = new VectorTileMapLayer({
      url: 'https://example.com/{z}/{x}/{y}.pbf',
      layers: [styleLayer],
    })

    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 256
    canvas.height = 256
    const spy = spyCreateLinearGradient(canvas)

    const tile = new VectorTile(new Pbf(makeLineMVT()))
    ;(layer as any)._drawTile(canvas, tile, { x: 0, y: 0, z: 0 })

    expect(spy.calls).toBe(0)
  })
})

describe('line-dasharray interpolation across zoom', () => {
  test('interpolate resolves to a different array at different zooms', () => {
    // Typical use: thinner dashes at low zoom, thicker dashes at high zoom.
    const expr = [
      'interpolate',
      ['linear'],
      ['zoom'],
      0, ['literal', [1, 1]],
      10, ['literal', [8, 4]],
    ]
    const c = compile(expr, 'array')
    const atZ0 = c.evaluate(ctx({ zoom: 0 })) as number[]
    const atZ10 = c.evaluate(ctx({ zoom: 10 })) as number[]
    expect(atZ0).toEqual([1, 1])
    expect(atZ10).toEqual([8, 4])
    // Midpoint should blend component-wise.
    const atZ5 = c.evaluate(ctx({ zoom: 5 })) as number[]
    expect(atZ5[0]).toBeGreaterThan(1)
    expect(atZ5[0]).toBeLessThan(8)
  })
})
