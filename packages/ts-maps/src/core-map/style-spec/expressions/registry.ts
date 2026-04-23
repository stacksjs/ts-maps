// Operator registry. Each operator family (math, logical, etc.) registers its
// implementations here. The compiler looks up operator names at compile time
// and wires up the closures; runtime lookups never touch this map.
//
// We keep the compiler function threaded through the definitions so operators
// can compile their own sub-arguments recursively without pulling in a
// circular import on `./compile`.

import type { CompiledExpression, ExpressionType } from './types'

// `ExpressionType` is used in the `OperatorCompiler` signature below — export
// so consumers can satisfy the shape without reaching into `./types` directly.
export type { ExpressionType }

// A compiler callback — operators call this to compile their child arguments.
// `expected` is the type the child should produce; 'value' means anything.
export type CompileFn = (
  expr: unknown,
  expected: ExpressionType,
  path: (string | number)[],
) => CompiledExpression

// An operator's compile-time function: given the raw expression array and a
// recursive compiler, return a CompiledExpression. The operator owns arity
// checking and argument compilation; the central compiler does not look at
// the shape of individual operator arguments. `expected` is the type the
// enclosing context wants back — used by `interpolate`/`step` to decide how
// their child branches should be compiled.
export type OperatorCompiler = (
  args: unknown[],
  compile: CompileFn,
  path: (string | number)[],
  expected: ExpressionType,
) => CompiledExpression

// The live registry. Populated at module load time via the `register*Ops`
// calls from `./compile`. Keyed by operator name.
const OPERATORS: Record<string, OperatorCompiler> = {}

export function registerOperator(name: string, fn: OperatorCompiler): void {
  OPERATORS[name] = fn
}

export function getOperator(name: string): OperatorCompiler | undefined {
  return OPERATORS[name]
}

export function hasOperator(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(OPERATORS, name)
}

// Introspection for validators — walkers that need to know whether a head
// token is a known operator (vs. an arbitrary data literal).
export function listOperators(): string[] {
  return Object.keys(OPERATORS)
}
