import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'

// Frames are pumped by hand, so every intermediate camera can be inspected.
let queue: Array<(t: number) => void> = []
let clock = 0
const realRaf = globalThis.requestAnimationFrame
const realCancel = globalThis.cancelAnimationFrame

beforeEach(() => {
  queue = []
  clock = 0
  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => { queue.push(cb); return queue.length }) as any
  globalThis.cancelAnimationFrame = ((id: number) => { queue[id - 1] = () => {} }) as any
})

afterEach(() => {
  globalThis.requestAnimationFrame = realRaf
  globalThis.cancelAnimationFrame = realCancel
})

function pump(ms = 16): void {
  clock += ms
  const due = queue
  queue = []
  for (const cb of due) cb(clock)
}

function makeMap(): TsMap {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const map = new TsMap(el, { center: [37.77, -122.42], zoom: 12 })
  map._size = new Point(800, 600)
  map._sizeChanged = false
  map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
  return map
}

describe('animated zoom', () => {
  test('zooming around a point holds that point still on every frame', () => {
    const map = makeMap()
    const anchor = new Point(620, 150)
    const target = map.containerPointToLatLng(anchor)

    const zooms: number[] = []
    map.on('zoom', () => {
      zooms.push(map.getZoom())
      // Within the pixel origin's whole-pixel rounding.
      const drift = map.latLngToContainerPoint(target).distanceTo(anchor)
      expect(drift).toBeLessThanOrEqual(1.5)
    })

    map.setZoomAround(anchor, 13)
    for (let i = 0; i < 40 && queue.length; i++)
      pump()

    expect(map.getZoom()).toBeCloseTo(13, 6)
    // Intermediate cameras, not a jump: this is what lets labels follow.
    expect(zooms.some(z => z > 12.05 && z < 12.95)).toBe(true)
    expect(map.latLngToContainerPoint(target).distanceTo(anchor)).toBeLessThanOrEqual(1.5)
  })

  test('zoomIn pressed during a zoom counts from where it is heading', () => {
    const map = makeMap()
    map.zoomIn()
    pump()
    pump()
    map.zoomIn()
    for (let i = 0; i < 40 && queue.length; i++)
      pump()
    expect(map.getZoom()).toBeCloseTo(14, 6)
  })

  test('the zoom fires zoomstart once, zoom per frame, and zoomend once', () => {
    const map = makeMap()
    const events: string[] = []
    map.on('zoomstart', () => events.push('zoomstart'))
    map.on('zoomend', () => events.push('zoomend'))
    map.setZoom(13)
    for (let i = 0; i < 40 && queue.length; i++)
      pump()
    expect(events).toEqual(['zoomstart', 'zoomend'])
  })
})
