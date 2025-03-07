import BaseComponent from './base'

const LINE_CLASS = 'jvm-line'

interface LineOptions {
  index: string
  group: SVGElement
  map: any
  animate?: boolean
  x1: number
  y1: number
  x2: number
  y2: number
  curvature?: number
  config?: any
}

interface LineStyle {
  initial?: Record<string, string | number>
  hover?: Record<string, string | number>
  selected?: Record<string, string | number>
}

class Line extends BaseComponent {
  private _options: LineOptions
  private _style: LineStyle

  constructor(options: LineOptions, style: LineStyle) {
    super()
    this._options = options
    this._style = style
    this._draw()
  }

  setStyle(property: string, value: string | number): void {
    this.shape?.setStyle(property, value)
  }

  getConfig(): any {
    return this._options.config
  }

  _draw(): void {
    const { index, group, map, animate } = this._options
    const config = {
      d: this._getDAttribute(),
      fill: 'none',
      dataIndex: index,
    }

    this.shape = map.canvas.createPath(config, this._style, group)
    this.shape?.addClass(LINE_CLASS)

    if (animate) {
      this.shape?.setStyle({ animation: true })
    }
  }

  _getDAttribute(): string {
    const { x1, y1, x2, y2 } = this._options
    return `M${x1},${y1}${this._getQCommand(x1, y1, x2, y2)}${x2},${y2}`
  }

  _getQCommand(x1: number, y1: number, x2: number, y2: number): string {
    if (!this._options.curvature) {
      return ' '
    }

    const curvature = this._options.curvature || 0.6
    const curveX = (x1 + x2) / 2 + curvature * (y2 - y1)
    const curveY = (y1 + y2) / 2 - curvature * (x2 - x1)

    return ` Q${curveX},${curveY} `
  }
}

export default Line
