import type { MapInterface, SeriesOptions } from './types'
import Legend from './legend'
import OrdinalScale from './scales/ordinal-scale'
import { merge } from './util/index'

class Series {
  private _map: MapInterface
  private _elements: Record<string, any>
  private _values: Record<string, number | string>
  public config: SeriesOptions
  public scale: any
  public legend?: any

  constructor(config: SeriesOptions, elements: Record<string, any>, map: MapInterface) {
    // Private
    this._map = map
    this._elements = elements // Could be markers or regions
    this._values = config.values || {}

    // Protected
    this.config = config
    this.config.attribute = config.attribute || 'fill'

    // Set initial attributes
    if (config.attributes) {
      this.setAttributes(config.attributes)
    }

    if (typeof config.scale === 'object') {
      this.scale = new OrdinalScale(config.scale)
    }

    if (this.config.legend) {
      this.legend = new Legend(
        merge({ map: this._map, series: this }, this.config.legend),
      )
    }

    this.setValues(this._values)
  }

  setValues(values: Record<string, number | string>): void {
    const attrs: Record<string, string> = {}

    for (const key in values) {
      if (values[key]) {
        attrs[key] = this.scale.getValue(values[key])
      }
    }

    this.setAttributes(attrs)
  }

  setAttributes(attrs: Record<string, string>): void {
    for (const code in attrs) {
      if (this._elements[code]) {
        this._elements[code].element.setStyle(this.config.attribute || 'fill', attrs[code])
      }
    }
  }

  clear(): void {
    const attrs: Record<string, string> = {}

    for (const key in this._values) {
      if (this._elements[key]) {
        attrs[key] = this._elements[key].element.shape.style.initial[this.config.attribute || 'fill']
      }
    }

    this.setAttributes(attrs)
    this._values = {}
  }
}

export default Series
