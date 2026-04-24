import { describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'

function createContainer(): HTMLElement {
  const c = document.createElement('div')
  c.style.width = '256px'
  c.style.height = '256px'
  document.body.appendChild(c)
  return c
}

function stampSize(map: TsMap, w: number, h: number): void {
  map._size = new Point(w, h)
  map._sizeChanged = false
}

describe('TsMap static image export', () => {
  test('toCanvas returns a canvas sized to the container', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    stampSize(map, 256, 256)
    const canvas = map.toCanvas()
    expect(canvas.tagName).toBe('CANVAS')
    // width accounts for DPR scaling (>= container size * dpr).
    expect(canvas.width).toBeGreaterThanOrEqual(256)
    expect(canvas.height).toBeGreaterThanOrEqual(256)
  })

  test('toDataURL returns a data URL', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    stampSize(map, 256, 256)
    const dataUrl = map.toDataURL()
    expect(typeof dataUrl).toBe('string')
    expect(dataUrl.startsWith('data:image/')).toBe(true)
  })

  test('toBlob resolves to a Blob or null', async () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    stampSize(map, 256, 256)
    const blob = await map.toBlob()
    // very-happy-dom may return null for toBlob; accept either.
    expect(blob === null || blob instanceof Blob).toBe(true)
  })

  test('_requestExportFrame is a no-op when no style is loaded', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    stampSize(map, 256, 256)
    expect(() => map._requestExportFrame()).not.toThrow()
  })
})
