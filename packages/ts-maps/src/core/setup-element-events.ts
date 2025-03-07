import type { MapInterface } from '../types'
import Events from '../defaults/events'
import EventHandler from '../event-handler'
import { getElement } from '../util'

interface ElementWithInteraction {
  hover: (state: boolean) => void
  select: (state: boolean) => void
  isSelected: boolean
  isHovered?: boolean
  shape: {
    [key: string]: any
    updateStyle: () => void
  }
}

interface ParseEventResult {
  type: 'region' | 'marker'
  code: string
  event: string
  element: ElementWithInteraction
  tooltipText: string
}

function parseEvent(map: MapInterface, selector: Element | string, isTooltip?: boolean): ParseEventResult {
  const element = getElement(selector)
  const type = !element?.getAttribute('class')?.includes('jvm-region') ? 'marker' : 'region'
  const isRegion = type === 'region'
  const code = isRegion ? element?.getAttribute('data-code') : element?.getAttribute('data-index')

  if (!code) {
    throw new Error('Element does not have required data attribute')
  }

  let event = isRegion ? Events.onRegionSelected : Events.onMarkerSelected

  // Init tooltip event
  if (isTooltip) {
    event = isRegion ? Events.onRegionTooltipShow : Events.onMarkerTooltipShow
  }

  const elementObj = isRegion ? map.regions[code] : map._markers?.[code]
  if (!elementObj) {
    throw new Error(`Element with code ${code} not found`)
  }

  // For regions, we use the element property directly
  // For markers, we use the element property which is a MarkerInstance
  const interactiveElement = isRegion ? elementObj : elementObj.element

  return {
    type,
    code,
    event,
    element: interactiveElement as unknown as ElementWithInteraction,
    tooltipText: isRegion ? map._mapData.paths[code].name || '' : (map._markers?.[code]?.config.name || ''),
  }
}

export default function setupElementEvents(this: MapInterface): void {
  const container = this.container
  let pageX: number | undefined
  let pageY: number | undefined
  let mouseMoved = false

  EventHandler.on(container, 'mousemove', ((e: Event) => {
    const mouseEvent = e as MouseEvent
    if (Math.abs((pageX || 0) - mouseEvent.pageX) + Math.abs((pageY || 0) - mouseEvent.pageY) > 2) {
      mouseMoved = true
    }
  }) as EventListener)

  // When the mouse is pressed
  EventHandler.delegate(container, 'mousedown', '.jvm-element', ((e: Event) => {
    const mouseEvent = e as MouseEvent
    pageX = mouseEvent.pageX
    pageY = mouseEvent.pageY
    mouseMoved = false
  }) as EventListener)

  // When the mouse is over the region/marker | When the mouse is out the region/marker
  EventHandler.delegate(container, 'mouseover mouseout', '.jvm-element', ((e: Event) => {
    const data = parseEvent(this, (e.target as Element), true)
    const { showTooltip } = this.params
    const tooltip = this._tooltip

    if (e.type === 'mouseover') {
      data.element.hover(true)

      if (showTooltip && tooltip) {
        tooltip.text(data.tooltipText)
        tooltip.show(data.tooltipText)
        this._emit(data.event, [e, tooltip.getElement(), data.code])
      }
    }
    else {
      data.element.hover(false)

      if (showTooltip && tooltip) {
        tooltip.hide()
      }
    }
  }) as EventListener)

  // When the click is released
  EventHandler.delegate(container, 'mouseup', '.jvm-element', ((e: Event) => {
    const data = parseEvent(this, (e.target as Element), false)

    if (mouseMoved) {
      return
    }

    if (
      (data.type === 'region' && this.params.regionsSelectable)
      || (data.type === 'marker' && this.params.markersSelectable)
    ) {
      const element = data.element

      // We're checking if regions/markers|SelectableOne option is presented
      if (this.params[`${data.type}sSelectableOne`]) {
        data.type === 'region' ? this.clearSelectedRegions() : this.clearSelectedMarkers()
      }

      if (data.element.isSelected) {
        element.select(false)
      }
      else {
        element.select(true)
      }

      this._emit(data.event, [
        data.code,
        element.isSelected,
        data.type === 'region'
          ? this.getSelectedRegions()
          : this.getSelectedMarkers(),
      ])
    }
  }) as EventListener)

  // When region/marker is clicked
  EventHandler.delegate(container, 'click', '.jvm-element', ((e: Event) => {
    const { type, code } = parseEvent(this, (e.target as Element), false)

    this._emit(
      type === 'region' ? Events.onRegionClick : Events.onMarkerClick,
      [e, code],
    )
  }) as EventListener)
}
