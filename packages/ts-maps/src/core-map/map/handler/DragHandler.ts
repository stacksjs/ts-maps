import type { Point } from '../../geometry/Point'
import { Handler } from '../../core/Handler'
import { Draggable } from '../../dom/Draggable'
import { LatLngBounds } from '../../geo/LatLngBounds'
import { Bounds } from '../../geometry/Bounds'
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

  addHooks(): void {
    if (!this._draggable) {
      const map = this._map
      this._draggable = new Draggable(map._mapPane, map._container) as any
      this._draggable!.on( {
        dragstart: this._onDragStart,
        drag: this._onDrag,
        dragend: this._onDragEnd,
      }, this)

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

    map.fire('movestart').fire('dragstart')
    if (map.options.inertia) {
      this._positions = []
      this._times = []
    }
  }

  _onDrag(e: any): void {
    if (this._map.options.inertia) {
      const time = this._lastTime = Date.now()
      const pos = this._lastPos = (this._draggable as any)._absPos || (this._draggable as any)._newPos
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

  _onPreDragLimit(): void {
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
        offset = map._limitOffset(offset, map.options.maxBounds)
        requestAnimationFrame(() => {
          map.panBy(offset, {
            duration: decelerationDuration,
            easeLinearity: ease,
            noMoveStart: true,
            animate: true,
          })
        })
      }
    }
  }
}

TsMap.addInitHook('addHandler', 'dragging', DragHandler)
