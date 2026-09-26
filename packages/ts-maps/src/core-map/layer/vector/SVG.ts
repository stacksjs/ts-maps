import * as DomUtil from '../../dom/DomUtil'
import { splitWords, stamp } from '../../core/Util'
import { Renderer } from './Renderer'

/**
 * Set a path's fill or stroke colour.
 *
 * A presentation attribute cannot hold `var(--x)` -- the SVG parser rejects it
 * and the path falls back to black -- but the same value as a style property
 * resolves like any other CSS. So a colour that uses a custom property goes on
 * `style`, which lets a host theme its paths from its own tokens and have a
 * light/dark flip repaint them with no script at all. Plain colours stay on the
 * attribute, where a stylesheet rule on `.tsmap-interactive` can still
 * override them, and clear any style value a previous `var()` colour left.
 */
function setPaint(path: SVGElement, name: 'fill' | 'stroke', value: unknown): void {
  const colour = String(value)
  if (colour.includes('var(')) {
    path.style.setProperty(name, colour)
    path.removeAttribute(name)
    return
  }
  if (path.style.getPropertyValue(name))
    path.style.removeProperty(name)
  path.setAttribute(name, colour)
}

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
    const size = this._blanketSize()
    this._container!.style.width = `${size.x}px`
    this._container!.style.height = `${size.y}px`

    if (!this._svgSize || !this._svgSize.equals(size)) {
      this._svgSize = size;
      (this._container as any).setAttribute('width', size.x);
      (this._container as any).setAttribute('height', size.y)
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
    const size = b.getSize();
    (this._container as any).setAttribute('viewBox', [b.min.x, b.min.y, size.x, size.y].join(' '))
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
      setPaint(path, 'stroke', options.color)
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
      setPaint(path, 'stroke', 'none')
    }

    if (options.fill) {
      setPaint(path, 'fill', options.fillColor || options.color)
      path.setAttribute('fill-opacity', options.fillOpacity)
      path.setAttribute('fill-rule', options.fillRule || 'evenodd')
    }
    else {
      setPaint(path, 'fill', 'none')
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
