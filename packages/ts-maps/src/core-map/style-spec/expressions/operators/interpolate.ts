// Interpolation and stepping — zoom and data-driven curves. The heavy lifting
// on the hot path is the stop lookup and the per-type blend; we keep both
// tight by compiling the curve shape and the output type up front and
// dispatching to a specialised blender closure.

import type { CompiledExpression, RGBA } from '../types'
import { lerpColor, parseColor } from '../Color'
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

// Binary search for the rightmost stop whose input <= x. Returns -1 if x is
// below the first stop.
function findStop(stops: number[], x: number): number {
  if (stops.length === 0 || x < stops[0]!) return -1
  let lo = 0
  let hi = stops.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (stops[mid]! <= x) lo = mid
    else hi = mid - 1
  }
  return lo
}

// Normalised interpolation factor given two stop inputs. Clamps to [0, 1].
function linearT(a: number, b: number, x: number): number {
  if (a === b) return 0
  const t = (x - a) / (b - a)
  return t < 0 ? 0 : t > 1 ? 1 : t
}

function exponentialT(base: number, a: number, b: number, x: number): number {
  if (a === b) return 0
  if (base === 1) return linearT(a, b, x)
  const diff = b - a
  const progress = x - a
  const t = (base ** progress - 1) / (base ** diff - 1)
  return t < 0 ? 0 : t > 1 ? 1 : t
}

// Cubic-Bezier easing with control points (x1,y1) and (x2,y2), anchored at
// (0,0) and (1,1). Classic Newton-Raphson to solve x(t)=u, then sample y(t).
function cubicBezierT(x1: number, y1: number, x2: number, y2: number): (u: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t
  const sampleDerivX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx
  return (u) => {
    if (u <= 0) return 0
    if (u >= 1) return 1
    // Newton iterations — converges fast for well-shaped Beziers.
    let t = u
    for (let i = 0; i < 8; i++) {
      const x = sampleX(t) - u
      if (Math.abs(x) < 1e-6) return sampleY(t)
      const d = sampleDerivX(t)
      if (Math.abs(d) < 1e-6) break
      t -= x / d
    }
    // Bisection fallback for pathological control points.
    let lo = 0
    let hi = 1
    let tt = u
    for (let i = 0; i < 20; i++) {
      const x = sampleX(tt) - u
      if (Math.abs(x) < 1e-6) return sampleY(tt)
      if (x > 0) hi = tt
      else lo = tt
      tt = (lo + hi) / 2
    }
    return sampleY(tt)
  }
}

type Interp = {
  kind: 'linear'
} | {
  kind: 'exponential'
  base: number
} | {
  kind: 'cubic-bezier'
  bezier: (u: number) => number
}

function parseInterp(spec: unknown, path: (string | number)[]): Interp {
  if (!Array.isArray(spec) || spec.length === 0)
    throw new ExpressionError('"interpolate": interpolation type required', spec, path)
  const head = spec[0]
  if (head === 'linear') return { kind: 'linear' }
  if (head === 'exponential') {
    const base = Number(spec[1])
    if (!Number.isFinite(base) || base <= 0)
      throw new ExpressionError('"interpolate": exponential base must be a positive number', spec, path)
    return { kind: 'exponential', base }
  }
  if (head === 'cubic-bezier') {
    const x1 = Number(spec[1])
    const y1 = Number(spec[2])
    const x2 = Number(spec[3])
    const y2 = Number(spec[4])
    if ([x1, y1, x2, y2].some(n => !Number.isFinite(n)))
      throw new ExpressionError('"interpolate": cubic-bezier requires 4 numeric control points', spec, path)
    return { kind: 'cubic-bezier', bezier: cubicBezierT(x1, y1, x2, y2) }
  }
  throw new ExpressionError(`"interpolate": unknown interpolation type ${JSON.stringify(head)}`, spec, path)
}

// Pick the blender for a given return type. For types we don't know how to
// interpolate (strings, booleans, resolved images) we fall back to stepping —
// the spec says this is the required behaviour.
type Blender = (a: unknown, b: unknown, t: number) => unknown

function pickBlender(returnType: CompiledExpression['returnType']): Blender {
  if (returnType === 'number') {
    return (a, b, t) => {
      const av = Number(a)
      const bv = Number(b)
      return av + (bv - av) * t
    }
  }
  if (returnType === 'color') {
    return (a, b, t) => {
      const ac = toRgba(a)
      const bc = toRgba(b)
      if (!ac || !bc) return a
      return formatRgba(lerpColor(ac, bc, t))
    }
  }
  // When the return type is a plain string, try to interpret the endpoints
  // as colors — callers often omit an explicit type hint and pass colour
  // literals like `#ff0000`. Fall back to step for non-colour strings.
  if (returnType === 'string') {
    return (a, b, t) => {
      if (typeof a !== 'string' || typeof b !== 'string') return t < 1 ? a : b
      const ac = toRgba(a)
      const bc = toRgba(b)
      if (!ac || !bc) return t < 1 ? a : b
      return formatRgba(lerpColor(ac, bc, t))
    }
  }
  if (returnType === 'array') {
    return (a, b, t) => {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return a
      const out: number[] = new Array(a.length)
      for (let i = 0; i < a.length; i++) {
        const av = Number(a[i])
        const bv = Number(b[i])
        out[i] = av + (bv - av) * t
      }
      return out
    }
  }
  // step-wise fallback for anything we can't blend.
  return (a, _b, t) => (t < 1 ? a : _b)
}

function toRgba(v: unknown): RGBA | null {
  if (typeof v === 'string') return parseColor(v)
  if (Array.isArray(v) && (v.length === 3 || v.length === 4)) {
    const r = Number(v[0]) / 255
    const g = Number(v[1]) / 255
    const b = Number(v[2]) / 255
    const a = v.length === 4 ? Number(v[3]) : 1
    if ([r, g, b, a].some(Number.isNaN)) return null
    return [clamp01(r), clamp01(g), clamp01(b), clamp01(a)]
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

export function registerInterpolateOps(): void {
  registerOperator('interpolate', (args, compile, path, expected) => {
    if (args.length < 4 || args.length % 2 !== 0)
      throw new ExpressionError(
        `"interpolate" expects interpolation, input, (stop, value)+ — got ${args.length} arguments`,
        ['interpolate', ...args],
        path,
      )
    const interp = parseInterp(args[0], path.concat(1))
    const input = compile(args[1], 'number', path.concat(2))

    // Stops inherit the outer expected type — `fill-color` → color stops,
    // `line-width` → number stops. `value` falls back to inferring from the
    // first literal stop so un-hinted call sites still work.
    const stopExpected = expected === 'value' ? 'value' : expected
    const stopInputs: number[] = []
    const stopOutputs: CompiledExpression[] = []
    for (let i = 2; i < args.length; i += 2) {
      const stopIn = args[i]
      if (typeof stopIn !== 'number')
        throw new ExpressionError(
          `"interpolate": stop input at position ${i} must be a number literal`,
          ['interpolate', ...args],
          path.concat(i + 1),
        )
      stopInputs.push(stopIn)
      stopOutputs.push(compile(args[i + 1], stopExpected, path.concat(i + 2)))
    }
    // Stops must be strictly ascending so the binary search is meaningful.
    for (let i = 1; i < stopInputs.length; i++) {
      if (stopInputs[i]! <= stopInputs[i - 1]!)
        throw new ExpressionError(
          '"interpolate": stop inputs must be strictly increasing',
          ['interpolate', ...args],
          path,
        )
    }

    // Determine return type from the outer expected (when hinted) or from
    // the first stop's compiled output. We don't enforce matching output
    // types here — the evaluator will tolerate mismatches by stepping.
    const returnType: CompiledExpression['returnType']
      = expected !== 'value' ? expected : stopOutputs[0]!.returnType
    const blend = pickBlender(returnType)

    const children: CompiledExpression[] = [input, ...stopOutputs]
    return {
      evaluate: (ctx) => {
        const x = Number(input.evaluate(ctx))
        if (!Number.isFinite(x)) return stopOutputs[0]!.evaluate(ctx)
        const idx = findStop(stopInputs, x)
        if (idx < 0) return stopOutputs[0]!.evaluate(ctx)
        if (idx >= stopInputs.length - 1) return stopOutputs[stopOutputs.length - 1]!.evaluate(ctx)
        const a = stopInputs[idx]!
        const b = stopInputs[idx + 1]!
        let t: number
        if (interp.kind === 'linear') t = linearT(a, b, x)
        else if (interp.kind === 'exponential') t = exponentialT(interp.base, a, b, x)
        else {
          const u = linearT(a, b, x)
          t = interp.bezier(u)
        }
        return blend(stopOutputs[idx]!.evaluate(ctx), stopOutputs[idx + 1]!.evaluate(ctx), t)
      },
      returnType,
      ...mergeDeps(children),
    }
  })

  // step — piecewise constant. The first value is the fallback used for
  // inputs below the first stop boundary.
  registerOperator('step', (args, compile, path, expected) => {
    if (args.length < 4 || args.length % 2 !== 0)
      throw new ExpressionError(
        `"step" expects input, fallback, (stop, value)+ — got ${args.length} arguments`,
        ['step', ...args],
        path,
      )
    const input = compile(args[0], 'number', path.concat(1))
    const fallback = compile(args[1], expected, path.concat(2))
    const stopInputs: number[] = []
    const stopOutputs: CompiledExpression[] = []
    for (let i = 2; i < args.length; i += 2) {
      const stopIn = args[i]
      if (typeof stopIn !== 'number')
        throw new ExpressionError(
          `"step": stop input at position ${i} must be a number literal`,
          ['step', ...args],
          path.concat(i + 1),
        )
      stopInputs.push(stopIn)
      stopOutputs.push(compile(args[i + 1], expected, path.concat(i + 2)))
    }
    for (let i = 1; i < stopInputs.length; i++) {
      if (stopInputs[i]! <= stopInputs[i - 1]!)
        throw new ExpressionError(
          '"step": stop inputs must be strictly increasing',
          ['step', ...args],
          path,
        )
    }

    const returnType: CompiledExpression['returnType']
      = expected !== 'value'
        ? expected
        : stopOutputs.length > 0 ? stopOutputs[0]!.returnType : fallback.returnType
    const children: CompiledExpression[] = [input, fallback, ...stopOutputs]
    return {
      evaluate: (ctx) => {
        const x = Number(input.evaluate(ctx))
        if (!Number.isFinite(x)) return fallback.evaluate(ctx)
        const idx = findStop(stopInputs, x)
        if (idx < 0) return fallback.evaluate(ctx)
        return stopOutputs[idx]!.evaluate(ctx)
      },
      returnType,
      ...mergeDeps(children),
    }
  })
}
