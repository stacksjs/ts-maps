// Public surface for the expression evaluator. Everything that consumers
// outside `style-spec/expressions/**` touch lives behind this barrel so we
// can rework the internals without churning call sites.

import type { CompiledExpression, EvaluationContext, ExpressionType } from './types'
import { compile } from './compile'
import { ExpressionError } from './errors'
import { isExpression } from './validate'

export { formatColor, lerpColor, parseColor } from './Color'
export { compile } from './compile'
export { ExpressionError } from './errors'
export { convertLegacyFilter } from './legacyFilter'
export type { CompiledExpression, EvaluationContext, ExpressionType, RGBA } from './types'
export { isExpression, validateExpression } from './validate'

/**
 * Compile-and-run convenience for one-shot evaluation. Prefer `compile` +
 * a long-lived `evaluate` closure on the render path — `evaluate` here
 * recompiles every call and only makes sense for tests and diagnostics.
 */
export function evaluate(
  expr: unknown,
  ctx: EvaluationContext,
  expectedType: ExpressionType = 'value',
): unknown {
  // Short-circuit the non-expression case: a literal value is returned as-is
  // (with a compile-time type check so obvious mistakes still surface).
  if (!isExpression(expr)) {
    // Arrays-that-aren't-expressions (e.g. [0, 0] translation tuples) are
    // valid literal data — return them verbatim.
    if (Array.isArray(expr)) return expr
    return expr
  }
  const compiled: CompiledExpression = compile(expr, expectedType, [])
  try {
    return compiled.evaluate(ctx)
  }
  catch (err) {
    if (err instanceof ExpressionError) throw err
    if (err instanceof Error) throw new ExpressionError(err.message, expr)
    throw new ExpressionError(String(err), expr)
  }
}
