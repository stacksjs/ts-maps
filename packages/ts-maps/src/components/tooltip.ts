import type { MapInterface } from '../types'
import EventHandler from '../event-handler'
import {
  createElement,
  findElement,
} from '../util'
import BaseComponent from './base'

class Tooltip extends BaseComponent {
  private _map: MapInterface
  private _tooltip: HTMLElement
  private _hoveredRegion: string | null = null
  private _hoveredMarker: string | null = null

  constructor(map: MapInterface) {
    super()

    this._map = map
    this._tooltip = createElement('div', 'jvm-tooltip', '')
    this._tooltip.style.display = 'none'
    this._map.container.appendChild(this._tooltip)

    this._bindEventListeners()

    return this
  }

  _bindEventListeners(): void {
    EventHandler.on(this._map.container, 'mousemove', (e: Event) => {
      const event = e as MouseEvent
      if (!this._tooltip.classList.contains('active')) {
        return
      }

      const container = findElement(this._map.container, '#jvm-regions-group')?.getBoundingClientRect()
      if (!container)
        return

      const space = 5 // Space between the cursor and tooltip element

      // Tooltip
      const { height, width } = this._tooltip.getBoundingClientRect()
      const topIsPassed = event.clientY <= (container.top + height + space)
      let top = event.pageY - height - space
      let left = event.pageX - width - space

      // Ensure the tooltip will never cross outside the canvas area(map)
      if (topIsPassed) { // Top:
        top += height + space

        // The cursor is a bit larger from left side
        left -= space * 2
      }

      if (event.clientX < (container.left + width + space)) { // Left:
        left = event.pageX + space + 2

        if (topIsPassed) {
          left += space * 2
        }
      }

      this.css({ top: `${top}px`, left: `${left}px` })
    })
  }

  getElement(): HTMLElement {
    return this._tooltip
  }

  show(text: string): void {
    this._tooltip.style.display = 'block'
    this._tooltip.innerHTML = text
  }

  hide(): void {
    this._tooltip.style.display = 'none'
    this._hoveredRegion = null
    this._hoveredMarker = null
  }

  text(text: string): void {
    this._tooltip.innerHTML = text
  }

  css(css: Record<string, string>): this {
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
