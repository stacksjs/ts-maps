import * as DomUtil from '../../dom/DomUtil'
import { Handler } from '../../core/Handler'
import { TsMap } from '../Map'

TsMap.mergeOptions({
  cooperativeGestures: false,
})

/** The hint's wording, for a map that is not in English. */
export interface CooperativeGesturesOptions {
  /** Shown when the wheel scrolls past the map. `{key}` is ⌘ or Ctrl. */
  wheelHint?: string
  /** Shown when one finger drags across the map on a touch screen. */
  touchHint?: string
}

const WHEEL_HINT = 'Use {key} + scroll to zoom the map'
const TOUCH_HINT = 'Use two fingers to move the map'
/** Milliseconds the hint stays up after the last gesture that needed it. */
const HINT_DURATION = 1400

/**
 * A map that shares the page with other content, and lets the page scroll.
 *
 * A map in the middle of a page is a trap for a scroll wheel: the page scrolls
 * until the pointer happens to cross the map, and then the map zooms instead,
 * wherever the reader was trying to go. On a phone it is worse — a map a
 * screen tall swallows every swipe, and the only way past it is to find the
 * margin. Google Maps and MapLibre embeds solve it the same way, and so does
 * this:
 *
 *   - **Wheel** scrolls the page. Hold ⌘ (or Ctrl) to zoom the map instead. A
 *     trackpad pinch arrives with `ctrlKey` set, so pinching still zooms.
 *   - **One finger** scrolls the page. Two fingers pan, pinch, rotate and tilt
 *     the map as usual.
 *   - Either way a short hint says so, over the map, the moment it matters.
 *
 * In fullscreen the map is the page and there is nothing to share with, so
 * gestures go back to working directly.
 *
 * Enabled with `cooperativeGestures: true`, or an object to reword the hint.
 */
export class CooperativeGesturesHandler extends Handler {
  declare _hint?: HTMLElement
  declare _hideTimer?: ReturnType<typeof setTimeout>
  /** Where a lone finger went down, to tell a swipe from a tap. */
  declare _touchStart?: { x: number, y: number } | null

  addHooks(): void {
    const container: HTMLElement = this._map._container
    container.classList.add('tsmap-cooperative')
    // Decoration for pointer users: keyboard users zoom with + and -, and a
    // screen reader announcing it on every scroll past would be noise.
    const hint = DomUtil.create('div', 'tsmap-cooperative-hint', container)
    hint.setAttribute('aria-hidden', 'true')
    this._hint = hint
    // Touch events rather than pointer events for the hint: once the browser
    // takes a swipe over to scroll the page it cancels the pointer, but touch
    // events keep coming. Passive, so the scroll is never held up.
    container.addEventListener('touchstart', this._onTouchStart, { passive: true })
    container.addEventListener('touchmove', this._onTouchMove, { passive: true })
  }

  removeHooks(): void {
    const container: HTMLElement = this._map._container
    container.classList.remove('tsmap-cooperative')
    container.removeEventListener('touchstart', this._onTouchStart)
    container.removeEventListener('touchmove', this._onTouchMove)
    clearTimeout(this._hideTimer)
    this._hint?.remove()
    this._hint = undefined
  }

  /** Whether gestures are being shared with the page right now. */
  active(): boolean {
    if (!this.enabled())
      return false
    const container: HTMLElement = this._map._container
    if (container.closest?.('.tsmap-pseudo-fullscreen'))
      return false
    const doc = container.ownerDocument as Document & { webkitFullscreenElement?: Element | null }
    const full = doc?.fullscreenElement ?? doc?.webkitFullscreenElement ?? null
    return !(full && (full === container || full.contains(container)))
  }

  /**
   * Whether this wheel event belongs to the page. Shows the hint when it does,
   * so the reader learns why the map did not zoom.
   */
  wheelBelongsToPage(e: WheelEvent): boolean {
    if (!this.active() || e.ctrlKey || e.metaKey)
      return false
    this._show('wheel')
    return true
  }

  /**
   * Whether a one-pointer drag belongs to the page: a single finger on a
   * touch screen. A mouse or pen drag is plainly meant for the map.
   */
  dragBelongsToPage(e: PointerEvent): boolean {
    return this.active() && e.pointerType === 'touch'
  }

  // Arrow properties, so they can be removed by identity.
  _onTouchStart = (e: TouchEvent): void => {
    const touch = e.touches.length === 1 ? e.touches[0] : undefined
    this._touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  /** A lone finger that has travelled is a swipe the page took: say why. */
  _onTouchMove = (e: TouchEvent): void => {
    const start = this._touchStart
    const touch = e.touches.length === 1 ? e.touches[0] : undefined
    if (!start || !touch || !this.active())
      return
    if (Math.abs(touch.clientX - start.x) + Math.abs(touch.clientY - start.y) < 10)
      return
    this._touchStart = null
    this._show('touch')
  }

  _text(kind: 'wheel' | 'touch'): string {
    const option = this._map.options.cooperativeGestures
    const custom: CooperativeGesturesOptions = option && typeof option === 'object' ? option : {}
    if (kind === 'touch')
      return custom.touchHint ?? TOUCH_HINT
    return (custom.wheelHint ?? WHEEL_HINT).replace('{key}', isApple() ? '⌘' : 'Ctrl')
  }

  _show(kind: 'wheel' | 'touch'): void {
    const hint = this._hint
    if (!hint)
      return
    const text = this._text(kind)
    if (hint.textContent !== text)
      hint.textContent = text
    hint.classList.add('tsmap-visible')
    clearTimeout(this._hideTimer)
    this._hideTimer = setTimeout(() => hint.classList.remove('tsmap-visible'), HINT_DURATION)
  }
}

function isApple(): boolean {
  if (typeof navigator === 'undefined')
    return false
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

TsMap.addInitHook('addHandler', 'cooperativeGestures', CooperativeGesturesHandler)
