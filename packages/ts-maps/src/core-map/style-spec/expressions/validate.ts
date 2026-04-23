// Static-validation surface for expressions. The philosophy matches the
// top-level style validator: collect all errors rather than short-circuit.
// Under the hood we run the compiler and trap its ExpressionError — that
// gives us one source of truth about what constitutes a valid expression.

import type { ExpressionType } from './types'
import { boot, compile } from './compile'
import { ExpressionError } from './errors'
import { hasOperator } from './registry'

/**
 * Quick predicate: does this value look like an expression? Used by the
 * style-spec validator to decide whether to hand off to us or to match
 * literal-shape rules.
 */
export function isExpression(value: unknown): boolean {
  // Make sure the operator registry is populated — callers that query
  // `isExpression` before touching the compiler still need accurate answers.
  boot()
  if (!Array.isArray(value) || value.length === 0) return false
  const head = value[0]
  return typeof head === 'string' && hasOperator(head)
}

/**
 * Validate an expression statically. Returns an array of error messages;
 * empty array means valid. Non-array inputs are accepted unconditionally
 * here — literal shape checking belongs to the caller's schema pass.
 */
export function validateExpression(value: unknown, expectedType: ExpressionType): string[] {
  const errors: string[] = []
  try {
    compile(value, expectedType, [])
  }
  catch (err) {
    if (err instanceof ExpressionError)
      errors.push(err.message)
    else if (err instanceof Error)
      errors.push(err.message)
    else
      errors.push(String(err))
  }
  return errors
}
