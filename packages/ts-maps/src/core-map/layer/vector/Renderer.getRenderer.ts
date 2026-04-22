import { TsMap } from '../../map/Map'
import { Canvas } from './Canvas'
import { SVG } from './SVG'

TsMap.include( {
  getRenderer(this: any, layer: any): any {
    let renderer = layer.options.renderer ?? this._getPaneRenderer(layer.options.pane) ?? this.options.renderer ?? this._renderer
    if (!renderer)
    renderer = this._renderer = this._createRenderer()
    if (!this.hasLayer(renderer))
    this.addLayer(renderer)
    return renderer
  },

  _getPaneRenderer(this: any, name: string): any {
    if (name === 'overlayPane' || name === undefined)
    return
    let renderer = this._paneRenderers[name]
    if (renderer === undefined) {
      renderer = this._createRenderer( { pane: name })
      this._paneRenderers[name] = renderer
    }
    return renderer
  },

  _createRenderer(this: any, options?: any): any {
    return (this.options.preferCanvas && new Canvas(options)) || new SVG(options)
  },
})
