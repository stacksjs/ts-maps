import * as DomUtil from '../dom/DomUtil'
import { Control } from './Control'

export class ScaleControl extends Control {
  declare _mScale?: HTMLElement
  declare _iScale?: HTMLElement

  onAdd(map: any): HTMLElement {
    const className = 'tsmap-control-scale'
    const container = DomUtil.create('div', className)
    const options = this.options!

    this._addScales(options, `${className}-line`, container)

    map.on(options.updateWhenIdle ? 'moveend' : 'move', this._update, this)
    map.whenReady(this._update, this)
    return container
  }

  onRemove(map: any): void {
    map.off(this.options!.updateWhenIdle ? 'moveend' : 'move', this._update, this)
  }

  _addScales(options: any, className: string, container: HTMLElement): void {
    if (options.metric)
    this._mScale = DomUtil.create('div', className, container)
    if (options.imperial)
    this._iScale = DomUtil.create('div', className, container)
  }

  _update(): void {
    const map = this._map
    const y = map.getSize().y / 2
    const maxMeters = map.distance(
    map.containerPointToLatLng([0, y]),
    map.containerPointToLatLng([this.options!.maxWidth, y]),
    )
    this._updateScales(maxMeters)
  }

  _updateScales(maxMeters: number): void {
    if (this.options!.metric && maxMeters)
    this._updateMetric(maxMeters)
    if (this.options!.imperial && maxMeters)
    this._updateImperial(maxMeters)
  }

  _updateMetric(maxMeters: number): void {
    const meters = this._getRoundNum(maxMeters)
    const label = meters < 1000 ? `${meters} m` : `${meters / 1000} km`
    this._updateScale(this._mScale as HTMLElement, label, meters / maxMeters)
  }

  _updateImperial(maxMeters: number): void {
    const maxFeet = maxMeters * 3.2808399
    if (maxFeet > 5280) {
      const maxMiles = maxFeet / 5280
      const miles = this._getRoundNum(maxMiles)
      this._updateScale(this._iScale as HTMLElement, `${miles} mi`, miles / maxMiles)
    }
    else {
      const feet = this._getRoundNum(maxFeet)
      this._updateScale(this._iScale as HTMLElement, `${feet} ft`, feet / maxFeet)
    }
  }

  _updateScale(scale: HTMLElement, text: string, ratio: number): void {
    scale.style.width = `${Math.round(this.options!.maxWidth * ratio)}px`
    scale.innerHTML = text
  }

  _getRoundNum(num: number): number {
    const pow10 = 10 ** (String(Math.floor(num)).length - 1)
    let d = num / pow10
    d = d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1
    return pow10 * d
  }
}

ScaleControl.setDefaultOptions( {
  position: 'bottomleft',
  maxWidth: 100,
  metric: true,
  imperial: true,
  updateWhenIdle: false,
})
