import {
  hyphenate,
  removeElement,
} from '../util/index'

interface SVGConfig {
  [key: string]: string | number
}

class SVGElement {
  public node: SVGGraphicsElement
  protected style: {
    initial: Record<string, string | number>
  }

  constructor(name: string, config?: SVGConfig) {
    this.node = this._createElement(name)
    this.style = { initial: {} }

    if (config) {
      this.set(config)
    }
  }

  // Create new SVG element `svg`, `g`, `path`, `line`, `circle`, `image`, etc.
  // https://developer.mozilla.org/en-US/docs/Web/API/Document/createElementNS#important_namespace_uris
  protected _createElement(tagName: string): SVGGraphicsElement {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName) as SVGGraphicsElement
  }

  addClass(className: string): void {
    this.node.setAttribute('class', className)
  }

  getBBox(): DOMRect {
    return this.node.getBBox()
  }

  // Apply attributes on the current node element
  set(property: SVGConfig | string, value?: string | number): void {
    if (typeof property === 'object') {
      for (const attr in property) {
        this.applyAttr(attr, property[attr])
      }
    }
    else if (value !== undefined) {
      this.applyAttr(property, value)
    }
  }

  get(property: string): string | number {
    return this.style.initial[property]
  }

  applyAttr(property: string, value: string | number): void {
    this.node.setAttribute(hyphenate(property), String(value))
  }

  remove(): void {
    removeElement(this.node)
  }
}

export default SVGElement
