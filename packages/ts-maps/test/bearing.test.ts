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
 * styles, so `TsMap.getSize()` would otherwise return `(0, 0)`. For the
 * pixel-math tests below we stamp an explicit size into the map's internal
 * slot. This mirrors what a real browser layout pass would give us. Since
 * `_pixelOrigin` is computed during `setView()` using the (then-zero) size,
 * we recompute it here too so downstream math matches what a real 800x600
 * viewport would produce.
 */
function stampSize(map: TsMap, width: number, height: number): void {
  map._size = new Point(width, height)
  map._sizeChanged = false
  if (map._loaded && map._lastCenter)
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
}

describe('bearing (map rotation)', () => {
  test('defaults to 0', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    expect(map.getBearing()).toBe(0)
  })

  test('accepts an initial bearing via options, wrapped to [0, 360)', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3, bearing: 45 })
    expect(map.getBearing()).toBe(45)

    const mapNeg = new TsMap(createContainer(), { center: [0, 0], zoom: 3, bearing: -10 })
    expect(mapNeg.getBearing()).toBe(350)
  })

  test('setBearing(45) sets bearing to 45', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.setBearing(45)
    expect(map.getBearing()).toBe(45)
  })

  test('setBearing(-10) wraps to 350', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.setBearing(-10)
    expect(map.getBearing()).toBe(350)
  })

  test('setBearing(720) wraps to 0', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    // First set to a non-zero value so the 720 -> 0 transition actually fires
    // the event path (setBearing is a no-op when the wrapped value is the
    // same as the current bearing).
    map.setBearing(45)
    map.setBearing(720)
    expect(map.getBearing()).toBe(0)
  })

  test('rotateTo is an alias for setBearing', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.rotateTo(90)
    expect(map.getBearing()).toBe(90)
  })

  test('fires rotate event when bearing changes', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    let fired = 0
    let lastBearing: number | undefined
    map.on('rotate', (e: any) => {
      fired++
      lastBearing = e.bearing
    })
    map.setBearing(90)
    expect(fired).toBe(1)
    expect(lastBearing).toBe(90)
  })

  test('fires rotatestart, rotate, rotateend in order', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    const seq: string[] = []
    map.on('rotatestart', () => { seq.push('start') })
    map.on('rotate', () => { seq.push('rotate') })
    map.on('rotateend', () => { seq.push('end') })
    map.setBearing(90)
    expect(seq).toEqual(['start', 'rotate', 'end'])
  })

  test('does not fire events when bearing does not change', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    map.setBearing(45)
    let fired = 0
    map.on('rotate', () => { fired++ })
    map.setBearing(45) // same value, no-op
    map.setBearing(405) // wraps to 45, no-op
    expect(fired).toBe(0)
  })

  test('containerPointToLayerPoint at bearing=0 vs bearing=90 differs predictably', () => {
    // Container is 800x600, so the viewport center (in container coords) is
    // (400, 300). With bearing=0 and mapPanePos=(0,0) (fresh map after
    // setView), a click at the right edge mid-height (800, 300) maps to
    // layerPoint (800, 300) — east of center by 400px on the x axis.
    //
    // Rotating the map to bearing=90 means "north is now pointing right".
    // Equivalently: the CSS rotation on `_mapPane` is +90° CW, so the
    // underlying layer grid appears rotated 90° CW relative to the viewport.
    // Inverting that, a click in the container is rotated by -90° to map
    // back to the layer grid. A click at (800, 300) relative to the center
    // (400, 300) is the vector (+400, 0). Rotating (+400, 0) by -90°
    // (screen-space CW-positive) yields (0, -400). So the layerPoint ends up
    // at center + (0, -400) = (400, -100) — directly NORTH of center in the
    // unrotated layer grid. That matches the intuition: a right-edge click
    // at bearing=90 (north points right) should correspond to the north
    // side of the world.
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)

    const lp0 = map.containerPointToLayerPoint([800, 300])
    expect(lp0.x).toBe(800)
    expect(lp0.y).toBe(300)

    map.setBearing(90)
    const lp90 = map.containerPointToLayerPoint([800, 300])
    // Floating-point tolerance. The expected values come from the math
    // documented above: rotate((+400, 0), -90°) + (400, 300) = (400, -100).
    expect(lp90.x).toBeCloseTo(400, 6)
    expect(lp90.y).toBeCloseTo(-100, 6)
    // The two layer points should be different.
    expect(lp0.x === lp90.x && lp0.y === lp90.y).toBe(false)
  })

  test('containerPointToLatLng at bearing=90 places a right-edge click to the north', () => {
    // A similar assertion at the lat/lng level. At bearing=0, a click at the
    // right edge of the viewport maps to a lat/lng *east* of center. At
    // bearing=90 (north points right), the same pixel click should map to a
    // lat/lng *north* of center.
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)

    const llEast = map.containerPointToLatLng([800, 300])
    // East of (0,0) means lng > 0 and lat ~ 0 (symmetric around equator).
    expect(llEast.lng).toBeGreaterThan(0)
    expect(Math.abs(llEast.lat)).toBeLessThan(1)

    map.setBearing(90)
    const llNorth = map.containerPointToLatLng([800, 300])
    // North of (0,0) means lat > 0 and lng ~ 0.
    expect(llNorth.lat).toBeGreaterThan(0)
    expect(Math.abs(llNorth.lng)).toBeLessThan(1)
  })

  test('layerPointToContainerPoint inverts containerPointToLayerPoint at non-zero bearing', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    stampSize(map, 800, 600)
    map.setBearing(30)

    const cp = [250, 175]
    const lp = map.containerPointToLayerPoint(cp)
    const cp2 = map.layerPointToContainerPoint(lp)
    expect(cp2.x).toBeCloseTo(cp[0], 6)
    expect(cp2.y).toBeCloseTo(cp[1], 6)
  })

  test('project/unproject are unaffected by bearing', () => {
    const map = new TsMap(createContainer(), { center: [0, 0], zoom: 3 })
    const p0 = map.project([37.7, -122.4], 3)
    map.setBearing(123)
    const p1 = map.project([37.7, -122.4], 3)
    expect(p1.x).toBe(p0.x)
    expect(p1.y).toBe(p0.y)
  })
})
