/**
 * By https://github.com/TehShrike/deepmerge
 */

interface Options {
  arrayMerge?: (target: any[], source: any[], options: Options) => any[]
  clone?: boolean
  customMerge?: (key: string) => ((x: any, y: any) => any) | undefined
  isMergeableObject?: (value: any) => boolean
  cloneUnlessOtherwiseSpecified?: (value: any, options: Options) => any
}

type DeepMergeResult = Record<string | symbol, any>

// Declare deepmerge first to fix hoisting issues
const deepmerge: {
  <T>(target: T, source: T, options?: Options): T
} = function deepmerge<T>(target: T, source: T, options: Options = {}): T {
  options.arrayMerge = options.arrayMerge || defaultArrayMerge
  options.isMergeableObject = options.isMergeableObject || isMergeableObject
  options.cloneUnlessOtherwiseSpecified = cloneUnlessOtherwiseSpecified

  const sourceIsArray = Array.isArray(source)
  const targetIsArray = Array.isArray(target)
  const sourceAndTargetTypesMatch = sourceIsArray === targetIsArray

  if (!sourceAndTargetTypesMatch) {
    return cloneUnlessOtherwiseSpecified(source, options) as T
  }

  if (sourceIsArray) {
    return options.arrayMerge(target as any[], source as any[], options) as T
  }

  return mergeObject(target as Record<string | symbol, any>, source as Record<string | symbol, any>, options) as T
}

function isMergeableObject(value: any): boolean {
  return isNonNullObject(value)
    && !isSpecial(value)
}

function isNonNullObject(value: any): boolean {
  return !!value && typeof value === 'object'
}

function isSpecial(value: any): boolean {
  const stringValue = Object.prototype.toString.call(value)

  return stringValue === '[object RegExp]'
    || stringValue === '[object Date]'
    || isNode(value)
    || isReactElement(value)
}

// see https://github.com/facebook/react/blob/b5ac963fb791d1298e7f396236383bc955f916c1/src/isomorphic/classic/element/ReactElement.js#L21-L25
const canUseSymbol = typeof Symbol === 'function' && Symbol.for
const REACT_ELEMENT_TYPE = canUseSymbol ? Symbol.for('react.element') : 0xEAC7

function isReactElement(value: any): boolean {
  return value.$$typeof === REACT_ELEMENT_TYPE
}

function isNode(value: any): boolean {
  return value instanceof Node
}

function emptyTarget(val: any): any[] | Record<string | symbol, any> {
  return Array.isArray(val) ? [] : {}
}

function cloneUnlessOtherwiseSpecified(value: any, options: Options): any {
  const mergeable = (options.isMergeableObject || isMergeableObject)(value)
  return (options.clone !== false && mergeable)
    ? deepmerge(emptyTarget(value), value, options)
    : value
}

function defaultArrayMerge(target: any[], source: any[], options: Options): any[] {
  return target.concat(source).map((element) => {
    return cloneUnlessOtherwiseSpecified(element, options)
  })
}

function getMergeFunction(key: string, options: Options): (x: any, y: any, options: Options) => any {
  if (!options.customMerge) {
    return deepmerge
  }
  const customMerge = options.customMerge(key)
  return typeof customMerge === 'function' ? customMerge : deepmerge
}

function getEnumerableOwnPropertySymbols(target: Record<string | symbol, any>): symbol[] {
  return Object.getOwnPropertySymbols
    ? Object.getOwnPropertySymbols(target).filter((symbol) => {
        return Object.prototype.propertyIsEnumerable.call(target, symbol)
      })
    : []
}

function getKeys(target: Record<string | symbol, any>): (string | symbol)[] {
  const symbols = getEnumerableOwnPropertySymbols(target)
  const keys = Object.keys(target)
  return [...keys, ...symbols]
}

function propertyIsOnObject(object: Record<string | symbol, any>, property: string | symbol): boolean {
  try {
    return property in object
  }
  catch {
    return false
  }
}

// Protects from prototype poisoning and unexpected merging up the prototype chain.
function propertyIsUnsafe(target: Record<string | symbol, any>, key: string | symbol): boolean {
  return propertyIsOnObject(target, key) // Properties are safe to merge if they don't exist in the target yet,
    && !(Object.hasOwnProperty.call(target, key) // unsafe if they exist up the prototype chain,
      && Object.propertyIsEnumerable.call(target, key)) // and also unsafe if they're nonenumerable.
}

function mergeObject(target: Record<string | symbol, any>, source: Record<string | symbol, any>, options: Options): DeepMergeResult {
  const destination: DeepMergeResult = {}
  const mergeableObject = options.isMergeableObject || isMergeableObject

  if (mergeableObject(target)) {
    getKeys(target).forEach((key) => {
      destination[key] = cloneUnlessOtherwiseSpecified(target[key], options)
    })
  }

  getKeys(source).forEach((key) => {
    if (propertyIsUnsafe(target, key)) {
      return
    }

    if (propertyIsOnObject(target, key) && mergeableObject(source[key])) {
      destination[key] = getMergeFunction(key as string, options)(target[key], source[key], options)
    }
    else {
      destination[key] = cloneUnlessOtherwiseSpecified(source[key], options)
    }
  })
  return destination
}

export default deepmerge
