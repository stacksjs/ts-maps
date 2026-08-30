import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { Control } from './Control'

/**
 * Expand the map to fill the screen.
 *
 * Two mechanisms, because one of them is unavailable more often than it
 * looks: the Fullscreen API is blocked in cross-origin iframes without an
 * `allowfullscreen` attribute, and on iPhone Safari it does not exist at all —
 * both being exactly the places a map is most likely to be embedded. When it
 * is unavailable the control falls back to a fixed, full-viewport class, which
 * is not true fullscreen (browser chrome stays) but does the thing the user
 * pressed the button for.
 *
 * Either way the map is told to re-measure: the container changes size without
 * a window resize event in the API case.
 */
export interface FullscreenControlOptions {
  position?: string
  /** Element to expand. Defaults to the map container. */
  container?: HTMLElement
  title?: string
  titleCancel?: string
}

const CLASS = 'tsmap-control-fullscreen'
const PSEUDO = 'tsmap-pseudo-fullscreen'

export class FullscreenControl extends Control {
  declare _button?: HTMLAnchorElement
  declare _pseudo?: boolean
  declare _onDocumentChange?: () => void

  onAdd(_map: any): HTMLElement {
    const options = this.options as FullscreenControlOptions
    const container = DomUtil.create('div', `${CLASS} tsmap-bar`)

    const link = DomUtil.create('a', `${CLASS}-button`, container) as HTMLAnchorElement
    link.href = '#'
    link.setAttribute('role', 'button')
    link.innerHTML = '<span class="tsmap-fullscreen-icon" aria-hidden="true"></span>'

    DomEvent.disableClickPropagation(link)
    DomEvent.on(link, 'click', DomEvent.stop)
    DomEvent.on(link, 'click', this.toggle, this)

    this._button = link
    this._updateButton(false)

    this._onDocumentChange = () => this._syncFromDocument()
    document.addEventListener('fullscreenchange', this._onDocumentChange)
    document.addEventListener('webkitfullscreenchange', this._onDocumentChange)

    void options
    return container
  }

  onRemove(_map: any): void {
    if (this._onDocumentChange) {
      document.removeEventListener('fullscreenchange', this._onDocumentChange)
      document.removeEventListener('webkitfullscreenchange', this._onDocumentChange)
      this._onDocumentChange = undefined
    }
    if (this._pseudo)
      this._exitPseudo()
  }

  /** True while the map is expanded, by either mechanism. */
  isFullscreen(): boolean {
    return this._pseudo === true || this._documentElement() === this._target()
  }

  toggle(): this {
    return this.isFullscreen() ? this.exit() : this.request()
  }

  request(): this {
    const target = this._target() as any
    const request = target?.requestFullscreen ?? target?.webkitRequestFullscreen

    if (typeof request === 'function') {
      // A rejected promise here is normal (a gesture requirement not met, a
      // sandboxed iframe); falling back beats leaving the button dead.
      Promise.resolve(request.call(target)).catch(() => this._enterPseudo())
      return this
    }

    this._enterPseudo()
    return this
  }

  exit(): this {
    if (this._pseudo) {
      this._exitPseudo()
      return this
    }

    const doc = document as any
    const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen
    if (typeof exit === 'function')
      Promise.resolve(exit.call(doc)).catch(() => {})

    return this
  }

  _target(): HTMLElement {
    return (this.options as FullscreenControlOptions).container ?? this._map?.getContainer()
  }

  _documentElement(): Element | null {
    const doc = document as any
    return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
  }

  _enterPseudo(): void {
    if (this._pseudo)
      return
    this._pseudo = true
    this._target()?.classList.add(PSEUDO)
    this._onChanged(true)
  }

  _exitPseudo(): void {
    if (!this._pseudo)
      return
    this._pseudo = false
    this._target()?.classList.remove(PSEUDO)
    this._onChanged(false)
  }

  _syncFromDocument(): void {
    // Covers the Escape key and the browser's own exit affordance, neither of
    // which routes through this control.
    this._onChanged(this._documentElement() === this._target())
  }

  _onChanged(active: boolean): void {
    this._updateButton(active)
    this._map?.invalidateSize?.()
    this._map?.fire?.(active ? 'fullscreenstart' : 'fullscreenend', { fullscreen: active })
  }

  _updateButton(active: boolean): void {
    const button = this._button
    if (!button)
      return

    const options = this.options as FullscreenControlOptions
    const title = active
      ? (options.titleCancel ?? 'Exit fullscreen')
      : (options.title ?? 'View fullscreen')

    button.title = title
    button.setAttribute('aria-label', title)
    button.setAttribute('aria-pressed', String(active))
    if (active)
      button.classList.add(`${CLASS}-active`)
    else
      button.classList.remove(`${CLASS}-active`)
  }
}

FullscreenControl.setDefaultOptions({
  position: 'topright',
})
