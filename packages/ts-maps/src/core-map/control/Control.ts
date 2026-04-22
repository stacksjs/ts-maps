import * as Util from '../core/Util'
import * as DomUtil from '../dom/DomUtil'
import { Class } from '../core/Class'
import { TsMap } from '../map/Map'

export class Control extends Class {
  _map: any
  _container?: HTMLElement

  onAdd(_map: any): HTMLElement { return document.createElement('div') }
  onRemove(_map: any): void {}

  initialize(...args: any[]): void {
    Util.setOptions(this as any, args[0])
  }

  getPosition(): string {
    return this.options!.position
  }

  setPosition(position: string): this {
    const map = this._map
    map?.removeControl(this)
    this.options!.position = position
    map?.addControl(this)
    return this
  }

  getContainer(): HTMLElement | undefined {
    return this._container
  }

  addTo(map: any): this {
    this.remove()
    this._map = map

    const container = this._container = this.onAdd(map)
    const pos = this.getPosition()
    const corner = map._controlCorners[pos]

    container.classList.add('tsmap-control')

    if (pos.includes('bottom'))
    corner.insertBefore(container, corner.firstChild)
    else
    corner.appendChild(container)

    this._map.on('unload', this.remove, this)
    return this
  }

  remove(): this {
    if (!this._map)
    return this
    this._container?.remove()
    this.onRemove(this._map)
    this._map.off('unload', this.remove, this)
    this._map = null
    return this
  }

  _refocusOnMap(e: any): void {
    if (this._map && e && !(e.screenX === 0 && e.screenY === 0))
    this._map.getContainer().focus()
  }
}

Control.setDefaultOptions( { position: 'topright' })

TsMap.include( {
  addControl(this: any, control: Control): any {
    control.addTo(this)
    return this
  },

  removeControl(this: any, control: Control): any {
    control.remove()
    return this
  },

  _initControlPos(this: any): void {
    const corners: Record<string, HTMLElement> = this._controlCorners = {}
    const l = 'tsmap-'
    const container = this._controlContainer = DomUtil.create('div', `${l}control-container`, this._container)

    function createCorner(vSide: string, hSide: string): void {
      const className = `${l + vSide} ${l}${hSide}`
      corners[vSide + hSide] = DomUtil.create('div', className, container)
    }

    createCorner('top', 'left')
    createCorner('top', 'right')
    createCorner('bottom', 'left')
    createCorner('bottom', 'right')
  },

  _clearControlPos(this: any): void {
    for (const c of Object.values(this._controlCorners) as HTMLElement[])
    c.remove()
    this._controlContainer?.remove()
    delete this._controlCorners
    delete this._controlContainer
  },
})
