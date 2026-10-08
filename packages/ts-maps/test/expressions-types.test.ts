import { describe, expect, test } from 'bun:test'
import { compile, evaluate, ExpressionError, isExpression, validateExpression } from '../src/core-map/style-spec/expressions'
import { validatePaintProperty } from '../src/core-map/style-spec/validate'

const at = (properties: Record<string, unknown> = {}, featureState?: Record<string, unknown>) => ({
  zoom: 10,
  feature: { type: 1 as const, properties },
  featureState,
})

describe('type assertions', () => {
  test('["boolean", ["feature-state", "hover"], false]: the default until there is state', () => {
    const expr = ['boolean', ['feature-state', 'hover'], false]
    expect(evaluate(expr, at())).toBe(false)
    expect(evaluate(expr, at({}, { hover: true }))).toBe(true)
    // As it is used: inside a case, compiled for a colour.
    const colour = compile(['case', ['boolean', ['feature-state', 'hover'], false], '#f00', '#00f'], 'color')
    expect(colour.evaluate(at({}, { hover: true }))).toBe('#f00')
    expect(colour.evaluate(at())).toBe('#00f')
  })

  test('string, number, object: the first argument of the type', () => {
    expect(evaluate(['string', ['get', 'name'], 'unnamed'], at({ name: 'Elm St' }))).toBe('Elm St')
    expect(evaluate(['string', ['get', 'name'], 'unnamed'], at({ name: 7 }))).toBe('unnamed')
    expect(evaluate(['number', ['get', 'rank'], 0], at({ rank: 3 }))).toBe(3)
    expect(evaluate(['number', ['get', 'rank'], 0], at({ rank: '3' }))).toBe(0)
    expect(evaluate(['object', ['get', 'meta'], ['literal', {}]], at({ meta: { a: 1 } }))).toEqual({ a: 1 })
    expect(evaluate(['object', ['get', 'meta'], ['literal', {}]], at({ meta: [1] }))).toEqual({})
  })

  test('none of the type is an error', () => {
    expect(() => evaluate(['number', ['get', 'x']], at({ x: 'a' }))).toThrow(ExpressionError)
    expect(() => evaluate(['boolean', ['get', 'x']], at())).toThrow('expected boolean')
  })

  test('array, with an item type and a length', () => {
    expect(evaluate(['array', ['literal', [1, 2]]], at())).toEqual([1, 2])
    expect(evaluate(['array', 'number', ['literal', [1, 2]]], at())).toEqual([1, 2])
    expect(evaluate(['array', 'number', 2, ['get', 'pair']], at({ pair: [3, 4] }))).toEqual([3, 4])
    expect(() => evaluate(['array', 'number', 3, ['literal', [1, 2]]], at())).toThrow('array<number, 3>')
    expect(() => evaluate(['array', 'string', ['literal', [1]]], at())).toThrow(ExpressionError)
    expect(() => evaluate(['array', ['get', 'x']], at({ x: 'no' }))).toThrow(ExpressionError)
    expect(validateExpression(['array', 'colour', ['literal', []]], 'array')[0]).toContain('item type')
  })

  test('they are expressions to the validator', () => {
    for (const op of ['boolean', 'string', 'number', 'object', 'array'])
      expect(isExpression([op, 1])).toBe(true)
    expect(validatePaintProperty('circle', 'circle-opacity', ['number', ['get', 'o'], 1])).toEqual([])
  })
})

describe('conversions', () => {
  test('to-boolean, to-string, to-color', () => {
    expect(evaluate(['to-boolean', ['get', 'x']], at({ x: '' }))).toBe(false)
    expect(evaluate(['to-boolean', ['get', 'x']], at({ x: 'y' }))).toBe(true)
    expect(evaluate(['to-string', ['get', 'x']], at({ x: 12 }))).toBe('12')
    expect(evaluate(['to-color', ['get', 'c'], '#000'], at({ c: 'nope' }))).toBe('rgba(0,0,0,1)')
  })

  test('to-number: null is 0, as in Mapbox, and the rest fall through', () => {
    expect(evaluate(['to-number', ['get', 'missing'], 5], at())).toBe(0)
    expect(evaluate(['to-number', 'abc', '7'], at())).toBe(7)
    expect(evaluate(['to-number', true], at())).toBe(1)
    expect(evaluate(['to-number', ''], at())).toBe(0)
  })
})

describe('unknown operators', () => {
  test('are an error naming the operator, not a literal array', () => {
    expect(() => compile(['get-property', 'name'], 'value')).toThrow(ExpressionError)
    expect(() => compile(['get-property', 'name'], 'value')).toThrow('"get-property"')
    // Nested too.
    expect(() => compile(['case', ['bogus', 1], 1, 0], 'number')).toThrow('"bogus"')
    expect(validateExpression(['==', ['getx', 'a'], 1], 'boolean')[0]).toContain('"getx"')
  })

  test('the style validator says which operator it does not know', () => {
    const errors = validatePaintProperty('fill', 'fill-color', ['interpolate-hcl-ish', ['zoom'], 0, '#000'])
    expect(errors.length).toBe(1)
    expect(errors[0]!.message).toContain('"interpolate-hcl-ish"')
  })

  test('literal arrays still work where they belong', () => {
    expect(evaluate(['literal', ['a', 'b']], at())).toEqual(['a', 'b'])
    expect(evaluate(['match', ['get', 'k'], ['a', 'b'], 1, 0], at({ k: 'b' }))).toBe(1)
    expect(evaluate(['in', ['get', 'k'], ['literal', ['x', 'y']]], at({ k: 'y' }))).toBe(true)
    // Numeric tuples are data.
    expect(compile([0, 2], 'value').evaluate(at())).toEqual([0, 2])
    // A plain value that is not an expression is returned as it is.
    expect(evaluate(['Open Sans Regular', 'Arial Unicode MS Regular'], at())).toEqual(['Open Sans Regular', 'Arial Unicode MS Regular'])
    expect(validatePaintProperty('line', 'line-dasharray', [2, 1])).toEqual([])
  })
})
