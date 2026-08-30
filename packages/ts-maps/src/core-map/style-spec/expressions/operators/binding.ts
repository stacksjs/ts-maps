// Local bindings: `["let", name, value, ..., body]` and `["var", name]`.
//
// These exist to stop a style from evaluating the same sub-expression several
// times in one property — a data-driven interpolation that reads the same
// `["get", ...]` in four stops is the common case. Binding it once is both
// faster and considerably easier to read.

import type { CompiledExpression, EvaluationContext } from '../types'
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

export function registerBindingOps(): void {
  registerOperator('let', (args, compile, path) => {
    // name/value pairs, then a single body: an odd argument count.
    if (args.length < 3 || args.length % 2 === 0)
      throw new ExpressionError(`"let" expects name/value pairs followed by a body, got ${args.length} arguments`, ['let', ...args], path)

    const names: string[] = []
    const values: CompiledExpression[] = []

    for (let i = 0; i < args.length - 1; i += 2) {
      const name = args[i]
      if (typeof name !== 'string')
        throw new ExpressionError(`"let": binding name must be a string, got ${typeof name}`, ['let', ...args], path)
      names.push(name)
      values.push(compile(args[i + 1], 'value', path.concat(i + 2)))
    }

    const body = compile(args[args.length - 1], 'value', path.concat(args.length))

    return {
      evaluate: (ctx: EvaluationContext) => {
        // A fresh frame inheriting the enclosing one, so nested `let`s shadow
        // rather than clobber, and the caller's context is never mutated.
        const bindings: Record<string, unknown> = { ...ctx.bindings }
        for (let i = 0; i < names.length; i++)
          bindings[names[i]!] = values[i]!.evaluate(ctx)
        return body.evaluate({ ...ctx, bindings })
      },
      returnType: body.returnType,
      ...mergeDeps([...values, body]),
    }
  })

  registerOperator('var', (args, _compile, path) => {
    if (args.length !== 1)
      throw new ExpressionError(`"var" expects 1 argument, got ${args.length}`, ['var', ...args], path)

    const name = args[0]
    if (typeof name !== 'string')
      throw new ExpressionError(`"var": name must be a string, got ${typeof name}`, ['var', ...args], path)

    return {
      evaluate: (ctx: EvaluationContext) => {
        // An unbound name is a style bug, not a missing value: returning null
        // would let it render as a silently wrong colour or size.
        if (!ctx.bindings || !(name in ctx.bindings))
          throw new ExpressionError(`"var": unbound name ${JSON.stringify(name)}`, ['var', name])
        return ctx.bindings[name]
      },
      returnType: 'value',
      // A bound value's own dependencies are already merged by the enclosing
      // `let`, which is the only thing that can make this reachable.
      dependsOnZoom: false,
      dependsOnFeature: false,
      dependsOnFeatureState: false,
    }
  })
}
