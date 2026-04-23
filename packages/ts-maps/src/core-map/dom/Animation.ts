import type { EasingFunction } from './easing'
import { Evented } from '../core/Events'
import { easeInOutCubic } from './easing'

export type { EasingFunction } from './easing'

export interface AnimationFrame {
  /** Progress through the timeline in `[0, 1]` (pre-easing). */
  progress: number
  /** Eased progress in `[0, 1]` — pass this to any lerp/interp helper. */
  t: number
  /** Seconds elapsed since the previous frame (0 on the first frame). */
  dt: number
}

export interface AnimationOptions {
  /** Animation duration in milliseconds. `0` runs a single "snap" frame. */
  duration: number
  /** Easing function. Defaults to `easeInOutCubic`. */
  easing?: EasingFunction
  /** Called once on the first `rAF` tick, before any `onFrame`. */
  onStart?: () => void
  /** Called on every `rAF` tick with the current frame info. */
  onFrame: (frame: AnimationFrame) => void
  /**
   * Called exactly once after the animation terminates.
   *  - `completed === true` when the timeline reached `t = 1` naturally.
   *  - `completed === false` when `cancel()`/`stop()` was called, or when a
   *    new `run()` superseded this one.
   */
  onEnd?: (completed: boolean) => void
}

/**
 * Unified animation engine for the camera (center / zoom / bearing / pitch /
 * padding). Single-timeline, easing-driven. The caller is responsible for
 * interpolating the actual properties inside `onFrame` — `Animation` only
 * provides the `t` value. That keeps it composable: multi-axis gestures can
 * drive bearing/pitch/zoom in concert by constructing the right `onFrame`
 * closure without the engine needing to know about maps.
 *
 * Only one `run()` can be active at a time. Calling `run()` on a running
 * animation cancels the previous one (fires its `onEnd(false)`) before
 * starting fresh.
 *
 * Events fired (in addition to the callback hooks):
 *   `start`   — before the first `onFrame`
 *   `frame`   — every tick, with `{ progress, t, dt }`
 *   `end`     — on completion or cancellation, with `{ completed }`
 */
export class Animation extends Evented {
  declare _opts?: AnimationOptions
  declare _easing: EasingFunction
  declare _startTime: number
  declare _lastTime: number
  declare _duration: number
  declare _animId?: number
  declare _running: boolean
  declare _pendingStart: boolean

  constructor() {
    super()
    this._easing = easeInOutCubic
    this._startTime = 0
    this._lastTime = 0
    this._duration = 0
    this._running = false
    this._pendingStart = false
  }

  run(opts: AnimationOptions): void {
    // Cancel any in-flight animation without tearing down the Evented state.
    if (this._running)
      this._finish(false)

    this._opts = opts
    this._easing = opts.easing ?? easeInOutCubic
    this._duration = Math.max(0, opts.duration)
    this._running = true
    this._pendingStart = true
    this._startTime = 0
    this._lastTime = 0

    this._animId = requestAnimationFrame((ts: number) => this._tick(ts))
  }

  cancel(): void {
    if (!this._running)
      return
    this._finish(false)
  }

  stop(): void {
    this.cancel()
  }

  isRunning(): boolean {
    return this._running
  }

  _tick(timestamp: number): void {
    if (!this._running)
      return

    // First tick: snapshot the base time, fire `start` callbacks.
    if (this._pendingStart) {
      this._pendingStart = false
      this._startTime = timestamp
      this._lastTime = timestamp
      this._opts?.onStart?.()
      this.fire('start')

      // Zero-duration animations snap to t=1 on the very first frame.
      if (this._duration <= 0) {
        this._emitFrame(1, 1, 0)
        this._finish(true)
        return
      }
    }

    const elapsed = timestamp - this._startTime
    const dt = (timestamp - this._lastTime) / 1000
    this._lastTime = timestamp

    if (elapsed >= this._duration) {
      this._emitFrame(1, 1, dt)
      this._finish(true)
      return
    }

    const progress = elapsed / this._duration
    const t = this._easing(progress)
    this._emitFrame(progress, t, dt)

    if (this._running)
      this._animId = requestAnimationFrame((ts: number) => this._tick(ts))
  }

  _emitFrame(progress: number, t: number, dt: number): void {
    const frame: AnimationFrame = { progress, t, dt }
    this._opts?.onFrame(frame)
    this.fire('frame', frame)
  }

  _finish(completed: boolean): void {
    const opts = this._opts
    if (this._animId !== undefined) {
      cancelAnimationFrame(this._animId)
      this._animId = undefined
    }
    this._running = false
    this._pendingStart = false
    this._opts = undefined
    opts?.onEnd?.(completed)
    this.fire('end', { completed })
  }
}
