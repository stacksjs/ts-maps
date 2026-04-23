// String operators. Nothing exotic — we lean on JavaScript's built-in string
// methods, which is fine for the ASCII-dominated content we see in styles.

import type { CompiledExpression } from '../types'
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

function toStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) }
  catch { return String(v) }
}

export function registerStringOps(): void {
  // concat — coerces every argument to a string and glues them together.
  registerOperator('concat', (args, compile, path) => {
    const children = args.map((a, i) => compile(a, 'value', path.concat(i + 1)))
    return {
      evaluate: (ctx) => {
        let out = ''
        for (let i = 0; i < children.length; i++)
          out += toStr(children[i]!.evaluate(ctx))
        return out
      },
      returnType: 'string',
      ...mergeDeps(children),
    }
  })

  registerOperator('downcase', (args, compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"downcase" expects 1 argument, got ${args.length}`, ['downcase', ...args], path)
    const inner = compile(args[0], 'string', path.concat(1))
    return {
      evaluate: ctx => toStr(inner.evaluate(ctx)).toLowerCase(),
      returnType: 'string',
      ...mergeDeps([inner]),
    }
  })

  registerOperator('upcase', (args, compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"upcase" expects 1 argument, got ${args.length}`, ['upcase', ...args], path)
    const inner = compile(args[0], 'string', path.concat(1))
    return {
      evaluate: ctx => toStr(inner.evaluate(ctx)).toUpperCase(),
      returnType: 'string',
      ...mergeDeps([inner]),
    }
  })

  // resolved-locale — the i18n plumbing isn't wired up yet, so we return a
  // stable stub. When the symbol layer grows locale handling, this operator
  // reads through to the active locale — callers that branch on it today
  // will still be correct in the English-only default.
  registerOperator('resolved-locale', (args, _compile, path) => {
    if (args.length !== 0 && args.length !== 1)
      throw new ExpressionError(`"resolved-locale" expects 0 or 1 arguments, got ${args.length}`, ['resolved-locale', ...args], path)
    return {
      evaluate: () => 'en',
      returnType: 'string',
      dependsOnZoom: false,
      dependsOnFeature: false,
      dependsOnFeatureState: false,
    }
  })
}
