import BaseComponent from './base'
import Interactable from './concerns/interactable'

interface RegionOptions {
  map: any
  code: string
  path: string
  style: RegionStyle
  label?: {
    render?: (key: string) => string
    offsets?: ((_key: string) => [number, number]) | Array<[number, number]>
  }
  labelStyle?: Record<string, any>
  labelsGroup?: SVGElement
}

interface RegionStyle {
  initial: Record<string, any>
  hover?: Record<string, any>
  selected?: Record<string, any>
}

class Region extends BaseComponent {
  private _map: any
  public labelX: number = 0
  public labelY: number = 0
  public label?: any
  public isHovered?: boolean
  public isSelected: boolean = false
  public shape: any

  // Declare methods that will be bound from Interactable
  public setStyle!: (property: string, value: any) => void
  public remove!: () => void
  public hover!: (state: boolean) => void
  public select!: (state: boolean) => void
  protected _setStatus!: (property: string, state: boolean) => void

  constructor({ map, code, path, style, label, labelStyle, labelsGroup }: RegionOptions) {
    super()

    this._map = map

    // Bind Interactable methods to this instance
    this.setStyle = Interactable.setStyle.bind(this)
    this.remove = Interactable.remove.bind(this)
    this.hover = Interactable.hover.bind(this)
    this.select = Interactable.select.bind(this)
    this._setStatus = Interactable._setStatus.bind(this)

    this.shape = this._createRegion(path, code, style)

    const text = this.getLabelText(code, label)

    // If label is passed and render function returns something
    if (label && text) {
      const bbox = this.shape?.getBBox()
      const offsets = this.getLabelOffsets(code, label)

      this.labelX = (bbox?.x ?? 0) + (bbox?.width ?? 0) / 2 + offsets[0]
      this.labelY = (bbox?.y ?? 0) + (bbox?.height ?? 0) / 2 + offsets[1]

      this.label = this._map.canvas.createText({
        text,
        textAnchor: 'middle',
        alignmentBaseline: 'central',
        dataCode: code,
        x: this.labelX,
        y: this.labelY,
      }, labelStyle, labelsGroup)

      this.label.addClass('jvm-region jvm-element')
    }
  }

  _createRegion(path: string, code: string, style: RegionStyle): any {
    const regionPath = this._map.canvas.createPath({ d: path, dataCode: code }, style)
    regionPath.addClass('jvm-region jvm-element')
    return regionPath
  }

  updateLabelPosition(): void {
    if (this.label) {
      this.label.set({
        x: this.labelX * this._map.scale + this._map.transX * this._map.scale,
        y: this.labelY * this._map.scale + this._map.transY * this._map.scale,
      })
    }
  }

  getLabelText(key: string, label?: any): string | undefined {
    if (!label) {
      return undefined
    }

    if (typeof label.render === 'function') {
      return label.render(key)
    }

    return key
  }

  getLabelOffsets(key: string, label?: any): [number, number] {
    if (label && typeof label.offsets === 'function') {
      return label.offsets(key)
    }

    // If offsets are an array of offsets e.g offsets: [ [0, 25], [10, 15] ]
    if (label && Array.isArray(label.offsets)) {
      return label.offsets[key as any] || [0, 0]
    }

    return [0, 0]
  }
}

export default Region
