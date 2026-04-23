// Type-coercion operators. These are the bridge between the loose `value`
// return type used throughout the DSL and the narrowly-typed paint/layout
// properties that consume evaluator output.

import type { CompiledExpression, RGBA } from '../types'
import { parseColor } from '../Color'
import { ExpressionError } from '../errors'
import { registerOperator } from '../registry'

function mergeDeps(children: CompiledExpression[]): {
  dependsOnZoom: boolean
  dependsOnFeature: boolean
  dependsOnFeatureState: boolean
} {
  let z = false
  let f = false
  let s = false
  for (const c of children) {
    if (c.dependsOnZoom) z = true
    if (c.dependsOnFeature) f = true
    if (c.dependsOnFeatureState) s = true
  }
  return { dependsOnZoom: z, dependsOnFeature: f, dependsOnFeatureState: s }
}

export function registerConversionOps(): void {
  // to-string — mirrors JavaScript's coercion except that objects render as
  // JSON to stay predictable in tile-label templates.
  registerOperator('to-string', (args, compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"to-string" expects 1 argument, got ${args.length}`, ['to-string', ...args], path)
    const inner = compile(args[0], 'value', path.concat(1))
    return {
      evaluate: (ctx) => {
        const v = inner.evaluate(ctx)
        if (v === null || v === undefined) return ''
        if (typeof v === 'string') return v
        if (typeof v === 'number' || typeof v === 'boolean') return String(v)
        try { return JSON.stringify(v) }
        catch { return String(v) }
      },
      returnType: 'string',
      ...mergeDeps([inner]),
    }
  })

  // to-number — Mapbox tries each argument in turn, returning the first that
  // coerces cleanly; if none work it throws. We follow that rule.
  registerOperator('to-number', (args, compile, path) => {
    if (args.length < 1)
      throw new ExpressionError('"to-number" expects at least 1 argument', ['to-number', ...args], path)
    const children = args.map((a, i) => compile(a, 'value', path.concat(i + 1)))
    const expr = ['to-number', ...args]
    return {
      evaluate: (ctx) => {
        for (let i = 0; i < children.length; i++) {
          const v = children[i]!.evaluate(ctx)
          if (v === null || v === undefined) continue
          if (typeof v === 'number') {
            if (!Number.isNaN(v)) return v
            continue
          }
          if (typeof v === 'boolean') return v ? 1 : 0
          if (typeof v === 'string') {
            const s = v.trim()
            if (s.length === 0) continue
            const n = Number(s)
            if (!Number.isNaN(n)) return n
          }
        }
        throw new ExpressionError('"to-number": could not convert any argument to a number', expr)
      },
      returnType: 'number',
      ...mergeDeps(children),
    }
  })

  // to-boolean — empty string, 0, null, undefined, and NaN are false.
  registerOperator('to-boolean', (args, compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"to-boolean" expects 1 argument, got ${args.length}`, ['to-boolean', ...args], path)
    const inner = compile(args[0], 'value', path.concat(1))
    return {
      evaluate: (ctx) => {
        const v = inner.evaluate(ctx)
        if (v === null || v === undefined) return false
        if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
        if (typeof v === 'string') return v.length > 0
        if (typeof v === 'boolean') return v
        if (Array.isArray(v)) return v.length > 0
        if (typeof v === 'object') return true
        return Boolean(v)
      },
      returnType: 'boolean',
      ...mergeDeps([inner]),
    }
  })

  // to-rgba — inverse of `to-color`: surfaces the [r, g, b, a] channels so
  // they can be plugged back into further computation.
  registerOperator('to-rgba', (args, compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"to-rgba" expects 1 argument, got ${args.length}`, ['to-rgba', ...args], path)
    const inner = compile(args[0], 'color', path.concat(1))
    const expr = ['to-rgba', ...args]
    return {
      evaluate: (ctx) => {
        const v = inner.evaluate(ctx)
        const rgba = coerceColor(v)
        if (!rgba) throw new ExpressionError(`"to-rgba": cannot convert ${String(v)} to a color`, expr)
        // Mapbox uses 0..255 for the first three channels and 0..1 for alpha.
        return [
          Math.round(rgba[0] * 255),
          Math.round(rgba[1] * 255),
          Math.round(rgba[2] * 255),
          rgba[3],
        ]
      },
      returnType: 'array',
      ...mergeDeps([inner]),
    }
  })

  // to-color — accepts a CSS string or a 3-/4-element numeric array. Throws
  // on anything else so downstream color interpolation doesn't silently fail.
  registerOperator('to-color', (args, compile, path) => {
    if (args.length < 1)
      throw new ExpressionError('"to-color" expects at least 1 argument', ['to-color', ...args], path)
    const children = args.map((a, i) => compile(a, 'value', path.concat(i + 1)))
    const expr = ['to-color', ...args]
    return {
      evaluate: (ctx) => {
        for (let i = 0; i < children.length; i++) {
          const v = children[i]!.evaluate(ctx)
          const rgba = coerceColor(v)
          if (rgba) return formatRgba(rgba)
        }
        throw new ExpressionError('"to-color": could not convert any argument to a color', expr)
      },
      returnType: 'color',
      ...mergeDeps(children),
    }
  })
}

// Normalise a `value` slot into an RGBA tuple. Accepts CSS strings, 3-tuples
// (r,g,b), and 4-tuples (r,g,b,a). Numeric values are read as 0..255.
function coerceColor(v: unknown): RGBA | null {
  if (typeof v === 'string') return parseColor(v)
  if (Array.isArray(v) && (v.length === 3 || v.length === 4)) {
    const r = Number(v[0])
    const g = Number(v[1])
    const b = Number(v[2])
    const a = v.length === 4 ? Number(v[3]) : 1
    if ([r, g, b, a].some(Number.isNaN)) return null
    return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255), clamp01(a)]
  }
  return null
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function formatRgba(c: RGBA): string {
  const r = Math.round(clamp01(c[0]) * 255)
  const g = Math.round(clamp01(c[1]) * 255)
  const b = Math.round(clamp01(c[2]) * 255)
  const a = clamp01(c[3])
  return `rgba(${r},${g},${b},${a === 1 ? '1' : String(Number(a.toFixed(4)))})`
}
