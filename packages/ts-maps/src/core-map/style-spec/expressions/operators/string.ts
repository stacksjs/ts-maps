// String operators. Nothing exotic — we lean on JavaScript's built-in string
// methods, which is fine for the ASCII-dominated content we see in styles.

import type { CompiledExpression } from '../types'
import { ExpressionError } from '../errors'
import { Formatted } from '../formatted'
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

  // index-of — the position of a needle in a string or array, or -1. The
  // optional third argument is where to start looking, as in Mapbox.
  registerOperator('index-of', (args, compile, path) => {
    if (args.length !== 2 && args.length !== 3)
      throw new ExpressionError(`"index-of" expects 2 or 3 arguments, got ${args.length}`, ['index-of', ...args], path)
    const needle = compile(args[0], 'value', path.concat(1))
    const haystack = compile(args[1], 'value', path.concat(2))
    const from = args.length === 3 ? compile(args[2], 'number', path.concat(3)) : undefined
    const children = from ? [needle, haystack, from] : [needle, haystack]
    return {
      evaluate: (ctx) => {
        const target = needle.evaluate(ctx)
        const source = haystack.evaluate(ctx)
        const start = from ? Number(from.evaluate(ctx)) : 0
        if (Array.isArray(source))
          return source.indexOf(target, start)
        return toStr(source).indexOf(toStr(target), start)
      },
      returnType: 'number',
      ...mergeDeps(children),
    }
  })

  // slice — a sub-range of a string or array. Negative and out-of-range
  // indices behave as they do in JavaScript, which is also what the spec says.
  registerOperator('slice', (args, compile, path) => {
    if (args.length !== 2 && args.length !== 3)
      throw new ExpressionError(`"slice" expects 2 or 3 arguments, got ${args.length}`, ['slice', ...args], path)
    const input = compile(args[0], 'value', path.concat(1))
    const start = compile(args[1], 'number', path.concat(2))
    const end = args.length === 3 ? compile(args[2], 'number', path.concat(3)) : undefined
    const children = end ? [input, start, end] : [input, start]
    return {
      evaluate: (ctx) => {
        const source = input.evaluate(ctx)
        const from = Number(start.evaluate(ctx))
        const to = end ? Number(end.evaluate(ctx)) : undefined
        if (Array.isArray(source))
          return to === undefined ? source.slice(from) : source.slice(from, to)
        const text = toStr(source)
        return to === undefined ? text.slice(from) : text.slice(from, to)
      },
      // A sliced array is still an array; the compiler only needs to know it
      // is not necessarily a string.
      returnType: 'value',
      ...mergeDeps(children),
    }
  })

  // number-format — locale-aware number rendering via Intl, which every
  // target runtime already ships, so this stays dependency-free.
  registerOperator('number-format', (args, compile, path) => {
    if (args.length !== 2)
      throw new ExpressionError(`"number-format" expects 2 arguments, got ${args.length}`, ['number-format', ...args], path)
    const value = compile(args[0], 'number', path.concat(1))
    const rawOptions = args[1]
    if (rawOptions === null || typeof rawOptions !== 'object' || Array.isArray(rawOptions))
      throw new ExpressionError('"number-format": second argument must be an options object', ['number-format', ...args], path)

    const opts = rawOptions as Record<string, unknown>
    const locale = typeof opts.locale === 'string' ? opts.locale : undefined
    const format: Intl.NumberFormatOptions = {}
    if (typeof opts.currency === 'string') {
      format.style = 'currency'
      format.currency = opts.currency
    }
    if (typeof opts['min-fraction-digits'] === 'number')
      format.minimumFractionDigits = opts['min-fraction-digits'] as number
    if (typeof opts['max-fraction-digits'] === 'number')
      format.maximumFractionDigits = opts['max-fraction-digits'] as number

    // Built once: constructing an Intl.NumberFormat is expensive relative to
    // formatting with it, and these options are static per compiled style.
    const formatter = new Intl.NumberFormat(locale, format)

    return {
      evaluate: ctx => formatter.format(Number(value.evaluate(ctx))),
      returnType: 'string',
      ...mergeDeps([value]),
    }
  })

  // format — the sectioned-text operator.
  //
  // Sections are kept as structure rather than concatenated, because their
  // whole purpose is that they are drawn differently: a shield's number larger
  // than its prefix, a subtitle smaller than the name it sits under. The
  // result stringifies to the concatenation, so every path that only wants to
  // know whether there is text still works unchanged.
  registerOperator('format', (args, compile, path) => {
    if (args.length === 0)
      throw new ExpressionError('"format" expects at least 1 argument', ['format'], path)

    interface CompiledSection {
      value: CompiledExpression
      scale?: CompiledExpression | number
      fontStack?: string[]
      color?: CompiledExpression | string
    }

    const sections: CompiledSection[] = []
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      // An options object belongs to the section before it, and is not itself
      // an expression.
      const isOptions = arg !== null && typeof arg === 'object' && !Array.isArray(arg)
      if (isOptions)
        continue

      const section: CompiledSection = { value: compile(arg, 'value', path.concat(i + 1)) }
      const options = args[i + 1]
      if (options !== null && typeof options === 'object' && !Array.isArray(options)) {
        const opts = options as Record<string, unknown>

        const scale = opts['font-scale']
        if (typeof scale === 'number')
          section.scale = scale
        else if (Array.isArray(scale))
          section.scale = compile(scale, 'number', path.concat(i + 2, 'font-scale'))

        const font = opts['text-font']
        // `text-font` in a section is a literal font stack, which the spec
        // writes as `["literal", [...]]`.
        if (Array.isArray(font) && font[0] === 'literal' && Array.isArray(font[1]))
          section.fontStack = (font[1] as unknown[]).map(String)
        else if (Array.isArray(font) && font.every(f => typeof f === 'string'))
          section.fontStack = font as string[]

        const color = opts['text-color']
        if (typeof color === 'string')
          section.color = color
        else if (Array.isArray(color))
          section.color = compile(color, 'value', path.concat(i + 2, 'text-color'))
      }

      sections.push(section)
    }

    const deps = sections.flatMap(s => [
      s.value,
      typeof s.scale === 'object' ? s.scale : undefined,
      typeof s.color === 'object' ? s.color : undefined,
    ].filter(Boolean) as CompiledExpression[])

    return {
      evaluate: (ctx) => {
        return new Formatted(sections.map(section => ({
          text: toStr(section.value.evaluate(ctx)),
          scale: typeof section.scale === 'object' ? Number(section.scale.evaluate(ctx)) : section.scale,
          fontStack: section.fontStack,
          color: typeof section.color === 'object' ? toStr(section.color.evaluate(ctx)) : section.color,
        })))
      },
      returnType: 'formatted',
      ...mergeDeps(deps),
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
