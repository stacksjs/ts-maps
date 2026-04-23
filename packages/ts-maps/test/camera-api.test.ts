import { afterEach, describe, expect, test } from 'bun:test'
import { LatLng } from '../src/core-map/geo/LatLng'
import { TsMap } from '../src/core-map/map/Map'

function createContainer(): HTMLElement {
  const el = document.createElement('div')
  el.style.width = '400px'
  el.style.height = '300px'
  document.body.appendChild(el)
  return el
}

const cleanup: HTMLElement[] = []
afterEach(() => { for (const c of cleanup.splice(0)) c.remove() })

function makeMap(opts?: Record<string, unknown>): TsMap {
  const c = createContainer()
  cleanup.push(c)
  return new TsMap(c, { center: [0, 0], zoom: 4, ...(opts ?? {}) })
}

describe('TsMap.getCamera', () => {
  test('returns the current camera as a single object', () => {
    const map = makeMap()
    map.setBearing(45)
    map.setPitch(20)
    const cam = map.getCamera()
    expect(cam.center).toBeInstanceOf(LatLng)
    expect(cam.zoom).toBe(4)
    expect(cam.bearing).toBe(45)
    expect(cam.pitch).toBe(20)
  })
})

describe('TsMap.jumpTo', () => {
  test('snaps bearing and pitch', () => {
    const map = makeMap()
    map.jumpTo({ bearing: 90, pitch: 30 })
    expect(map.getBearing()).toBe(90)
    expect(map.getPitch()).toBe(30)
  })

  test('fires rotate / pitch events for changed fields', () => {
    const map = makeMap()
    let rotate = 0
    let pitch = 0
    map.on('rotate', () => { rotate++ })
    map.on('pitch', () => { pitch++ })
    map.jumpTo({ bearing: 10 })
    map.jumpTo({ pitch: 5 })
    expect(rotate).toBeGreaterThanOrEqual(1)
    expect(pitch).toBeGreaterThanOrEqual(1)
  })

  test('wraps bearing into [0, 360)', () => {
    const map = makeMap()
    map.jumpTo({ bearing: 370 })
    expect(map.getBearing()).toBe(10)
    map.jumpTo({ bearing: -30 })
    expect(map.getBearing()).toBe(330)
  })

  test('clamps pitch to maxPitch / minPitch', () => {
    const map = makeMap({ maxPitch: 45, minPitch: 5 })
    map.jumpTo({ pitch: 100 })
    expect(map.getPitch()).toBe(45)
    map.jumpTo({ pitch: -10 })
    expect(map.getPitch()).toBe(5)
  })

  test('does not fire events when values are unchanged', () => {
    const map = makeMap()
    let rotate = 0
    let pitch = 0
    map.on('rotate', () => { rotate++ })
    map.on('pitch', () => { pitch++ })
    map.jumpTo({ bearing: 0, pitch: 0 })
    expect(rotate).toBe(0)
    expect(pitch).toBe(0)
  })
})
