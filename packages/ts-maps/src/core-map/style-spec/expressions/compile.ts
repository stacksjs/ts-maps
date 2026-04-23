// The expression compiler. Walks a Mapbox-style expression array and returns
// a compiled form — an `evaluate` closure together with dependency metadata
// that downstream consumers (the renderer, caches) use to skip work.

import type { CompiledExpression, ExpressionType } from './types'
import { parseColor } from './Color'
import { ExpressionError } from './errors'
import { registerConversionOps } from './operators/conversion'
import { registerInterpolateOps } from './operators/interpolate'
import { registerLogicalOps } from './operators/logical'
import { registerLookupOps } from './operators/lookup'
import { registerMathOps } from './operators/math'
import { registerStringOps } from './operators/string'
import { getOperator } from './registry'

// One-shot registry boot. Module-scoped boolean rather than a top-level call
// so multiple bundlers and test runners don't race on initialisation order.
let BOOTED = false
export function boot(): void {
  if (BOOTED) return
  BOOTED = true
  registerLookupOps()
  registerLogicalOps()
  registerMathOps()
  registerConversionOps()
  registerStringOps()
  registerInterpolateOps()
}

// Wrap a plain literal into a CompiledExpression. Reuse this shape so the
// evaluator's hot path never needs a type check for literals — it's always
// a closure that returns a constant.
function compileLiteral(value: unknown, expected: ExpressionType, path: (string | number)[]): CompiledExpression {
  if (expected === 'color') {
    if (typeof value !== 'string')
      throw new ExpressionError(`expected color string, got ${typeof value}`, value, path)
    const rgba = parseColor(value)
    if (!rgba) throw new ExpressionError(`invalid color string ${JSON.stringify(value)}`, value, path)
    return {
      evaluate: () => value,
      returnType: 'color',
      dependsOnZoom: false,
      dependsOnFeature: false,
      dependsOnFeatureState: false,
    }
  }
  if (expected === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value))
      throw new ExpressionError(`expected number, got ${String(value)}`, value, path)
  }
  else if (expected === 'boolean') {
    if (typeof value !== 'boolean')
      throw new ExpressionError(`expected boolean, got ${typeof value}`, value, path)
  }
  else if (expected === 'string' || expected === 'formatted' || expected === 'resolvedImage') {
    if (typeof value !== 'string')
      throw new ExpressionError(`expected string, got ${typeof value}`, value, path)
  }
  const returnType: ExpressionType
    = value === null
      ? 'null'
      : typeof value === 'string'
        ? 'string'
        : typeof value === 'number'
          ? 'number'
          : typeof value === 'boolean'
            ? 'boolean'
            : Array.isArray(value)
              ? 'array'
              : 'value'
  return {
    evaluate: () => value,
    returnType,
    dependsOnZoom: false,
    dependsOnFeature: false,
    dependsOnFeatureState: false,
  }
}

// The recursive compiler.
export function compile(
  expr: unknown,
  expectedType: ExpressionType = 'value',
  path: (string | number)[] = [],
): CompiledExpression {
  boot()

  // Arrays that don't lead with a known operator are treated as literal
  // data — common for [number, number] tuples used in translate properties.
  if (Array.isArray(expr)) {
    const head = expr[0]
    if (typeof head === 'string') {
      const op = getOperator(head)
      if (op) {
        const args = expr.slice(1)
        return op(args, compile, path, expectedType)
      }
      // Fall through: unknown string head with an otherwise array-shaped
      // payload means literal data — `['a', 'b']` as a text-font value, say.
    }
    return compileLiteral(expr, 'array', path)
  }

  return compileLiteral(expr, expectedType, path)
}
