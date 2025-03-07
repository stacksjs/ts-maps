import type { DataVisualizationOptions, MapInterface } from './types'

export class DataVisualization {
  private _scale: [string, string]
  private _values: Record<string, number | string>
  private _fromColor: number[]
  private _toColor: number[]
  private _map: MapInterface
  private min: number = Number.MAX_VALUE
  private max: number = 0

  constructor({ scale, values }: DataVisualizationOptions, map: MapInterface) {
    this._scale = scale
    this._values = values
    this._fromColor = this.hexToRgb(scale[0])
    this._toColor = this.hexToRgb(scale[1])
    this._map = map

    this.setMinMaxValues(values)
    this.visualize()
  }

  setMinMaxValues(values: Record<string, number | string>): void {
    for (const key in values) {
      const value = Number.parseFloat(String(values[key]))

      if (value > this.max) {
        this.max = value
      }

      if (value < this.min) {
        this.min = value
      }
    }
  }

  visualize(): void {
    const attrs: Record<string, string> = {}
    let value: number

    for (const regionCode in this._values) {
      value = Number.parseFloat(String(this._values[regionCode]))

      if (!Number.isNaN(value)) {
        attrs[regionCode] = this.getValue(value)
      }
    }

    this.setAttributes(attrs)
  }

  setAttributes(attrs: Record<string, string>): void {
    for (const code in attrs) {
      if (this._map.regions[code]) {
        this._map.regions[code].element.setStyle('fill', attrs[code])
      }
    }
  }

  getValue(value: number): string {
    if (this.min === this.max) {
      return `#${this._toColor.join('')}`
    }

    let hex: string
    let color = '#'

    for (let i = 0; i < 3; i++) {
      hex = Math.round(
        this._fromColor[i] + (this._toColor[i] - this._fromColor[i]) * ((value - this.min) / (this.max - this.min)),
      ).toString(16)

      color += (hex.length === 1 ? '0' : '') + hex
    }

    return color
  }

  hexToRgb(h: string): number[] {
    let r: string = '0'
    let g: string = '0'
    let b: string = '0'

    if (h.length === 4) {
      r = `0x${h[1]}${h[1]}`
      g = `0x${h[2]}${h[2]}`
      b = `0x${h[3]}${h[3]}`
    }
    else if (h.length === 7) {
      r = `0x${h[1]}${h[2]}`
      g = `0x${h[3]}${h[4]}`
      b = `0x${h[5]}${h[6]}`
    }

    return [Number.parseInt(r, 16), Number.parseInt(g, 16), Number.parseInt(b, 16)]
  }
}

export default DataVisualization
