import Browser from '../../core/Browser'
import { Class } from '../../core/Class'
import { setOptions } from '../../core/Util'
import { Point } from '../../geometry/Point'

export class Icon extends Class {
  initialize(options?: any): void {
    setOptions(this as any, options)
  }

  createIcon(oldIcon?: HTMLElement): HTMLElement | null {
    return this._createIcon('icon', oldIcon)
  }

  createShadow(oldIcon?: HTMLElement): HTMLElement | null {
    return this._createIcon('shadow', oldIcon)
  }

  _createIcon(name: string, oldIcon?: HTMLElement | null): HTMLElement | null {
    const src = this._getIconUrl(name)
    if (!src) {
      if (name === 'icon')
      throw new Error('iconUrl not set in Icon options (see the docs).')
      return null
    }

    const img = this._createImg(src, oldIcon && oldIcon.tagName === 'IMG' ? oldIcon as HTMLImageElement : null)
    this._setIconStyles(img, name)

    if (this.options!.crossOrigin || this.options!.crossOrigin === '')
    (img as HTMLImageElement).crossOrigin = this.options!.crossOrigin === true ? '' : this.options!.crossOrigin

    return img
  }

  _setIconStyles(img: HTMLElement, name: string): void {
    const options = this.options!
    let sizeOption = options[`${name}Size`]
    if (typeof sizeOption === 'number')
    sizeOption = [sizeOption, sizeOption]

    const size = Point.validate(sizeOption) && new Point(sizeOption)
    const anchorPosition = (name === 'shadow' && options.shadowAnchor) || options.iconAnchor || (size && (size as Point).divideBy(2)._round())
    const anchor = Point.validate(anchorPosition) && new Point(anchorPosition)

    img.className = `tsmap-marker-${name} ${options.className || ''}`

    if (anchor) {
      img.style.marginLeft = `${-(anchor as Point).x}px`
      img.style.marginTop = `${-(anchor as Point).y}px`
    }

    if (size) {
      img.style.width = `${(size as Point).x}px`
      img.style.height = `${(size as Point).y}px`
    }
  }

  _createImg(src: string, el?: HTMLImageElement | null): HTMLImageElement {
    el ??= document.createElement('img')
    el.src = src
    return el
  }

  _getIconUrl(name: string): string {
    return (Browser.retina && this.options![`${name}RetinaUrl`]) || this.options![`${name}Url`]
  }
}

Icon.setDefaultOptions( {
  popupAnchor: [0, 0],
  tooltipAnchor: [0, 0],
  crossOrigin: false,
})
