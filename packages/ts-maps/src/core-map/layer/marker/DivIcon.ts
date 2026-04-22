import { Point } from '../../geometry/Point'
import { Icon } from './Icon'

export class DivIcon extends Icon {
  createIcon(oldIcon?: HTMLElement): HTMLElement {
    const div = (oldIcon && oldIcon.tagName === 'DIV') ? oldIcon as HTMLDivElement : document.createElement('div')
    const options = this.options!

    if (options.html instanceof Element) {
      div.replaceChildren()
      div.appendChild(options.html)
    }
    else {
      div.innerHTML = options.html !== false ? options.html : ''
    }

    if (options.bgPos) {
      const bgPos = new Point(options.bgPos)
      div.style.backgroundPosition = `${-bgPos.x}px ${-bgPos.y}px`
    }
    this._setIconStyles(div, 'icon')
    return div
  }

  createShadow(): HTMLElement | null {
    return null
  }
}

DivIcon.setDefaultOptions( {
  iconSize: [12, 12],
  html: false,
  bgPos: null,
  className: 'tsmap-div-icon',
})
