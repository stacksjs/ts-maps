import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { TsMap } from '../map/Map'
import { Control } from './Control'

const ukrainianFlag = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8" class="tsmap-attribution-flag"><path fill="#4C7BE1" d="M0 0h12v4H0z"/><path fill="#FFD500" d="M0 4h12v3H0z"/><path fill="#E0BC00" d="M0 7h12v1H0z"/></svg>'

export class AttributionControl extends Control {
  declare _attributions: Record<string, number>

  initialize(options?: any): void {
    super.initialize(options)
    this._attributions = {}
  }

  onAdd(map: any): HTMLElement {
    map.attributionControl = this
    this._container = DomUtil.create('div', 'tsmap-control-attribution')
    DomEvent.disableClickPropagation(this._container)

    for (const layer of Object.values(map._layers) as any[]) {
      if (layer.getAttribution)
      this.addAttribution(layer.getAttribution())
    }

    this._update()
    map.on('layeradd', this._addAttribution, this)
    return this._container
  }

  onRemove(map: any): void {
    map.off('layeradd', this._addAttribution, this)
  }

  _addAttribution(ev: any): void {
    if (ev.layer.getAttribution) {
      this.addAttribution(ev.layer.getAttribution())
      ev.layer.once('remove', () => this.removeAttribution(ev.layer.getAttribution()))
    }
  }

  setPrefix(prefix: string | false): this {
    this.options!.prefix = prefix
    this._update()
    return this
  }

  addAttribution(text: string): this {
    if (!text)
    return this
    if (!this._attributions[text])
    this._attributions[text] = 0
    this._attributions[text]++
    this._update()
    return this
  }

  removeAttribution(text: string): this {
    if (!text)
    return this
    if (this._attributions[text]) {
      this._attributions[text]--
      this._update()
    }
    return this
  }

  _update(): void {
    if (!this._map)
    return
    const attribs = Object.keys(this._attributions).filter(i => this._attributions[i])
    const prefixAndAttribs: string[] = []
    if (this.options!.prefix)
    prefixAndAttribs.push(this.options!.prefix)
    if (attribs.length)
    prefixAndAttribs.push(attribs.join(', '))
    this._container!.innerHTML = prefixAndAttribs.join(' <span aria-hidden="true">|</span> ')
  }
}

AttributionControl.setDefaultOptions( {
  position: 'bottomright',
  prefix: `<a target="_blank" href="https://github.com/stacksjs/ts-maps" title="ts-maps">${ukrainianFlag}ts-maps</a>`,
})

TsMap.mergeOptions( { attributionControl: true })

TsMap.addInitHook(function (this: any) {
  if (this.options.attributionControl)
  new AttributionControl().addTo(this)
})
