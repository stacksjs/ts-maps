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

describe('TsMap.setRenderer', () => {
  test('getPreferredRenderer defaults to canvas2d', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    expect(map.getPreferredRenderer()).toBe('canvas2d')
  })

  test('setRenderer updates the options and reports the new value', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    map.setRenderer('webgl')
    expect(map.getPreferredRenderer()).toBe('webgl')
    map.setRenderer('svg')
    expect(map.getPreferredRenderer()).toBe('svg')
  })

  test('fires rendererchange with the new name', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    stampSize(map, 256, 256)
    const events: any[] = []
    map.on('rendererchange', (e: any) => events.push(e))
    map.setRenderer('webgl')
    expect(events.length).toBe(1)
    expect(events[0].renderer).toBe('webgl')
  })

  test('is a no-op (but does not throw) when no style is loaded', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    expect(() => map.setRenderer('canvas2d')).not.toThrow()
  })
})
