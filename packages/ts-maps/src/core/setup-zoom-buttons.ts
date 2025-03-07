import type { MapInterface } from '../types'
import EventHandler from '../event-handler'
import { createElement } from '../util'
import setScale from './set-scale'

export default function setupZoomButtons(this: MapInterface): void {
  const zoomin = createElement('div', 'jvm-zoom-btn jvm-zoomin', '&#43;', true)
  const zoomout = createElement('div', 'jvm-zoom-btn jvm-zoomout', '&#x2212', true)

  this.container.appendChild(zoomin)
  this.container.appendChild(zoomout)

  const handler = (zoomin = true) => {
    return () => setScale.call(
      this,
      zoomin ? this.scale * (this.params.zoomStep || 1.5) : this.scale / (this.params.zoomStep || 1.5),
      this._width / 2,
      this._height / 2,
      false,
      this.params.zoomAnimate,
    )
  }

  EventHandler.on(zoomin, 'click', handler())
  EventHandler.on(zoomout, 'click', handler(false))
}
