import { describe, expect, test } from 'bun:test'
import { TileLayer } from '../src/core-map/layer/tile/TileLayer'
import { TsMap } from '../src/core-map/map/Map'

function createContainer(): HTMLElement {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  return container
}

describe('fractional zoom', () => {
  test('zoomSnap defaults to 0 (fractional zoom on)', () => {
    const container = createContainer()
    const map = new TsMap(container)
    expect(map.options.zoomSnap).toBe(0)
  })

  test('setView with a fractional zoom preserves the exact value', () => {
    const container = createContainer()
    const map = new TsMap(container, { zoomSnap: 0 })
    map.setView([0, 0], 3.5)

    expect(map.getZoom()).toBe(3.5)
    expect(map._zoom).toBe(3.5)
    expect(map._loaded).toBe(true)
  })

  test('tile layer clamps fractional zoom to an integer for tile loading', () => {
    const layer = new TileLayer('https://example.com/{z}/{x}/{y}.png', {
      minZoom: 0,
      maxZoom: 18,
    })

    // _clampZoom in TileLayer wraps GridLayer._clampZoom in Math.round.
    // This is the same logic that drives `_tileZoom` inside `_setView`, so we
    // verify the clamp directly here (no need to initialize the overlay).
    expect(layer._clampZoom(3.5)).toBe(4)
    expect(layer._clampZoom(3.4)).toBe(3)
    expect(layer._clampZoom(3.0)).toBe(3)
  })

  test('getZoomScale between fractional display zoom and integer tile zoom', () => {
    const container = createContainer()
    const map = new TsMap(container, { zoomSnap: 0 })
    map.setView([0, 0], 3.5)

    // Display zoom 3.5 with tile zoom 3 should scale the tile container by
    // 2 ** 0.5 — that's the same math GridLayer uses in _setZoomTransform.
    expect(map.getZoomScale(3.5, 3)).toBe(2 ** 0.5)
  })

  test('zoomSnap: 1 (classic Leaflet) still snaps to integers via _limitZoom', () => {
    const container = createContainer()
    const map = new TsMap(container, { zoomSnap: 1 })
    map.setView([0, 0], 3.5)

    expect(map.getZoom()).toBe(4)
  })
})
