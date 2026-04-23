// A small error class for expression compilation and evaluation failures.
// Attaches the offending expression and the path through the AST so that
// style authors can locate the problem without guessing.

export class ExpressionError extends Error {
  // `declare` — initialised values must be assigned in the constructor body
  // after `super()` to avoid the class-field erase-on-init trap.
  declare expression: unknown
  declare path: (string | number)[]

  constructor(message: string, expression: unknown, path: (string | number)[] = []) {
    const prefix = path.length > 0 ? `[${path.map(p => JSON.stringify(p)).join('][')}] ` : ''
    super(`${prefix}${message}`)
    this.name = 'ExpressionError'
    this.expression = expression
    this.path = path.slice()
  }
}
