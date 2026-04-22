import * as Util from '../../core/Util'
import * as DomEvent from '../../dom/DomEvent'
import { Bounds } from '../../geometry/Bounds'
import { Renderer } from './Renderer'

interface Order {
  layer: any
  prev: Order | null
  next: Order | null
}

// Canvas renderer for vector layers.
export class Canvas extends Renderer {
  declare _ctx?: CanvasRenderingContext2D
  declare _ctxScale?: number
  declare _redrawRequest?: number | null
  declare _redrawBounds?: Bounds | null
  declare _drawFirst?: Order | null
  declare _drawLast?: Order | null
  declare _drawing?: boolean
  declare _postponeUpdatePaths?: boolean
  declare _hoveredLayer?: any
  declare _pointerHoverThrottled?: boolean
  declare _pointerHoverThrottleTimeout?: ReturnType<typeof setTimeout>

  getEvents(): Record<string, any> {
    const events = super.getEvents()
    events.viewprereset = this._onViewPreReset
    return events
  }

  _onViewPreReset(): void {
    this._postponeUpdatePaths = true
  }

  onAdd(map: any): void {
    super.onAdd(map)
    this._draw()
  }

  onRemove(): void {
    super.onRemove()
    clearTimeout(this._pointerHoverThrottleTimeout as any)
  }

  _initContainer(): void {
    const container = this._container = document.createElement('canvas') as any
    DomEvent.on(container, 'pointermove', this._onPointerMove, this)
    DomEvent.on(container, 'click dblclick pointerdown pointerup contextmenu', this._onClick, this)
    DomEvent.on(container, 'pointerout', this._handlePointerOut, this)
    container._tsmap_disable_events = true
    this._ctx = (container as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D
  }

  _destroyContainer(): void {
    if (this._redrawRequest !== undefined && this._redrawRequest !== null)
    cancelAnimationFrame(this._redrawRequest)
    this._redrawRequest = null
    delete this._ctx
    super._destroyContainer()
  }

  _resizeContainer(): any {
    const p = this.options!.padding
    const size = this._map.getSize().multiplyBy(1 + p * 2).round()
    this._container!.style.width = `${size.x}px`
    this._container!.style.height = `${size.y}px`

    const m = this._ctxScale = window.devicePixelRatio
    ; (this._container as HTMLCanvasElement).width = m * size.x
    ; (this._container as HTMLCanvasElement).height = m * size.y
    return size
  }

  _updatePaths(): void {
    if (this._postponeUpdatePaths)
    return
    this._redrawBounds = null
    for (const layer of Object.values(this._layers))
    layer._update()
    this._redraw()
  }

  _update(): void {
    if (this._map._animatingZoom && this._bounds)
    return

    const b = this._bounds!
    const s = this._ctxScale as number
    this._ctx!.setTransform(s, 0, 0, s, -b.min.x * s, -b.min.y * s)
    this.fire('update')
  }

  _reset(): void {
    const onSettled = this._onSettled.bind(this)
    onSettled()
    const self = this as any
    self._updateTransform(self._center, self._zoom)
    this._onViewReset()

    if (this._postponeUpdatePaths) {
      this._postponeUpdatePaths = false
      this._updatePaths()
    }
  }

  _initPath(layer: any): void {
    this._updateDashArray(layer)
    this._layers[Util.stamp(layer)] = layer

    const order: Order = { layer, prev: this._drawLast ?? null, next: null }
    if (this._drawLast)
    this._drawLast.next = order
    this._drawLast = order
    this._drawFirst ??= this._drawLast
    layer._order = order
  }

  _addPath(layer: any): void {
    this._requestRedraw(layer)
  }

  _removePath(layer: any): void {
    const order = layer._order as Order
    const next = order.next
    const prev = order.prev

    if (next)
    next.prev = prev
    else
    this._drawLast = prev

    if (prev)
    prev.next = next
    else
    this._drawFirst = next

    delete layer._order
    delete this._layers[Util.stamp(layer)]
    this._requestRedraw(layer)
  }

  _updatePath(layer: any): void {
    this._extendRedrawBounds(layer)
    layer._project()
    layer._update()
    this._requestRedraw(layer)
  }

  _updateStyle(layer: any): void {
    this._updateDashArray(layer)
    this._requestRedraw(layer)
  }

  _updateDashArray(layer: any): void {
    if (typeof layer.options.dashArray === 'string') {
      const parts = layer.options.dashArray.split(/[, ]+/)
      layer.options._dashArray = parts.map((n: string) => Number(n)).filter((n: number) => !Number.isNaN(n))
    }
    else {
      layer.options._dashArray = layer.options.dashArray
    }
  }

  _requestRedraw(layer: any): void {
    if (!this._map)
    return
    this._extendRedrawBounds(layer)
    this._redrawRequest ??= requestAnimationFrame(this._redraw.bind(this))
  }

  _extendRedrawBounds(layer: any): void {
    if (layer._pxBounds) {
      const padding = (layer.options.weight ?? 0) + 1
      this._redrawBounds ??= new Bounds()
      this._redrawBounds.extend(layer._pxBounds.min.subtract([padding, padding]))
      this._redrawBounds.extend(layer._pxBounds.max.add([padding, padding]))
    }
  }

  _redraw(): void {
    this._redrawRequest = null
    if (this._redrawBounds) {
      this._redrawBounds.min._floor()
      this._redrawBounds.max._ceil()
    }
    this._clear()
    this._draw()
    this._redrawBounds = null
  }

  _clear(): void {
    const bounds = this._redrawBounds
    if (bounds) {
      const size = bounds.getSize()
      this._ctx!.clearRect(bounds.min.x, bounds.min.y, size.x, size.y)
    }
    else {
      this._ctx!.save()
      this._ctx!.setTransform(1, 0, 0, 1, 0, 0)
      this._ctx!.clearRect(0, 0, (this._container as HTMLCanvasElement).width, (this._container as HTMLCanvasElement).height)
      this._ctx!.restore()
    }
  }

  _draw(): void {
    const bounds = this._redrawBounds
    this._ctx!.save()
    if (bounds) {
      const size = bounds.getSize()
      this._ctx!.beginPath()
      this._ctx!.rect(bounds.min.x, bounds.min.y, size.x, size.y)
      this._ctx!.clip()
    }

    this._drawing = true

    for (let order = this._drawFirst; order; order = order.next) {
      const layer = order.layer
      if (!bounds || (layer._pxBounds && layer._pxBounds.intersects(bounds)))
      layer._updatePath()
    }

    this._drawing = false
    this._ctx!.restore()
  }

  _updatePoly(layer: any, closed?: boolean): void {
    if (!this._drawing)
    return
    const parts = layer._parts
    const ctx = this._ctx!
    if (!parts.length)
    return

    ctx.beginPath()

    parts.forEach((p0: any[]) => {
      p0.forEach((p: any, j: number) => {
        ctx[j ? 'lineTo' : 'moveTo'](p.x, p.y)
      })
      if (closed)
      ctx.closePath()
    })

    this._fillStroke(ctx, layer)
  }

  _updateCircle(layer: any): void {
    if (!this._drawing || layer._empty())
    return

    const p = layer._point
    const ctx = this._ctx!
    const r = Math.max(Math.round(layer._pxRadius), 1)
    const s = (Math.max(Math.round(layer._pxRadiusY), 1) || r) / r

    if (s !== 1) {
      ctx.save()
      ctx.scale(1, s)
    }

    ctx.beginPath()
    ctx.arc(p.x, p.y / s, r, 0, Math.PI * 2, false)

    if (s !== 1)
    ctx.restore()

    this._fillStroke(ctx, layer)
  }

  _fillStroke(ctx: CanvasRenderingContext2D, layer: any): void {
    const options = layer.options

    if (options.fill) {
      ctx.globalAlpha = options.fillOpacity
      ctx.fillStyle = options.fillColor ?? options.color
      ctx.fill(options.fillRule || 'evenodd')
    }

    if (options.stroke && options.weight !== 0) {
      if (ctx.setLineDash) {
        ctx.lineDashOffset = Number(options.dashOffset ?? 0)
        ctx.setLineDash(options._dashArray ?? [])
      }
      ctx.globalAlpha = options.opacity
      ctx.lineWidth = options.weight
      ctx.strokeStyle = options.color
      ctx.lineCap = options.lineCap
      ctx.lineJoin = options.lineJoin
      ctx.stroke()
    }
  }

  _onClick(e: any): void {
    const point = this._map.pointerEventToLayerPoint(e)
    let clickedLayer: any

    for (let order = this._drawFirst; order; order = order.next) {
      const layer = order.layer
      if (layer.options.interactive && layer._containsPoint(point)) {
        if (!(e.type === 'click' || e.type === 'preclick') || !this._map._draggableMoved(layer))
        clickedLayer = layer
      }
    }
    this._fireEvent(clickedLayer ? [clickedLayer] : false, e)
  }

  _onPointerMove(e: any): void {
    if (!this._map || this._map.dragging.moving() || this._map._animatingZoom)
    return
    const point = this._map.pointerEventToLayerPoint(e)
    this._handlePointerHover(e, point)
  }

  _handlePointerOut(e: any): void {
    const layer = this._hoveredLayer
    if (layer) {
      this._container!.classList.remove('tsmap-interactive')
      this._fireEvent([layer], e, 'pointerout')
      this._hoveredLayer = null
      this._pointerHoverThrottled = false
    }
  }

  _handlePointerHover(e: any, point: any): void {
    if (this._pointerHoverThrottled)
    return

    let candidateHoveredLayer: any
    for (let order = this._drawFirst; order; order = order.next) {
      const layer = order.layer
      if (layer.options.interactive && layer._containsPoint(point))
      candidateHoveredLayer = layer
    }

    if (candidateHoveredLayer !== this._hoveredLayer) {
      this._handlePointerOut(e)
      if (candidateHoveredLayer) {
        this._container!.classList.add('tsmap-interactive')
        this._fireEvent([candidateHoveredLayer], e, 'pointerover')
        this._hoveredLayer = candidateHoveredLayer
      }
    }

    this._fireEvent(this._hoveredLayer ? [this._hoveredLayer] : false, e)

    this._pointerHoverThrottled = true
    this._pointerHoverThrottleTimeout = setTimeout(() => {
      this._pointerHoverThrottled = false
    }, 32)
  }

  _fireEvent(layers: any[] | false, e: any, type?: string): void {
    this._map._fireDOMEvent(e, type || e.type, layers || undefined)
  }

  _bringToFront(layer: any): void {
    const order = layer._order as Order
    if (!order)
    return
    const next = order.next
    const prev = order.prev
    if (next) {
      next.prev = prev
    }
    else {
      return
    }
    if (prev)
    prev.next = next
    else if (next)
    this._drawFirst = next

    order.prev = this._drawLast as Order
    ; (this._drawLast as Order).next = order

    order.next = null
    this._drawLast = order

    this._requestRedraw(layer)
  }

  _bringToBack(layer: any): void {
    const order = layer._order as Order
    if (!order)
    return
    const next = order.next
    const prev = order.prev
    if (prev) {
      prev.next = next
    }
    else {
      return
    }
    if (next)
    next.prev = prev
    else if (prev)
    this._drawLast = prev

    order.prev = null
    order.next = this._drawFirst as Order
    ; (this._drawFirst as Order).prev = order
    this._drawFirst = order

    this._requestRedraw(layer)
  }
}

Canvas.setDefaultOptions( { tolerance: 0 })
