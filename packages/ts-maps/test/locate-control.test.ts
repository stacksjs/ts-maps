import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { control, TsMap } from '../src/core-map'

/**
 * The blue dot and the accuracy halo used to be drawn through a `map.circle`
 * factory that TsMap has never had, so `_updateMarker` returned early and the
 * control silently reported a fix with nothing on the map. These tests pin the
 * layers themselves, not just the button state.
 */

interface Fix {
  coords: { latitude: number, longitude: number, accuracy: number }
}

function fix(latitude: number, longitude: number, accuracy = 30): Fix {
  return { coords: { latitude, longitude, accuracy } }
}

let cleared: number[]
let watchSuccess: ((position: Fix) => void) | undefined
let watchError: ((error: unknown) => void) | undefined

function stubGeolocation(): void {
  cleared = []
  watchSuccess = undefined
  watchError = undefined
  ;(navigator as any).geolocation = {
    watchPosition(success: (p: Fix) => void, error: (e: unknown) => void) {
      watchSuccess = success
      watchError = error
      return 7
    },
    getCurrentPosition(success: (p: Fix) => void, error: (e: unknown) => void) {
      watchSuccess = success
      watchError = error
    },
    clearWatch(id: number) {
      cleared.push(id)
    },
  }
}

function makeMap(): TsMap {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  // zoomAnimation off: the animated path reaches DOM APIs the test shim does
  // not implement, and the animation is not what these tests are about.
  const map = new TsMap(container, { zoomAnimation: false })
  map.setView([0, 0], 5)
  return map
}

function layerCount(map: TsMap, className: string): number {
  return Object.values((map as any)._layers)
    .filter((layer: any) => layer.options?.className === className).length
}

describe('LocateControl', () => {
  beforeEach(stubGeolocation)
  afterEach(() => {
    delete (navigator as any).geolocation
  })

  test('draws a position dot and accuracy halo on the first fix', () => {
    const map = makeMap()
    const locate = control.locate().addTo(map)

    locate.start()
    expect(locate._button!.getAttribute('data-state')).toBe('locating')

    watchSuccess!(fix(34.02, -118.47))

    expect(locate._marker).toBeDefined()
    expect(locate._accuracyCircle).toBeDefined()
    expect(map.hasLayer(locate._marker as any)).toBe(true)
    expect(map.hasLayer(locate._accuracyCircle as any)).toBe(true)
    expect(locate._button!.getAttribute('data-state')).toBe('active')
  })

  test('moves the existing layers on a second fix rather than stacking new ones', () => {
    const map = makeMap()
    const locate = control.locate().addTo(map)

    locate.start()
    watchSuccess!(fix(34.02, -118.47, 30))
    const dot = locate._marker
    const halo = locate._accuracyCircle

    watchSuccess!(fix(34.03, -118.46, 12))

    expect(locate._marker).toBe(dot as any)
    expect(locate._accuracyCircle).toBe(halo as any)
    expect(locate._marker!.getLatLng().lat).toBeCloseTo(34.03, 5)
    expect((locate._accuracyCircle as any).getRadius()).toBe(12)
    expect(layerCount(map, 'tsmap-locate-accuracy')).toBe(1)
  })

  test('stop() clears the watch and removes both layers', () => {
    const map = makeMap()
    const locate = control.locate().addTo(map)

    locate.start()
    watchSuccess!(fix(34.02, -118.47))
    const dot = locate._marker!

    locate.stop()

    expect(cleared).toEqual([7])
    expect(locate._marker).toBeUndefined()
    expect(locate._accuracyCircle).toBeUndefined()
    expect(map.hasLayer(dot as any)).toBe(false)
    expect(locate._button!.getAttribute('data-state')).toBe('idle')
  })

  test('showMarker: false reports the fix without drawing anything', () => {
    const map = makeMap()
    const locate = control.locate({ showMarker: false }).addTo(map)

    let found = 0
    map.on('locatefound', () => { found += 1 })

    locate.start()
    watchSuccess!(fix(34.02, -118.47))

    expect(found).toBe(1)
    expect(locate._marker).toBeUndefined()
    expect(locate._accuracyCircle).toBeUndefined()
  })

  test('a hand-driven pan stops following but keeps the dot', () => {
    const map = makeMap()
    const locate = control.locate().addTo(map)

    locate.start()
    watchSuccess!(fix(34.02, -118.47))
    map.fire('dragstart')

    expect(cleared).toEqual([7])
    expect(locate._following).toBe(false)
    expect(locate._marker).toBeDefined()
    expect(locate._button!.getAttribute('data-state')).toBe('idle')
  })

  test('removing the control takes its layers with it', () => {
    const map = makeMap()
    const locate = control.locate().addTo(map)

    locate.start()
    watchSuccess!(fix(34.02, -118.47))
    const dot = locate._marker!
    locate.remove()

    expect(map.hasLayer(dot as any)).toBe(false)
    expect(layerCount(map, 'tsmap-locate-accuracy')).toBe(0)
  })

  test('a denied permission is reported and leaves nothing on the map', () => {
    const map = makeMap()
    const locate = control.locate().addTo(map)

    let error: any
    map.on('locateerror', (event: any) => { error = event })

    locate.start()
    watchError!({ code: 1, message: 'User denied Geolocation' })

    expect(error?.code).toBe(1)
    expect(locate._button!.getAttribute('data-state')).toBe('denied')
    expect(locate._marker).toBeUndefined()
  })
})
