import type { PositionFix } from './navigator'
import type { Navigator } from './navigator'

export interface RouteSimulatorOptions {
  /** Cruising speed, metres per second. Default 13.4 (30 mph). */
  speed?: number
  /** Milliseconds between fixes. Default 1000, like a phone's GPS. */
  interval?: number
  /** Multiplier on elapsed time, to watch a long drive quickly. */
  timeScale?: number
}

/**
 * Drives a route, producing the fixes a phone would: for trying guidance at a
 * desk, for demos, and for tests.
 *
 * It slows for maneuvers — down to about a third of cruising speed through a
 * turn — so the camera, the banner and the voice are exercised the way a real
 * drive exercises them rather than at a constant, unrealistic pace.
 */
export class RouteSimulator {
  navigator: Navigator
  distance = 0
  speed: number
  interval: number
  timeScale: number
  onFix: (fix: PositionFix) => void
  _timer: ReturnType<typeof setInterval> | null = null
  _time = 0

  constructor(navigator: Navigator, onFix: (fix: PositionFix) => void, options: RouteSimulatorOptions = {}) {
    this.navigator = navigator
    this.onFix = onFix
    this.speed = options.speed ?? 13.4
    this.interval = options.interval ?? 1000
    this.timeScale = options.timeScale ?? 1
  }

  get running(): boolean {
    return this._timer !== null
  }

  start(): void {
    if (this._timer)
      return
    this._time = Date.now()
    this.tick(0)
    this._timer = setInterval(() => this.tick((this.interval / 1000) * this.timeScale), this.interval)
  }

  stop(): void {
    if (this._timer)
      clearInterval(this._timer)
    this._timer = null
  }

  /** How fast to go here: cruising, easing down within reach of a maneuver. */
  speedAt(distance: number): number {
    const starts = this.navigator.stepStarts
    let nearest = Infinity
    for (let i = 1; i < starts.length; i++)
      nearest = Math.min(nearest, Math.abs(starts[i]! - distance))
    const slow = this.speed * 0.35
    const reach = 60
    return nearest >= reach ? this.speed : slow + (this.speed - slow) * (nearest / reach)
  }

  /** Advance by `seconds` and report where that lands. */
  tick(seconds: number): PositionFix {
    const speed = this.speedAt(this.distance)
    this.distance = Math.min(this.navigator.length, this.distance + speed * seconds)
    this._time += seconds * 1000
    const { location, heading } = this.navigator.pointAt(this.distance)
    const fix: PositionFix = { ...location, heading, speed, accuracy: 5, time: this._time }
    this.onFix(fix)
    if (this.distance >= this.navigator.length)
      this.stop()
    return fix
  }
}
