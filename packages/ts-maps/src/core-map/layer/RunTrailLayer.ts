// The line behind a runner, while they are still running.
//
// This is the other half of the territory display, and it carries information
// the trail in a normal route viewer does not need to. A player mid-run wants
// to know two things without stopping to think: where they have been since the
// last capture, and whether closing the loop from here would be worth
// anything. So the trail fades from the tail forward — the oldest points are
// the faintest — and it can show the shape the loop would enclose if they
// closed it now.
//
// It is drawn on its own canvas rather than as a `Polyline` because it changes
// every second and the gradient along it is the point. Rebuilding a vector
// path with per-segment styling on every GPS tick would cost more and look
// worse.

import type { Position } from '../geo/polygonClip'
import * as Util from '../core/Util'
import { Layer } from './Layer'

export interface RunTrailLayerOptions {
  color?: string
  weight?: number
  /** Opacity at the head of the trail; the tail fades to nothing. */
  opacity?: number
  /**
   * Shade the area the trail would enclose if the runner closed it from where
   * they are now. Shows what a lap is worth before it is run.
   */
  showPotential?: boolean
  potentialOpacity?: number
  /** Draw a marker at the runner's current position. */
  showHead?: boolean
  /** Pulse that marker, so it reads as live rather than as a pin. */
  pulse?: boolean
  pane?: string
  attribution?: string
}

export class RunTrailLayer extends Layer {
  declare _canvas?: HTMLCanvasElement
  declare _ctx?: CanvasRenderingContext2D | null
  declare _track: Position[]
  declare _frame?: number
  declare _ratio: number

  initialize(options?: RunTrailLayerOptions): void {
    Util.setOptions(this as any, options)
    this._track = []
    this._ratio = 1
  }

  /** Replace the whole track — what a `LoopDetector` hands back each tick. */
  setTrack(track: Position[]): this {
    this._track = track
    return this.redraw()
  }

  /** Extend the trail by one position. */
  addPoint(position: Position): this {
    this._track.push(position)
    return this.redraw()
  }

  clear(): this {
    this._track = []
    return this.redraw()
  }

  get track(): Position[] {
    return this._track
  }

  redraw(): this {
    if (!this._map || this._frame !== undefined)
      return this

    if (typeof requestAnimationFrame !== 'function') {
      this._draw()
      return this
    }

    this._frame = requestAnimationFrame(() => {
      this._frame = undefined
      this._draw()
    })
    return this
  }

  onAdd(_map: any): void {
    if (!this._canvas) {
      const canvas = document.createElement('canvas')
      canvas.className = 'tsmap-run-trail-canvas'
      if (canvas.style) {
        canvas.style.position = 'absolute'
        canvas.style.left = '0'
        canvas.style.top = '0'
        canvas.style.pointerEvents = 'none'
      }
      this._canvas = canvas
      this._ctx = canvas.getContext('2d')
    }
    this.getPane().appendChild(this._canvas)
    this._resize()
  }

  onRemove(_map: any): void {
    if (this._frame !== undefined && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(this._frame)
    this._frame = undefined
    // `removeChild` rather than `remove()`: the latter is missing on canvas in
    // some DOM implementations, and a layer that will not detach leaves its
    // canvas stacked over the next one.
    const canvas = this._canvas
    canvas?.parentNode?.removeChild(canvas)
  }

  getEvents(): Record<string, any> {
    return {
      viewreset: this._resize,
      resize: this._resize,
      move: this._draw,
      moveend: this._draw,
      zoom: this._draw,
      zoomend: this._draw,
    }
  }

  _pixelRatio(): number {
    const ratio = typeof window !== 'undefined' ? window.devicePixelRatio : 1
    return Math.min(2, Math.max(1, ratio || 1))
  }

  _resize(): void {
    const canvas = this._canvas
    const map = this._map as any
    if (!canvas || !map?.getSize)
      return

    const size = map.getSize()
    const ratio = this._pixelRatio()
    this._ratio = ratio
    canvas.width = backingSize(size.x, ratio)
    canvas.height = backingSize(size.y, ratio)
    if (canvas.style) {
      canvas.style.width = `${size.x}px`
      canvas.style.height = `${size.y}px`
    }
    this._draw()
  }

  _draw(): void {
    const canvas = this._canvas
    const ctx = this._ctx
    const map = this._map as any
    if (!canvas || !ctx || !map)
      return

    // The same clamped value `_resize` writes. Comparing against the unclamped
    // one recurses forever on a map that has not been laid out yet: the canvas
    // is one pixel wide, the expected width is zero, and each call asks the
    // other to try again.
    const size = map.getSize()
    if (canvas.width !== backingSize(size.x, this._ratio)) {
      this._resize()
      return
    }

    const paneOffset = map._getMapPanePos?.()
    if (paneOffset && canvas.style)
      canvas.style.transform = `translate3d(${-paneOffset.x}px, ${-paneOffset.y}px, 0)`

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0)

    const track = this._track
    if (track.length === 0)
      return

    const options = this.options as RunTrailLayerOptions
    const color = options.color ?? '#38bdf8'
    const weight = options.weight ?? 4
    const opacity = options.opacity ?? 0.95

    const points = track.map((position) => {
      const point = map.latLngToContainerPoint([position[1], position[0]])
      return { x: point.x, y: point.y }
    })

    if (options.showPotential !== false && points.length >= 3)
      this._drawPotential(ctx, points, color, options.potentialOpacity ?? 0.12)

    // Segment by segment rather than one path, because the whole point is that
    // the opacity varies along it: the runner's recent path is what matters
    // now, and the start of it is history.
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = color
    ctx.lineWidth = weight

    for (let i = 1; i < points.length; i++) {
      const along = i / (points.length - 1)
      // Squared, so the fade is concentrated at the tail and most of the
      // trail stays clearly visible.
      ctx.globalAlpha = opacity * (0.15 + 0.85 * along ** 2)
      ctx.beginPath()
      ctx.moveTo(points[i - 1].x, points[i - 1].y)
      ctx.lineTo(points[i].x, points[i].y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    if (options.showHead !== false)
      this._drawHead(ctx, points[points.length - 1], color, options.pulse !== false)
  }

  /** The shape the trail would enclose if the runner closed it from here. */
  _drawPotential(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number, y: number }>,
    color: string,
    alpha: number,
  ): void {
    ctx.save()
    ctx.beginPath()
    points.forEach((point, index) => {
      if (index === 0)
        ctx.moveTo(point.x, point.y)
      else
        ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()

    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.fill()

    // The closing leg is dashed, because it is the only part of this outline
    // the runner has not actually run.
    ctx.globalAlpha = alpha * 3
    ctx.setLineDash([6, 6])
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(points[points.length - 1].x, points[points.length - 1].y)
    ctx.lineTo(points[0].x, points[0].y)
    ctx.stroke()
    ctx.restore()
  }

  _drawHead(
    ctx: CanvasRenderingContext2D,
    point: { x: number, y: number },
    color: string,
    pulse: boolean,
  ): void {
    if (pulse) {
      // A ring that grows and fades on a two-second cycle. Driven by the clock
      // rather than by a counter so it stays in step across redraws, however
      // often the map happens to repaint.
      const phase = (now() % 2000) / 2000
      ctx.save()
      ctx.globalAlpha = (1 - phase) * 0.45
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(point.x, point.y, 8 + phase * 22, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      this.redraw()
    }

    ctx.save()
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2)
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/** Backing-store pixels for a CSS size, never smaller than one. */
function backingSize(cssPixels: number, ratio: number): number {
  return Math.max(1, Math.round(cssPixels * ratio))
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function runTrailLayer(options?: RunTrailLayerOptions): RunTrailLayer {
  return new RunTrailLayer(options)
}
