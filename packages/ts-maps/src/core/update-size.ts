import type { MapInterface } from '../types'
import resize from './resize'

export default function updateSize(this: MapInterface): void {
  this._width = this.container.offsetWidth
  this._height = this.container.offsetHeight
  resize.call(this)
  this.canvas.applyTransformParams(this.scale, this.transX, this.transY)
}
