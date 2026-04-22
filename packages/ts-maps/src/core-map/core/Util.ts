// Various utility functions, used internally.

export let lastId = 0

// Returns the unique ID of an object, assigning it one if it doesn't have it.
export function stamp(obj: any): number {
  if (!('_tsmap_id' in obj)) {
    obj._tsmap_id = ++lastId
  }
  return obj._tsmap_id
}

export function setLastId(id: number): void {
  lastId = id
}

// Returns a function which executes `fn` no more than one time per given amount of `time`.
export function throttle < T extends (...args: any[]) => any > (fn: T, time: number, context?: any): (...args: Parameters < T>) => void {
  let lock = false
  let queuedArgs: Parameters < T> | false = false

  function later(): void {
    lock = false
    if (queuedArgs) {
      wrapperFn.apply(context, queuedArgs as any)
      queuedArgs = false
    }
  }

  function wrapperFn(...args: Parameters < T>): void {
    if (lock) {
      queuedArgs = args
    }
    else {
      fn.apply(context, args)
      setTimeout(later, time)
      lock = true
    }
  }

  return wrapperFn
}

// Returns the number `num` modulo `range` so it lies within `range[0]` and `range[1]`.
export function wrapNum(x: number, range: [number, number] | number[], includeMax?: boolean): number {
  const max = range[1]
  const min = range[0]
  const d = max - min
  return x === max && includeMax ? x : ((x - min) % d + d) % d + min
}

// Always returns false.
export function falseFn(..._args: any[]): false { return false }

// Returns the number `num` rounded with specified `precision` (default 6 decimal places).
export function formatNum(num: number, precision?: number | false): number {
  if (precision === false)
  return num
  const pow = 10 ** (precision === undefined ? 6 : precision)
  return Math.round(num * pow) / pow
}

// Trims and splits the string on whitespace and returns the array of parts.
export function splitWords(str: string): string[] {
  return str.trim().split(/\s+/)
}

// Merges the given properties to the `options` of the `obj`, returning the resulting options.
export function setOptions < T extends { options?: Record<string, any> } > (obj: T, options?: Record<string, any>): Record<string, any> {
  if (!Object.hasOwn(obj, 'options')) {
    obj.options = obj.options ? Object.create(obj.options) : {}
  }
  if (options) {
    for (const i in options) {
      if (Object.hasOwn(options, i)) {
        (obj.options as any)[i] = options[i]
      }
    }
  }
  return obj.options!
}

const templateRe = /\ { *([\w\- ]+) *\}/g

// Simple templating facility: `'Hello {a}, {b}'` + `{a: 'foo', b: 'bar'}` -> `'Hello foo, bar'`.
export function template(str: string, data: Record<string, any>): string {
  return str.replace(templateRe, (match, key) => {
    let value = data[key]
    if (value === undefined) {
      throw new Error(`No value provided for variable ${match}`)
    }
    else if (typeof value === 'function') {
      value = value(data)
    }
    return value
  })
}

// No-op function.
export function noop(): void {}
