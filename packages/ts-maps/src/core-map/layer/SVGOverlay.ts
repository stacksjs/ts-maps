import * as Util from '../core/Util'
import { ImageOverlay } from './ImageOverlay'

export class SVGOverlay extends ImageOverlay {
  _initImage(): void {
    const el = this._image = this._url

    el.classList.add('tsmap-image-layer')
    if (this._zoomAnimated)
    el.classList.add('tsmap-zoom-animated')
    if (this.options!.className)
    el.classList.add(...Util.splitWords(this.options!.className))

    el.onselectstart = Util.falseFn
    el.onpointermove = Util.falseFn
  }
}
