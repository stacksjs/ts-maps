import { describe, expect, test } from 'bun:test'
import { DivIcon } from '../src/core-map/layer/marker/DivIcon'
import { Marker } from '../src/core-map/layer/marker/Marker'
import { Point } from '../src/core-map/geometry/Point'
import * as DomUtil from '../src/core-map/dom/DomUtil'
import { TsMap } from '../src/core-map/map/Map'

function makeMap(options: Record<string, unknown> = {}): TsMap {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const map = new TsMap(el, { center: [37.7879, -122.4075], zoom: 15, ...options })
  // very-happy-dom has no layout; give the map a size of its own.
  map._size = new Point(800, 600)
  map._sizeChanged = false
  map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
  return map
}

// --- A small 4×4 matrix kit, to compose the CSS transforms by hand ---------

type Mat = number[] // column-major, as CSS matrix3d

function mul(a: Mat, b: Mat): Mat {
  const out: number[] = Array.from({ length: 16 }, () => 0)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0
      for (let k = 0; k < 4; k++)
        sum += a[k * 4 + r]! * b[c * 4 + k]!
      out[c * 4 + r] = sum
    }
  }
  return out
}

const identity = (): Mat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function perspective(d: number): Mat { const m = identity(); m[11] = -1 / d; return m }
function translateZ(z: number): Mat { const m = identity(); m[14] = z; return m }
function scale(s: number): Mat { const m = identity(); m[0] = s; m[5] = s; return m }
function rotateZ(deg: number): Mat {
  const a = (deg * Math.PI) / 180
  const m = identity()
  m[0] = Math.cos(a); m[1] = Math.sin(a); m[4] = -Math.sin(a); m[5] = Math.cos(a)
  return m
}
function rotateX(deg: number): Mat {
  const a = (deg * Math.PI) / 180
  const m = identity()
  m[5] = Math.cos(a); m[6] = Math.sin(a); m[9] = -Math.sin(a); m[10] = Math.cos(a)
  return m
}
function apply(m: Mat, x: number, y: number): { x: number, y: number, z: number } {
  const X = m[0]! * x + m[4]! * y + m[12]!
  const Y = m[1]! * x + m[5]! * y + m[13]!
  const Z = m[2]! * x + m[6]! * y + m[14]!
  const W = m[3]! * x + m[7]! * y + m[15]!
  return { x: X / W, y: Y / W, z: Z }
}

/** The map pane's CSS camera, as `_applyCameraTransform` composes it. */
function groundMatrix(map: TsMap): Mat {
  const { h, depth, scale: s } = map._cameraGeometry()
  return [perspective(h), translateZ(-depth), rotateX(map._pitch), rotateZ(map._bearing), scale(s)].reduce(mul)
}

/** The upright panes' counter-transform. */
function uprightMatrix(map: TsMap): Mat {
  const { depth, scale: s } = map._cameraGeometry()
  return [scale(1 / s), rotateZ(-map._bearing), rotateX(-map._pitch), translateZ(depth)].reduce(mul)
}

describe('pitch rendering', () => {
  test('the pane transform carries the perspective the projection assumes', () => {
    const map = makeMap()
    map.setPitch(45)
    const { h } = map._cameraGeometry()
    const transform = map._mapPane.style.transform
    expect(transform).toContain(`perspective(${h}px)`)
    expect(transform).toContain('rotateX(45deg)')
    expect(map._mapPane.style.transformStyle).toBe('preserve-3d')
  })

  test('the CSS camera puts every ground point where latLngToContainerPoint says', () => {
    const map = makeMap()
    map.setBearing(30)
    map.setPitch(50)
    const m = groundMatrix(map)
    const center = map.getSize().divideBy(2)
    const pos = map._getMapPanePos()

    for (const [x, y] of [[400, 300], [100, 80], [700, 120], [50, 560], [760, 590]]) {
      const layer = map.containerPointToLayerPoint(new Point(x, y))
      // transform-origin is the view centre; the pane offset is outside it.
      const css = apply(m, layer.x - center.x, layer.y - center.y)
      expect(css.x + center.x + pos.x).toBeCloseTo(x, 6)
      expect(css.y + center.y + pos.y).toBeCloseTo(y, 6)
    }
  })

  test('everything visible on the ground sits behind the upright panes', () => {
    const map = makeMap()
    map.setPitch(60)
    const m = groundMatrix(map)
    const center = map.getSize().divideBy(2)
    // The bottom edge is the nearest ground on screen.
    for (const x of [0, 400, 800]) {
      const layer = map.containerPointToLayerPoint(new Point(x, 600))
      expect(apply(m, layer.x - center.x, layer.y - center.y).z).toBeLessThanOrEqual(0)
    }
  })

  test('upright panes come out in the screen plane, unsquashed and unrotated', () => {
    const map = makeMap()
    map.setBearing(40)
    map.setPitch(45)
    const net = mul(groundMatrix(map), uprightMatrix(map))
    for (const [x, y] of [[0, 0], [120, -80], [-300, 250]]) {
      const p = apply(net, x, y)
      expect(p.x).toBeCloseTo(x, 6)
      expect(p.y).toBeCloseTo(y, 6)
      expect(p.z).toBeCloseTo(0, 6)
    }
    const pane = map.getPane('markerPane')
    expect(pane.style.transform).toContain('rotateX(-45deg)')
    expect(pane.style.transform).toContain('rotate(-40deg)')
  })

  test('flattening again clears the 3D context', () => {
    const map = makeMap()
    map.setPitch(45)
    map.setPitch(0)
    expect(map._mapPane.style.transformStyle).toBe('')
    expect(map._mapPane.style.transform).not.toContain('perspective')
    expect(map.getPane('symbolPane').style.transform).toBe('')
  })

  test('a marker stands at its projected point under bearing and pitch', () => {
    const map = makeMap()
    const latlng = map.containerPointToLatLng([600, 450])
    const marker = new Marker(latlng, { icon: new DivIcon({ iconSize: [10, 10] }) }).addTo(map)

    for (const [bearing, pitch] of [[0, 0], [40, 0], [0, 45], [40, 45]]) {
      map.setBearing(bearing)
      map.setPitch(pitch)
      const onScreen = map._uprightPointToContainerPoint(DomUtil.getPosition(marker._icon as HTMLElement))
      const want = map.latLngToContainerPoint(latlng)
      expect(onScreen.distanceTo(want)).toBeLessThanOrEqual(1)
    }
  })

  test('tilting folds an existing pane offset into the centre without moving the view', () => {
    const map = makeMap()
    map._rawPanBy(new Point(120, -80))
    const probe = new Point(400, 300)
    const before = map.containerPointToLatLng(probe)
    map.setPitch(40)
    expect(map._getMapPanePos().equals(new Point(0, 0))).toBe(true)
    // The view centre is on the pitch axis, so what is under it is unchanged.
    expect(map.containerPointToLatLng(probe).distanceTo(before)).toBeLessThan(1)
  })
})

describe('panning a pitched map', () => {
  test('moves the ground, not the pane', () => {
    const map = makeMap({ pitch: 50 })
    const target = map.containerPointToLatLng([400, 150])
    map.panBy([0, -150], { animate: false })
    expect(map._getMapPanePos().equals(new Point(0, 0))).toBe(true)
    // What was 150px above the centre is now at the centre.
    expect(map.latLngToContainerPoint(target).distanceTo(new Point(400, 300))).toBeLessThan(1.5)
  })

  test('a pan near the top reaches further on the ground than one near the bottom', () => {
    const up = makeMap({ pitch: 55 })
    const start = up.project(up.getCenter())
    up.panBy([0, -150], { animate: false })
    const far = up.project(up.getCenter()).distanceTo(start)

    const down = makeMap({ pitch: 55 })
    const start2 = down.project(down.getCenter())
    down.panBy([0, 150], { animate: false })
    const near = down.project(down.getCenter()).distanceTo(start2)

    expect(far).toBeGreaterThan(near)
  })
})

describe('ground offsets', () => {
  test('flat and north-up, a ground offset is the screen offset', () => {
    const map = makeMap()
    const g = map._groundOffset(new Point(500, 250))
    expect(g.x).toBeCloseTo(100, 6)
    expect(g.y).toBeCloseTo(-50, 6)
  })

  test('zooming around a point on a rotated, tilted map holds that point', () => {
    const map = makeMap({ bearing: 35, pitch: 45 })
    const anchor = new Point(600, 420)
    const latlng = map.containerPointToLatLng(anchor)
    map.setZoomAround(anchor, 16, { animate: false })
    expect(map.getZoom()).toBe(16)
    expect(map.latLngToContainerPoint(latlng).distanceTo(anchor)).toBeLessThan(1.5)
  })

  test('a tilted view asks for tiles further into the distance', async () => {
    const { GridLayer } = await import('../src/core-map/layer/tile/GridLayer')
    const map = makeMap()
    const layer = new GridLayer({ tileSize: 256 }) as any
    layer._map = map
    layer._tileZoom = 15
    const flat = layer._getTiledPixelBounds(map.getCenter())
    map.setPitch(55)
    const tilted = layer._getTiledPixelBounds(map.getCenter())
    const centre = map.project(map.getCenter(), 15)
    expect(centre.y - tilted.min.y).toBeGreaterThan(centre.y - flat.min.y)
  })

  test('tiles are updated when the camera turns or tilts', async () => {
    const { GridLayer } = await import('../src/core-map/layer/tile/GridLayer')
    const events = (new GridLayer() as any).getEvents()
    expect(events.pitchend).toBeDefined()
    expect(events.rotateend).toBeDefined()
  })
})
