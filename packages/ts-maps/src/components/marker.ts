import BaseComponent from './base'
import Interactable from './concerns/interactable'

const NAME = 'marker'
const JVM_PREFIX = 'jvm-'
const MARKER_CLASS = `${JVM_PREFIX}element ${JVM_PREFIX}marker`
const MARKER_LABEL_CLASS = `${JVM_PREFIX}element ${JVM_PREFIX}label`

interface MarkerOptions {
  index: string
  map: any
  group: SVGElement
  labelsGroup: SVGElement
  cx: number
  cy: number
  label?: {
    render?: (config: any, key: string) => string
    offsets?: ((_key: string) => [number, number]) | Array<[number, number]>
  }
  config?: {
    offsets?: [number, number]
    [key: string]: any
  }
  isRecentlyCreated?: boolean
}

interface MarkerStyle {
  initial: {
    image?: string
    [key: string]: any
  }
  hover?: Record<string, any>
  selected?: Record<string, any>
}

class Marker extends BaseComponent {
  private _options: MarkerOptions
  private _style: MarkerStyle
  private _labelX: number | null = null
  private _labelY: number | null = null
  private _offsets: [number, number] | null = null
  private _isImage: boolean
  public label?: any
  public isHovered?: boolean = false
  public isSelected: boolean = false

  // Declare methods that will be bound from Interactable
  public setStyle!: (property: string, value: any) => void
  public remove!: () => void
  public hover!: (state: boolean) => void
  public select!: (state: boolean) => void
  protected _setStatus!: (property: string, state: boolean) => void

  static get Name(): string {
    return NAME
  }

  constructor(options: MarkerOptions, style: MarkerStyle) {
    super()

    this._options = options
    this._style = style
    this._isImage = !!style.initial.image

    // Bind Interactable methods to this instance
    this.setStyle = Interactable.setStyle.bind(this)
    this.remove = Interactable.remove.bind(this)
    this.hover = Interactable.hover.bind(this)
    this.select = Interactable.select.bind(this)
    this._setStatus = Interactable._setStatus.bind(this)

    this._draw()

    if (this._options.label) {
      this._drawLabel()
    }

    if (this._isImage) {
      this.updateLabelPosition()
    }
  }

  getConfig(): any {
    return this._options.config
  }

  updateLabelPosition(): void {
    const map = this._options.map
    if (this.label && this._labelX !== null && this._labelY !== null && this._offsets) {
      this.label.set({
        x:
          this._labelX * map.scale
          + this._offsets[0]
          + map.transX * map.scale
          + 5
          + (this._isImage
            ? (this.shape?.width || 0) / 2
            : (this.shape?.node as SVGCircleElement)?.r?.baseVal?.value || 0),
        y:
          this._labelY * map.scale
          + map.transY * this._options.map.scale
          + this._offsets[1],
      })
    }
  }

  _draw(): void {
    const { index, map, group, cx, cy } = this._options
    const shapeType = this._isImage ? 'createImage' : 'createCircle'

    this.shape = map.canvas[shapeType](
      { dataIndex: index, cx, cy },
      this._style,
      group,
    )
    this.shape?.addClass(MARKER_CLASS)
  }

  _drawLabel(): void {
    const {
      index,
      map,
      label,
      labelsGroup,
      cx,
      cy,
      config,
      isRecentlyCreated,
    } = this._options
    const labelText = this.getLabelText(index, label)

    this._labelX = cx / map.scale - map.transX
    this._labelY = cy / map.scale - map.transY
    this._offsets = isRecentlyCreated && config?.offsets ? config.offsets : this.getLabelOffsets(index, label)
    this.label = map.canvas.createText(
      {
        text: labelText,
        dataIndex: index,
        x: this._labelX,
        y: this._labelY,
        dy: '0.6ex',
      },
      map.params.markerLabelStyle,
      labelsGroup,
    )
    this.label.addClass(MARKER_LABEL_CLASS)

    if (isRecentlyCreated) {
      this.updateLabelPosition()
    }
  }

  getLabelText(key: string, label?: any): string | undefined {
    if (!label) {
      return undefined
    }

    if (typeof label.render === 'function') {
      return label.render(this.getConfig(), key)
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

// Note: We don't need inherit() anymore since we're binding methods in constructor
export default Marker
