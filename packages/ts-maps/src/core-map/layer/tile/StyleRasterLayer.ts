import type { RasterLayerSpecification } from '../../style-spec/types'
import { compile as compileExpression, isExpression } from '../../style-spec/expressions'
import { TileLayer } from './TileLayer'

/**
 * The tile layer behind a style's `raster` source, drawn as its `raster`
 * layers say.
 *
 * A raster source is pictures, and a style decides when and how to show them
 * through the layers over it: a zoom range, `visibility`, an opacity and a
 * colour adjustment. OpenFreeMap's styles carry a shaded-relief source meant
 * only for the first few zooms; drawn as a plain tile layer, it covered the
 * streets too.
 *
 * The zoom range is checked here rather than set as the tile layer's own
 * `minZoom`/`maxZoom`: those also bound how far the map itself may zoom.
 */
export class StyleRasterLayer extends TileLayer {
  declare _rasterLayers: RasterLayerSpecification[]

  initialize(url: string, options?: any): void {
    super.initialize(url, options)
    this._rasterLayers = options?.rasterLayers ?? []
  }

  /** The style's raster layers over this source, in style order. */
  setRasterLayers(layers: RasterLayerSpecification[]): this {
    this._rasterLayers = layers
    if (this._map) {
      this._applyRasterStyle()
      // Tiles start or stop loading with the layers' zoom ranges.
      this._resetView()
    }
    return this
  }

  // Adding the layer, `zoom` and `viewreset` all land here, so the layer
  // shows, hides and fades with the zoom as it changes.
  _resetView(e?: any): void {
    this._applyRasterStyle()
    super._resetView(e)
  }

  // No tiles at a zoom no layer draws: hidden, they would still be fetched.
  _tileZoomFor(zoom: number): number | undefined {
    if (!rasterLayerAt(this._rasterLayers, zoom))
      return undefined
    return super._tileZoomFor(zoom)
  }

  _applyRasterStyle(): void {
    const container = this._container
    if (!this._map || !container)
      return
    const zoom = this._map.getZoom()
    const layer = rasterLayerAt(this._rasterLayers, zoom)
    container.style.display = layer ? '' : 'none'
    if (!layer)
      return
    const paint = (layer.paint ?? {}) as Record<string, unknown>
    const opacity = Math.min(1, Math.max(0, rasterPaintValue(paint['raster-opacity'], zoom, 1)))
    if (opacity !== this.options!.opacity)
      this.setOpacity(opacity)
    container.style.filter = rasterCssFilter(paint, zoom)
  }
}

/**
 * The raster layer that draws at `zoom`: the first that is visible and whose
 * range holds it. Like Mapbox, `minzoom` is inclusive and `maxzoom` is not.
 */
export function rasterLayerAt(layers: readonly RasterLayerSpecification[], zoom: number): RasterLayerSpecification | undefined {
  return layers.find(l => l.layout?.visibility !== 'none'
    && (l.minzoom === undefined || zoom >= l.minzoom)
    && (l.maxzoom === undefined || zoom < l.maxzoom))
}

/**
 * A numeric raster paint value at `zoom`: a number, or an expression, which
 * for a raster can only depend on the zoom — OpenFreeMap's Liberty fades its
 * relief out with an `interpolate` over it.
 */
export function rasterPaintValue(value: unknown, zoom: number, fallback: number): number {
  if (typeof value === 'number')
    return value
  if (!isExpression(value))
    return fallback
  try {
    const out = compileExpression(value, 'number').evaluate({ zoom })
    return typeof out === 'number' && Number.isFinite(out) ? out : fallback
  }
  catch {
    return fallback
  }
}

/**
 * The `raster-*` colour adjustments as a CSS filter on the layer's container.
 *
 * Close to, not the same as, Mapbox's shader: CSS has no exact match for its
 * saturation curve, and a brightness floor is made from a brightness and a
 * contrast, which can only lift it to just under half.
 */
export function rasterCssFilter(paint: Record<string, unknown>, zoom: number): string {
  const parts: string[] = []
  const hue = rasterPaintValue(paint['raster-hue-rotate'], zoom, 0)
  if (hue)
    parts.push(`hue-rotate(${hue}deg)`)
  const saturation = Math.min(1, Math.max(-1, rasterPaintValue(paint['raster-saturation'], zoom, 0)))
  if (saturation)
    parts.push(`saturate(${1 + saturation})`)
  const contrast = Math.min(1, Math.max(-1, rasterPaintValue(paint['raster-contrast'], zoom, 0)))
  if (contrast)
    parts.push(`contrast(${contrast > 0 ? 1 / (1 - contrast) : 1 + contrast})`)
  const min = Math.min(1, Math.max(0, rasterPaintValue(paint['raster-brightness-min'], zoom, 0)))
  const max = Math.min(1, Math.max(0, rasterPaintValue(paint['raster-brightness-max'], zoom, 1)))
  if (min !== 0 || max !== 1) {
    // out = min + (max - min)·in, as brightness(b) then contrast(c):
    // c·(b·in − ½) + ½, so c = 1 − 2·min and b = (max − min) / c.
    const c = Math.max(0.01, 1 - 2 * min)
    parts.push(`brightness(${(max - min) / c})`)
    if (c !== 1)
      parts.push(`contrast(${c})`)
  }
  return parts.join(' ')
}
