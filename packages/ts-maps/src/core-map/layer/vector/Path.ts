import * as Util from '../../core/Util'
import { Layer } from '../Layer'

export class Path extends Layer {
  declare _renderer?: any
  declare _path?: any
  declare _pxBounds?: any
  declare _parts?: any[]

  beforeAdd(map: any): void {
    this._renderer = map.getRenderer(this)
  }

  onAdd(): void {
    this._renderer._initPath(this)
    this._reset()
    this._renderer._addPath(this)
  }

  onRemove(): void {
    this._renderer._removePath(this)
  }

  redraw(): this {
    if (this._map)
    this._renderer._updatePath(this)
    return this
  }

  setStyle(style: any): this {
    Util.setOptions(this as any, style)
    if (this._renderer) {
      this._renderer._updateStyle(this)
      if (this.options!.stroke && style && Object.hasOwn(style, 'weight'))
      this._updateBounds()
    }
    return this
  }

  bringToFront(): this {
    this._renderer?._bringToFront(this)
    return this
  }

  bringToBack(): this {
    this._renderer?._bringToBack(this)
    return this
  }

  getElement(): any {
    return this._path
  }

  _reset(): void {
    this._project()
    this._update()
  }

  _clickTolerance(): number {
    return (this.options!.stroke ? this.options!.weight / 2 : 0) + (this._renderer.options.tolerance || 0)
  }

  _project(): void {}
  _update(): void {}
  _updateBounds(): void {}
}

Path.setDefaultOptions( {
  stroke: true,
  color: '#3388ff',
  weight: 3,
  opacity: 1,
  lineCap: 'round',
  lineJoin: 'round',
  dashArray: null,
  dashOffset: null,
  fill: false,
  fillColor: null,
  fillOpacity: 0.2,
  fillRule: 'evenodd',
  interactive: true,
  bubblingPointerEvents: true,
})
