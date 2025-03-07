import { removeElement } from '../util'

interface BBox {
  x: number
  y: number
  width: number
  height: number
}

interface BaseComponentShape {
  remove: () => void
  setStyle: (property: string | Record<string, any>, value?: string | number) => void
  addClass: (className: string) => void
  getBBox: () => BBox
  width?: number
  node?: SVGElement
  isHovered?: boolean
  isSelected?: boolean
  updateStyle?: () => void
}

class BaseComponent {
  protected _tooltip?: HTMLElement
  protected shape?: BaseComponentShape

  dispose(): void {
    if (this._tooltip) {
      removeElement(this._tooltip)
    }
    else if (this.shape) {
      // @todo: move shape in base component in v2
      this.shape.remove()
    }

    for (const propertyName of Object.getOwnPropertyNames(this)) {
      (this as any)[propertyName] = null
    }
  }
}

export default BaseComponent
