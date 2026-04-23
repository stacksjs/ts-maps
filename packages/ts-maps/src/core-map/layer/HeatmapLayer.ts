import * as Util from '../core/Util'
import { Layer } from './Layer'
import type { Point } from '../geometry/Point'

export interface HeatmapPoint {
  lat: number
  lng: number
  weight?: number
}

export interface HeatmapLayerOptions {
  data?: HeatmapPoint[]
  radius?: number
  blur?: number
  max?: number
  gradient?: Record<number, string>
  minOpacity?: number
  pane?: string
  attribution?: string
}

const DEFAULT_GRADIENT: Record<number, string> = {
  0.4: 'blue',
  0.6: 'cyan',
  0.7: 'lime',
  0.8: 'yellow',
  1.0: 'red',
}

// Density-field heatmap rendered on a full-viewport canvas inside the
// overlay pane. Each point draws a Gaussian intensity splat; the
// accumulated alpha channel is then mapped through a colour ramp.
export class HeatmapLayer extends Layer {
  declare _canvas?: HTMLCanvasElement
  declare _ctx?: CanvasRenderingContext2D
  declare _data: HeatmapPoint[]
  declare _frame?: number
  declare _gradientTexture?: Uint8ClampedArray
  declare _redrawScheduled: boolean

  initialize(options?: HeatmapLayerOptions): void {
    Util.setOptions(this as any, options)
    this._data = options?.data ? [...options.data] : []
    this._redrawScheduled = false
  }

  setData(points: HeatmapPoint[]): this {
    this._data = [...points]
    return this.redraw()
  }

  addPoint(p: HeatmapPoint): this {
    this._data.push(p)
    return this.redraw()
  }

  clearData(): this {
    this._data = []
    return this.redraw()
  }

  setOptions(opts: Partial<HeatmapLayerOptions>): this {
    Util.setOptions(this as any, opts as any)
    if (opts.gradient) this._gradientTexture = undefined
    if (opts.data) this._data = [...opts.data]
    return this.redraw()
  }

  redraw(): this {
    if (!this._map || this._redrawScheduled) return this
    this._redrawScheduled = true
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => this._draw())
    }
    else {
      // Test environments without rAF — draw immediately.
      this._draw()
    }
    return this
  }

  onAdd(_map: any): void {
    if (!this._canvas) {
      const canvas = this._canvas = document.createElement('canvas')
      canvas.className = 'tsmap-heatmap-canvas tsmap-zoom-animated'
      if (canvas.style) {
        canvas.style.position = 'absolute'
        canvas.style.left = '0'
        canvas.style.top = '0'
        canvas.style.pointerEvents = 'none'
      }
      this._ctx = canvas.getContext('2d') ?? undefined
    }
    this.getPane().appendChild(this._canvas)
    this._resize()
    this._draw()
  }

  onRemove(_map: any): void {
    this._canvas?.remove()
  }

  getEvents(): Record<string, any> {
    return {
      viewreset: this._resize,
      resize: this._resize,
      moveend: this._draw,
      zoomend: this._draw,
    }
  }

  _resize(): void {
    if (!this._canvas || !this._map) return
    const size = this._map.getSize()
    this._canvas.width = size.x
    this._canvas.height = size.y
    if (this._canvas.style) {
      this._canvas.style.width = `${size.x}px`
      this._canvas.style.height = `${size.y}px`
    }
    this._draw()
  }

  _draw(): void {
    this._redrawScheduled = false
    if (!this._map || !this._ctx || !this._canvas) return

    const ctx = this._ctx
    const canvas = this._canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!this._data.length) return

    const opts = this.options as Required<HeatmapLayerOptions>
    const radius = (opts.radius ?? 25) as number
    const blur = (opts.blur ?? 15) as number
    const minOpacity = (opts.minOpacity ?? 0.05) as number
    const max = (opts.max ?? 1) as number

    // Map container offset: the canvas sits at pane origin, points are in
    // container pixel space, so we shift by the map pane position.
    const paneOffset = this._map._getMapPanePos()

    // 1. Paint intensity blobs into an offscreen buffer.
    const buffer = document.createElement('canvas')
    buffer.width = canvas.width
    buffer.height = canvas.height
    const bctx = buffer.getContext('2d')
    if (!bctx) return

    const totalRadius = radius + blur
    // Pre-build a single reusable gradient blob — sampled by drawImage for each point.
    const blob = this._intensityBlob(totalRadius, radius, blur)

    for (const pt of this._data) {
      const lp = this._map.latLngToContainerPoint([pt.lat, pt.lng]) as Point
      const x = lp.x - paneOffset.x
      const y = lp.y - paneOffset.y
      const weight = Math.max(0, Math.min((pt.weight ?? 1) / max, 1))
      if (weight <= 0) continue
      bctx.globalAlpha = Math.max(minOpacity, weight)
      bctx.drawImage(blob, x - totalRadius, y - totalRadius)
    }
    bctx.globalAlpha = 1

    // 2. Colourise using the alpha channel as the intensity lookup.
    const image = bctx.getImageData(0, 0, canvas.width, canvas.height)
    const pixels = image.data
    const ramp = this._colourRamp()
    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3]
      if (a === 0) continue
      const base = a * 4
      pixels[i] = ramp[base]
      pixels[i + 1] = ramp[base + 1]
      pixels[i + 2] = ramp[base + 2]
      // Leave alpha as the density estimate.
    }
    ctx.putImageData(image, 0, 0)
  }

  _intensityBlob(radius: number, innerRadius: number, blur: number): HTMLCanvasElement {
    const size = radius * 2
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    if (!ctx) return c
    const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius)
    const innerStop = innerRadius / radius
    grad.addColorStop(0, 'rgba(0,0,0,1)')
    grad.addColorStop(Math.min(1, innerStop), `rgba(0,0,0,${Math.max(0.2, 1 - blur / (innerRadius + blur))})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    return c
  }

  _colourRamp(): Uint8ClampedArray {
    if (this._gradientTexture) return this._gradientTexture
    const gradient = this.options?.gradient ?? DEFAULT_GRADIENT
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 256
    const ctx = c.getContext('2d')
    if (!ctx) {
      this._gradientTexture = new Uint8ClampedArray(256 * 4)
      return this._gradientTexture
    }
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    for (const [stop, colour] of Object.entries(gradient)) {
      g.addColorStop(Number(stop), colour as string)
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1, 256)
    this._gradientTexture = ctx.getImageData(0, 0, 1, 256).data
    return this._gradientTexture
  }
}

HeatmapLayer.setDefaultOptions({
  radius: 25,
  blur: 15,
  max: 1,
  minOpacity: 0.05,
  pane: 'overlayPane',
})
