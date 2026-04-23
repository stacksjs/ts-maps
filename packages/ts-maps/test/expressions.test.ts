import { describe, expect, test } from 'bun:test'
import {
  compile,
  convertLegacyFilter,
  evaluate,
  ExpressionError,
  formatColor,
  isExpression,
  lerpColor,
  parseColor,
  validateExpression,
} from '../src/core-map/style-spec/expressions'
import { validatePaintProperty } from '../src/core-map/style-spec/validate'
import type { EvaluationContext } from '../src/core-map/style-spec/expressions'

// ---------- helpers ----------

function ctx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    zoom: 0,
    ...overrides,
  }
}

// Parse an `rgba(r,g,b,a)` string into a 4-tuple so we can compare with a
// tolerance. Fails the test if the string isn't parseable.
function rgbaFrom(s: string): [number, number, number, number] {
  const m = s.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
  if (!m) throw new Error(`not an rgba string: ${s}`)
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
}

// ---------- Color primitives ----------

describe('parseColor', () => {
  test('parses #rrggbb hex', () => {
    expect(parseColor('#ff0000')).toEqual([1, 0, 0, 1])
  })
  test('parses #rgb shorthand', () => {
    expect(parseColor('#f00')).toEqual([1, 0, 0, 1])
  })
  test('parses #rrggbbaa with alpha', () => {
    const c = parseColor('#ff000080')
    expect(c).not.toBeNull()
    expect(c![0]).toBe(1)
    expect(c![1]).toBe(0)
    expect(c![2]).toBe(0)
    expect(Math.abs(c![3] - 128 / 255)).toBeLessThan(0.01)
  })
  test('parses rgb() / rgba()', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual([1, 0, 0, 1])
    const c = parseColor('rgba(0, 255, 0, 0.5)')
    expect(c).not.toBeNull()
    expect(c![1]).toBe(1)
    expect(c![3]).toBeCloseTo(0.5, 5)
  })
  test('parses hsl() / hsla()', () => {
    const c = parseColor('hsl(0, 100%, 50%)')
    expect(c).not.toBeNull()
    expect(c![0]).toBeCloseTo(1, 3)
    expect(c![1]).toBeCloseTo(0, 3)
    expect(c![2]).toBeCloseTo(0, 3)
  })
  test('parses named colors', () => {
    expect(parseColor('red')).toEqual([1, 0, 0, 1])
    expect(parseColor('transparent')).toEqual([0, 0, 0, 0])
  })
  test('returns null for malformed input', () => {
    expect(parseColor('')).toBeNull()
    expect(parseColor('not-a-color')).toBeNull()
    expect(parseColor('#xyz')).toBeNull()
  })
})

describe('formatColor', () => {
  test('round-trips opaque colors', () => {
    const c = parseColor('#336699')
    expect(c).not.toBeNull()
    expect(formatColor(c!)).toBe('rgba(51,102,153,1)')
  })
  test('renders transparent as alpha 0', () => {
    expect(formatColor([0, 0, 0, 0])).toBe('rgba(0,0,0,0)')
  })
})

describe('lerpColor', () => {
  test('midway between red and blue is purple', () => {
    const out = lerpColor([1, 0, 0, 1], [0, 0, 1, 1], 0.5)
    expect(out[0]).toBeCloseTo(0.5, 3)
    expect(out[1]).toBeCloseTo(0, 3)
    expect(out[2]).toBeCloseTo(0.5, 3)
    expect(out[3]).toBe(1)
  })
  test('t clamps to [0,1]', () => {
    expect(lerpColor([0, 0, 0, 1], [1, 1, 1, 1], -1)).toEqual([0, 0, 0, 1])
    expect(lerpColor([0, 0, 0, 1], [1, 1, 1, 1], 2)).toEqual([1, 1, 1, 1])
  })
})

// ---------- literal + context operators ----------

describe('literal / get / has / properties / id / geometry-type', () => {
  test('literal passes through arrays/objects unchanged', () => {
    expect(evaluate(['literal', [1, 2, 3]], ctx())).toEqual([1, 2, 3])
    expect(evaluate(['literal', { foo: 1 }], ctx())).toEqual({ foo: 1 })
  })
  test('get reads feature property', () => {
    const c = ctx({ feature: { type: 1, properties: { name: 'Paris' } } })
    expect(evaluate(['get', 'name'], c)).toBe('Paris')
  })
  test('get returns undefined for missing properties', () => {
    const c = ctx({ feature: { type: 1, properties: {} } })
    expect(evaluate(['get', 'missing'], c)).toBeUndefined()
  })
  test('has reports presence of property', () => {
    const c = ctx({ feature: { type: 1, properties: { name: 'Paris' } } })
    expect(evaluate(['has', 'name'], c)).toBe(true)
    expect(evaluate(['has', 'missing'], c)).toBe(false)
  })
  test('properties returns the whole bag', () => {
    const props = { a: 1, b: 2 }
    const c = ctx({ feature: { type: 2, properties: props } })
    expect(evaluate(['properties'], c)).toEqual(props)
  })
  test('id surfaces feature id', () => {
    const c = ctx({ feature: { type: 1, id: 42, properties: {} } })
    expect(evaluate(['id'], c)).toBe(42)
  })
  test('geometry-type maps MVT types to names', () => {
    expect(evaluate(['geometry-type'], ctx({ feature: { type: 1, properties: {} } }))).toBe('Point')
    expect(evaluate(['geometry-type'], ctx({ feature: { type: 2, properties: {} } }))).toBe('LineString')
    expect(evaluate(['geometry-type'], ctx({ feature: { type: 3, properties: {} } }))).toBe('Polygon')
  })
})

describe('at / length', () => {
  test('at indexes into array literals', () => {
    expect(evaluate(['at', 1, ['literal', [10, 20, 30]]], ctx())).toBe(20)
  })
  test('at out-of-range returns undefined', () => {
    expect(evaluate(['at', 9, ['literal', [10, 20, 30]]], ctx())).toBeUndefined()
    expect(evaluate(['at', -1, ['literal', [10, 20, 30]]], ctx())).toBeUndefined()
  })
  test('length measures strings and arrays', () => {
    expect(evaluate(['length', 'hello'], ctx())).toBe(5)
    expect(evaluate(['length', ['literal', [1, 2, 3]]], ctx())).toBe(3)
  })
})

describe('zoom / feature-state', () => {
  test('zoom returns current zoom', () => {
    expect(evaluate(['zoom'], ctx({ zoom: 7.5 }))).toBe(7.5)
  })
  test('feature-state reads from state bag', () => {
    const c = ctx({ featureState: { hover: true } })
    expect(evaluate(['feature-state', 'hover'], c)).toBe(true)
  })
  test('feature-state returns undefined without state', () => {
    expect(evaluate(['feature-state', 'hover'], ctx())).toBeUndefined()
  })
})

// ---------- logical / comparison ----------

describe('comparisons', () => {
  test('equality and inequality', () => {
    expect(evaluate(['==', 1, 1], ctx())).toBe(true)
    expect(evaluate(['==', 'a', 'b'], ctx())).toBe(false)
    expect(evaluate(['!=', 1, 2], ctx())).toBe(true)
  })
  test('ordering operators on numbers', () => {
    expect(evaluate(['<', 1, 2], ctx())).toBe(true)
    expect(evaluate(['<=', 2, 2], ctx())).toBe(true)
    expect(evaluate(['>', 3, 2], ctx())).toBe(true)
    expect(evaluate(['>=', 3, 3], ctx())).toBe(true)
  })
  test('ordering on strings is lexicographic', () => {
    expect(evaluate(['<', 'apple', 'banana'], ctx())).toBe(true)
  })
  test('mismatched-type compares return false', () => {
    expect(evaluate(['<', 1, 'a'], ctx())).toBe(false)
  })
})

describe('logical combinators', () => {
  test('all — short-circuits, empty list is true', () => {
    expect(evaluate(['all'], ctx())).toBe(true)
    expect(evaluate(['all', true, true], ctx())).toBe(true)
    expect(evaluate(['all', true, false, true], ctx())).toBe(false)
  })
  test('any — short-circuits, empty list is false', () => {
    expect(evaluate(['any'], ctx())).toBe(false)
    expect(evaluate(['any', false, true], ctx())).toBe(true)
  })
  test('none — true iff every child is false', () => {
    expect(evaluate(['none', false, false], ctx())).toBe(true)
    expect(evaluate(['none', true, false], ctx())).toBe(false)
  })
  test('! negates', () => {
    expect(evaluate(['!', true], ctx())).toBe(false)
    expect(evaluate(['!', false], ctx())).toBe(true)
  })
})

describe('case / match / coalesce', () => {
  test('case picks first truthy branch', () => {
    expect(evaluate(['case', false, 'a', true, 'b', 'fallback'], ctx())).toBe('b')
  })
  test('case falls through to fallback', () => {
    expect(evaluate(['case', false, 'a', false, 'b', 'fallback'], ctx())).toBe('fallback')
  })
  test('match with scalar labels', () => {
    const expr = ['match', ['get', 'kind'], 'a', 1, 'b', 2, 99]
    expect(evaluate(expr, ctx({ feature: { type: 1, properties: { kind: 'a' } } }))).toBe(1)
    expect(evaluate(expr, ctx({ feature: { type: 1, properties: { kind: 'b' } } }))).toBe(2)
    expect(evaluate(expr, ctx({ feature: { type: 1, properties: { kind: 'x' } } }))).toBe(99)
  })
  test('match with grouped array labels', () => {
    const expr = [
      'match',
      ['get', 'class'],
      ['motorway', 'trunk'], 'highway',
      ['residential'], 'local',
      'other',
    ]
    expect(evaluate(expr, ctx({ feature: { type: 2, properties: { class: 'motorway' } } }))).toBe('highway')
    expect(evaluate(expr, ctx({ feature: { type: 2, properties: { class: 'trunk' } } }))).toBe('highway')
    expect(evaluate(expr, ctx({ feature: { type: 2, properties: { class: 'residential' } } }))).toBe('local')
    expect(evaluate(expr, ctx({ feature: { type: 2, properties: { class: 'unknown' } } }))).toBe('other')
  })
  test('coalesce picks first non-null', () => {
    const expr = ['coalesce', ['get', 'primary'], ['get', 'secondary'], 'fallback']
    expect(evaluate(expr, ctx({ feature: { type: 1, properties: { secondary: 'B' } } }))).toBe('B')
    expect(evaluate(expr, ctx({ feature: { type: 1, properties: {} } }))).toBe('fallback')
  })
  test('case + coalesce composed (realistic fragment)', () => {
    const expr = [
      'case',
      ['==', ['geometry-type'], 'Point'], ['coalesce', ['get', 'color'], 'blue'],
      'black',
    ]
    expect(evaluate(expr, ctx({ feature: { type: 1, properties: { color: 'green' } } }))).toBe('green')
    expect(evaluate(expr, ctx({ feature: { type: 1, properties: {} } }))).toBe('blue')
    expect(evaluate(expr, ctx({ feature: { type: 3, properties: {} } }))).toBe('black')
  })
})

// ---------- conversion ----------

describe('type coercion', () => {
  test('to-number parses numeric strings', () => {
    expect(evaluate(['to-number', '42'], ctx())).toBe(42)
    expect(evaluate(['to-number', '3.14'], ctx())).toBeCloseTo(3.14, 5)
  })
  test('to-number falls through on first failing arg', () => {
    expect(evaluate(['to-number', 'nope', '7'], ctx())).toBe(7)
  })
  test('to-number throws when nothing coerces', () => {
    expect(() => evaluate(['to-number', 'x', 'y'], ctx())).toThrow(ExpressionError)
  })
  test('to-boolean coerces falsy values', () => {
    expect(evaluate(['to-boolean', 0], ctx())).toBe(false)
    expect(evaluate(['to-boolean', ''], ctx())).toBe(false)
    expect(evaluate(['to-boolean', null], ctx())).toBe(false)
    expect(evaluate(['to-boolean', 1], ctx())).toBe(true)
    expect(evaluate(['to-boolean', 'x'], ctx())).toBe(true)
  })
  test('to-string coerces and JSON-encodes objects', () => {
    expect(evaluate(['to-string', 42], ctx())).toBe('42')
    expect(evaluate(['to-string', true], ctx())).toBe('true')
    expect(evaluate(['to-string', ['literal', { a: 1 }]], ctx())).toBe('{"a":1}')
  })
  test('to-rgba returns channel array 0..255', () => {
    expect(evaluate(['to-rgba', 'red'], ctx())).toEqual([255, 0, 0, 1])
  })
  test('to-color accepts strings and arrays', () => {
    expect(evaluate(['to-color', 'red'], ctx())).toBe('rgba(255,0,0,1)')
    expect(evaluate(['to-color', ['literal', [0, 255, 0]]], ctx())).toBe('rgba(0,255,0,1)')
  })
})

// ---------- math ----------

describe('math operators', () => {
  test('add / subtract / multiply / divide', () => {
    expect(evaluate(['+', 1, 2, 3], ctx())).toBe(6)
    expect(evaluate(['-', 5, 2], ctx())).toBe(3)
    expect(evaluate(['-', 5], ctx())).toBe(-5)
    expect(evaluate(['*', 2, 3, 4], ctx())).toBe(24)
    expect(evaluate(['/', 10, 4], ctx())).toBe(2.5)
  })
  test('divide by zero throws', () => {
    expect(() => evaluate(['/', 1, 0], ctx())).toThrow(ExpressionError)
    expect(() => evaluate(['%', 1, 0], ctx())).toThrow(ExpressionError)
  })
  test('power / modulus', () => {
    expect(evaluate(['^', 2, 10], ctx())).toBe(1024)
    expect(evaluate(['%', 7, 3], ctx())).toBe(1)
  })
  test('min / max / abs / floor / ceil / round', () => {
    expect(evaluate(['min', 3, 1, 4, 1, 5], ctx())).toBe(1)
    expect(evaluate(['max', 3, 1, 4, 1, 5], ctx())).toBe(5)
    expect(evaluate(['abs', -7], ctx())).toBe(7)
    expect(evaluate(['floor', 1.7], ctx())).toBe(1)
    expect(evaluate(['ceil', 1.2], ctx())).toBe(2)
    expect(evaluate(['round', 1.5], ctx())).toBe(2)
  })
  test('sqrt / log10 throw on non-positive input', () => {
    expect(() => evaluate(['sqrt', -1], ctx())).toThrow(ExpressionError)
    expect(() => evaluate(['log10', 0], ctx())).toThrow(ExpressionError)
    expect(() => evaluate(['ln', -1], ctx())).toThrow(ExpressionError)
  })
  test('e and pi constants', () => {
    expect(evaluate(['e'], ctx())).toBeCloseTo(Math.E, 10)
    expect(evaluate(['pi'], ctx())).toBeCloseTo(Math.PI, 10)
  })
  test('rand with seed is deterministic', () => {
    const a = evaluate(['rand', 0, 100, 42], ctx())
    const b = evaluate(['rand', 0, 100, 42], ctx())
    expect(a).toBe(b)
    expect(typeof a).toBe('number')
  })
})

// ---------- string ----------

describe('string operators', () => {
  test('concat', () => {
    expect(evaluate(['concat', 'foo', '-', 42], ctx())).toBe('foo-42')
  })
  test('upcase / downcase', () => {
    expect(evaluate(['upcase', 'hello'], ctx())).toBe('HELLO')
    expect(evaluate(['downcase', 'HELLO'], ctx())).toBe('hello')
  })
  test('resolved-locale stubs as en', () => {
    expect(evaluate(['resolved-locale'], ctx())).toBe('en')
  })
})

// ---------- interpolate ----------

describe('interpolate — linear numbers', () => {
  test('midpoint lerp', () => {
    const v = evaluate(['interpolate', ['linear'], ['zoom'], 0, 10, 10, 100], ctx({ zoom: 5 }))
    expect(v).toBe(55)
  })
  test('below-range clamps to first stop', () => {
    const v = evaluate(['interpolate', ['linear'], ['zoom'], 10, 100, 20, 200], ctx({ zoom: 5 }))
    expect(v).toBe(100)
  })
  test('above-range clamps to last stop', () => {
    const v = evaluate(['interpolate', ['linear'], ['zoom'], 0, 0, 10, 100], ctx({ zoom: 99 }))
    expect(v).toBe(100)
  })
})

describe('interpolate — linear colors', () => {
  test('halfway between red and blue is ~purple', () => {
    const v = evaluate(
      ['interpolate', ['linear'], ['zoom'], 0, '#ff0000', 10, '#0000ff'],
      ctx({ zoom: 5 }),
    )
    const [r, g, b, a] = rgbaFrom(String(v))
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(1)
    expect(g).toBe(0)
    expect(Math.abs(b - 127)).toBeLessThanOrEqual(1)
    expect(a).toBe(1)
  })
})

describe('interpolate — exponential', () => {
  test('base 2 produces known curve points', () => {
    const expr = ['interpolate', ['exponential', 2], ['zoom'], 0, 0, 10, 1024]
    // At the endpoints, value equals the stop output regardless of base.
    expect(evaluate(expr, ctx({ zoom: 0 }))).toBe(0)
    expect(evaluate(expr, ctx({ zoom: 10 }))).toBe(1024)
    // Midpoint is pulled towards the upper end (ease-in effect).
    const mid = Number(evaluate(expr, ctx({ zoom: 5 })))
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(512)
  })
})

describe('interpolate — cubic-bezier', () => {
  test('ease-out curve pulls midpoint past linear', () => {
    const expr = ['interpolate', ['cubic-bezier', 0.25, 0.1, 0.25, 1], ['zoom'], 0, 0, 10, 100]
    const mid = Number(evaluate(expr, ctx({ zoom: 5 })))
    expect(mid).toBeGreaterThan(50)
  })
})

describe('step', () => {
  test('piecewise constant lookup', () => {
    const expr = ['step', ['zoom'], 'small', 10, 'medium', 15, 'large']
    expect(evaluate(expr, ctx({ zoom: 5 }))).toBe('small')
    expect(evaluate(expr, ctx({ zoom: 10 }))).toBe('medium')
    expect(evaluate(expr, ctx({ zoom: 12 }))).toBe('medium')
    expect(evaluate(expr, ctx({ zoom: 15 }))).toBe('large')
    expect(evaluate(expr, ctx({ zoom: 20 }))).toBe('large')
  })
})

// ---------- filter behaviour ----------

describe('filter expressions', () => {
  test('geometry-type point filter', () => {
    const expr = ['all', ['==', ['geometry-type'], 'Point'], ['has', 'name']]
    const hit = ctx({ feature: { type: 1, properties: { name: 'x' } } })
    const miss = ctx({ feature: { type: 2, properties: { name: 'x' } } })
    expect(evaluate(expr, hit)).toBe(true)
    expect(evaluate(expr, miss)).toBe(false)
  })
})

describe('legacy filter conversion', () => {
  test('bare property name becomes get', () => {
    const legacy = ['==', 'class', 'road']
    const upgraded = convertLegacyFilter(legacy)
    expect(upgraded).toEqual(['==', ['get', 'class'], 'road'])
  })
  test('already-upgraded filters pass through unchanged', () => {
    const expr = ['==', ['get', 'class'], 'road']
    expect(convertLegacyFilter(expr)).toBe(expr)
  })
  test('has / !has legacy form', () => {
    expect(convertLegacyFilter(['has', 'name'])).toEqual(['has', 'name'])
    expect(convertLegacyFilter(['!has', 'name'])).toEqual(['!has', 'name'])
  })
  test('in with $type becomes geometry-type', () => {
    const upgraded = convertLegacyFilter(['in', '$type', 'Point', 'LineString'])
    expect(upgraded).toEqual(['in', ['geometry-type'], 'Point', 'LineString'])
  })
  test('combinators recurse', () => {
    const legacy = ['all', ['==', 'class', 'road'], ['has', 'name']]
    const upgraded = convertLegacyFilter(legacy)
    expect(upgraded).toEqual(['all', ['==', ['get', 'class'], 'road'], ['has', 'name']])
  })
  test('legacy form evaluates identically to upgraded form', () => {
    const legacy = ['==', 'class', 'road']
    const upgraded = convertLegacyFilter(legacy)
    const c = ctx({ feature: { type: 2, properties: { class: 'road' } } })
    expect(evaluate(upgraded, c)).toBe(true)
  })
})

// ---------- errors ----------

describe('errors', () => {
  test('malformed interpolate throws ExpressionError', () => {
    let caught: unknown
    try { compile(['interpolate', ['linear'], ['zoom'], 0], 'number') }
    catch (e) { caught = e }
    expect(caught).toBeInstanceOf(ExpressionError)
    if (caught instanceof ExpressionError) {
      expect(caught.message.length).toBeGreaterThan(0)
      expect(caught.expression).toBeDefined()
    }
  })
  test('unknown interpolation type throws', () => {
    expect(() => compile(['interpolate', ['cosine'], ['zoom'], 0, 0, 1, 1], 'number')).toThrow(ExpressionError)
  })
  test('interpolate with non-monotonic stops throws', () => {
    expect(() => compile(['interpolate', ['linear'], ['zoom'], 10, 0, 5, 1], 'number')).toThrow(ExpressionError)
  })
  test('case with even argument count throws', () => {
    expect(() => compile(['case', true, 1, true], 'number')).toThrow(ExpressionError)
  })
  test('divide-by-zero throws at eval time', () => {
    const c = compile(['/', 1, 0], 'number')
    expect(() => c.evaluate(ctx())).toThrow(ExpressionError)
  })
  test('to-color on un-parseable value throws', () => {
    expect(() => evaluate(['to-color', 'not-a-color'], ctx())).toThrow(ExpressionError)
  })
})

// ---------- dependency metadata ----------

describe('dependency metadata', () => {
  test('literal has no dependencies', () => {
    const c = compile(['literal', 5])
    expect(c.dependsOnZoom).toBe(false)
    expect(c.dependsOnFeature).toBe(false)
    expect(c.dependsOnFeatureState).toBe(false)
  })
  test('zoom depends only on zoom', () => {
    const c = compile(['zoom'])
    expect(c.dependsOnZoom).toBe(true)
    expect(c.dependsOnFeature).toBe(false)
    expect(c.dependsOnFeatureState).toBe(false)
  })
  test('get depends only on feature', () => {
    const c = compile(['get', 'foo'])
    expect(c.dependsOnZoom).toBe(false)
    expect(c.dependsOnFeature).toBe(true)
    expect(c.dependsOnFeatureState).toBe(false)
  })
  test('feature-state depends only on state', () => {
    const c = compile(['feature-state', 'hover'])
    expect(c.dependsOnZoom).toBe(false)
    expect(c.dependsOnFeature).toBe(false)
    expect(c.dependsOnFeatureState).toBe(true)
  })
  test('composed expressions merge dependencies', () => {
    const c = compile(['interpolate', ['linear'], ['zoom'], 0, ['get', 'a'], 10, ['feature-state', 'b']])
    expect(c.dependsOnZoom).toBe(true)
    expect(c.dependsOnFeature).toBe(true)
    expect(c.dependsOnFeatureState).toBe(true)
  })
})

// ---------- validator integration ----------

describe('isExpression / validateExpression', () => {
  test('isExpression rejects plain literals and objects', () => {
    expect(isExpression('red')).toBe(false)
    expect(isExpression(5)).toBe(false)
    expect(isExpression([1, 2, 3])).toBe(false)
    expect(isExpression(null)).toBe(false)
  })
  test('isExpression accepts arrays with a known operator head', () => {
    expect(isExpression(['get', 'foo'])).toBe(true)
    expect(isExpression(['interpolate', ['linear'], ['zoom'], 0, 0, 1, 1])).toBe(true)
  })
  test('validateExpression surfaces compiler errors', () => {
    const errs = validateExpression(['interpolate', ['linear'], ['zoom'], 0], 'number')
    expect(errs.length).toBeGreaterThan(0)
  })
})

describe('style-spec integration', () => {
  test('valid fill-color expression produces no errors', () => {
    const errs = validatePaintProperty('fill', 'fill-color', [
      'interpolate', ['linear'], ['zoom'], 0, 'red', 10, 'blue',
    ])
    expect(errs).toEqual([])
  })
  test('invalid fill-color expression surfaces error', () => {
    const errs = validatePaintProperty('fill', 'fill-color', [
      'interpolate', ['cosine'], ['zoom'], 0, 'red', 10, 'blue',
    ])
    expect(errs.length).toBeGreaterThan(0)
    expect(errs[0].message).toContain('Invalid expression')
  })
})
