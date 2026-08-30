import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { Control } from './Control'

/**
 * Zoom buttons plus a compass, in one stack — Mapbox's `NavigationControl`.
 *
 * The compass is the part `ZoomControl` cannot grow into: once a map can be
 * rotated and pitched (it can — see `TwoFingerRotate` and `TwoFingerPitch`),
 * there has to be a way back to north that does not involve wrestling two
 * fingers into alignment. The needle doubles as the only always-visible
 * indication that the map is rotated at all.
 *
 * It composes rather than extends ZoomControl: the two are separate controls
 * with separate positions, and inheritance would tie their DOM together for
 * the sake of sharing one small button helper.
 */
export interface NavigationControlOptions {
  position?: string
  /** Show the +/− buttons. Default true. */
  showZoom?: boolean
  /** Show the compass / reset-bearing button. Default true. */
  showCompass?: boolean
  /** Tilt the needle to reflect pitch, and reset pitch on click. Default false. */
  visualizePitch?: boolean
  /**
   * Milliseconds the swing back to north takes. `0` snaps. Ignored when the
   * user has asked for reduced motion, which always snaps — a map spinning
   * under someone who has turned animation off is exactly the kind of motion
   * that setting exists to prevent.
   */
  resetDuration?: number
  zoomInTitle?: string
  zoomOutTitle?: string
  compassTitle?: string
}

const CLASS = 'tsmap-control-navigation'

export class NavigationControl extends Control {
  declare _zoomInButton?: HTMLAnchorElement
  declare _zoomOutButton?: HTMLAnchorElement
  declare _compassButton?: HTMLAnchorElement
  declare _needle?: HTMLElement

  onAdd(map: any): HTMLElement {
    const options = this.options as NavigationControlOptions
    const container = DomUtil.create('div', `${CLASS} tsmap-bar`)

    if (options.showZoom !== false) {
      this._zoomInButton = this._createButton(
        `${CLASS}-zoom-in`,
        options.zoomInTitle ?? 'Zoom in',
        '<span aria-hidden="true">+</span>',
        container,
        this._zoomIn,
      )
      this._zoomOutButton = this._createButton(
        `${CLASS}-zoom-out`,
        options.zoomOutTitle ?? 'Zoom out',
        '<span aria-hidden="true">&#x2212;</span>',
        container,
        this._zoomOut,
      )
      this._updateDisabled()
      map.on('zoomend zoomlevelschange', this._updateDisabled, this)
    }

    if (options.showCompass !== false) {
      this._compassButton = this._createButton(
        `${CLASS}-compass`,
        options.compassTitle ?? 'Reset bearing to north',
        '<span class="tsmap-compass-needle" aria-hidden="true"></span>',
        container,
        this._resetNorth,
      )
      this._needle = this._compassButton.querySelector('.tsmap-compass-needle') as HTMLElement
      map.on('rotate rotateend', this._updateCompass, this)
      if (options.visualizePitch)
        map.on('pitch pitchend', this._updateCompass, this)
      this._updateCompass()
    }

    return container
  }

  onRemove(map: any): void {
    map.off('zoomend zoomlevelschange', this._updateDisabled, this)
    map.off('rotate rotateend', this._updateCompass, this)
    map.off('pitch pitchend', this._updateCompass, this)
  }

  _zoomIn(event: any): void {
    const map = this._map
    if (map._zoom < map.getMaxZoom())
      map.zoomIn(map.options.zoomDelta * (event?.shiftKey ? 3 : 1))
  }

  _zoomOut(event: any): void {
    const map = this._map
    if (map._zoom > map.getMinZoom())
      map.zoomOut(map.options.zoomDelta * (event?.shiftKey ? 3 : 1))
  }

  _resetNorth(): void {
    const map = this._map
    const options = this.options as NavigationControlOptions
    const duration = this._reducedMotion() ? 0 : (options.resetDuration ?? 300)

    if (duration > 0)
      map.rotateTo(0, { animate: true, duration })
    else
      map.setBearing(0)

    if (options.visualizePitch && typeof map.setPitch === 'function')
      map.setPitch(0)
  }

  _reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  _updateCompass(): void {
    const map = this._map
    const needle = this._needle
    if (!map || !needle)
      return

    const options = this.options as NavigationControlOptions
    const bearing = map.getBearing?.() ?? 0
    // Negated: the needle keeps pointing north while the map turns under it.
    const transforms = [`rotate(${-bearing}deg)`]
    if (options.visualizePitch)
      transforms.unshift(`rotateX(${map.getPitch?.() ?? 0}deg)`)

    needle.style.transform = transforms.join(' ')
    this._compassButton?.setAttribute('data-bearing', String(Math.round(bearing)))
  }

  _updateDisabled(): void {
    const map = this._map
    const className = 'tsmap-disabled'
    if (!map)
      return

    for (const [button, disabled] of [
      [this._zoomOutButton, map._zoom === map.getMinZoom()],
      [this._zoomInButton, map._zoom === map.getMaxZoom()],
    ] as Array<[HTMLAnchorElement | undefined, boolean]>) {
      if (!button)
        continue
      if (disabled)
        button.classList.add(className)
      else
        button.classList.remove(className)
      button.setAttribute('aria-disabled', String(disabled))
    }
  }

  _createButton(className: string, title: string, html: string, container: HTMLElement, fn: (event: any) => void): HTMLAnchorElement {
    const link = DomUtil.create('a', className, container) as HTMLAnchorElement
    link.innerHTML = html
    link.href = '#'
    link.title = title
    link.setAttribute('role', 'button')
    link.setAttribute('aria-label', title)

    DomEvent.disableClickPropagation(link)
    DomEvent.on(link, 'click', DomEvent.stop)
    DomEvent.on(link, 'click', fn, this)
    DomEvent.on(link, 'click', this._refocusOnMap, this)
    return link
  }
}

NavigationControl.setDefaultOptions({
  position: 'topright',
  showZoom: true,
  showCompass: true,
  visualizePitch: false,
})
