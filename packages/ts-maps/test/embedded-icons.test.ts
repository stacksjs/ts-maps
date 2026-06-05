import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DefaultIcon, Marker } from '../src/core-map/index'
import { LAYERS_TOGGLE_DATA_URI, MARKER_ICON_DATA_URI } from '../src/core-map/assets/embedded-icons'

describe('embedded icons', () => {
  test('default marker uses bundled data URIs', () => {
    const icon = new DefaultIcon()
    expect(icon.options!.iconUrl).toBe(MARKER_ICON_DATA_URI)
    expect(icon.options!.iconUrl.startsWith('data:image/svg+xml,')).toBe(true)
    expect(icon._getIconUrl('icon')).toBe(MARKER_ICON_DATA_URI)
  })

  test('Marker with default icon does not request marker-icon.svg', () => {
    const m = new Marker([0, 0])
    const url = (m.options!.icon as DefaultIcon)._getIconUrl('icon')
    expect(url).not.toContain('marker-icon.svg')
    expect(url.startsWith('data:')).toBe(true)
  })

  test('styles.css has no unresolved images/ asset paths', () => {
    const cssPath = join(import.meta.dir, '../src/core-map/ts-maps.css')
    const css = readFileSync(cssPath, 'utf8')
    expect(css).not.toMatch(/url\(images\//)
    expect(css).toContain('data:image/svg+xml')
    expect(LAYERS_TOGGLE_DATA_URI.startsWith('data:')).toBe(true)
  })
})
