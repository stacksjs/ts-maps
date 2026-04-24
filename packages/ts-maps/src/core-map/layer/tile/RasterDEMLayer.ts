import * as DomEvent from '../../dom/DomEvent'
import { TileLayer } from './TileLayer'
import type { Point } from '../../geometry/Point'
import type { DEMEncoding } from '../../geo/elevation'
import { decodeMapboxRGB, decodeTerrariumRGB } from '../../geo/elevation'

// Re-exports preserve the historical `RasterDEMLayer` surface. New code
// should import these directly from `core-map/geo/elevation`.
export type { DEMEncoding }
export { decodeMapboxRGB, decodeTerrariumRGB }

export interface RasterDEMLayerOptions {
  url: string
  subdomains?: string | string[]
  encoding?: DEMEncoding
  tileSize?: number
  minZoom?: number
  maxZoom?: number
  exaggeration?: number
  azimuth?: number
  altitude?: number
  accentColor?: string
  shadowColor?: string
  opacity?: number
  attribution?: string
  pane?: string
  crossOrigin?: boolean | string
}

function parseCssColor(css: string): [number, number, number] {
  // Lean parser covering the forms we emit as defaults plus common hex.
  if (css.startsWith('#')) {
    const h = css.slice(1)
    if (h.length === 3) {
      return [
        Number.parseInt(h[0]! + h[0]!, 16),
        Number.parseInt(h[1]! + h[1]!, 16),
        Number.parseInt(h[2]! + h[2]!, 16),
      ]
    }
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ]
  }
  if (css === 'white' || css === '#fff') return [255, 255, 255]
  if (css === 'black' || css === '#000') return [0, 0, 0]
  return [255, 255, 255]
}

// Fetches RGB-encoded terrain tiles and shades them with a simple
// Lambertian light model. Decoding and shading both run on the main
// thread for now; the worker path is a future optimisation.
//
// This class backs both the raster-dem source type and the `hillshade`
// style-spec layer type — `HillshadeLayer` below is an alias that
// matches Mapbox GL JS's naming.
export class RasterDEMLayer extends TileLayer {
  declare _encoding: DEMEncoding

  initialize(url: string, options?: RasterDEMLayerOptions): void {
    super.initialize(url, { tileSize: 512, ...options } as any)
    this._encoding = options?.encoding ?? 'mapbox'
  }

  createTile(coords: Point & { z: number }, done: (err: any, tile: HTMLElement) => void): HTMLElement {
    const canvas = document.createElement('canvas')
    const size = this.options!.tileSize as number
    canvas.width = size
    canvas.height = size
    if (canvas.style) {
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
    }

    const img = new Image()
    if (this.options!.crossOrigin || this.options!.crossOrigin === '')
      img.crossOrigin = this.options!.crossOrigin === true ? '' : this.options!.crossOrigin

    DomEvent.on(img, 'load', () => {
      try {
        this._shadeInto(img, canvas)
        done(null, canvas)
      }
      catch (err) {
        done(err, canvas)
      }
    })
    DomEvent.on(img, 'error', (e: any) => done(e, canvas))

    img.src = this.getTileUrl(coords)
    return canvas
  }

  _shadeInto(img: HTMLImageElement, out: HTMLCanvasElement): void {
    const size = out.width
    const ctx = out.getContext('2d')
    if (!ctx) return
    const src = document.createElement('canvas')
    src.width = size
    src.height = size
    const sctx = src.getContext('2d')
    if (!sctx) return
    sctx.drawImage(img, 0, 0, size, size)
    const srcImg = sctx.getImageData(0, 0, size, size)

    const elev = new Float32Array(size * size)
    const px = srcImg.data
    const decode = this._encoding === 'terrarium' ? decodeTerrariumRGB : decodeMapboxRGB
    for (let i = 0, p = 0; i < elev.length; i++, p += 4) {
      elev[i] = decode(px[p]!, px[p + 1]!, px[p + 2]!)
    }

    const azimuthDeg = (this.options!.azimuth ?? 335) as number
    const altitudeDeg = (this.options!.altitude ?? 45) as number
    const exaggeration = (this.options!.exaggeration ?? 0.5) as number
    const az = azimuthDeg * Math.PI / 180
    const al = altitudeDeg * Math.PI / 180
    const lx = Math.sin(az) * Math.cos(al)
    const ly = -Math.cos(az) * Math.cos(al)
    const lz = Math.sin(al)

    const [ar, ag, ab] = parseCssColor(this.options!.accentColor ?? '#ffffff')
    const [sr, sg, sb] = parseCssColor(this.options!.shadowColor ?? '#000000')
    const opacity = (this.options!.opacity ?? 1) as number

    const out2 = ctx.createImageData(size, size)
    const dpx = out2.data
    // Edge pixels clamp to the interior (1-pixel seam accepted for now;
    // neighbour-sampling across tiles is a later enhancement).
    for (let y = 0; y < size; y++) {
      const ym = Math.max(0, y - 1)
      const yp = Math.min(size - 1, y + 1)
      for (let x = 0; x < size; x++) {
        const xm = Math.max(0, x - 1)
        const xp = Math.min(size - 1, x + 1)
        const dzdx = (elev[y * size + xp]! - elev[y * size + xm]!) * 0.5 * exaggeration
        const dzdy = (elev[yp * size + x]! - elev[ym * size + x]!) * 0.5 * exaggeration
        const n = Math.hypot(dzdx, dzdy, 1)
        const nx = -dzdx / n
        const ny = -dzdy / n
        const nz = 1 / n
        const dot = Math.max(0, nx * lx + ny * ly + nz * lz)
        // Blend accent (on the lit side) with shadow (on the unlit side).
        const r = dot * ar + (1 - dot) * sr
        const g = dot * ag + (1 - dot) * sg
        const b = dot * ab + (1 - dot) * sb
        const i = (y * size + x) * 4
        dpx[i] = r
        dpx[i + 1] = g
        dpx[i + 2] = b
        dpx[i + 3] = Math.round(255 * opacity)
      }
    }
    ctx.putImageData(out2, 0, 0)
  }
}

/**
 * Mapbox-style alias: the `hillshade` style-spec layer type resolves to
 * this class. Exposed so callers who speak the style spec can write
 * `new HillshadeLayer(url, { encoding, exaggeration, shadowColor, accentColor })`
 * without having to know it's the same runtime as `raster-dem`.
 */
export const HillshadeLayer: typeof RasterDEMLayer = RasterDEMLayer
export type HillshadeLayerOptions = RasterDEMLayerOptions
