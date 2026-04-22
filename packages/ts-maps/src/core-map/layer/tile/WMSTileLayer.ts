import type { Point } from '../../geometry/Point'
import Browser from '../../core/Browser'
import { EPSG4326 } from '../../geo/crs/EPSG4326'
import { Bounds } from '../../geometry/Bounds'
import { TileLayer } from './TileLayer'

export class WMSTileLayer extends TileLayer {
  declare wmsParams: Record<string, any>
  declare _crs?: any
  declare _wmsVersion?: number
  defaultWmsParams: Record<string, any> = {
    service: 'WMS',
    request: 'GetMap',
    layers: '',
    styles: '',
    format: 'image/jpeg',
    transparent: false,
    version: '1.1.1',
  }

  initialize(url: string, options?: any): void {
    super.initialize(url, options)

    const wmsParams: Record<string, any> = { ...this.defaultWmsParams }

    for (const [key, value] of Object.entries(options ?? {})) {
      if (!(key in (WMSTileLayer.prototype as any).options))
      wmsParams[key] = value
    }

    const realRetina = this.options!.detectRetina && Browser.retina ? 2 : 1
    const tileSize = this.getTileSize()

    wmsParams.width = tileSize.x * realRetina
    wmsParams.height = tileSize.y * realRetina

    this.wmsParams = wmsParams
  }

  onAdd(map: any): void {
    this._crs = this.options!.crs ?? map.options.crs
    this._wmsVersion = Number.parseFloat(this.wmsParams.version)

    const projectionKey = this._wmsVersion! >= 1.3 ? 'crs' : 'srs'
    this.wmsParams[projectionKey] = this._crs.code

    super.onAdd()
  }

  getTileUrl(coords: Point & { z: number }): string {
    const tileBounds = this._tileCoordsToNwSe(coords)
    const crs = this._crs
    const bounds = new Bounds(crs.project(tileBounds[0]), crs.project(tileBounds[1]))
    const min = bounds.min
    const max = bounds.max
    const bbox = (this._wmsVersion! >= 1.3 && this._crs === EPSG4326
    ? [min.y, min.x, max.y, max.x]
    : [min.x, min.y, max.x, max.y]).join(',')
    const url = new URL(super.getTileUrl(coords))
    for (const [k, v] of Object.entries( { ...this.wmsParams, bbox }))
    url.searchParams.append(this.options!.uppercase ? k.toUpperCase() : k, String(v))
    return url.toString()
  }

  setParams(params: Record<string, any>, noRedraw?: boolean): this {
    Object.assign(this.wmsParams, params)
    if (!noRedraw)
    this.redraw()
    return this
  }
}

WMSTileLayer.setDefaultOptions( { crs: null, uppercase: false })
