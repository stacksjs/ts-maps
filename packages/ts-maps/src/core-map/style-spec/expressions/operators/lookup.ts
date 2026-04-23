// Lookup operators — the narrow interface the evaluator has onto its context.
// These are the leaves of most expression trees: `['get', 'class']`,
// `['zoom']`, `['geometry-type']`, and so on.

import type { CompiledExpression } from '../types'
import { ExpressionError } from '../errors'
import { registerOperator } from '../registry'

export function registerLookupOps(): void {
  // literal — bypass the compiler entirely so arrays/objects can be carried
  // as data without being interpreted as further expressions.
  registerOperator('literal', (args, _compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"literal" expects 1 argument, got ${args.length}`, ['literal', ...args], path)
    const value = args[0]
    return {
      evaluate: () => value,
      returnType: inferLiteralType(value),
      dependsOnZoom: false,
      dependsOnFeature: false,
      dependsOnFeatureState: false,
    }
  })

  // get — read a property off the feature (or an explicit object argument).
  registerOperator('get', (args, compile, path) => {
    if (args.length < 1 || args.length > 2)
      throw new ExpressionError(`"get" expects 1 or 2 arguments, got ${args.length}`, ['get', ...args], path)
    if (typeof args[0] !== 'string')
      throw new ExpressionError('"get" key must be a string literal', ['get', ...args], path)
    const key = args[0]
    if (args.length === 2) {
      const obj = compile(args[1], 'value', path.concat(2))
      return {
        evaluate: (ctx) => {
          const o = obj.evaluate(ctx)
          if (o && typeof o === 'object') return (o as Record<string, unknown>)[key]
          return undefined
        },
        returnType: 'value',
        dependsOnZoom: obj.dependsOnZoom,
        dependsOnFeature: obj.dependsOnFeature,
        dependsOnFeatureState: obj.dependsOnFeatureState,
      }
    }
    return {
      evaluate: (ctx) => {
        const props = ctx.feature ? ctx.feature.properties : undefined
        return props ? props[key] : undefined
      },
      returnType: 'value',
      dependsOnZoom: false,
      dependsOnFeature: true,
      dependsOnFeatureState: false,
    }
  })

  // has — boolean form of `get`.
  registerOperator('has', (args, compile, path) => {
    if (args.length < 1 || args.length > 2)
      throw new ExpressionError(`"has" expects 1 or 2 arguments, got ${args.length}`, ['has', ...args], path)
    if (typeof args[0] !== 'string')
      throw new ExpressionError('"has" key must be a string literal', ['has', ...args], path)
    const key = args[0]
    if (args.length === 2) {
      const obj = compile(args[1], 'value', path.concat(2))
      return {
        evaluate: (ctx) => {
          const o = obj.evaluate(ctx)
          if (o && typeof o === 'object')
            return Object.prototype.hasOwnProperty.call(o, key)
          return false
        },
        returnType: 'boolean',
        dependsOnZoom: obj.dependsOnZoom,
        dependsOnFeature: obj.dependsOnFeature,
        dependsOnFeatureState: obj.dependsOnFeatureState,
      }
    }
    return {
      evaluate: (ctx) => {
        const props = ctx.feature ? ctx.feature.properties : undefined
        return props ? Object.prototype.hasOwnProperty.call(props, key) : false
      },
      returnType: 'boolean',
      dependsOnZoom: false,
      dependsOnFeature: true,
      dependsOnFeatureState: false,
    }
  })

  // at — index into an array by numeric offset. Mapbox clamps out-of-range
  // reads to `undefined`; we match that so invalid data doesn't blow up the
  // whole render.
  registerOperator('at', (args, compile, path) => {
    if (args.length !== 2)
      throw new ExpressionError(`"at" expects 2 arguments, got ${args.length}`, ['at', ...args], path)
    const idx = compile(args[0], 'number', path.concat(1))
    const arr = compile(args[1], 'array', path.concat(2))
    return {
      evaluate: (ctx) => {
        const a = arr.evaluate(ctx)
        const i = idx.evaluate(ctx)
        if (!Array.isArray(a) || typeof i !== 'number') return undefined
        if (i < 0 || i >= a.length || !Number.isFinite(i)) return undefined
        return a[Math.floor(i)]
      },
      returnType: 'value',
      dependsOnZoom: idx.dependsOnZoom || arr.dependsOnZoom,
      dependsOnFeature: idx.dependsOnFeature || arr.dependsOnFeature,
      dependsOnFeatureState: idx.dependsOnFeatureState || arr.dependsOnFeatureState,
    }
  })

  // length — works on both strings and arrays.
  registerOperator('length', (args, compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"length" expects 1 argument, got ${args.length}`, ['length', ...args], path)
    const inner = compile(args[0], 'value', path.concat(1))
    return {
      evaluate: (ctx) => {
        const v = inner.evaluate(ctx)
        if (typeof v === 'string' || Array.isArray(v)) return v.length
        return 0
      },
      returnType: 'number',
      dependsOnZoom: inner.dependsOnZoom,
      dependsOnFeature: inner.dependsOnFeature,
      dependsOnFeatureState: inner.dependsOnFeatureState,
    }
  })

  // properties — the whole property bag of the active feature.
  registerOperator('properties', (args, _compile, path) => {
    if (args.length !== 0)
      throw new ExpressionError(`"properties" takes no arguments, got ${args.length}`, ['properties', ...args], path)
    return {
      evaluate: ctx => (ctx.feature ? ctx.feature.properties : {}),
      returnType: 'value',
      dependsOnZoom: false,
      dependsOnFeature: true,
      dependsOnFeatureState: false,
    }
  })

  // geometry-type — 'Point' | 'LineString' | 'Polygon' based on the MVT type
  // byte. Unknown geometry returns 'Unknown' so downstream `match`/`case`
  // clauses can branch defensively.
  registerOperator('geometry-type', (args, _compile, path) => {
    if (args.length !== 0)
      throw new ExpressionError(`"geometry-type" takes no arguments, got ${args.length}`, ['geometry-type', ...args], path)
    return {
      evaluate: (ctx) => {
        if (!ctx.feature) return 'Unknown'
        switch (ctx.feature.type) {
          case 1: return 'Point'
          case 2: return 'LineString'
          case 3: return 'Polygon'
          default: return 'Unknown'
        }
      },
      returnType: 'string',
      dependsOnZoom: false,
      dependsOnFeature: true,
      dependsOnFeatureState: false,
    }
  })

  // id — feature id (may be undefined for sources that don't emit ids).
  registerOperator('id', (args, _compile, path) => {
    if (args.length !== 0)
      throw new ExpressionError(`"id" takes no arguments, got ${args.length}`, ['id', ...args], path)
    return {
      evaluate: ctx => (ctx.feature ? ctx.feature.id : undefined),
      returnType: 'value',
      dependsOnZoom: false,
      dependsOnFeature: true,
      dependsOnFeatureState: false,
    }
  })

  // zoom — the live zoom, used for zoom-based interpolation stops.
  registerOperator('zoom', (args, _compile, path) => {
    if (args.length !== 0)
      throw new ExpressionError(`"zoom" takes no arguments, got ${args.length}`, ['zoom', ...args], path)
    return {
      evaluate: ctx => ctx.zoom,
      returnType: 'number',
      dependsOnZoom: true,
      dependsOnFeature: false,
      dependsOnFeatureState: false,
    }
  })

  // line-progress — fractional position [0, 1] along the line being drawn.
  // Only meaningful inside a `line-gradient` paint property; elsewhere it
  // resolves to 0 so stops sample deterministically during validation.
  registerOperator('line-progress', (args, _compile, path) => {
    if (args.length !== 0)
      throw new ExpressionError(`"line-progress" takes no arguments, got ${args.length}`, ['line-progress', ...args], path)
    return {
      evaluate: ctx => ctx.lineProgress ?? 0,
      returnType: 'number',
      dependsOnZoom: false,
      dependsOnFeature: false,
      dependsOnFeatureState: false,
    }
  })

  // feature-state — reads from an out-of-band state bag (hover, selection).
  // Returns undefined when no state has been set; callers should pair this
  // with `coalesce` for defaults.
  registerOperator('feature-state', (args, _compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"feature-state" expects 1 argument, got ${args.length}`, ['feature-state', ...args], path)
    if (typeof args[0] !== 'string')
      throw new ExpressionError('"feature-state" key must be a string literal', ['feature-state', ...args], path)
    const key = args[0]
    return {
      evaluate: (ctx) => {
        const state = ctx.featureState
        return state ? state[key] : undefined
      },
      returnType: 'value',
      dependsOnZoom: false,
      dependsOnFeature: false,
      dependsOnFeatureState: true,
    }
  })
}

function inferLiteralType(value: unknown): CompiledExpression['returnType'] {
  if (value === null) return 'null'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  return 'value'
}
