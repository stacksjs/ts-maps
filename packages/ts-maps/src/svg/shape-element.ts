import { merge } from '../util/index'
import SVGElement from './base-element'

export interface ShapeStyle {
  initial: Record<string, string | number>
  current?: Record<string, string | number>
  hover?: Record<string, string | number>
  selected?: Record<string, string | number>
  selectedHover?: Record<string, string | number>
}

class SVGShapeElement extends SVGElement {
  protected isHovered: boolean
  protected isSelected: boolean
  protected style: ShapeStyle

  constructor(name: string, config?: Record<string, string | number>, style: ShapeStyle = { initial: {} }) {
    super(name, config)

    this.isHovered = false
    this.isSelected = false
    this.style = style
    this.style.current = {}

    this.updateStyle()
  }

  setStyle(property: string | Record<string, string | number>, value?: string | number): void {
    if (typeof property === 'object') {
      merge(this.style.current!, property)
    }
    else {
      merge(this.style.current!, { [property]: value })
    }

    this.updateStyle()
  }

  updateStyle(): void {
    const attrs: Record<string, string | number> = {}

    merge(attrs, this.style.initial)
    merge(attrs, this.style.current || {})

    if (this.isHovered) {
      merge(attrs, this.style.hover || {})
    }

    if (this.isSelected) {
      merge(attrs, this.style.selected || {})

      if (this.isHovered) {
        merge(attrs, this.style.selectedHover || {})
      }
    }

    this.set(attrs)
  }
}

export default SVGShapeElement
