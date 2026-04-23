// Logical, comparison, and branching operators. These are what filters and
// `case` blocks lean on; keeping them in one file makes the branching story
// easy to reason about.

import type { CompiledExpression } from '../types'
import { ExpressionError } from '../errors'
import { registerOperator } from '../registry'

// Combine the three dependency flags across a variadic list of compiled
// children. Used by the N-ary short-circuit operators below.
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

// Loose equality that matches Mapbox-GL semantics: strict `===` for same-type
// comparisons; we don't follow JavaScript's `==` coercion rules — those lead
// to surprises in style authoring.
function strictEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  // NaN !== NaN by JS rules, which is what we want for styles too.
  return false
}

// Numeric comparator helper. Returns 0 (equal), -1 (a<b), 1 (a>b), or NaN if
// either side isn't a comparable scalar. Strings compare lexicographically.
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN
    return a < b ? -1 : a > b ? 1 : 0
  }
  if (typeof a === 'string' && typeof b === 'string')
    return a < b ? -1 : a > b ? 1 : 0
  return Number.NaN
}

export function registerLogicalOps(): void {
  registerOperator('!', (args, compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"!" expects 1 argument, got ${args.length}`, ['!', ...args], path)
    const inner = compile(args[0], 'boolean', path.concat(1))
    return {
      evaluate: ctx => !inner.evaluate(ctx),
      returnType: 'boolean',
      ...mergeDeps([inner]),
    }
  })

  registerOperator('==', (args, compile, path) => {
    if (args.length !== 2)
      throw new ExpressionError(`"==" expects 2 arguments, got ${args.length}`, ['==', ...args], path)
    const a = compile(args[0], 'value', path.concat(1))
    const b = compile(args[1], 'value', path.concat(2))
    return {
      evaluate: ctx => strictEq(a.evaluate(ctx), b.evaluate(ctx)),
      returnType: 'boolean',
      ...mergeDeps([a, b]),
    }
  })

  registerOperator('!=', (args, compile, path) => {
    if (args.length !== 2)
      throw new ExpressionError(`"!=" expects 2 arguments, got ${args.length}`, ['!=', ...args], path)
    const a = compile(args[0], 'value', path.concat(1))
    const b = compile(args[1], 'value', path.concat(2))
    return {
      evaluate: ctx => !strictEq(a.evaluate(ctx), b.evaluate(ctx)),
      returnType: 'boolean',
      ...mergeDeps([a, b]),
    }
  })

  const comparator = (name: '<' | '<=' | '>' | '>='): void => {
    registerOperator(name, (args, compile, path) => {
      if (args.length !== 2)
        throw new ExpressionError(`"${name}" expects 2 arguments, got ${args.length}`, [name, ...args], path)
      const a = compile(args[0], 'value', path.concat(1))
      const b = compile(args[1], 'value', path.concat(2))
      return {
        evaluate: (ctx) => {
          const cmp = compare(a.evaluate(ctx), b.evaluate(ctx))
          if (Number.isNaN(cmp)) return false
          switch (name) {
            case '<': return cmp < 0
            case '<=': return cmp <= 0
            case '>': return cmp > 0
            case '>=': return cmp >= 0
          }
        },
        returnType: 'boolean',
        ...mergeDeps([a, b]),
      }
    })
  }
  comparator('<')
  comparator('<=')
  comparator('>')
  comparator('>=')

  // all — short-circuits on first false; empty list is true.
  registerOperator('all', (args, compile, path) => {
    const children = args.map((a, i) => compile(a, 'boolean', path.concat(i + 1)))
    return {
      evaluate: (ctx) => {
        for (let i = 0; i < children.length; i++)
          if (!children[i]!.evaluate(ctx)) return false
        return true
      },
      returnType: 'boolean',
      ...mergeDeps(children),
    }
  })

  // any — short-circuits on first true; empty list is false.
  registerOperator('any', (args, compile, path) => {
    const children = args.map((a, i) => compile(a, 'boolean', path.concat(i + 1)))
    return {
      evaluate: (ctx) => {
        for (let i = 0; i < children.length; i++)
          if (children[i]!.evaluate(ctx)) return true
        return false
      },
      returnType: 'boolean',
      ...mergeDeps(children),
    }
  })

  // none — legacy filter form, true iff every child is false.
  registerOperator('none', (args, compile, path) => {
    const children = args.map((a, i) => compile(a, 'boolean', path.concat(i + 1)))
    return {
      evaluate: (ctx) => {
        for (let i = 0; i < children.length; i++)
          if (children[i]!.evaluate(ctx)) return false
        return true
      },
      returnType: 'boolean',
      ...mergeDeps(children),
    }
  })

  // case — condition/value pairs, terminated by a fallback.
  registerOperator('case', (args, compile, path, expected) => {
    if (args.length < 3 || args.length % 2 !== 1)
      throw new ExpressionError(
        `"case" expects an odd number of arguments >= 3 (cond, val, ..., fallback), got ${args.length}`,
        ['case', ...args],
        path,
      )
    const branches: Array<{ cond: CompiledExpression, val: CompiledExpression }> = []
    for (let i = 0; i < args.length - 1; i += 2) {
      branches.push({
        cond: compile(args[i], 'boolean', path.concat(i + 1)),
        val: compile(args[i + 1], expected, path.concat(i + 2)),
      })
    }
    const fallback = compile(args[args.length - 1], expected, path.concat(args.length))
    const all: CompiledExpression[] = [fallback]
    for (const b of branches) {
      all.push(b.cond)
      all.push(b.val)
    }
    return {
      evaluate: (ctx) => {
        for (let i = 0; i < branches.length; i++) {
          const br = branches[i]!
          if (br.cond.evaluate(ctx)) return br.val.evaluate(ctx)
        }
        return fallback.evaluate(ctx)
      },
      returnType: expected,
      ...mergeDeps(all),
    }
  })

  // match — pattern dispatch. Labels may be scalars or arrays of scalars.
  registerOperator('match', (args, compile, path, expected) => {
    if (args.length < 4 || args.length % 2 !== 0)
      throw new ExpressionError(
        `"match" expects input, (label, value)+, fallback — got ${args.length} arguments`,
        ['match', ...args],
        path,
      )
    const input = compile(args[0], 'value', path.concat(1))
    const branches: Array<{ labels: unknown[], val: CompiledExpression }> = []
    for (let i = 1; i < args.length - 1; i += 2) {
      const label = args[i]
      const labels = Array.isArray(label) ? label : [label]
      for (const l of labels) {
        if (typeof l !== 'string' && typeof l !== 'number' && typeof l !== 'boolean')
          throw new ExpressionError(
            '"match" labels must be strings, numbers, or booleans',
            ['match', ...args],
            path.concat(i + 1),
          )
      }
      branches.push({
        labels,
        val: compile(args[i + 1], expected, path.concat(i + 2)),
      })
    }
    const fallback = compile(args[args.length - 1], expected, path.concat(args.length))
    const all: CompiledExpression[] = [input, fallback]
    for (const b of branches) all.push(b.val)
    return {
      evaluate: (ctx) => {
        const x = input.evaluate(ctx)
        for (let i = 0; i < branches.length; i++) {
          const br = branches[i]!
          for (let j = 0; j < br.labels.length; j++) {
            if (strictEq(x, br.labels[j])) return br.val.evaluate(ctx)
          }
        }
        return fallback.evaluate(ctx)
      },
      returnType: expected,
      ...mergeDeps(all),
    }
  })

  // coalesce — first non-null argument wins.
  registerOperator('coalesce', (args, compile, path, expected) => {
    if (args.length === 0)
      throw new ExpressionError('"coalesce" expects at least 1 argument', ['coalesce'], path)
    const children = args.map((a, i) => compile(a, expected, path.concat(i + 1)))
    return {
      evaluate: (ctx) => {
        for (let i = 0; i < children.length; i++) {
          const v = children[i]!.evaluate(ctx)
          if (v !== null && v !== undefined) return v
        }
        return null
      },
      returnType: expected,
      ...mergeDeps(children),
    }
  })

  // Legacy `in` / `!in` — membership test against a literal list. Modern
  // expressions express this via `match` but some old styles still use it.
  registerOperator('in', (args, compile, path) => {
    if (args.length < 1)
      throw new ExpressionError('"in" expects at least 1 argument', ['in', ...args], path)
    const input = compile(args[0], 'value', path.concat(1))
    const haystack = args.slice(1)
    return {
      evaluate: (ctx) => {
        const x = input.evaluate(ctx)
        for (let i = 0; i < haystack.length; i++)
          if (strictEq(x, haystack[i])) return true
        return false
      },
      returnType: 'boolean',
      ...mergeDeps([input]),
    }
  })

  registerOperator('!in', (args, compile, path) => {
    if (args.length < 1)
      throw new ExpressionError('"!in" expects at least 1 argument', ['!in', ...args], path)
    const input = compile(args[0], 'value', path.concat(1))
    const haystack = args.slice(1)
    return {
      evaluate: (ctx) => {
        const x = input.evaluate(ctx)
        for (let i = 0; i < haystack.length; i++)
          if (strictEq(x, haystack[i])) return false
        return true
      },
      returnType: 'boolean',
      ...mergeDeps([input]),
    }
  })

  // Legacy `!has` — complement of `has`, parallel to the non-negated form.
  registerOperator('!has', (args, _compile, path) => {
    if (args.length < 1 || args.length > 2)
      throw new ExpressionError(`"!has" expects 1 or 2 arguments, got ${args.length}`, ['!has', ...args], path)
    if (typeof args[0] !== 'string')
      throw new ExpressionError('"!has" key must be a string literal', ['!has', ...args], path)
    const key = args[0]
    return {
      evaluate: (ctx) => {
        const props = ctx.feature ? ctx.feature.properties : undefined
        return props ? !Object.prototype.hasOwnProperty.call(props, key) : true
      },
      returnType: 'boolean',
      dependsOnZoom: false,
      dependsOnFeature: true,
      dependsOnFeatureState: false,
    }
  })
}
