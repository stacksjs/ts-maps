import type { Point } from '../geometry/Point'
import * as DomUtil from './DomUtil'
import { Evented } from '../core/Events'

export class PosAnimation extends Evented {
  declare _el?: HTMLElement
  declare _inProgress?: boolean
  declare _duration?: number
  declare _easeOutPower?: number
  declare _startPos?: Point
  declare _offset?: Point
  declare _startTime?: number
  declare _animId?: number

  run(el: HTMLElement, newPos: Point, duration?: number, easeLinearity?: number): void {
    this.stop()
    this._el = el
    this._inProgress = true
    this._duration = duration ?? 0.25
    this._easeOutPower = 1 / Math.max(easeLinearity ?? 0.5, 0.2)
    this._startPos = DomUtil.getPosition(el)
    this._offset = newPos.subtract(this._startPos)
    this._startTime = +new Date()
    this.fire('start')
    this._animate()
  }

  stop(): void {
    if (!this._inProgress)
    return
    this._step(true)
    this._complete()
  }

  _animate(): void {
    this._animId = requestAnimationFrame(this._animate.bind(this))
    this._step()
  }

  _step(round?: boolean): void {
    const elapsed = (+new Date()) - (this._startTime as number)
    const duration = (this._duration as number) * 1000

    if (elapsed < duration) {
      this._runFrame(this._easeOut(elapsed / duration), round)
    }
    else {
      this._runFrame(1)
      this._complete()
    }
  }

  _runFrame(progress: number, round?: boolean): void {
    const pos = (this._startPos as Point).add((this._offset as Point).multiplyBy(progress))
    if (round)
    pos._round()
    DomUtil.setPosition(this._el as HTMLElement, pos)
    this.fire('step')
  }

  _complete(): void {
    cancelAnimationFrame(this._animId as number)
    this._inProgress = false
    this.fire('end')
  }

  _easeOut(t: number): number {
    return 1 - (1 - t) ** (this._easeOutPower as number)
  }
}
