import type { ShapeStyle } from './shape-element'
import SVGShapeElement from './shape-element'

interface ImageConfig {
  url?: string
  offset?: [number, number]
}

class SVGImageElement extends SVGShapeElement {
  protected width: number = 0
  protected height: number = 0
  protected cx: number = 0
  protected cy: number = 0
  protected offset: [number, number] = [0, 0]

  constructor(config: Record<string, string | number>, style: ShapeStyle) {
    super('image', config, style)
  }

  applyAttr(attr: string, value: string | number | ImageConfig): void {
    let imageUrl: string

    if (attr === 'image') {
      if (typeof value === 'object') {
        const config = value as ImageConfig
        imageUrl = config.url || ''
        this.offset = config.offset || [0, 0]
      }
      else {
        imageUrl = String(value)
        this.offset = [0, 0]
      }

      this.node.setAttributeNS('http://www.w3.org/1999/xlink', 'href', imageUrl)

      // Set width and height then call this `applyAttr` again
      this.width = 23
      this.height = 23
      this.applyAttr('width', this.width)
      this.applyAttr('height', this.height)
      this.applyAttr('x', this.cx - this.width / 2 + this.offset[0])
      this.applyAttr('y', this.cy - this.height / 2 + this.offset[1])
    }
    else if (attr === 'cx') {
      this.cx = Number(value)

      if (this.width) {
        this.applyAttr('x', this.cx - this.width / 2 + this.offset[0])
      }
    }
    else if (attr === 'cy') {
      this.cy = Number(value)

      if (this.height) {
        this.applyAttr('y', this.cy - this.height / 2 + this.offset[1])
      }
    }
    else {
      super.applyAttr(attr, value as string | number)
    }
  }
}

export default SVGImageElement
