import * as DomUtil from '../../dom/DomUtil'
import { splitWords, stamp } from '../../core/Util'
import { Renderer } from './Renderer'

export class SVG extends Renderer {
  declare _rootGroup?: SVGGElement
  declare _svgSize?: any

  _initContainer(): void {
    this._container = SVG.create('svg') as any
    (this._container as any).setAttribute('pointer-events', 'none')
    this._rootGroup = SVG.create('g') as SVGGElement
    this._container!.appendChild(this._rootGroup)
  }

  _destroyContainer(): void {
    super._destroyContainer()
    delete this._rootGroup
    delete this._svgSize
  }

  _resizeContainer(): any {
    // Equivalent to super._resizeContainer but needs access to _bounds after.
    const p = this.options!.padding
    const size = this._map.getSize().multiplyBy(1 + p * 2).round()
    this._container!.style.width = `${size.x}px`
    this._container!.style.height = `${size.y}px`

    if (!this._svgSize || !this._svgSize.equals(size)) {
      this._svgSize = size
      ; (this._container as any).setAttribute('width', size.x)
      ; (this._container as any).setAttribute('height', size.y)
    }

    const b = this._bounds
    if (b)
    (this._container as any).setAttribute('viewBox', [b.min.x, b.min.y, size.x, size.y].join(' '))

    return size
  }

  _update(): void {
    if (this._map._animatingZoom && this._bounds)
    return

    const b = this._bounds!
    const size = b.getSize()
    ; (this._container as any).setAttribute('viewBox', [b.min.x, b.min.y, size.x, size.y].join(' '))
    this.fire('update')
  }

  _initPath(layer: any): void {
    const path = layer._path = SVG.create('path')

    if (layer.options.className)
    path.classList.add(...splitWords(layer.options.className))

    if (layer.options.interactive)
    path.classList.add('tsmap-interactive')

    this._updateStyle(layer)
    this._layers[stamp(layer)] = layer
  }

  _addPath(layer: any): void {
    if (!this._rootGroup)
    this._initContainer()
    this._rootGroup!.appendChild(layer._path)
    layer.addInteractiveTarget(layer._path)
  }

  _removePath(layer: any): void {
    layer._path.remove()
    layer.removeInteractiveTarget(layer._path)
    delete this._layers[stamp(layer)]
  }

  _updatePath(layer: any): void {
    layer._project()
    layer._update()
  }

  _updateStyle(layer: any): void {
    const path = layer._path
    const options = layer.options
    if (!path)
    return

    if (options.stroke) {
      path.setAttribute('stroke', options.color)
      path.setAttribute('stroke-opacity', options.opacity)
      path.setAttribute('stroke-width', options.weight)
      path.setAttribute('stroke-linecap', options.lineCap)
      path.setAttribute('stroke-linejoin', options.lineJoin)

      if (options.dashArray)
      path.setAttribute('stroke-dasharray', options.dashArray)
      else
      path.removeAttribute('stroke-dasharray')

      if (options.dashOffset)
      path.setAttribute('stroke-dashoffset', options.dashOffset)
      else
      path.removeAttribute('stroke-dashoffset')
    }
    else {
      path.setAttribute('stroke', 'none')
    }

    if (options.fill) {
      path.setAttribute('fill', options.fillColor || options.color)
      path.setAttribute('fill-opacity', options.fillOpacity)
      path.setAttribute('fill-rule', options.fillRule || 'evenodd')
    }
    else {
      path.setAttribute('fill', 'none')
    }
  }

  _updatePoly(layer: any, closed?: boolean): void {
    this._setPath(layer, SVG.pointsToPath(layer._parts, closed))
  }

  _updateCircle(layer: any): void {
    const p = layer._point
    const r = Math.max(Math.round(layer._pxRadius), 1)
    const r2 = Math.max(Math.round(layer._pxRadiusY), 1) || r
    const arc = `a${r},${r2} 0 1,0 `
    const d = layer._empty() ? 'M0 0' : `M${p.x - r},${p.y}${arc}${r * 2},0 ${arc}${-r * 2},0 `
    this._setPath(layer, d)
  }

  _setPath(layer: any, path: string): void {
    layer._path.setAttribute('d', path)
  }

  _bringToFront(layer: any): void {
    DomUtil.toFront(layer._path)
  }

  _bringToBack(layer: any): void {
    DomUtil.toBack(layer._path)
  }

  static create(name: string): SVGElement {
    return document.createElementNS('http://www.w3.org/2000/svg', name) as SVGElement
  }

  static pointsToPath(rings: any[], closed?: boolean): string {
    const str = rings.flatMap(points => [
    ...points.map((p: any, j: number) => `${(j ? 'L' : 'M') + p.x} ${p.y}`),
    closed ? 'z' : '',
    ]).join('')
    return str || 'M0 0'
  }
}
