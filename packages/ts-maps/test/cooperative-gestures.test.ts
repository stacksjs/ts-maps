import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'
import { CooperativeGesturesHandler } from '../src/core-map/map/handler/CooperativeGesturesHandler'
import '../src/core-map/map/handler/DragHandler'
import '../src/core-map/map/handler/ScrollWheelZoomHandler'

let queue: Array<(t: number) => void> = []
let clock = 0
const realRaf = globalThis.requestAnimationFrame
const realCancel = globalThis.cancelAnimationFrame
const containers: HTMLElement[] = []

beforeEach(() => {
  queue = []
  clock = 0
  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => { queue.push(cb); return queue.length }) as any
  globalThis.cancelAnimationFrame = ((id: number) => { queue[id - 1] = () => {} }) as any
})

afterEach(() => {
  globalThis.requestAnimationFrame = realRaf
  globalThis.cancelAnimationFrame = realCancel
  for (const c of containers.splice(0)) c.remove()
})

function settle(): void {
  for (let i = 0; i < 200 && queue.length; i++) {
    clock += 16
    const due = queue
    queue = []
    for (const cb of due) cb(clock)
  }
}

function makeMap(options: Record<string, unknown> = {}): TsMap {
  const el = document.createElement('div')
  document.body.appendChild(el)
  containers.push(el)
  const map = new TsMap(el, { center: [39.74, -104.99], zoom: 10, ...options })
  map._size = new Point(800, 600)
  map._sizeChanged = false
  return map
}

// The DOM under test has no `onwheel`, so the map listens for `mousewheel`.
const WHEEL = 'onwheel' in window ? 'wheel' : 'mousewheel'

function wheel(map: TsMap, init: WheelEventInit = {}): WheelEvent {
  const e = new WheelEvent(WHEEL, { deltaY: -120, deltaMode: 0, clientX: 400, clientY: 300, bubbles: true, cancelable: true, ...init })
  map.getContainer().dispatchEvent(e)
  settle()
  return e
}

function hint(map: TsMap): HTMLElement | null {
  return map.getContainer().querySelector('.tsmap-cooperative-hint')
}

describe('cooperativeGestures', () => {
  test('is off by default: the wheel zooms the map and the page does not scroll', () => {
    const map = makeMap()
    const e = wheel(map)
    expect(e.defaultPrevented).toBe(true)
    expect(map.getZoom()).toBeGreaterThan(10.5)
    expect(hint(map)).toBeNull()
  })

  test('a plain wheel scrolls the page, leaves the map alone, and says why', () => {
    const map = makeMap({ cooperativeGestures: true })
    expect(map.cooperativeGestures).toBeInstanceOf(CooperativeGesturesHandler)
    const e = wheel(map)
    expect(e.defaultPrevented).toBe(false)
    expect(map.getZoom()).toBe(10)
    expect(hint(map)?.classList.contains('tsmap-visible')).toBe(true)
    expect(hint(map)?.textContent).toMatch(/(⌘|Ctrl) \+ scroll to zoom/)
  })

  test('⌘ or Ctrl + wheel zooms, and so does a trackpad pinch', () => {
    for (const init of [{ metaKey: true }, { ctrlKey: true }] as WheelEventInit[]) {
      const map = makeMap({ cooperativeGestures: true })
      const e = wheel(map, init)
      expect(e.defaultPrevented).toBe(true)
      expect(map.getZoom()).toBeGreaterThan(10)
      expect(hint(map)?.classList.contains('tsmap-visible')).toBe(false)
    }
  })

  test('in fullscreen the map is the page, and the wheel zooms it directly', () => {
    const map = makeMap({ cooperativeGestures: true })
    map.getContainer().classList.add('tsmap-pseudo-fullscreen')
    const e = wheel(map)
    expect(e.defaultPrevented).toBe(true)
    expect(map.getZoom()).toBeGreaterThan(10.5)
  })

  test('one finger is left to the page; a mouse still drags the map', () => {
    const map = makeMap({ cooperativeGestures: true })
    const draggable = map.dragging._draggable
    expect(draggable._shouldStart({ pointerType: 'touch' } as PointerEvent)).toBe(false)
    expect(draggable._shouldStart({ pointerType: 'mouse' } as PointerEvent)).toBe(true)
    expect(map.getContainer().classList.contains('tsmap-cooperative')).toBe(true)

    const plain = makeMap()
    expect(plain.dragging._draggable._shouldStart({ pointerType: 'touch' } as PointerEvent)).toBe(true)
  })

  test('the hint can be reworded, and goes away with the option', () => {
    const map = makeMap({ cooperativeGestures: { wheelHint: 'Zoom: {key} + molette' } })
    wheel(map)
    expect(hint(map)?.textContent).toMatch(/^Zoom: (⌘|Ctrl) \+ molette$/)

    map.cooperativeGestures.disable()
    expect(hint(map)).toBeNull()
    expect(map.getContainer().classList.contains('tsmap-cooperative')).toBe(false)
    expect(wheel(map).defaultPrevented).toBe(true)
  })
})
