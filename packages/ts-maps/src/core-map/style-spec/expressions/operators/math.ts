// Math operators. Everything here is defined on numbers only; non-numeric
// inputs throw at evaluation time so that buggy styles fail loudly rather
// than silently rendering garbage.

import type { CompiledExpression } from '../types'
import { ExpressionError } from '../errors'
import { registerOperator } from '../registry'

function expectNumber(value: unknown, op: string, expr: unknown[]): number {
  if (typeof value !== 'number' || Number.isNaN(value))
    throw new ExpressionError(`"${op}": expected number, got ${String(value)}`, expr)
  return value
}

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

export function registerMathOps(): void {
  // `+` / `*` — n-ary reductions. Empty lists are identity (0 / 1).
  registerOperator('+', (args, compile, path) => {
    const children = args.map((a, i) => compile(a, 'number', path.concat(i + 1)))
    const expr = ['+', ...args]
    return {
      evaluate: (ctx) => {
        let acc = 0
        for (let i = 0; i < children.length; i++)
          acc += expectNumber(children[i]!.evaluate(ctx), '+', expr)
        return acc
      },
      returnType: 'number',
      ...mergeDeps(children),
    }
  })

  registerOperator('*', (args, compile, path) => {
    const children = args.map((a, i) => compile(a, 'number', path.concat(i + 1)))
    const expr = ['*', ...args]
    return {
      evaluate: (ctx) => {
        let acc = 1
        for (let i = 0; i < children.length; i++)
          acc *= expectNumber(children[i]!.evaluate(ctx), '*', expr)
        return acc
      },
      returnType: 'number',
      ...mergeDeps(children),
    }
  })

  // `-` — unary negation or binary subtraction.
  registerOperator('-', (args, compile, path) => {
    if (args.length !== 1 && args.length !== 2)
      throw new ExpressionError(`"-" expects 1 or 2 arguments, got ${args.length}`, ['-', ...args], path)
    const children = args.map((a, i) => compile(a, 'number', path.concat(i + 1)))
    const expr = ['-', ...args]
    if (children.length === 1) {
      const a = children[0]!
      return {
        evaluate: ctx => -expectNumber(a.evaluate(ctx), '-', expr),
        returnType: 'number',
        ...mergeDeps(children),
      }
    }
    const a = children[0]!
    const b = children[1]!
    return {
      evaluate: ctx => expectNumber(a.evaluate(ctx), '-', expr) - expectNumber(b.evaluate(ctx), '-', expr),
      returnType: 'number',
      ...mergeDeps(children),
    }
  })

  // `/` — division. Divide-by-zero throws; NaN-producing forms are style
  // authoring bugs worth surfacing.
  registerOperator('/', (args, compile, path) => {
    if (args.length !== 2)
      throw new ExpressionError(`"/" expects 2 arguments, got ${args.length}`, ['/', ...args], path)
    const a = compile(args[0], 'number', path.concat(1))
    const b = compile(args[1], 'number', path.concat(2))
    const expr = ['/', ...args]
    return {
      evaluate: (ctx) => {
        const av = expectNumber(a.evaluate(ctx), '/', expr)
        const bv = expectNumber(b.evaluate(ctx), '/', expr)
        if (bv === 0) throw new ExpressionError('"/": divide by zero', expr)
        return av / bv
      },
      returnType: 'number',
      ...mergeDeps([a, b]),
    }
  })

  registerOperator('%', (args, compile, path) => {
    if (args.length !== 2)
      throw new ExpressionError(`"%" expects 2 arguments, got ${args.length}`, ['%', ...args], path)
    const a = compile(args[0], 'number', path.concat(1))
    const b = compile(args[1], 'number', path.concat(2))
    const expr = ['%', ...args]
    return {
      evaluate: (ctx) => {
        const av = expectNumber(a.evaluate(ctx), '%', expr)
        const bv = expectNumber(b.evaluate(ctx), '%', expr)
        if (bv === 0) throw new ExpressionError('"%": divide by zero', expr)
        return av % bv
      },
      returnType: 'number',
      ...mergeDeps([a, b]),
    }
  })

  registerOperator('^', (args, compile, path) => {
    if (args.length !== 2)
      throw new ExpressionError(`"^" expects 2 arguments, got ${args.length}`, ['^', ...args], path)
    const a = compile(args[0], 'number', path.concat(1))
    const b = compile(args[1], 'number', path.concat(2))
    const expr = ['^', ...args]
    return {
      evaluate: ctx => expectNumber(a.evaluate(ctx), '^', expr) ** expectNumber(b.evaluate(ctx), '^', expr),
      returnType: 'number',
      ...mergeDeps([a, b]),
    }
  })

  registerOperator('min', (args, compile, path) => {
    if (args.length < 1)
      throw new ExpressionError('"min" expects at least 1 argument', ['min'], path)
    const children = args.map((a, i) => compile(a, 'number', path.concat(i + 1)))
    const expr = ['min', ...args]
    return {
      evaluate: (ctx) => {
        let m = Infinity
        for (let i = 0; i < children.length; i++) {
          const v = expectNumber(children[i]!.evaluate(ctx), 'min', expr)
          if (v < m) m = v
        }
        return m
      },
      returnType: 'number',
      ...mergeDeps(children),
    }
  })

  registerOperator('max', (args, compile, path) => {
    if (args.length < 1)
      throw new ExpressionError('"max" expects at least 1 argument', ['max'], path)
    const children = args.map((a, i) => compile(a, 'number', path.concat(i + 1)))
    const expr = ['max', ...args]
    return {
      evaluate: (ctx) => {
        let m = -Infinity
        for (let i = 0; i < children.length; i++) {
          const v = expectNumber(children[i]!.evaluate(ctx), 'max', expr)
          if (v > m) m = v
        }
        return m
      },
      returnType: 'number',
      ...mergeDeps(children),
    }
  })

  // Single-argument builtins.
  const unary = (name: string, fn: (n: number) => number, validate?: (n: number, expr: unknown[]) => void): void => {
    registerOperator(name, (args, compile, path) => {
      if (args.length !== 1)
        throw new ExpressionError(`"${name}" expects 1 argument, got ${args.length}`, [name, ...args], path)
      const inner = compile(args[0], 'number', path.concat(1))
      const expr = [name, ...args]
      return {
        evaluate: (ctx) => {
          const v = expectNumber(inner.evaluate(ctx), name, expr)
          if (validate) validate(v, expr)
          return fn(v)
        },
        returnType: 'number',
        ...mergeDeps([inner]),
      }
    })
  }

  unary('abs', Math.abs)
  unary('floor', Math.floor)
  unary('ceil', Math.ceil)
  unary('round', Math.round)
  unary('sqrt', Math.sqrt, (n, expr) => {
    if (n < 0) throw new ExpressionError('"sqrt": input must be non-negative', expr)
  })
  unary('ln', Math.log, (n, expr) => {
    if (n <= 0) throw new ExpressionError('"ln": input must be positive', expr)
  })
  unary('log10', Math.log10, (n, expr) => {
    if (n <= 0) throw new ExpressionError('"log10": input must be positive', expr)
  })
  unary('log2', Math.log2, (n, expr) => {
    if (n <= 0) throw new ExpressionError('"log2": input must be positive', expr)
  })

  // Constants.
  registerOperator('e', (args, _compile, path) => {
    if (args.length !== 0)
      throw new ExpressionError(`"e" takes no arguments, got ${args.length}`, ['e', ...args], path)
    return {
      evaluate: () => Math.E,
      returnType: 'number',
      dependsOnZoom: false,
      dependsOnFeature: false,
      dependsOnFeatureState: false,
    }
  })

  registerOperator('pi', (args, _compile, path) => {
    if (args.length !== 0)
      throw new ExpressionError(`"pi" takes no arguments, got ${args.length}`, ['pi', ...args], path)
    return {
      evaluate: () => Math.PI,
      returnType: 'number',
      dependsOnZoom: false,
      dependsOnFeature: false,
      dependsOnFeatureState: false,
    }
  })

  // rand — bounded random. An explicit seed produces a deterministic LCG
  // stream so that style output is reproducible for tests and visual diffs;
  // unseeded `rand` falls back to Math.random.
  registerOperator('rand', (args, compile, path) => {
    if (args.length < 2 || args.length > 3)
      throw new ExpressionError(`"rand" expects 2 or 3 arguments, got ${args.length}`, ['rand', ...args], path)
    const min = compile(args[0], 'number', path.concat(1))
    const max = compile(args[1], 'number', path.concat(2))
    const seed = args.length === 3 ? compile(args[2], 'number', path.concat(3)) : null
    const expr = ['rand', ...args]
    // Numerical Recipes LCG — cheap and good enough for style variation.
    let state = 1
    const nextSeeded = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 0x100000000
    }
    const children: CompiledExpression[] = seed ? [min, max, seed] : [min, max]
    return {
      evaluate: (ctx) => {
        const a = expectNumber(min.evaluate(ctx), 'rand', expr)
        const b = expectNumber(max.evaluate(ctx), 'rand', expr)
        if (seed) {
          const s = expectNumber(seed.evaluate(ctx), 'rand', expr)
          state = (Math.floor(s) >>> 0) || 1
          // Step once so adjacent seeds don't correlate.
          nextSeeded()
          return a + (b - a) * nextSeeded()
        }
        return a + (b - a) * Math.random()
      },
      returnType: 'number',
      ...mergeDeps(children),
    }
  })
}
