import { afterEach, describe, expect, test } from 'bun:test'
import * as PointerEvents from '../src/core-map/dom/DomEvent.PointerEvents'
import { Draggable } from '../src/core-map/dom/Draggable'
import { Point } from '../src/core-map/geometry/Point'
import { Map } from '../src/core-map/map/Map'
import { DragRotateHandler } from '../src/core-map/map/handler/DragRotateHandler'
import '../src/core-map/map/handler/BoxZoomHandler'
import '../src/core-map/map/handler/DragHandler'

const containers: HTMLElement[] = []
const maps: Map[] = []

afterEach(() => {
  for (const m of maps.splice(0)) m.dragRotate.disable()
  for (const c of containers.splice(0)) c.remove()
  PointerEvents.cleanupPointers()
  Draggable._dragging = false
})

function makeMap(options: Record<string, unknown> = {}): Map {
  const el = document.createElement('div')
  el.style.width = '800px'
  el.style.height = '600px'
  document.body.appendChild(el)
  containers.push(el)
  const map = new Map(el, { center: [39.74, -104.99], zoom: 10, ...options })
  map._size = new Point(800, 600)
  map._sizeChanged = false
  maps.push(map)
  return map
}

function pointer(map: Map, type: string, x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  const e = new PointerEvent(type, {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  map.getContainer().dispatchEvent(e)
  return e
}

function contextMenu(map: Map): MouseEvent {
  const e = new MouseEvent('contextmenu', { button: 2, clientX: 400, clientY: 300, bubbles: true, cancelable: true })
  map.getContainer().dispatchEvent(e)
  return e
}

/** Press at (400, 300), move by (dx, dy) in two steps, release. */
function drag(map: Map, dx: number, dy: number, init: PointerEventInit = {}): void {
  pointer(map, 'pointerdown', 400, 300, init)
  pointer(map, 'pointermove', 400 + dx / 2, 300 + dy / 2, init)
  pointer(map, 'pointermove', 400 + dx, 300 + dy, init)
  pointer(map, 'pointerup', 400 + dx, 300 + dy, init)
}

const RIGHT: PointerEventInit = { button: 2 }
const ALT: PointerEventInit = { button: 0, altKey: true }

/** Counts every event named, in the order they fire. */
function record(map: Map, names: string[]): { log: string[], count: (name: string) => number } {
  const log: string[] = []
  for (const name of names)
    map.on(name, () => { log.push(name) })
  return { log, count: name => log.filter(n => n === name).length }
}

describe('DragRotateHandler', () => {
  test('is on every map as dragRotate, enabled, and tilts by default', () => {
    const map = makeMap()
    expect(map.dragRotate).toBeInstanceOf(DragRotateHandler)
    expect(map.dragRotate.enabled()).toBe(true)
    expect(map.options.dragRotate).toBe(true)
    expect(map.options.pitchWithRotate).toBe(true)
  })

  test('a right-drag turns and tilts the map by the distance dragged', () => {
    const map = makeMap({ bearing: 10, pitch: 20 })
    drag(map, 100, -80, RIGHT)
    // 0.3° of bearing per pixel across, 0.25° of pitch per pixel up.
    expect(map.getBearing()).toBeCloseTo(40, 6)
    expect(map.getPitch()).toBeCloseTo(40, 6)
  })

  test('dragging left and down turns the other way and tilts back', () => {
    const map = makeMap({ bearing: 10, pitch: 40 })
    drag(map, -100, 80, RIGHT)
    // Bearing wraps into [0, 360).
    expect(map.getBearing()).toBeCloseTo(340, 6)
    expect(map.getPitch()).toBeCloseTo(20, 6)
  })

  test('Alt + left-drag does the same', () => {
    const map = makeMap({ bearing: 10, pitch: 20 })
    drag(map, 100, -80, ALT)
    expect(map.getBearing()).toBeCloseTo(40, 6)
    expect(map.getPitch()).toBeCloseTo(40, 6)
  })

  test('a plain left drag does not rotate or tilt', () => {
    const map = makeMap({ bearing: 10, pitch: 20 })
    drag(map, 100, -80)
    expect(map.getBearing()).toBe(10)
    expect(map.getPitch()).toBe(20)
  })

  test('Shift + left-drag is box zoom\'s, with or without Alt', () => {
    const map = makeMap({ bearing: 10, pitch: 20 })
    const events = record(map, ['rotatestart', 'pitchstart'])
    pointer(map, 'pointerdown', 400, 300, { shiftKey: true, altKey: true })
    pointer(map, 'pointermove', 500, 220, { shiftKey: true, altKey: true })
    expect(map.getBearing()).toBe(10)
    expect(map.getPitch()).toBe(20)
    expect(events.log).toEqual([])
    pointer(map, 'pointerup', 500, 220, { shiftKey: true, altKey: true })
  })

  test('pitch is clamped to minPitch and maxPitch', () => {
    const map = makeMap({ pitch: 30, minPitch: 10, maxPitch: 45 })
    drag(map, 0, -400, RIGHT)
    expect(map.getPitch()).toBe(45)
    drag(map, 0, 400, RIGHT)
    expect(map.getPitch()).toBe(10)
  })

  test('pitchWithRotate: false leaves the pitch alone', () => {
    const map = makeMap({ bearing: 10, pitch: 20, pitchWithRotate: false })
    const events = record(map, ['pitchstart', 'pitch', 'pitchend', 'rotatestart', 'rotateend'])
    drag(map, 100, -80, RIGHT)
    expect(map.getBearing()).toBeCloseTo(40, 6)
    expect(map.getPitch()).toBe(20)
    expect(events.log).toEqual(['rotatestart', 'rotateend'])
  })

  test('dragRotate: false does nothing, and leaves the context menu alone', () => {
    const map = makeMap({ bearing: 10, pitch: 20, dragRotate: false })
    expect(map.dragRotate.enabled()).toBe(false)

    const down = pointer(map, 'pointerdown', 400, 300, RIGHT)
    pointer(map, 'pointermove', 500, 220, RIGHT)
    pointer(map, 'pointerup', 500, 220, RIGHT)
    expect(down.defaultPrevented).toBe(false)
    expect(map.getBearing()).toBe(10)
    expect(map.getPitch()).toBe(20)

    expect(contextMenu(map).defaultPrevented).toBe(false)
  })

  test('while enabled, the browser\'s context menu does not open on the map', () => {
    const map = makeMap()
    expect(contextMenu(map).defaultPrevented).toBe(true)
  })

  test('disable() and enable() take effect at runtime', () => {
    const map = makeMap({ bearing: 10, pitch: 20 })

    map.dragRotate.disable()
    expect(map.dragRotate.enabled()).toBe(false)
    drag(map, 100, -80, RIGHT)
    expect(map.getBearing()).toBe(10)
    expect(map.getPitch()).toBe(20)
    expect(contextMenu(map).defaultPrevented).toBe(false)

    map.dragRotate.enable()
    expect(map.dragRotate.enabled()).toBe(true)
    drag(map, 100, -80, RIGHT)
    expect(map.getBearing()).toBeCloseTo(40, 6)
    expect(map.getPitch()).toBeCloseTo(40, 6)
    expect(contextMenu(map).defaultPrevented).toBe(true)
  })

  test('disable() in the middle of a drag ends it', () => {
    const map = makeMap({ bearing: 10 })
    const events = record(map, ['rotateend', 'moveend'])
    pointer(map, 'pointerdown', 400, 300, RIGHT)
    pointer(map, 'pointermove', 450, 300, RIGHT)
    map.dragRotate.disable()
    expect(events.log).toEqual(['moveend', 'rotateend'])
    pointer(map, 'pointermove', 500, 300, RIGHT)
    expect(map.getBearing()).toBeCloseTo(25, 6)
  })

  test('start and end events fire once each, and moveend comes at the end', () => {
    const map = makeMap({ bearing: 10, pitch: 20 })
    const events = record(map, ['movestart', 'move', 'moveend', 'rotatestart', 'rotate', 'rotateend', 'pitchstart', 'pitch', 'pitchend'])

    pointer(map, 'pointerdown', 400, 300, RIGHT)
    expect(events.log).toEqual([])
    pointer(map, 'pointermove', 420, 290, RIGHT)
    pointer(map, 'pointermove', 460, 270, RIGHT)
    pointer(map, 'pointermove', 500, 220, RIGHT)
    expect(events.count('moveend')).toBe(0)
    pointer(map, 'pointerup', 500, 220, RIGHT)

    for (const once of ['movestart', 'moveend', 'rotatestart', 'rotateend', 'pitchstart', 'pitchend'])
      expect(events.count(once)).toBe(1)
    for (const each of ['move', 'rotate', 'pitch'])
      expect(events.count(each)).toBe(3)

    expect(events.log.slice(0, 3)).toEqual(['movestart', 'rotatestart', 'pitchstart'])
    // As `easeTo` ends: the move, then the turn and the tilt.
    expect(events.log.slice(-3)).toEqual(['moveend', 'rotateend', 'pitchend'])
  })

  test('rotate and pitch events carry the new bearing and pitch', () => {
    const map = makeMap({ bearing: 10, pitch: 20 })
    let bearing: number | undefined
    let pitch: number | undefined
    map.on('rotate', (e: any) => { bearing = e.bearing })
    map.on('pitch', (e: any) => { pitch = e.pitch })
    drag(map, 100, -80, RIGHT)
    expect(bearing).toBeCloseTo(40, 6)
    expect(pitch).toBeCloseTo(40, 6)
  })

  test('a drag that only turns fires no pitch events', () => {
    const map = makeMap({ bearing: 10, pitch: 20 })
    const events = record(map, ['rotatestart', 'rotateend', 'pitchstart', 'pitch', 'pitchend', 'moveend'])
    drag(map, 100, 0, RIGHT)
    expect(events.log).toEqual(['rotatestart', 'moveend', 'rotateend'])
  })

  test('touch and pen pointers are ignored', () => {
    const map = makeMap({ bearing: 10, pitch: 20, dragging: false })
    for (const pointerType of ['touch', 'pen']) {
      drag(map, 100, -80, { ...RIGHT, pointerType })
      drag(map, 100, -80, { ...ALT, pointerType })
    }
    expect(map.getBearing()).toBe(10)
    expect(map.getPitch()).toBe(20)
  })

  test('a second pointer does not take over a drag in progress', () => {
    const map = makeMap({ bearing: 10 })
    pointer(map, 'pointerdown', 400, 300, RIGHT)
    pointer(map, 'pointermove', 500, 300, RIGHT)
    pointer(map, 'pointermove', 700, 300, { ...RIGHT, pointerId: 2 })
    expect(map.getBearing()).toBeCloseTo(40, 6)
    pointer(map, 'pointerup', 700, 300, { ...RIGHT, pointerId: 2 })
    pointer(map, 'pointermove', 600, 300, RIGHT)
    expect(map.getBearing()).toBeCloseTo(70, 6)
    pointer(map, 'pointerup', 600, 300, RIGHT)
  })

  test('pointercancel ends the drag', () => {
    const map = makeMap({ bearing: 10 })
    const events = record(map, ['moveend', 'rotateend'])
    pointer(map, 'pointerdown', 400, 300, RIGHT)
    pointer(map, 'pointermove', 500, 300, RIGHT)
    pointer(map, 'pointercancel', 500, 300, RIGHT)
    expect(events.log).toEqual(['moveend', 'rotateend'])
    pointer(map, 'pointermove', 600, 300, RIGHT)
    expect(map.getBearing()).toBeCloseTo(40, 6)
  })
})

describe('dragRotate and the pan handler', () => {
  test('a right-drag or Alt-drag does not pan', () => {
    const map = makeMap()
    const events = record(map, ['dragstart', 'drag', 'dragend'])
    const center = map.getCenter()

    drag(map, 100, -80, RIGHT)
    drag(map, 100, -80, ALT)

    expect(events.log).toEqual([])
    expect(map.dragging.moved()).toBeFalsy()
    expect(map.getCenter().lat).toBeCloseTo(center.lat, 9)
    expect(map.getCenter().lng).toBeCloseTo(center.lng, 9)
  })

  test('a plain left drag still pans', () => {
    const map = makeMap({ inertia: false })
    const events = record(map, ['dragstart', 'dragend', 'rotatestart'])
    drag(map, 100, -80)
    expect(events.log).toEqual(['dragstart', 'dragend'])
  })

  test('with dragRotate off, Alt + left-drag pans as it always did', () => {
    const map = makeMap({ inertia: false, dragRotate: false })
    const events = record(map, ['dragstart', 'dragend'])
    drag(map, 100, -80, ALT)
    expect(events.log).toEqual(['dragstart', 'dragend'])
  })

  test('the click that ends an Alt-drag is not a map click', () => {
    const map = makeMap()
    let clicks = 0
    map.on('click', () => { clicks++ })

    drag(map, 100, -80, ALT)
    map.getContainer().dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }))
    expect(clicks).toBe(0)

    // An Alt-click that did not move still is.
    pointer(map, 'pointerdown', 400, 300, ALT)
    pointer(map, 'pointerup', 400, 300, ALT)
    map.getContainer().dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }))
    expect(clicks).toBe(1)
  })
})

describe('dragRotate and the map\'s contextmenu event', () => {
  test('a right click without movement fires it, menu on release (Windows, Linux)', () => {
    const map = makeMap({ bearing: 10 })
    const events = record(map, ['contextmenu', 'movestart', 'rotatestart'])

    pointer(map, 'pointerdown', 400, 300, RIGHT)
    pointer(map, 'pointerup', 400, 300, RIGHT)
    const e = contextMenu(map)

    expect(events.log).toEqual(['contextmenu'])
    expect(e.defaultPrevented).toBe(true)
    expect(map.getBearing()).toBe(10)
  })

  test('a right click without movement fires it, menu on press (macOS)', () => {
    const map = makeMap()
    const events = record(map, ['contextmenu'])

    pointer(map, 'pointerdown', 400, 300, RIGHT)
    contextMenu(map)
    // Not yet: the press may still become a drag.
    expect(events.log).toEqual([])
    pointer(map, 'pointerup', 400, 300, RIGHT)
    expect(events.log).toEqual(['contextmenu'])
  })

  test('a right-drag does not fire it, menu on release', () => {
    const map = makeMap()
    const events = record(map, ['contextmenu'])

    drag(map, 100, -80, RIGHT)
    const e = contextMenu(map)
    expect(events.log).toEqual([])
    expect(e.defaultPrevented).toBe(true)

    // Only that one: the next right click is a click again.
    contextMenu(map)
    expect(events.log).toEqual(['contextmenu'])
  })

  test('a right-drag does not fire it, menu on press', () => {
    const map = makeMap()
    const events = record(map, ['contextmenu'])

    pointer(map, 'pointerdown', 400, 300, RIGHT)
    const e = contextMenu(map)
    pointer(map, 'pointermove', 500, 220, RIGHT)
    pointer(map, 'pointerup', 500, 220, RIGHT)
    expect(events.log).toEqual([])
    expect(e.defaultPrevented).toBe(true)

    contextMenu(map)
    expect(events.log).toEqual(['contextmenu'])
  })

  test('with dragRotate off the event fires as it always did', () => {
    const map = makeMap({ dragRotate: false })
    const events = record(map, ['contextmenu'])
    drag(map, 100, -80, RIGHT)
    contextMenu(map)
    expect(events.log).toEqual(['contextmenu'])
  })
})
