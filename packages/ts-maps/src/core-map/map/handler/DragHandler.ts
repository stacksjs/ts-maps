import type { LatLng } from '../../geo/LatLng'
import { Handler } from '../../core/Handler'
import { Draggable } from '../../dom/Draggable'
import { LatLngBounds } from '../../geo/LatLngBounds'
import { Bounds } from '../../geometry/Bounds'
import { Point } from '../../geometry/Point'
import { TsMap } from '../Map'

TsMap.mergeOptions( {
  dragging: true,
  inertia: true,
  inertiaDeceleration: 3400,
  inertiaMaxSpeed: Infinity,
  easeLinearity: 0.2,
  worldCopyJump: false,
  maxBoundsViscosity: 0.0,
})

export class DragHandler extends Handler {
  declare _draggable?: Draggable & { _absPos?: Point }
  _positions: Point[] = []
  _times: number[] = []
  declare _lastTime?: number
  declare _lastPos?: Point
  _offsetLimit: Bounds | null = null
  _viscosity = 0
  _initialWorldOffset = 0
  _worldWidth = 0
  /** Under pitch: the ground point that was grabbed, and where the pointer went down. */
  declare _groundAnchor?: LatLng
  declare _groundStart?: Point
  /** Under pitch: where the pointer is now, in container pixels. */
  declare _groundCursor?: Point

  addHooks(): void {
    if (!this._draggable) {
      const map = this._map
      this._draggable = new Draggable(map._mapPane, map._container) as any
      this._draggable!._shouldStart = e => !map.cooperativeGestures?.dragBelongsToPage?.(e)
      this._draggable!.on( {
        dragstart: this._onDragStart,
        drag: this._onDrag,
        dragend: this._onDragEnd,
      }, this)

      // First, so the limit and wrap handlers see a pane that is not moving.
      this._draggable!.on('predrag', this._onPreDragPitch, this)
      this._draggable!.on('predrag', this._onPreDragLimit, this)
      if (map.options.worldCopyJump) {
        this._draggable!.on('predrag', this._onPreDragWrap, this)
        map.on('zoomend', this._onZoomEnd, this)
        map.whenReady(this._onZoomEnd, this)
      }
    }
    this._map._container.classList.add('tsmap-grab', 'tsmap-touch-drag')
    this._draggable!.enable()
    this._positions = []
    this._times = []
  }

  removeHooks(): void {
    this._map._container.classList.remove('tsmap-grab', 'tsmap-touch-drag')
    this._draggable!.disable()
  }

  moved(): boolean | undefined {
    return this._draggable?._moved
  }

  moving(): boolean | undefined {
    return this._draggable?._moving
  }

  _onDragStart(): void {
    const map = this._map
    map._stop()
    if (map.options.maxBounds && map.options.maxBoundsViscosity) {
      const bounds = new LatLngBounds(map.options.maxBounds)
      this._offsetLimit = new Bounds(
      map.latLngToContainerPoint(bounds.getNorthWest()).multiplyBy(-1),
      map.latLngToContainerPoint(bounds.getSouthEast()).multiplyBy(-1).add(map.getSize()),
      )
      this._viscosity = Math.min(1.0, Math.max(0.0, map.options.maxBoundsViscosity))
    }
    else {
      this._offsetLimit = null
    }

    // A pitched map is dragged by the ground, not the pane: remember what was
    // grabbed so it can be kept under the pointer.
    this._groundAnchor = undefined
    this._groundStart = undefined
    this._groundCursor = undefined
    const d = this._draggable as any
    if (map._pitch && d?._startPoint) {
      const rect = map._container.getBoundingClientRect()
      // Grabbed near the horizon, the ground under the pointer is so far off
      // that following it would fling the map; hold on lower down instead.
      this._groundStart = map._clampToGround(new Point(d._startPoint.x - rect.left - map._container.clientLeft, d._startPoint.y - rect.top - map._container.clientTop), 1 / 8)
      this._groundAnchor = map.containerPointToLatLng(this._groundStart)
    }

    map.fire('movestart').fire('dragstart')
    if (map.options.inertia) {
      this._positions = []
      this._times = []
    }
  }

  _onDrag(e: any): void {
    if (this._map.options.inertia) {
      const time = this._lastTime = Date.now()
      const d = this._draggable as any
      // Under pitch the pane never moves, so the pointer's path is the record.
      const pos = this._lastPos = this._groundCursor?.clone() ?? d._absPos ?? d._newPos
      this._positions.push(pos)
      this._times.push(time)
      this._prunePositions(time)
    }
    this._map.fire('move', e).fire('drag', e)
  }

  _prunePositions(time: number): void {
    while (this._positions.length > 1 && time - this._times[0] > 50) {
      this._positions.shift()
      this._times.shift()
    }
  }

  _onZoomEnd(): void {
    const pxCenter = this._map.getSize().divideBy(2)
    const pxWorldCenter = this._map.latLngToLayerPoint([0, 0])
    this._initialWorldOffset = pxWorldCenter.subtract(pxCenter).x
    this._worldWidth = this._map.getPixelWorldBounds().getSize().x
  }

  _viscousLimit(value: number, threshold: number): number {
    return value - (value - threshold) * this._viscosity
  }

  /**
   * Under pitch, turn the pane move the drag asked for into a camera move.
   *
   * The grabbed ground point is put back under the pointer by shifting the
   * centre, which is exact: at a fixed zoom, moving the centre by some world
   * distance moves the ground under every screen point by that same distance.
   * The pane is left where it was, so the perspective's vanishing point stays
   * in the middle of the screen as it does in Apple Maps.
   */
  _onPreDragPitch(): void {
    const map = this._map
    const d = this._draggable as any
    if (!map._pitch || !this._groundAnchor || !this._groundStart)
    return

    const offset = d._newPos.subtract(d._startPos)
    const cursor = this._groundCursor = map._clampToGround(this._groundStart.add(offset), 1 / 8)
    d._newPos = d._startPos.clone()
    d._absPos = undefined

    const zoom = map.getZoom()
    const want = map.project(this._groundAnchor, zoom)
    const have = map.project(map.containerPointToLatLng(cursor), zoom)
    const center = map.unproject(map.project(map.getCenter(), zoom).add(want.subtract(have)), zoom)
    // `move` itself is fired by `_onDrag`; layers re-lay on `zoom`.
    map._move(center, zoom, undefined, true)
    map.fire('zoom', { relayout: true })
  }

  _onPreDragLimit(): void {
    if (this._map._pitch)
    return
    if (!this._viscosity || !this._offsetLimit)
    return
    const d = this._draggable as any
    const offset = d._newPos.subtract(d._startPos)
    const limit = this._offsetLimit
    if (offset.x < limit.min.x)
    offset.x = this._viscousLimit(offset.x, limit.min.x)
    if (offset.y < limit.min.y)
    offset.y = this._viscousLimit(offset.y, limit.min.y)
    if (offset.x > limit.max.x)
    offset.x = this._viscousLimit(offset.x, limit.max.x)
    if (offset.y > limit.max.y)
    offset.y = this._viscousLimit(offset.y, limit.max.y)
    d._newPos = d._startPos.add(offset)
  }

  _onPreDragWrap(): void {
    if (this._map._pitch)
    return
    const d = this._draggable as any
    const worldWidth = this._worldWidth
    const halfWidth = Math.round(worldWidth / 2)
    const dx = this._initialWorldOffset
    const x = d._newPos.x
    const newX1 = (x - halfWidth + dx) % worldWidth + halfWidth - dx
    const newX2 = (x + halfWidth + dx) % worldWidth - halfWidth - dx
    const newX = Math.abs(newX1 + dx) < Math.abs(newX2 + dx) ? newX1 : newX2
    d._absPos = d._newPos.clone()
    d._newPos.x = newX
  }

  _onDragEnd(e: any): void {
    const map = this._map
    const options = map.options
    const noInertia = !options.inertia || e.noInertia || this._times.length < 2

    map.fire('dragend', e)

    if (noInertia) {
      map.fire('moveend')
    }
    else {
      this._prunePositions(Date.now())
      const direction = (this._lastPos as Point).subtract(this._positions[0])
      const duration = ((this._lastTime as number) - this._times[0]) / 1000
      const ease = options.easeLinearity
      const speedVector = direction.multiplyBy(ease / duration)
      const speed = speedVector.distanceTo([0, 0])
      const limitedSpeed = Math.min(options.inertiaMaxSpeed, speed)
      const limitedSpeedVector = speedVector.multiplyBy(limitedSpeed / speed)
      const decelerationDuration = limitedSpeed / (options.inertiaDeceleration * ease)
      let offset = limitedSpeedVector.multiplyBy(-decelerationDuration / 2).round()

      if (!offset.x && !offset.y) {
        map.fire('moveend')
      }
      else {
        // Pitched, the glide continues from where the pointer let go, so it
        // carries on at the speed the ground under it was moving.
        const around = map._pitch ? this._groundCursor : undefined
        if (!around)
        offset = map._limitOffset(offset, map.options.maxBounds)
        requestAnimationFrame(() => {
          map.panBy(offset, {
            duration: decelerationDuration,
            easeLinearity: ease,
            noMoveStart: true,
            animate: true,
            around,
          })
        })
      }
    }
  }
}

TsMap.addInitHook('addHandler', 'dragging', DragHandler)
