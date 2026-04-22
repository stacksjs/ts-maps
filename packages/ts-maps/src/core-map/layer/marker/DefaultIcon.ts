import * as DomUtil from '../../dom/DomUtil'
import { Icon } from './Icon'

export class DefaultIcon extends Icon {
  static imagePath?: string

  _getIconUrl(name: string): string {
    if (!DefaultIcon.imagePath)
    DefaultIcon.imagePath = this._detectIconPath()

    const url = super._getIconUrl(name)
    if (!url)
    return null as any

    return (this.options!.imagePath || DefaultIcon.imagePath) + url
  }

  _stripUrl(path: string): string | null {
    const strip = (str: string, re: RegExp, idx: number): string | null => {
      const match = re.exec(str)
      return match && match[idx]
    }
    const p1 = strip(path, /^url\((['"])?(.+)\1\)$/, 2)
    return p1 && strip(p1, /^(.*)marker - icon\.svg$/, 1)
  }

  _detectIconPath(): string {
    const el = DomUtil.create('div', 'tsmap-default-icon-path', document.body)
    const path = this._stripUrl(getComputedStyle(el).backgroundImage)
    document.body.removeChild(el)
    if (path)
    return path
    const link = document.querySelector('link[href$="ts-maps.css"]') as HTMLLinkElement | null
    if (!link)
    return ''
    return link.href.substring(0, link.href.length - 'ts-maps.css'.length - 1)
  }
}

DefaultIcon.setDefaultOptions( {
  iconUrl: 'marker-icon.svg',
  iconRetinaUrl: 'marker-icon.svg',
  shadowUrl: 'marker-shadow.svg',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
})
