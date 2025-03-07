/**
 * By https://github.com/TehShrike/deepmerge
 */
'use strict'

function isMergeableObject(value) {
  return isNonNullObject(value)
    && !isSpecial(value)
}

function isNonNullObject(value) {
  return !!value && typeof value === 'object'
}

function isSpecial(value) {
  const stringValue = Object.prototype.toString.call(value)

  return stringValue === '[object RegExp]'
    || stringValue === '[object Date]'
    || isNode(value)
    || isReactElement(value)
}

// see https://github.com/facebook/react/blob/b5ac963fb791d1298e7f396236383bc955f916c1/src/isomorphic/classic/element/ReactElement.js#L21-L25
const canUseSymbol = typeof Symbol === 'function' && Symbol.for
const REACT_ELEMENT_TYPE = canUseSymbol ? Symbol.for('react.element') : 0xEAC7

function isReactElement(value) {
  return value.$$typeof === REACT_ELEMENT_TYPE
}

function isNode(value) {
  return value instanceof Node
}

function emptyTarget(val) {
  return Array.isArray(val) ? [] : {}
}

function cloneUnlessOtherwiseSpecified(value, options) {
  return (options.clone !== false && options.isMergeableObject(value))
    ? deepmerge(emptyTarget(value), value, options)
    : value
}

function defaultArrayMerge(target, source, options) {
  return target.concat(source).map((element) => {
    return cloneUnlessOtherwiseSpecified(element, options)
  })
}

function getMergeFunction(key, options) {
  if (!options.customMerge) {
    return deepmerge
  }
  const customMerge = options.customMerge(key)
  return typeof customMerge === 'function' ? customMerge : deepmerge
}

function getEnumerableOwnPropertySymbols(target) {
  return Object.getOwnPropertySymbols
    ? Object.getOwnPropertySymbols(target).filter((symbol) => {
        return target.propertyIsEnumerable(symbol)
      })
    : []
}

function getKeys(target) {
  return Object.keys(target).concat(getEnumerableOwnPropertySymbols(target))
}

function propertyIsOnObject(object, property) {
  try {
    return property in object
  }
  catch (_) {
    return false
  }
}

// Protects from prototype poisoning and unexpected merging up the prototype chain.
function propertyIsUnsafe(target, key) {
  return propertyIsOnObject(target, key) // Properties are safe to merge if they don't exist in the target yet,
    && !(Object.hasOwnProperty.call(target, key) // unsafe if they exist up the prototype chain,
      && Object.propertyIsEnumerable.call(target, key)) // and also unsafe if they're nonenumerable.
}

function mergeObject(target, source, options) {
  const destination = {}
  if (options.isMergeableObject(target)) {
    getKeys(target).forEach((key) => {
      destination[key] = cloneUnlessOtherwiseSpecified(target[key], options)
    })
  }
  getKeys(source).forEach((key) => {
    if (propertyIsUnsafe(target, key)) {
      return
    }

    if (propertyIsOnObject(target, key) && options.isMergeableObject(source[key])) {
      destination[key] = getMergeFunction(key, options)(target[key], source[key], options)
    }
    else {
      destination[key] = cloneUnlessOtherwiseSpecified(source[key], options)
    }
  })
  return destination
}

var deepmerge = function (target, source, options) {
  options = options || {}
  options.arrayMerge = options.arrayMerge || defaultArrayMerge
  options.isMergeableObject = options.isMergeableObject || isMergeableObject
  // cloneUnlessOtherwiseSpecified is added to `options` so that custom arrayMerge()
  // implementations can use it. The caller may not replace it.
  options.cloneUnlessOtherwiseSpecified = cloneUnlessOtherwiseSpecified

  const sourceIsArray = Array.isArray(source)
  const targetIsArray = Array.isArray(target)
  const sourceAndTargetTypesMatch = sourceIsArray === targetIsArray

  if (!sourceAndTargetTypesMatch) {
    return cloneUnlessOtherwiseSpecified(source, options)
  }
  else if (sourceIsArray) {
    return options.arrayMerge(target, source, options)
  }
  else {
    return mergeObject(target, source, options)
  }
}

export default deepmerge
