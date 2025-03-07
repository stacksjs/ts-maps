import DeepMerge from './deepMerge'

/**
 * --------------------------------------------------------------------------
 * Public Util Api
 * --------------------------------------------------------------------------
 */
function getElement(selector) {
  if (typeof selector === 'object' && typeof selector.nodeType !== 'undefined') {
    return selector
  }

  if (typeof selector === 'string') {
    return document.querySelector(selector)
  }

  return null
}

function createElement(type, classes, content, html = false) {
  const el = document.createElement(type)

  if (content) {
    el[!html ? 'textContent' : 'innerHTML'] = content
  }

  if (classes) {
    el.className = classes
  }

  return el
}

function findElement(parentElement, selector) {
  return Element.prototype.querySelector.call(parentElement, selector)
}

function removeElement(target) {
  target.parentNode.removeChild(target)
}

function isImageUrl(url) {
  return /\.(jpg|gif|png)$/.test(url)
}

function hyphenate(string) {
  return string.replace(/\w([A-Z])/g, m => `${m[0]}-${m[1]}`).toLowerCase()
}

function merge(target, source, deep = false) {
  if (deep) {
    return DeepMerge(target, source)
  }

  return Object.assign(target, source)
}

function keys(object) {
  return Object.keys(object)
}

function getLineUid(from, to) {
  return `${from.toLowerCase()}:to:${to.toLowerCase()}`
}

function inherit(target, source) {
  Object.assign(target.prototype, source)
}

export {
  createElement,
  findElement,
  getElement,
  getLineUid,
  hyphenate,
  inherit,
  isImageUrl,
  keys,
  merge,
  removeElement,
}
