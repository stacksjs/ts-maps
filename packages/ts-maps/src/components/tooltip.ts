import type { MapInterface } from '../types'
import {
  createElement,
} from '../util'
import BaseComponent from './base'

export class Tooltip extends BaseComponent {
  private _map: MapInterface
  protected _tooltip: HTMLElement
  private _hoveredRegion: string | null = null
  private _hoveredMarker: string | null = null
  private _customPositioning: boolean = true // Flag to enable custom positioning

  constructor(map: MapInterface) {
    super()

    this._map = map
    this._tooltip = createElement('div', 'jvm-tooltip', '')
    this._tooltip.style.display = 'none'
    this._map.container.appendChild(this._tooltip)

    // We're not binding event listeners as we're using custom positioning in HTML
    // this._bindEventListeners()

    return this
  }

  getElement(): HTMLElement {
    return this._tooltip
  }

  show(text: string): void {
    this._tooltip.style.display = 'block'
    this._tooltip.innerHTML = text
    this._tooltip.classList.add('active')
  }

  hide(): void {
    this._tooltip.style.display = 'none'
    this._tooltip.classList.remove('active')
    this._hoveredRegion = null
    this._hoveredMarker = null
  }

  text(text: string): void {
    if (this._tooltip) {
      this._tooltip.innerHTML = text
    }
  }

  html(html: string): void {
    if (this._tooltip) {
      this._tooltip.innerHTML = html
    }
  }

  css(css: Record<string, string>): this {
    // Skip CSS positioning if custom positioning is enabled
    if (this._customPositioning && (css.top || css.left)) {
      return this
    }

    for (const style in css) {
      this._tooltip.style[style as any] = css[style]
    }

    return this
  }

  /**
   * Set the hovered region
   */
  setHoveredRegion(code: string): void {
    this._hoveredRegion = code
  }

  /**
   * Get the hovered region
   */
  getHoveredRegion(): string | null {
    return this._hoveredRegion
  }

  /**
   * Set the hovered marker
   */
  setHoveredMarker(index: string): void {
    this._hoveredMarker = index
  }

  /**
   * Get the hovered marker
   */
  getHoveredMarker(): string | null {
    return this._hoveredMarker
  }
}

export default Tooltip
