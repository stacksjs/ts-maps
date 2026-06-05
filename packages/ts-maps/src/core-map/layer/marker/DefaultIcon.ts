import { MARKER_ICON_DATA_URI, MARKER_SHADOW_DATA_URI } from '../../assets/embedded-icons'
import * as DomUtil from '../../dom/DomUtil'
import { Icon } from './Icon'

function isAbsoluteIconUrl(url: string): boolean {
  return url.startsWith('data:')
    || url.startsWith('http://')
    || url.startsWith('https://')
    || url.startsWith('blob:')
    || url.startsWith('/')
}

export class DefaultIcon extends Icon {
  static imagePath?: string

  _getIconUrl(name: string): string {
    const url = super._getIconUrl(name)
    if (!url)
      return null as any

    if (isAbsoluteIconUrl(url))
      return url

    if (!DefaultIcon.imagePath)
      DefaultIcon.imagePath = this._detectIconPath()

    return (this.options!.imagePath || DefaultIcon.imagePath) + url
  }

  _stripUrl(path: string): string | null {
    const strip = (str: string, re: RegExp, idx: number): string | null => {
      const match = re.exec(str)
      return match && match[idx]
    }
    const p1 = strip(path, /^url\((['"])?(.+)\1\)$/, 2)
    if (!p1)
      return null
    if (p1.startsWith('data:'))
      return ''
    return strip(p1, /^(.*)marker-icon\.svg$/, 1)
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

DefaultIcon.setDefaultOptions({
  iconUrl: MARKER_ICON_DATA_URI,
  iconRetinaUrl: MARKER_ICON_DATA_URI,
  shadowUrl: MARKER_SHADOW_DATA_URI,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
})
