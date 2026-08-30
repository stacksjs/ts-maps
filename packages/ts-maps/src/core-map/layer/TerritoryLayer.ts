// Showing who owns what.
//
// A territory map has a job the usual polygon layer does not: it has to be
// readable at a glance while a player is running, and it has to make a capture
// feel like something happened. Both of those are why this is a layer of its
// own rather than a bag of `Polygon` instances.
//
// Readable at a glance means the fill is light enough to see the streets
// through — a player needs to know *which* blocks are theirs, not just that
// some are — and the border is what carries the colour. It means a player's
// own ground is distinguishable from everyone else's without reading a legend.
// And it means the area label appears only when there is room for it.
//
// Making a capture feel like something is the animation: newly taken ground
// sweeps in from the loop the runner just closed, rather than appearing between
// two frames. The sweep is the shape of the run, so what the player sees is
// their own lap filling in.

import type { MultiPolygon, Position } from '../geo/polygonClip'
import { contains } from '../geo/polygonClip'
import type { CaptureResult, TerritoryStore } from '../game/TerritoryStore'
import * as Util from '../core/Util'
import { formatArea, polygonArea } from '../geo/area'
import { Layer } from './Layer'

export interface TerritoryStyle {
  /** Border and fill colour. The fill is this at `fillOpacity`. */
  color?: string
  fillOpacity?: number
  weight?: number
  /** A soft outer glow, for the viewer's own territory. */
  glow?: boolean
  /** Diagonal hatching, which reads as "contested" without needing a colour. */
  hatch?: boolean
  /** Label this owner's territories with their area. */
  label?: boolean
}

export interface TerritoryLayerOptions {
  /** Where territories come from. Changes are followed automatically. */
  store?: TerritoryStore
  /** Per-owner styling. */
  styles?: Record<string, TerritoryStyle>
  /** Styling for an owner with no entry in `styles`. */
  defaultStyle?: TerritoryStyle
  /**
   * The viewer. Their territory is drawn with the emphasis, and capture
   * animations for other players are drawn more quietly.
   */
  self?: string
  /** How long a capture takes to sweep in, in milliseconds. Zero disables it. */
  captureDuration?: number
  /** Draw area labels at and above this zoom. */
  labelMinZoom?: number
  /** Imperial or metric labels. */
  units?: 'metric' | 'imperial'
  pane?: string
  attribution?: string
}

/**
 * Colours that stay distinguishable next to each other on a dark basemap,
 * assigned in order to owners with no style of their own.
 *
 * Picked to differ in hue rather than only in lightness, so two neighbouring
 * territories are still two territories to a colour-blind player.
 */
const PALETTE = [
  '#3b82f6',
  '#f97316',
  '#22c55e',
  '#e11d48',
  '#a855f7',
  '#eab308',
  '#06b6d4',
  '#ec4899',
]

interface CaptureAnimation {
  owner: string
  ring: Position[]
  start: number
  duration: number
}

export class TerritoryLayer extends Layer {
  declare _canvas?: HTMLCanvasElement
  declare _ctx?: CanvasRenderingContext2D | null
  declare _store?: TerritoryStore
  declare _manual: Map<string, MultiPolygon>
  declare _animations: CaptureAnimation[]
  declare _frame?: number
  declare _assigned: Map<string, string>
  declare _ratio: number
  declare _onStoreChange?: () => void
  declare _onStoreCapture?: (result: CaptureResult) => void

  initialize(options?: TerritoryLayerOptions): void {
    Util.setOptions(this as any, options)
    this._manual = new Map()
    this._animations = []
    this._assigned = new Map()
    this._ratio = 1
    if (options?.store)
      this.setStore(options.store)
  }

  /** Follow a store, redrawing whenever it changes. */
  setStore(store: TerritoryStore): this {
    this._detachStore()
    this._store = store

    this._onStoreChange = () => this.redraw()
    this._onStoreCapture = (result: CaptureResult) => this.animateCapture(result)
    store.on('change', this._onStoreChange)
    store.on('capture', this._onStoreCapture)

    return this.redraw()
  }

  /** Set one owner's territory directly, for use without a store. */
  setTerritory(owner: string, territory: MultiPolygon): this {
    this._manual.set(owner, territory)
    return this.redraw()
  }

  setOwnerStyle(owner: string, style: TerritoryStyle): this {
    const options = this.options as TerritoryLayerOptions
    options.styles = { ...options.styles, [owner]: { ...options.styles?.[owner], ...style } }
    return this.redraw()
  }

  /**
   * Play the sweep for a capture.
   *
   * Called for you when following a store. Worth calling by hand when a
   * capture arrives from the network — another player taking ground from you
   * should look the same as taking it yourself.
   */
  animateCapture(result: { owner: string, ring: Position[] }): this {
    const duration = (this.options as TerritoryLayerOptions).captureDuration ?? 900
    if (duration > 0 && result.ring?.length) {
      this._animations.push({
        owner: result.owner,
        ring: result.ring,
        start: now(),
        duration,
      })
    }
    return this.redraw()
  }

  /** The colour an owner is drawn in, assigning one if they have none. */
  colorFor(owner: string): string {
    const options = this.options as TerritoryLayerOptions
    const explicit = options.styles?.[owner]?.color
    if (explicit)
      return explicit

    const assigned = this._assigned.get(owner)
    if (assigned)
      return assigned

    const colour = PALETTE[this._assigned.size % PALETTE.length]
    this._assigned.set(owner, colour)
    return colour
  }

  redraw(): this {
    if (!this._map)
      return this
    if (this._frame !== undefined)
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
      canvas.className = 'tsmap-territory-canvas'
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
    this._detachStore()
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
      moveend: this._draw,
      zoomend: this._draw,
      zoom: this._draw,
      move: this._draw,
    }
  }

  /**
   * Who owns the territory under a point on screen, if anyone.
   *
   * The canvas takes no pointer events, so a click reaches the map and the
   * caller asks this — which keeps the map draggable across its own
   * territories.
   */
  ownerAtContainerPoint(point: { x: number, y: number }): string | null {
    const map = this._map as any
    if (!map)
      return null
    const latlng = map.containerPointToLatLng(point)
    const position: Position = [latlng.lng, latlng.lat]

    if (this._store)
      return this._store.ownerAt(position)

    for (const [owner, territory] of this._manual) {
      if (contains(territory, position))
        return owner
    }
    return null
  }

  _detachStore(): void {
    if (!this._store)
      return
    if (this._onStoreChange)
      this._store.off('change', this._onStoreChange)
    if (this._onStoreCapture)
      this._store.off('capture', this._onStoreCapture)
    this._store = undefined
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

  /** Everything to draw, owner by owner. */
  _territories(): Array<[string, MultiPolygon]> {
    if (this._store)
      return this._store.owners().map(owner => [owner, this._store!.get(owner)] as [string, MultiPolygon])
    return [...this._manual.entries()]
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

    // The pane travels with the map, so the canvas is pushed back the other
    // way to stay over the viewport. Without this the territories slide off
    // during a drag.
    const paneOffset = map._getMapPanePos?.()
    if (paneOffset && canvas.style)
      canvas.style.transform = `translate3d(${-paneOffset.x}px, ${-paneOffset.y}px, 0)`

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0)

    const options = this.options as TerritoryLayerOptions
    const project = (position: Position): { x: number, y: number } =>
      map.latLngToContainerPoint([position[1], position[0]])

    const entries = this._territories()

    // The viewer's own ground last, so it sits above the rest where they
    // overlap on screen.
    entries.sort(([a], [b]) => {
      if (a === options.self)
        return 1
      if (b === options.self)
        return -1
      return 0
    })

    for (const [owner, territory] of entries) {
      if (territory.length === 0)
        continue
      this._drawTerritory(ctx, owner, territory, project)
    }

    this._drawCaptures(ctx, project)

    if (this._animations.length > 0)
      this.redraw()
  }

  _styleFor(owner: string): Required<TerritoryStyle> {
    const options = this.options as TerritoryLayerOptions
    const style = { ...options.defaultStyle, ...options.styles?.[owner] }
    const isSelf = owner === options.self
    return {
      color: this.colorFor(owner),
      // The viewer's own ground is a touch stronger, so "mine" and "theirs"
      // read apart before any label does.
      fillOpacity: style.fillOpacity ?? (isSelf ? 0.28 : 0.16),
      weight: style.weight ?? (isSelf ? 3 : 2),
      glow: style.glow ?? isSelf,
      hatch: style.hatch ?? false,
      label: style.label ?? true,
    }
  }

  _drawTerritory(
    ctx: CanvasRenderingContext2D,
    owner: string,
    territory: MultiPolygon,
    project: (p: Position) => { x: number, y: number },
  ): void {
    const style = this._styleFor(owner)

    const path = (polygon: Position[][]): void => {
      ctx.beginPath()
      for (const ring of polygon) {
        ring.forEach((position, index) => {
          const point = project(position)
          if (index === 0)
            ctx.moveTo(point.x, point.y)
          else
            ctx.lineTo(point.x, point.y)
        })
        ctx.closePath()
      }
    }

    for (const polygon of territory) {
      path(polygon)

      // Holes are cut by the even-odd rule rather than by winding, so a
      // territory with a courtyard in it shows the courtyard whichever way the
      // rings happen to wind.
      ctx.fillStyle = style.color
      ctx.globalAlpha = style.fillOpacity
      ctx.fill('evenodd')
      ctx.globalAlpha = 1

      if (style.hatch)
        this._drawHatch(ctx, style.color)

      if (style.glow) {
        ctx.save()
        ctx.shadowColor = style.color
        ctx.shadowBlur = 12
        ctx.strokeStyle = style.color
        ctx.lineWidth = style.weight
        ctx.stroke()
        ctx.restore()
      }

      ctx.strokeStyle = style.color
      ctx.lineWidth = style.weight
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    if (style.label)
      this._drawLabels(ctx, territory, style.color, project)
  }

  /** Diagonal hatching, clipped to the path already on the context. */
  _drawHatch(ctx: CanvasRenderingContext2D, color: string): void {
    ctx.save()
    ctx.clip('evenodd')
    ctx.globalAlpha = 0.35
    ctx.strokeStyle = color
    ctx.lineWidth = 1

    const canvas = ctx.canvas
    const width = canvas.width / this._ratio
    const height = canvas.height / this._ratio
    const spacing = 8

    ctx.beginPath()
    for (let x = -height; x < width; x += spacing) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x + height, height)
    }
    ctx.stroke()
    ctx.restore()
  }

  _drawLabels(
    ctx: CanvasRenderingContext2D,
    territory: MultiPolygon,
    color: string,
    project: (p: Position) => { x: number, y: number },
  ): void {
    const options = this.options as TerritoryLayerOptions
    const map = this._map as any
    const minZoom = options.labelMinZoom ?? 13
    if ((map.getZoom?.() ?? 0) < minZoom)
      return

    for (const polygon of territory) {
      if (polygon.length === 0)
        continue

      const projected = polygon[0].map(project)
      const bounds = boundsOf(projected)
      const width = bounds.maxX - bounds.minX
      const height = bounds.maxY - bounds.minY

      // A label that does not fit inside the shape it names is worse than no
      // label: it belongs to whichever territory the reader guesses.
      if (width < 70 || height < 34)
        continue

      const text = formatArea(polygonArea(polygon), { units: options.units })
      const x = (bounds.minX + bounds.maxX) / 2
      const y = (bounds.minY + bounds.maxY) / 2

      ctx.save()
      ctx.font = '600 12px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // Drawn with a dark halo rather than a plate, so it stays legible over
      // both the fill and whatever the basemap has underneath.
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)'
      ctx.strokeText(text, x, y)
      ctx.fillStyle = color
      ctx.fillText(text, x, y)
      ctx.restore()
    }
  }

  /** The sweep that plays when ground changes hands. */
  _drawCaptures(
    ctx: CanvasRenderingContext2D,
    project: (p: Position) => { x: number, y: number },
  ): void {
    const time = now()
    const remaining: CaptureAnimation[] = []

    for (const animation of this._animations) {
      const progress = (time - animation.start) / animation.duration
      if (progress >= 1)
        continue
      remaining.push(animation)

      const eased = 1 - (1 - progress) ** 3
      const color = this.colorFor(animation.owner)
      const projected = animation.ring.map(project)

      ctx.save()
      ctx.beginPath()
      projected.forEach((point, index) => {
        if (index === 0)
          ctx.moveTo(point.x, point.y)
        else
          ctx.lineTo(point.x, point.y)
      })
      ctx.closePath()

      // A flash across the whole claim that fades as it settles, so the eye is
      // pulled to the shape that just changed hands.
      ctx.globalAlpha = (1 - eased) * 0.5
      ctx.fillStyle = color
      ctx.fill('evenodd')

      // And the loop itself drawn as a widening, fading outline: the player
      // sees the lap they ran, not a rectangle appearing.
      ctx.globalAlpha = 1 - eased
      ctx.strokeStyle = color
      ctx.lineWidth = 2 + eased * 6
      ctx.lineJoin = 'round'
      ctx.shadowColor = color
      ctx.shadowBlur = 16 * (1 - eased)
      ctx.stroke()
      ctx.restore()
    }

    this._animations = remaining
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

function boundsOf(points: Array<{ x: number, y: number }>): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    if (point.x < minX)
      minX = point.x
    if (point.x > maxX)
      maxX = point.x
    if (point.y < minY)
      minY = point.y
    if (point.y > maxY)
      maxY = point.y
  }
  return { minX, minY, maxX, maxY }
}

export function territoryLayer(options?: TerritoryLayerOptions): TerritoryLayer {
  return new TerritoryLayer(options)
}
