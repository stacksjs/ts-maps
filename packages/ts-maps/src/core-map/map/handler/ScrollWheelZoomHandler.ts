import type { LatLng } from '../../geo/LatLng'
import type { Point } from '../../geometry/Point'
import * as DomEvent from '../../dom/DomEvent'
import { Handler } from '../../core/Handler'
import { TsMap } from '../Map'

TsMap.mergeOptions({
  scrollWheelZoom: true,

  /**
   * How much wheel travel is one zoom level.
   *
   * A notched mouse wheel reports ~53px per notch in Chrome and 120 in
   * Firefox's line mode, both normalised to pixels upstream. 60 puts a single
   * notch a little under a full level, which is what every other map does — a
   * notch that jumps exactly one level feels like a slideshow.
   */
  wheelPxPerZoomLevel: 60,

  /**
   * Seconds for the camera to catch up with the wheel.
   *
   * Not a duration in the usual sense: the zoom converges exponentially on
   * wherever the wheel has pushed it, so a gesture that keeps going never
   * waits for an animation to finish. Around 130ms is where the movement stops
   * reading as a jump and has not yet started reading as lag.
   */
  wheelSmoothing: 0.13,

  /**
   * Legacy. Kept so a config that sets it still loads; the handler no longer
   * waits for the wheel to stop before it moves, which is what made scrolling
   * feel like it was ignoring the first part of every gesture.
   */
  wheelDebounceTime: 40,
})

/**
 * Continuous scroll-wheel zoom.
 *
 * The previous implementation was Leaflet's: accumulate wheel delta, wait
 * 40ms for the gesture to stop, then animate one discrete `setZoom` step. That
 * is three separate problems stacked on each other — the map does not move
 * while you are actually scrolling, it then moves in a jump you did not ask
 * for, and a trackpad's continuous stream of small deltas is chopped into a
 * sequence of those jumps. Next to Google Maps or Apple Maps it reads as
 * broken rather than as slow.
 *
 * What every other slippy map does instead, and what this does:
 *
 *   - Wheel events push a TARGET zoom. They never animate anything themselves,
 *     so a fast scroll and a slow one differ in how far they go, not in how
 *     many animations they queue.
 *   - A single rAF loop eases the live zoom toward that target and stops when
 *     it arrives. Scrolling again just moves the target; the loop is already
 *     running and simply keeps going. There is nothing to cancel and nothing
 *     to queue.
 *   - The point under the cursor stays under the cursor, recomputed every
 *     frame from the anchor the gesture started at.
 *
 * ## Trackpads
 *
 * A pinch on a macOS trackpad arrives as a `wheel` event with `ctrlKey` set —
 * the browser's way of reporting a zoom gesture, and nothing to do with the
 * Control key. Those deltas are much finer than a mouse notch, so applying the
 * mouse's px-per-level to them makes a pinch cover half the zoom range. They
 * get their own scale, and no easing: a pinch is a direct manipulation, and
 * anything that lags behind the fingers feels broken.
 */
export class ScrollWheelZoomHandler extends Handler {
  /** Where the camera is heading. Equal to the live zoom when at rest. */
  declare _targetZoom: number | null
  /** The container point the gesture is anchored to. */
  declare _anchor?: Point
  /** The world position under `_anchor` when the gesture started. */
  declare _anchorLatLng?: LatLng
  declare _frame?: number
  declare _lastFrameTime: number
  declare _active: boolean

  addHooks(): void {
    DomEvent.on(this._map._container, 'wheel', this._onWheelScroll, this)
    this._targetZoom = null
    this._active = false
    this._lastFrameTime = 0
  }

  removeHooks(): void {
    DomEvent.off(this._map._container, 'wheel', this._onWheelScroll, this)
    this._stopFrames()
    this._targetZoom = null
    this._active = false
  }

  _onWheelScroll(e: WheelEvent): void {
    const map = this._map
    const delta = DomEvent.getWheelDelta(e)

    DomEvent.stop(e)

    if (!delta)
      return

    // A trackpad pinch. Finer deltas, and a much larger divisor, so a gesture
    // covers a sane amount of zoom rather than the whole range.
    const pinch = e.ctrlKey === true
    const pxPerLevel = map.options.wheelPxPerZoomLevel as number
    const step = delta / (pinch ? pxPerLevel * 2 : pxPerLevel)

    // A new gesture re-anchors. An in-flight one keeps the anchor it started
    // with, so a long scroll converges on one point instead of drifting toward
    // wherever the pointer happened to be on the last event.
    if (!this._active) {
      this._anchor = map.pointerEventToContainerPoint(e)
      this._anchorLatLng = map.containerPointToLatLng(this._anchor)
      this._targetZoom = map.getZoom()
      this._active = true

      // Any camera animation still running would fight the loop below for the
      // same properties.
      map._stop()
      map._moveStart(true, false)
    }

    this._targetZoom = map._limitZoom((this._targetZoom as number) + step)

    // A pinch is direct manipulation: applied on the spot, with no easing to
    // lag behind the fingers.
    if (pinch) {
      this._applyZoom(this._targetZoom as number)
      this._scheduleSettle()
      return
    }

    if (this._frame === undefined)
      this._startFrames()
  }

  /**
   * Move the camera to `zoom`, keeping the anchor point fixed.
   *
   * The centre is derived rather than tracked: project the anchor's world
   * position at the new zoom, offset by where the anchor sits in the
   * container, and unproject. That is exactly `setZoomAround`'s maths, applied
   * per frame and without going through `setView` — which would start its own
   * animation and undo the smoothness this exists to provide.
   */
  _applyZoom(zoom: number): void {
    const map = this._map
    const anchor = this._anchor
    const anchorLatLng = this._anchorLatLng

    if (!anchor || !anchorLatLng) {
      map._move(map.getCenter(), zoom)
      return
    }

    const viewHalf = map.getSize().divideBy(2)
    const offset = anchor.subtract(viewHalf)
    const center = map.unproject(map.project(anchorLatLng, zoom).subtract(offset), zoom)

    map._move(center, zoom, { round: false })
  }

  _startFrames(): void {
    this._lastFrameTime = 0
    this._frame = requestAnimationFrame(ts => this._tick(ts))
  }

  _stopFrames(): void {
    if (this._frame !== undefined) {
      cancelAnimationFrame(this._frame)
      this._frame = undefined
    }
  }

  _tick(timestamp: number): void {
    const map = this._map
    const target = this._targetZoom

    if (target === null) {
      this._frame = undefined
      return
    }

    // Frame-rate independent easing. A fixed per-frame fraction converges
    // twice as fast on a 120Hz display as on a 60Hz one, so the same gesture
    // feels different on two machines; deriving the fraction from elapsed time
    // makes it feel the same on both.
    const dt = this._lastFrameTime ? Math.min((timestamp - this._lastFrameTime) / 1000, 0.1) : 1 / 60
    this._lastFrameTime = timestamp

    const smoothing = Math.max(0.01, map.options.wheelSmoothing as number)
    const t = 1 - Math.exp(-dt / smoothing)

    const current = map.getZoom()
    const remaining = target - current

    // Close enough that another frame would not be visible. Snapping here is
    // what lets the loop actually stop rather than converging forever.
    if (Math.abs(remaining) < 0.001) {
      this._applyZoom(target)
      this._frame = undefined
      this._settle()
      return
    }

    this._applyZoom(current + remaining * t)
    this._frame = requestAnimationFrame(ts => this._tick(ts))
  }

  /**
   * A pinch has no easing loop to notice that it finished, so the end of the
   * gesture is inferred from the wheel going quiet.
   */
  _scheduleSettle(): void {
    this._stopFrames()
    this._frame = requestAnimationFrame(() => {
      this._frame = undefined
      setTimeout(() => {
        if (this._frame === undefined && this._active)
          this._settle()
      }, 120)
    })
  }

  /** End the gesture: fire `zoomend`/`moveend` once, and forget the anchor. */
  _settle(): void {
    if (!this._active)
      return

    this._active = false
    this._targetZoom = null
    this._anchor = undefined
    this._anchorLatLng = undefined
    this._map._moveEnd(true)
  }
}

TsMap.addInitHook('addHandler', 'scrollWheelZoom', ScrollWheelZoomHandler)
