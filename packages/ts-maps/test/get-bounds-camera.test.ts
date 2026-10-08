import { describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'

function createContainer(): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

// very-happy-dom has no layout, so the size is stamped in (as in bearing.test.ts).
function stampSize(map: TsMap, width: number, height: number): void {
  map._size = new Point(width, height)
  map._sizeChanged = false
  if (map._loaded && map._lastCenter)
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
}

function makeMap(zoom = 6): TsMap {
  const map = new TsMap(createContainer(), { center: [40, -100], zoom })
  stampSize(map, 800, 600)
  return map
}

describe('getBounds under a rotated or tilted camera', () => {
  test('flat and north-up: the pixel bounds, as before', () => {
    const map = makeMap()
    const px = map.getPixelBounds()
    const b = map.getBounds()
    expect(b.getSouthWest().equals(map.unproject(px.getBottomLeft()))).toBe(true)
    expect(b.getNorthEast().equals(map.unproject(px.getTopRight()))).toBe(true)
  })

  test('rotated: covers every corner of the view', () => {
    const map = makeMap()
    const flat = map.getBounds()
    map.setBearing(45)
    const b = map.getBounds()
    for (const corner of [[0, 0], [800, 0], [800, 600], [0, 600]])
      expect(b.contains(map.containerPointToLatLng(corner))).toBe(true)
    // A square turned 45° reaches further than the square itself.
    expect(b.getNorth() - b.getSouth()).toBeGreaterThan(flat.getNorth() - flat.getSouth())
    expect(b.getEast() - b.getWest()).toBeGreaterThan(flat.getEast() - flat.getWest())
  })

  test('tilted: reaches further north than the flat view, and contains the centre', () => {
    const map = makeMap()
    const flat = map.getBounds()
    map.setPitch(60)
    const b = map.getBounds()
    expect(b.getNorth()).toBeGreaterThan(flat.getNorth())
    expect(b.contains(map.getCenter())).toBe(true)
    for (const corner of [[0, 300], [800, 300], [800, 600], [0, 600]])
      expect(b.contains(map.containerPointToLatLng(corner))).toBe(true)
  })

  test('steeply tilted: the sky stops at legible ground, not the edge of the world', () => {
    const map = makeMap(14)
    map.setPitch(85)
    const b = map.getBounds()
    expect(Number.isFinite(b.getNorth())).toBe(true)
    // About 14 000 px of ground ahead at z14: a fraction of a degree, not the pole.
    expect(b.getNorth()).toBeLessThan(41)
    expect(b.getNorth()).toBeGreaterThan(map.getCenter().lat)
  })
})
