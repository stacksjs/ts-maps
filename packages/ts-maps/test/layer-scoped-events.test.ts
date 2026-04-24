import { describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'

function createContainer(): HTMLElement {
  const c = document.createElement('div')
  c.style.width = '400px'
  c.style.height = '400px'
  document.body.appendChild(c)
  return c
}

function stampSize(map: TsMap, w: number, h: number): void {
  map._size = new Point(w, h)
  map._sizeChanged = false
}

describe('TsMap layer-scoped events', () => {
  test('map.on(type, layerId, fn) only fires when queryRenderedFeatures hits that layer', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    stampSize(map, 400, 400)

    const calls: any[] = []
    map.on('click', 'roads', (e: any) => calls.push(e))

    // Stub queryRenderedFeatures to simulate a hit on `roads`.
    ;(map as any).queryRenderedFeatures = (_point: unknown, opts?: { layers?: string[] }) => {
      if (opts?.layers?.includes('roads'))
        return [{ feature: { properties: { name: 'Main St' } }, layer: { id: 'roads' }, tile: { x: 0, y: 0, z: 2 } }]
      return []
    }

    map.fire('click', { containerPoint: new Point(200, 200), originalEvent: {} })
    expect(calls.length).toBe(1)
    expect(calls[0].features.length).toBe(1)
    expect(calls[0].features[0].layer.id).toBe('roads')
  })

  test('scoped handler skipped when no feature hit', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    stampSize(map, 400, 400)

    const calls: any[] = []
    map.on('click', 'roads', () => calls.push(1))

    ;(map as any).queryRenderedFeatures = () => []

    map.fire('click', { containerPoint: new Point(10, 10), originalEvent: {} })
    expect(calls.length).toBe(0)
  })

  test('map.off with (type, layerId, fn) removes the handler', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    stampSize(map, 400, 400)

    const calls: any[] = []
    const fn = (): void => { calls.push(1) }
    map.on('click', 'roads', fn)

    ;(map as any).queryRenderedFeatures = () => [{ feature: {}, layer: {}, tile: {} }]

    map.fire('click', { containerPoint: new Point(200, 200), originalEvent: {} })
    expect(calls.length).toBe(1)

    map.off('click', 'roads', fn)
    map.fire('click', { containerPoint: new Point(200, 200), originalEvent: {} })
    expect(calls.length).toBe(1)
  })

  test('map.on(type, fn) still works — legacy signature unaffected', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    stampSize(map, 400, 400)

    const calls: any[] = []
    map.on('custom-event', (e: any) => calls.push(e))
    map.fire('custom-event', { detail: 'hello' })
    expect(calls.length).toBe(1)
    expect(calls[0].detail).toBe('hello')
  })

  test('map.once(type, layerId, fn) fires only once', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 2 })
    stampSize(map, 400, 400)
    ;(map as any).queryRenderedFeatures = () => [{ feature: {}, layer: {}, tile: {} }]

    const calls: any[] = []
    map.once('click', 'roads', () => calls.push(1))

    map.fire('click', { containerPoint: new Point(10, 10), originalEvent: {} })
    map.fire('click', { containerPoint: new Point(10, 10), originalEvent: {} })
    expect(calls.length).toBe(1)
  })
})
