// Legacy (pre-v8 expressions) filter conversion. The old filter DSL was
// declarative shorthand: `['==', 'class', 'road']` meant "the feature's
// `class` property equals `'road'`". Expressions make the property access
// explicit via `['get', 'class']`. This module upgrades the former into the
// latter so the compiler can treat everything uniformly.

const COMPARATORS: ReadonlySet<string> = new Set(['==', '!=', '<', '<=', '>', '>='])
const COMBINATORS: ReadonlySet<string> = new Set(['all', 'any', 'none'])

// Identify whether the outer array shape matches a legacy filter — i.e. the
// head is one of the legacy operators and, for comparators, the second slot
// is a bare property name (string) rather than an expression array.
function isLegacyShape(filter: unknown[]): boolean {
  if (filter.length === 0) return false
  const head = filter[0]
  if (typeof head !== 'string') return false
  if (head === 'has' || head === '!has' || head === 'in' || head === '!in')
    return typeof filter[1] === 'string'
  if (COMPARATORS.has(head))
    return typeof filter[1] === 'string'
  if (COMBINATORS.has(head)) {
    // A combinator at the top-level with legacy children is itself legacy.
    for (let i = 1; i < filter.length; i++) {
      const child = filter[i]
      if (Array.isArray(child) && isLegacyShape(child))
        return true
    }
    return false
  }
  return false
}

function convertSpecial(prop: string): unknown[] {
  // Special property names translate to evaluator builtins rather than `get`.
  if (prop === '$type') return ['geometry-type']
  if (prop === '$id') return ['id']
  return ['get', prop]
}

function convertInner(filter: unknown[]): unknown[] {
  const head = filter[0]
  if (typeof head !== 'string') return filter

  if (head === 'has') {
    if (typeof filter[1] !== 'string') return filter
    return ['has', filter[1]]
  }
  if (head === '!has') {
    if (typeof filter[1] !== 'string') return filter
    return ['!has', filter[1]]
  }
  if (head === 'in' || head === '!in') {
    if (typeof filter[1] !== 'string') return filter
    return [head, convertSpecial(filter[1]), ...filter.slice(2)]
  }
  if (COMPARATORS.has(head)) {
    if (typeof filter[1] !== 'string') return filter
    return [head, convertSpecial(filter[1]), filter[2]]
  }
  if (COMBINATORS.has(head)) {
    const converted: unknown[] = [head]
    for (let i = 1; i < filter.length; i++) {
      const child = filter[i]
      if (Array.isArray(child) && isLegacyShape(child))
        converted.push(convertInner(child))
      else
        converted.push(child)
    }
    return converted
  }
  return filter
}

/**
 * Upgrade a legacy Mapbox filter to an equivalent expression-form filter.
 * Already-upgraded filters pass through unchanged so callers can apply this
 * blindly as a pre-pass.
 */
export function convertLegacyFilter(filter: unknown[]): unknown[] {
  if (!Array.isArray(filter)) return filter
  if (!isLegacyShape(filter)) return filter
  return convertInner(filter)
}
