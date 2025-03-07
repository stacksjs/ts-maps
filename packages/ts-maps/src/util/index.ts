import DeepMerge from './deep-merge'

/**
 * --------------------------------------------------------------------------
 * Public Util Api
 * --------------------------------------------------------------------------
 */

type ElementType = Element | null
interface Constructor { prototype: Record<string, any> }

function getElement(selector: string | Element): ElementType {
  if (typeof selector === 'object' && typeof selector.nodeType !== 'undefined') {
    return selector
  }

  if (typeof selector === 'string') {
    return document.querySelector(selector)
  }

  return null
}

function createElement(type: string, classes?: string, content?: string, html: boolean = false): HTMLElement {
  const el = document.createElement(type)

  if (content) {
    el[!html ? 'textContent' : 'innerHTML'] = content
  }

  if (classes) {
    el.className = classes
  }

  return el
}

function findElement(parentElement: Element, selector: string): Element | null {
  return Element.prototype.querySelector.call(parentElement, selector)
}

function removeElement(target: Element): void {
  target.parentNode?.removeChild(target)
}

function isImageUrl(url: string): boolean {
  return /\.[jpe?g|ifn]$/i.test(url)
}

function hyphenate(str: string): string {
  return str.replace(/\w([A-Z])/g, (m: string) => `${m[0]}-${m[1]}`).toLowerCase()
}

function merge<T extends Record<string, any>>(target: T, source: Record<string, any>, deep: boolean = false): T {
  if (deep) {
    return DeepMerge(target, source) as T
  }

  return Object.assign({}, target, source) as T
}

function keys<T extends Record<string, any>>(object: T): Array<keyof T> {
  return Object.keys(object) as Array<keyof T>
}

function getLineUid(from: string, to: string): string {
  return `${from.toLowerCase()}:to:${to.toLowerCase()}`
}

function inherit(target: Constructor, source: Record<string, any>): void {
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
