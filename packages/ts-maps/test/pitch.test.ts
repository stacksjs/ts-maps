import { describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'

function createContainer(): HTMLElement {
  const container = document.createElement('div')
  container.style.width = '800px'
  container.style.height = '600px'
  document.body.appendChild(container)
  return container
}

/**
 * very-happy-dom does not populate `clientWidth` / `clientHeight` from inline
 * styles, so `TsMap.getSize()` would otherwise return `(0, 0)`. Stamp an
 * explicit size into the map's internal slot, then recompute `_pixelOrigin`
 * using the now-correct size. Mirrors the helper in `bearing.test.ts`.
 */
function stampSize(map: TsMap, width: number, height: number): void {
  map._size = new Point(width, height)
  map._sizeChanged = false
  if (map._loaded && map._lastCenter)
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
}

describe('pitch (camera tilt)', () => {
  test('defaults to 0', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    expect(map.getPitch()).toBe(0)
  })

  test('accepts an initial pitch via options, clamped to [0, 60]', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3, pitch: 45 })
    expect(map.getPitch()).toBe(45)
  })

  test('setPitch(45) sets pitch to 45', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.setPitch(45)
    expect(map.getPitch()).toBe(45)
  })

  test('setPitch(-10) clamps to 0 (default minPitch)', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.setPitch(-10)
    expect(map.getPitch()).toBe(0)
  })

  test('setPitch(90) clamps to 60 (default maxPitch)', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.setPitch(90)
    expect(map.getPitch()).toBe(60)
  })

  test('respects custom maxPitch from options at runtime', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.options.maxPitch = 85
    map.setPitch(80)
    expect(map.getPitch()).toBe(80)
    map.setPitch(100)
    expect(map.getPitch()).toBe(85)
  })

  test('respects custom minPitch from options at runtime', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.options.minPitch = 10
    map.setPitch(5)
    expect(map.getPitch()).toBe(10)
  })

  test('pitchTo is an alias for setPitch', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.pitchTo(30)
    expect(map.getPitch()).toBe(30)
  })

  test('fires pitch event when pitch changes', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    let fired = 0
    let lastPitch: number | undefined
    map.on('pitch', (e: any) => {
      fired++
      lastPitch = e.pitch
    })
    map.setPitch(45)
    expect(fired).toBe(1)
    expect(lastPitch).toBe(45)
  })

  test('fires pitchstart, pitch, pitchend in order', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    const seq: string[] = []
    map.on('pitchstart', () => { seq.push('start') })
    map.on('pitch', () => { seq.push('pitch') })
    map.on('pitchend', () => { seq.push('end') })
    map.setPitch(45)
    expect(seq).toEqual(['start', 'pitch', 'end'])
  })

  test('does not fire events when pitch does not change (incl. clamp)', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.setPitch(45)
    let fired = 0
    map.on('pitch', () => { fired++ })
    map.setPitch(45) // same value
    map.setPitch(45) // still the same
    expect(fired).toBe(0)
  })

  test('pitch=0 is a no-op: containerPointToLatLng matches bearing-only behavior', () => {
    // Regression: at pitch=0 the new perspective code path must be skipped,
    // giving the exact same result as before pitch support existed.
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)

    const cp = [300, 200]
    const before = map.containerPointToLatLng(cp)
    // Setting pitch to 0 must not change anything (and skips the perspective
    // math since `_pitch` is still 0).
    map.setPitch(0)
    const after = map.containerPointToLatLng(cp)
    expect(after.lat).toBe(before.lat)
    expect(after.lng).toBe(before.lng)

    // And the bearing-only path (bearing != 0, pitch = 0) is also unchanged.
    map.setBearing(30)
    const bearingOnly = map.containerPointToLatLng(cp)
    // Set pitch to 0 explicitly (already 0), the result should be identical
    // to the pure-bearing case.
    map.setPitch(0)
    const bearingWithZeroPitch = map.containerPointToLatLng(cp)
    expect(bearingWithZeroPitch.lat).toBe(bearingOnly.lat)
    expect(bearingWithZeroPitch.lng).toBe(bearingOnly.lng)
  })

  test('at pitch=45 bearing=0, clicking near the top of the viewport maps further north than pitch=0', () => {
    // With pitch tilting the map so the top of the screen shows more
    // distant terrain, a click at (400, 50) — near the top — should yield
    // a lat/lng further north than the same click with pitch=0.
    const mapFlat = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(mapFlat, 800, 600)
    const centerLL = mapFlat.containerPointToLatLng([400, 300])
    const topLLFlat = mapFlat.containerPointToLatLng([400, 50])
    const deltaFlat = Math.abs(topLLFlat.lat - centerLL.lat)

    const mapPitched = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(mapPitched, 800, 600)
    mapPitched.setPitch(45)
    const topLLPitched = mapPitched.containerPointToLatLng([400, 50])
    const centerLLPitched = mapPitched.containerPointToLatLng([400, 300])
    const deltaPitched = Math.abs(topLLPitched.lat - centerLLPitched.lat)

    // Top click should be "farther north" under pitch.
    expect(topLLPitched.lat).toBeGreaterThan(topLLFlat.lat)
    expect(deltaPitched).toBeGreaterThan(deltaFlat)
  })

  test('bearing=90 + pitch=45: top-of-viewport click composes bearing rotation with pitch stretch', () => {
    // `setBearing(90)` rotates the layer pane +90° CW. Inverting for a
    // container click: a top-edge click (0, -Δy) relative to center maps to
    // layer vector (-Δy, 0) — i.e. WEST in the underlying layer grid.
    // Adding pitch=45 stretches the perceived distance (points near the top
    // appear farther away), so the same pixel click maps to a point
    // FARTHER west in layer space → smaller (more negative) lng after
    // unprojection. Lat stays near 0 since the layer y component is ~0.
    const mapBearing = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(mapBearing, 800, 600)
    mapBearing.setBearing(90)
    const topOnly = mapBearing.containerPointToLatLng([400, 50])

    const mapBoth = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(mapBoth, 800, 600)
    mapBoth.setBearing(90)
    mapBoth.setPitch(45)
    const topBoth = mapBoth.containerPointToLatLng([400, 50])

    // West of center: lng < 0 in both cases.
    expect(topOnly.lng).toBeLessThan(0)
    expect(topBoth.lng).toBeLessThan(0)
    // Pitch stretches the top click farther west (perspective → larger
    // magnitude in the "away from camera" direction, which after bearing
    // rotation is west).
    expect(topBoth.lng).toBeLessThan(topOnly.lng)
    // The lat component stays close to center's lat.
    expect(Math.abs(topBoth.lat)).toBeLessThan(1)
  })

  test('layerPointToContainerPoint inverts containerPointToLayerPoint at non-zero pitch', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)
    map.setPitch(45)

    const cp = [250, 400] // below-center so denominator stays well-behaved
    const lp = map.containerPointToLayerPoint(cp)
    const cp2 = map.layerPointToContainerPoint(lp)
    expect(cp2.x).toBeCloseTo(cp[0], 4)
    expect(cp2.y).toBeCloseTo(cp[1], 4)
  })

  test('layerPointToContainerPoint inverts containerPointToLayerPoint at non-zero bearing + pitch', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)
    map.setBearing(30)
    map.setPitch(40)

    const cp = [350, 450]
    const lp = map.containerPointToLayerPoint(cp)
    const cp2 = map.layerPointToContainerPoint(lp)
    expect(cp2.x).toBeCloseTo(cp[0], 4)
    expect(cp2.y).toBeCloseTo(cp[1], 4)
  })

  test('project/unproject are unaffected by pitch', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    const p0 = map.project([37.7, -122.4], 3)
    map.setPitch(45)
    const p1 = map.project([37.7, -122.4], 3)
    expect(p1.x).toBe(p0.x)
    expect(p1.y).toBe(p0.y)
  })
})
