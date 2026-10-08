import { afterEach, describe, expect, test } from 'bun:test'
import { densestCell, HeatmapLayer } from '../src/core-map/layer/HeatmapLayer'
import { Map } from '../src/core-map/map/Map'

function createContainer(): HTMLElement {
  const el = document.createElement('div')
  el.style.width = '400px'
  el.style.height = '300px'
  document.body.appendChild(el)
  return el
}

const cleanup: HTMLElement[] = []
afterEach(() => {
  for (const c of cleanup.splice(0)) c.remove()
})

function makeMap(): Map {
  const c = createContainer()
  cleanup.push(c)
  return new Map(c, { center: [40, -74], zoom: 5 })
}

describe('HeatmapLayer', () => {
  test('constructs with defaults', () => {
    const layer = new HeatmapLayer()
    expect(layer.options!.radius).toBe(25)
    expect(layer.options!.blur).toBe(15)
    // No max: it scales to the densest spot in view.
    expect(layer.options!.max).toBeUndefined()
  })

  test('scales to its data: the densest spot sets the top of the ramp', () => {
    const cluster = Array.from({ length: 40 }, () => ({ x: 100, y: 100, weight: 1 }))
    const lone = { x: 300, y: 300, weight: 1 }
    expect(densestCell([...cluster, lone], 25, 400, 400)).toBe(40)
    // A spot reads 1 − 0.05^(its weight / peak): the cluster near the top,
    // a lone point far down the ramp rather than red.
    const reads = (total: number): number => 1 - 0.05 ** (total / 40)
    expect(reads(40)).toBeCloseTo(0.95)
    expect(reads(1)).toBeLessThan(0.1)
    // Off screen does not count, but one heavy point is a floor.
    expect(densestCell([{ x: -500, y: 0, weight: 3 }, { x: 10, y: 10, weight: 2 }], 25, 400, 400)).toBe(3)
    expect(densestCell([], 25, 400, 400)).toBe(1)
  })

  test('accepts initial data in options', () => {
    const layer = new HeatmapLayer({
      data: [
        { lat: 40, lng: -74, weight: 0.5 },
        { lat: 41, lng: -73 },
      ],
    })
    expect((layer as any)._data.length).toBe(2)
  })

  test('addPoint appends to the data set', () => {
    const layer = new HeatmapLayer()
    layer.addPoint({ lat: 10, lng: 20 })
    layer.addPoint({ lat: 11, lng: 21, weight: 0.9 })
    expect((layer as any)._data.length).toBe(2)
  })

  test('clearData empties the layer', () => {
    const layer = new HeatmapLayer({ data: [{ lat: 0, lng: 0 }] })
    expect((layer as any)._data.length).toBe(1)
    layer.clearData()
    expect((layer as any)._data.length).toBe(0)
  })

  test('setOptions merges and invalidates the gradient cache', () => {
    const layer = new HeatmapLayer()
    ;(layer as any)._gradientTexture = new Uint8ClampedArray(1024)
    layer.setOptions({ gradient: { 0: 'red', 1: 'blue' } })
    // Gradient cache cleared; next _colourRamp() call will rebuild.
    expect((layer as any)._gradientTexture).toBeUndefined()
  })

  test('addTo a map links the layer and creates a canvas', () => {
    const map = makeMap()
    const layer = new HeatmapLayer({ data: [{ lat: 40, lng: -74 }] })
    layer.addTo(map)
    expect(layer._map).toBe(map)
    expect(layer._canvas).toBeDefined()
    expect(layer._canvas?.tagName).toBe('CANVAS')
  })

  test('setData re-points the underlying array', () => {
    const layer = new HeatmapLayer({ data: [{ lat: 0, lng: 0 }] })
    layer.setData([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }])
    expect((layer as any)._data.length).toBe(2)
    expect((layer as any)._data[0].lat).toBe(1)
  })
})
