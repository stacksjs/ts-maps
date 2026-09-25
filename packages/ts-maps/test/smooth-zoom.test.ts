import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { VectorTileMapLayer } from '../src/core-map/layer/tile/VectorTileMapLayer'
import { TsMap } from '../src/core-map/map/Map'
import '../src/core-map/map/handler/ScrollWheelZoomHandler'

// A slow trackpad zoom is dozens of frames a fraction of a pixel apart. Any
// rounding in the camera or in how labels are projected shows up as text
// shaking on the spot, so these check the maths is exact, not just close.

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

function makeMap(options: Record<string, unknown> = {}): TsMap {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const map = new TsMap(el, { center: [39.74, -104.99], zoom: 10, ...options })
  map._size = new Point(800, 600)
  map._sizeChanged = false
  map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
  return map
}

// The DOM under test has no `onwheel`, so the map listens for `mousewheel`.
const WHEEL = 'onwheel' in window ? 'wheel' : 'mousewheel'

function wheel(map: TsMap, at: Point, deltaY: number): WheelEvent {
  const e = new WheelEvent(WHEEL, { deltaY, deltaMode: 0, clientX: at.x, clientY: at.y, bubbles: true, cancelable: true })
  map.getContainer().dispatchEvent(e)
  return e
}

describe('pixel origin', () => {
  test('is whole at an integer zoom, where raster tiles are drawn one to one', () => {
    const map = makeMap()
    const origin = map._getNewPixelOrigin(map.getCenter(), 10)
    expect(Number.isInteger(origin.x)).toBe(true)
    expect(Number.isInteger(origin.y)).toBe(true)
  })

  test('is exact at a fractional zoom, so the camera does not step', () => {
    const map = makeMap()
    const center = map.getCenter()
    const origin = map._getNewPixelOrigin(center, 10.37)
    const exact = map.project(center, 10.37).subtract(map.getSize().divideBy(2))
    expect(origin.x).toBeCloseTo(exact.x, 9)
    expect(origin.y).toBeCloseTo(exact.y, 9)
  })
})

describe('slow scroll-wheel zoom', () => {
  test('holds the point under the cursor still to a hundredth of a pixel, every frame', () => {
    const map = makeMap()
    const anchor = new Point(317, 211)
    const target = map.containerPointToLatLng(anchor)
    let worst = 0
    map.on('zoom', () => {
      // `latLngToContainerPoint` rounds; compare on the exact projection.
      const exact = map.project(target).subtract(map.getPixelOrigin())
      worst = Math.max(worst, exact.distanceTo(anchor))
    })

    // A trackpad's worth of small deltas, a frame apart.
    for (let i = 0; i < 60; i++) {
      wheel(map, anchor, -2)
      pump()
    }
    for (let i = 0; i < 60 && queue.length; i++)
      pump()

    expect(map.getZoom()).toBeGreaterThan(10.1)
    expect(worst).toBeLessThan(0.01)
  })
})

describe('label projection', () => {
  function layerOn(map: TsMap): VectorTileMapLayer {
    const layer = new VectorTileMapLayer({ url: 'https://tiles/{z}/{x}/{y}.pbf', tileSize: 512 })
    ;(layer as any)._map = map
    return layer
  }

  test('matches the exact projection at a fractional zoom, with no rounding', () => {
    const map = makeMap()
    map._move(map.getCenter(), 10.4321, { round: false })
    const layer = layerOn(map)
    const coords = { x: 213, y: 388, z: 10 }
    const project = layer._tileProjector(coords)!

    for (const [x, y] of [[0, 0], [511, 3], [257.25, 400.5]]) {
      const latlng = map.unproject([coords.x * 512 + x, coords.y * 512 + y], coords.z)
      const exact = map.project(latlng).subtract(map.getPixelOrigin())
      const at = project(x, y)!
      expect(at.x).toBeCloseTo(exact.x, 6)
      expect(at.y).toBeCloseTo(exact.y, 6)
    }
  })

  test('moves a label steadily outward through a zoom, never back and forth', () => {
    const map = makeMap()
    const layer = layerOn(map)
    const anchor = new Point(400, 300)
    const target = map.containerPointToLatLng(anchor)
    // A label 30px right of the cursor, in whichever tile holds it: close
    // enough that each frame moves it by less than a pixel, which is where
    // rounding used to show.
    const world = map.project(target, 10).add([30, 0])
    const coords = { x: Math.floor(world.x / 512), y: Math.floor(world.y / 512), z: 10 }
    const local = { x: world.x - coords.x * 512, y: world.y - coords.y * 512 }

    let last: number | null = null
    for (let i = 1; i <= 80; i++) {
      const zoom = 10 + i * 0.004
      const offset = map.project(target, zoom).subtract(anchor.subtract(map.getSize().divideBy(2)))
      map._move(map.unproject(offset, zoom), zoom, { round: false })
      const at = layer._tileProjector(coords)!(local.x, local.y)!
      const distance = at.x - anchor.x
      if (last !== null)
        // Zooming in pushes everything away from the anchor: the distance
        // grows every frame, by about the same amount.
        expect(Math.abs(distance)).toBeGreaterThan(Math.abs(last))
      last = distance
    }
  })
})
