import * as Util from '../../core/Util'
import { BlanketOverlay } from '../BlanketOverlay'

export class Renderer extends BlanketOverlay {
  declare _layers: Record<number, any>

  initialize(options?: any): void {
    super.initialize({ ...options, continuous: false })
    Util.stamp(this);
    (this as any)._layers ??= {}
  }

  onAdd(map?: any): void {
    super.onAdd(map)
    this.on('update', this._updatePaths, this)
  }

  onRemove(map?: any): void {
    super.onRemove(map)
    this.off('update', this._updatePaths, this)
  }

  _onZoomEnd(): void {
    for (const layer of Object.values(this._layers))
    layer._project()
  }

  _updatePaths(): void {
    for (const layer of Object.values(this._layers))
    layer._update()
  }

  _onViewReset(): void {
    for (const layer of Object.values(this._layers))
    layer._reset()
  }

  _onSettled(_ev?: any): void {
    this._update()
  }

  _update(): void {}
}
