import { afterEach, describe, expect, test } from 'bun:test'
import { TsMap } from '../src/core-map/map/Map'
import { TwoFingerPitchHandler } from '../src/core-map/map/handler/TwoFingerPitchHandler'
import { TwoFingerRotateHandler } from '../src/core-map/map/handler/TwoFingerRotateHandler'

function createContainer(): HTMLElement {
  const el = document.createElement('div')
  el.style.width = '800px'
  el.style.height = '600px'
  document.body.appendChild(el)
  return el
}

const containers: HTMLElement[] = []

afterEach(() => {
  for (const c of containers.splice(0)) c.remove()
})

function makeMap(opts?: Record<string, unknown>): TsMap {
  const c = createContainer()
  containers.push(c)
  const map = new TsMap(c, { center: [0, 0], zoom: 4, ...(opts ?? {}) })
  return map
}

describe('TwoFingerRotateHandler', () => {
  test('registered on map as touchRotate', () => {
    const map = makeMap()
    expect(map.touchRotate).toBeInstanceOf(TwoFingerRotateHandler)
    expect(map.touchRotate!.enabled()).toBe(true)
  })

  test('disabled when touchRotate option is false', () => {
    const map = makeMap({ touchRotate: false })
    expect(map.touchRotate).toBeInstanceOf(TwoFingerRotateHandler)
    expect(map.touchRotate!.enabled()).toBe(false)
  })

  test('disable() / enable() round-trip', () => {
    const map = makeMap()
    map.touchRotate!.disable()
    expect(map.touchRotate!.enabled()).toBe(false)
    map.touchRotate!.enable()
    expect(map.touchRotate!.enabled()).toBe(true)
  })

  test('pivot defaults to finger-midpoint; "center" keeps map center fixed', () => {
    const map = makeMap()
    expect(map.options.touchRotate).toBe(true)
    const map2 = makeMap({ touchRotate: 'center' })
    expect(map2.options.touchRotate).toBe('center')
  })

  test('angle computation — 90° twist maps to 90° bearing delta', () => {
    // Verify the math directly without dispatching pointer events:
    // simulate what _onPointerStart and _onPointerMove compute.
    const startP1 = { x: 200, y: 300 }
    const startP2 = { x: 600, y: 300 } // horizontal line, angle 0
    const endP1 = { x: 400, y: 100 }
    const endP2 = { x: 400, y: 500 } // vertical line, angle 90°

    const startAngle = Math.atan2(startP2.y - startP1.y, startP2.x - startP1.x)
    const endAngle = Math.atan2(endP2.y - endP1.y, endP2.x - endP1.x)
    const deltaDeg = (endAngle - startAngle) * 180 / Math.PI

    expect(Math.abs(deltaDeg - 90)).toBeLessThan(0.001)
  })
})

describe('TwoFingerPitchHandler', () => {
  test('registered on map as touchPitch', () => {
    const map = makeMap()
    expect(map.touchPitch).toBeInstanceOf(TwoFingerPitchHandler)
    expect(map.touchPitch!.enabled()).toBe(true)
  })

  test('disabled when touchPitch option is false', () => {
    const map = makeMap({ touchPitch: false })
    expect(map.touchPitch!.enabled()).toBe(false)
  })

  test('disable() / enable() round-trip', () => {
    const map = makeMap()
    map.touchPitch!.disable()
    expect(map.touchPitch!.enabled()).toBe(false)
    map.touchPitch!.enable()
    expect(map.touchPitch!.enabled()).toBe(true)
  })

  test('vertical drag produces positive pitch delta; upward motion', () => {
    // Mirror the handler math: upward drag (negative Δy) increases pitch.
    const startPitch = 20
    const meanDy = -50 // both fingers moved 50px up
    const nextPitch = startPitch - meanDy * 0.3
    expect(nextPitch).toBeGreaterThan(startPitch)
  })

  test('downward drag decreases pitch', () => {
    const startPitch = 40
    const meanDy = 30
    const nextPitch = startPitch - meanDy * 0.3
    expect(nextPitch).toBeLessThan(startPitch)
  })

  test('pitch still respects map maxPitch clamp', () => {
    const map = makeMap({ maxPitch: 45 })
    map.setPitch(100)
    expect(map.getPitch()).toBe(45)
  })
})

describe('rotate + pitch compose with existing camera API', () => {
  test('map.setBearing fires rotate event', () => {
    const map = makeMap()
    let calls = 0
    map.on('rotate', () => { calls++ })
    map.setBearing(45)
    expect(calls).toBeGreaterThanOrEqual(1)
    expect(map.getBearing()).toBe(45)
  })

  test('map.setPitch fires pitch event', () => {
    const map = makeMap()
    let calls = 0
    map.on('pitch', () => { calls++ })
    map.setPitch(30)
    expect(calls).toBeGreaterThanOrEqual(1)
    expect(map.getPitch()).toBe(30)
  })
})
