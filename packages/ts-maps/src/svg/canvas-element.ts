import type { ShapeStyle } from './shape-element'
import SVGElement from './base-element'
import SVGImageElement from './image-element'
import SVGShapeElement from './shape-element'
import SVGTextElement from './text-element'

class SVGCanvasElement extends SVGElement {
  protected _container: HTMLElement
  protected _defsElement: SVGElement
  protected _rootElement: SVGElement

  constructor(container: HTMLElement) {
    super('svg') // Create svg element for holding the whole map

    this._container = container

    // Create the defs element
    this._defsElement = new SVGElement('defs')

    // Create group element which will hold the paths (regions)
    this._rootElement = new SVGElement('g', { id: 'jvm-regions-group' })

    // Append the defs element to the this.node (SVG tag)
    this.node.appendChild(this._defsElement.node)

    // Append the group to this.node (SVG tag)
    this.node.appendChild(this._rootElement.node)

    // Append this.node (SVG tag) to the container
    this._container.appendChild(this.node)
  }

  setSize(width: number, height: number): void {
    this.node.setAttribute('width', String(width))
    this.node.setAttribute('height', String(height))
  }

  applyTransformParams(scale: number, transX: number, transY: number): void {
    this._rootElement.node.setAttribute('transform', `scale(${scale}) translate(${transX}, ${transY})`)
  }

  // Create `path` element
  createPath(config: Record<string, string | number>, style: ShapeStyle, group?: SVGElement): SVGShapeElement {
    const path = new SVGShapeElement('path', config, style)
    path.node.setAttribute('fill-rule', 'evenodd')
    return this._add(path, group)
  }

  // Create `circle` element
  createCircle(config: Record<string, string | number>, style: ShapeStyle, group?: SVGElement): SVGShapeElement {
    const circle = new SVGShapeElement('circle', config, style)
    return this._add(circle, group)
  }

  // Create `line` element
  createLine(config: Record<string, string | number>, style: ShapeStyle, group?: SVGElement): SVGShapeElement {
    const line = new SVGShapeElement('line', config, style)
    return this._add(line, group)
  }

  // Create `text` element
  createText(config: Record<string, string | number>, style: ShapeStyle, group?: SVGElement): SVGTextElement {
    const text = new SVGTextElement(config, style)
    return this._add(text, group)
  }

  // Create `image` element
  createImage(config: Record<string, string | number>, style: ShapeStyle, group?: SVGElement): SVGImageElement {
    const image = new SVGImageElement(config, style)
    return this._add(image, group)
  }

  // Create `g` element
  createGroup(id?: string): SVGElement {
    const group = new SVGElement('g')
    this.node.appendChild(group.node)

    if (id) {
      group.node.id = id
    }

    ;(group as any).canvas = this

    return group
  }

  // Add some element to a specific group or the root element if the group isn't given
  protected _add<T extends SVGElement>(element: T, group?: SVGElement): T {
    group = group || this._rootElement
    group.node.appendChild(element.node)
    return element
  }
}

export default SVGCanvasElement
