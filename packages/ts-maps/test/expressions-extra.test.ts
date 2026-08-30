import type { EvaluationContext } from '../src/core-map/style-spec/expressions'
import { describe, expect, test } from 'bun:test'
import { compile, evaluate, ExpressionError } from '../src/core-map/style-spec/expressions'
import { Formatted } from '../src/core-map/style-spec/expressions/formatted'

const ctx: EvaluationContext = {
  zoom: 10,
  feature: { type: 1, properties: { name: 'Ocean Park', population: 12345, tags: ['beach', 'park'] } },
}

function run(expr: unknown): unknown {
  return evaluate(expr, ctx)
}

describe('trigonometry operators', () => {
  test('sin, cos and tan take radians', () => {
    expect(run(['sin', 0])).toBe(0)
    expect(run(['cos', 0])).toBe(1)
    expect(run(['tan', 0])).toBe(0)
    expect(run(['sin', ['/', ['pi'], 2]]) as number).toBeCloseTo(1, 10)
  })

  test('the inverses round-trip', () => {
    expect(run(['asin', 1]) as number).toBeCloseTo(Math.PI / 2, 10)
    expect(run(['acos', 1])).toBe(0)
    expect(run(['atan', 1]) as number).toBeCloseTo(Math.PI / 4, 10)
  })

  test('asin and acos reject inputs outside their domain', () => {
    expect(() => run(['asin', 2])).toThrow(ExpressionError)
    expect(() => run(['acos', -2])).toThrow(ExpressionError)
  })
})

describe('let / var', () => {
  test('binds a value the body can read back', () => {
    expect(run(['let', 'n', 4, ['*', ['var', 'n'], 3]])).toBe(12)
  })

  test('binds several names at once', () => {
    expect(run(['let', 'a', 2, 'b', 5, ['+', ['var', 'a'], ['var', 'b']]])).toBe(7)
  })

  test('a nested let shadows the outer binding without destroying it', () => {
    expect(run([
      'let',
      'n',
      1,
      ['concat', ['let', 'n', 2, ['to-string', ['var', 'n']]], '-', ['to-string', ['var', 'n']]],
    ])).toBe('2-1')
  })

  test('bindings can read the feature', () => {
    expect(run(['let', 'p', ['get', 'name'], ['upcase', ['var', 'p']]])).toBe('OCEAN PARK')
  })

  test('a feature-dependent binding propagates that dependency', () => {
    // Otherwise the renderer would cache one value across every feature.
    const compiled = compile(['let', 'p', ['get', 'name'], ['var', 'p']], 'value', [])
    expect(compiled.dependsOnFeature).toBe(true)
  })

  test('an unbound name is an error, not a silent null', () => {
    expect(() => run(['var', 'nope'])).toThrow(ExpressionError)
  })

  test('malformed let is rejected at compile time', () => {
    expect(() => run(['let', 'a', 1])).toThrow(ExpressionError)
    expect(() => run(['let', 2, 1, ['var', 'a']])).toThrow(ExpressionError)
  })
})

describe('index-of and slice', () => {
  test('index-of finds substrings and array members', () => {
    expect(run(['index-of', 'Park', ['get', 'name']])).toBe(6)
    expect(run(['index-of', 'missing', ['get', 'name']])).toBe(-1)
    expect(run(['index-of', 'park', ['get', 'tags']])).toBe(1)
  })

  test('index-of honours a start offset', () => {
    expect(run(['index-of', 'a', 'banana'])).toBe(1)
    expect(run(['index-of', 'a', 'banana', 2])).toBe(3)
  })

  test('slice cuts strings and arrays, including from the end', () => {
    expect(run(['slice', ['get', 'name'], 6])).toBe('Park')
    expect(run(['slice', ['get', 'name'], 0, 5])).toBe('Ocean')
    expect(run(['slice', ['get', 'name'], -4])).toBe('Park')
    expect(run(['slice', ['get', 'tags'], 1])).toEqual(['park'])
  })

  test('an out-of-range slice yields an empty result rather than throwing', () => {
    expect(run(['slice', 'abc', 99])).toBe('')
  })
})

describe('number-format', () => {
  test('formats with grouping for a locale', () => {
    expect(run(['number-format', ['get', 'population'], { locale: 'en-US' }])).toBe('12,345')
  })

  test('honours fraction-digit bounds', () => {
    expect(run(['number-format', 1.5, { locale: 'en-US', 'min-fraction-digits': 2 }])).toBe('1.50')
    expect(run(['number-format', 1.239, { locale: 'en-US', 'max-fraction-digits': 1 }])).toBe('1.2')
  })

  test('rejects a missing options object', () => {
    expect(() => run(['number-format', 1])).toThrow(ExpressionError)
    expect(() => run(['number-format', 1, 'en-US'])).toThrow(ExpressionError)
  })
})

describe('format', () => {
  test('reads as the concatenation of its sections', () => {
    // Sections are kept as structure for the renderer, but every path that
    // only wants the text — a query result, an emptiness check — sees a
    // string.
    expect(String(run(['format', ['get', 'name'], '\n', 'Santa Monica']))).toBe('Ocean Park\nSanta Monica')
  })

  test('an options object belongs to the section before it', () => {
    const out = run(['format', ['get', 'name'], { 'font-scale': 1.2 }, ' CA', {}]) as Formatted
    expect(String(out)).toBe('Ocean Park CA')
    expect(out.sections.map(s => s.text)).toEqual(['Ocean Park', ' CA'])
    expect(out.sections[0].scale).toBe(1.2)
    expect(out.sections[1].scale).toBeUndefined()
  })

  test('carries per-section font, scale and colour', () => {
    const out = run(['format',
      'M',
      { 'font-scale': 1.4, 'text-color': '#ff0000', 'text-font': ['literal', ['Noto Sans Bold']] },
      '5',
      { 'font-scale': 0.8 },
    ]) as Formatted

    expect(out.sections[0]).toMatchObject({ text: 'M', scale: 1.4, color: '#ff0000', fontStack: ['Noto Sans Bold'] })
    expect(out.sections[1]).toMatchObject({ text: '5', scale: 0.8 })
    expect(out.uniform).toBe(false)
  })

  test('section options may themselves be expressions', () => {
    const out = run(['format',
      ['get', 'name'],
      { 'text-color': ['case', ['==', ['get', 'name'], 'Ocean Park'], '#00ff00', '#000000'] },
    ]) as Formatted
    expect(out.sections[0].color).toBe('#00ff00')
  })

  test('plain sections report themselves as uniform', () => {
    expect((run(['format', 'a', 'b']) as Formatted).uniform).toBe(true)
  })

  test('reports itself as formatted text', () => {
    expect(compile(['format', 'x'], 'value', []).returnType).toBe('formatted')
  })
})
