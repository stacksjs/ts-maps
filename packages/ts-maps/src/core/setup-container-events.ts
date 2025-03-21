import type { MapInterface } from '../types'
import EventHandler from '../event-handler'
import setScale from './set-scale'

export default function setupContainerEvents(this: MapInterface): void {
  let mouseDown = false
  let oldPageX: number | undefined
  let oldPageY: number | undefined

  if (this.params.draggable) {
    EventHandler.on(this.container, 'mousemove', ((e) => {
      if (!mouseDown) {
        return false
      }

      const mouseEvent = e as MouseEvent
      if (oldPageX !== undefined && oldPageY !== undefined) {
        this.transX -= (oldPageX - mouseEvent.pageX) / this.scale
        this.transY -= (oldPageY - mouseEvent.pageY) / this.scale

        this._applyTransform()
      }
      oldPageX = mouseEvent.pageX
      oldPageY = mouseEvent.pageY
    }) as EventListener)

    EventHandler.on(this.container, 'mousedown', ((e) => {
      mouseDown = true
      const mouseEvent = e as MouseEvent
      oldPageX = mouseEvent.pageX
      oldPageY = mouseEvent.pageY
      return false
    }) as EventListener)

    EventHandler.on(document.body, 'mouseup', () => {
      mouseDown = false
    })
  }

  if (this.params.zoomOnScroll) {
    EventHandler.on(this.container, 'wheel', ((e) => {
      const wheelEvent = e as WheelEvent
      const deltaY = (((wheelEvent.deltaY || 0) >> 10) || 1) * 75
      const rect = this.container.getBoundingClientRect()
      const offsetX = wheelEvent.pageX - rect.left - window.scrollX
      const offsetY = wheelEvent.pageY - rect.top - window.scrollY
      const zoomStep = (1 + ((this.params.zoomOnScrollSpeed || 3) / 1000)) ** (-1.5 * deltaY)

      setScale.call(this, this.scale * zoomStep, offsetX, offsetY)
      e.preventDefault()
    }) as EventListener)
  }
}
