import type { ShapeStyle } from './shape-element'
import SVGShapeElement from './shape-element'

class SVGTextElement extends SVGShapeElement {
  constructor(config: Record<string, string | number>, style: ShapeStyle) {
    super('text', config, style)
  }

  applyAttr(attr: string, value: string | number): void {
    attr === 'text' ? this.node.textContent = String(value) : super.applyAttr(attr, value)
  }
}

export default SVGTextElement
