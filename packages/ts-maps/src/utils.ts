/**
 * Common utility functions for the ts-maps library
 */

/**
 * Check if a value is undefined
 */
export function isUndefined(value: any): boolean {
  return typeof value === 'undefined'
}

/**
 * Check if a value is null
 */
export function isNull(value: any): boolean {
  return value === null
}

/**
 * Check if a value is null or undefined
 */
export function isNullOrUndefined(value: any): boolean {
  return isNull(value) || isUndefined(value)
}

/**
 * Check if a value is a string
 */
export function isString(value: any): value is string {
  return typeof value === 'string'
}

/**
 * Check if a value is a number
 */
export function isNumber(value: any): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * Check if a value is a function
 */
export function isFunction(value: any): value is (...args: any[]) => any {
  return typeof value === 'function'
}

/**
 * Check if a value is an object
 */
export function isObject(value: any): value is object {
  return typeof value === 'object' && !isNull(value)
}

/**
 * Check if a value is an array
 */
export function isArray(value: any): value is any[] {
  return Array.isArray(value)
}

/**
 * Check if a value is a boolean
 */
export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Check if a value is a DOM element
 */
export function isElement(value: any): value is Element {
  return value instanceof Element
}

/**
 * Check if a value is a DOM node
 */
export function isNode(value: any): value is Node {
  return value instanceof Node
}

/**
 * Check if a value is a DOM event
 */
export function isEvent(value: any): value is Event {
  return value instanceof Event
}

/**
 * Check if a value is a RegExp
 */
export function isRegExp(value: any): value is RegExp {
  return value instanceof RegExp
}

/**
 * Check if a value is a Date
 */
export function isDate(value: any): value is Date {
  return value instanceof Date
}

/**
 * Check if a value is a Map
 */
export function isMap(value: any): value is Map<any, any> {
  return value instanceof Map
}

/**
 * Check if a value is a Set
 */
export function isSet(value: any): value is Set<any> {
  return value instanceof Set
}

/**
 * Check if a value is a Promise
 */
export function isPromise(value: any): value is Promise<any> {
  return value instanceof Promise
}

/**
 * Check if a value is a Symbol
 */
export function isSymbol(value: any): value is symbol {
  return typeof value === 'symbol'
}

/**
 * Check if a value is a BigInt
 */
export function isBigInt(value: any): value is bigint {
  return typeof value === 'bigint'
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value: any): boolean {
  if (isNullOrUndefined(value))
    return true
  if (isString(value))
    return value.length === 0
  if (isArray(value))
    return value.length === 0
  if (isObject(value))
    return Object.keys(value).length === 0
  return false
}

/**
 * Get the type of a value
 */
export function getType(value: any): string {
  if (isUndefined(value))
    return 'undefined'
  if (isNull(value))
    return 'null'
  if (isString(value))
    return 'string'
  if (isNumber(value))
    return 'number'
  if (isFunction(value))
    return 'function'
  if (isArray(value))
    return 'array'
  if (isBoolean(value))
    return 'boolean'
  if (isElement(value))
    return 'element'
  if (isNode(value))
    return 'node'
  if (isEvent(value))
    return 'event'
  if (isRegExp(value))
    return 'regexp'
  if (isDate(value))
    return 'date'
  if (isMap(value))
    return 'map'
  if (isSet(value))
    return 'set'
  if (isPromise(value))
    return 'promise'
  if (isSymbol(value))
    return 'symbol'
  if (isBigInt(value))
    return 'bigint'
  if (isObject(value))
    return 'object'
  return typeof value
}
