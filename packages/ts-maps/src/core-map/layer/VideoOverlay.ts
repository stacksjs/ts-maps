import * as Util from '../core/Util'
import * as DomEvent from '../dom/DomEvent'
import * as DomUtil from '../dom/DomUtil'
import { ImageOverlay } from './ImageOverlay'

export class VideoOverlay extends ImageOverlay {
  _initImage(): void {
    const wasElementSupplied = this._url.tagName === 'VIDEO'
    const vid = this._image = wasElementSupplied ? this._url : DomUtil.create('video')

    vid.classList.add('tsmap-image-layer')
    if (this._zoomAnimated)
    vid.classList.add('tsmap-zoom-animated')
    if (this.options!.className)
    vid.classList.add(...Util.splitWords(this.options!.className))

    DomEvent.on(vid, 'pointerdown', (e: any) => {
      if (vid.controls)
      DomEvent.stopPropagation(e)
    })

    vid.onloadeddata = this.fire.bind(this, 'load')

    if (wasElementSupplied) {
      const sourceElements = Array.from(vid.getElementsByTagName('source')) as HTMLSourceElement[]
      const sources = sourceElements.map(e => e.src)
      this._url = sourceElements.length > 0 ? sources : [vid.src]
      return
    }

    if (!Array.isArray(this._url))
    this._url = [this._url]

    if (!this.options!.keepAspectRatio && Object.hasOwn(vid.style, 'objectFit'))
    vid.style.objectFit = 'fill'
    vid.autoplay = !!this.options!.autoplay
    vid.controls = !!this.options!.controls
    vid.loop = !!this.options!.loop
    vid.muted = !!this.options!.muted
    vid.playsInline = !!this.options!.playsInline
    for (const url of this._url) {
      const source = DomUtil.create('source') as HTMLSourceElement
      source.src = url
      vid.appendChild(source)
    }
  }
}

VideoOverlay.setDefaultOptions( {
  autoplay: true,
  controls: false,
  loop: true,
  keepAspectRatio: true,
  muted: false,
  playsInline: true,
})
