import type { MapInterface } from '../types'
import EventHandler from '../event-handler'
import setScale from './set-scale'

export default function setupContainerTouchEvents(this: MapInterface): void {
  let touchStartScale = 1
  let touchStartDistance = 0
  let centerTouchX = 0
  let centerTouchY = 0
  let lastTouchesLength = 0
  let touchStartX = 0
  let touchStartY = 0
  let offset = { top: 0, left: 0 }

  const handleTouchEvent = (e: TouchEvent) => {
    const touches = e.touches
    let currentScale = this.scale

    if (touches.length === 1) {
      if (lastTouchesLength === 1) {
        const touch = touches[0]
        if (touchStartScale === currentScale) {
          this.transX -= (touchStartX - touch.pageX) / currentScale
          this.transY -= (touchStartY - touch.pageY) / currentScale
          this.canvas.applyTransformParams(currentScale, this.transX, this.transY)
        }
        touchStartX = touch.pageX
        touchStartY = touch.pageY
      }
    }
    else if (touches.length === 2) {
      if (lastTouchesLength === 2) {
        currentScale = Math.sqrt(
          (touches[0].pageX - touches[1].pageX) ** 2
          + (touches[0].pageY - touches[1].pageY) ** 2,
        ) / touchStartDistance

        setScale.call(this, touchStartScale * currentScale, centerTouchX, centerTouchY, false, false)
        e.preventDefault()
      }
      else {
        const rect = this.container.getBoundingClientRect()
        offset = {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
        }

        centerTouchX = touches[0].pageX > touches[1].pageX
          ? touches[1].pageX + (touches[0].pageX - touches[1].pageX) / 2
          : touches[0].pageX + (touches[1].pageX - touches[0].pageX) / 2

        centerTouchY = touches[0].pageY > touches[1].pageY
          ? touches[1].pageY + (touches[0].pageY - touches[1].pageY) / 2
          : touches[0].pageY + (touches[1].pageY - touches[0].pageY) / 2

        centerTouchX -= offset.left
        centerTouchY -= offset.top
        touchStartScale = this.scale

        touchStartDistance = Math.sqrt(
          (touches[0].pageX - touches[1].pageX) ** 2
          + (touches[0].pageY - touches[1].pageY) ** 2,
        )
      }
    }

    lastTouchesLength = touches.length
  }

  EventHandler.on(this.container, 'touchstart', handleTouchEvent as EventListener)
  EventHandler.on(this.container, 'touchmove', handleTouchEvent as EventListener)
}
