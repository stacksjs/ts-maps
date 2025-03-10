import type { ShapeStyle } from './shape-element'
import SVGShapeElement from './shape-element'

class SVGTextElement extends SVGShapeElement {
  constructor(config: Record<string, string | number>, style: ShapeStyle) {
    super('text', config, style)
  }

  applyAttr(attr: string, value: string | number): void {
    if (attr === 'text') {
      this.node.textContent = String(value)
    }
    else if (attr === 'x' || attr === 'y' || attr === 'cx' || attr === 'cy') {
      // Ensure these attributes have proper length values
      this.node.setAttribute(attr, `${value}`)
    }
    else {
      super.applyAttr(attr, value)
    }
  }
}

export default SVGTextElement
