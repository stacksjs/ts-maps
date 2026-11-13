import { describe, expect, test } from 'bun:test'
import * as DomUtil from '../src/core-map/dom/DomUtil'
import { Point } from '../src/core-map/geometry/Point'
import { DivIcon } from '../src/core-map/layer/marker/DivIcon'
import { Marker } from '../src/core-map/layer/marker/Marker'
import { Popup } from '../src/core-map/layer/Popup'
import { Map } from '../src/core-map/map/Map'
import { buildingMatrix } from '../src/core-map/renderer/webgl/BuildingOverlay'
import { collection, extrusionHarness, square } from './helpers/extrusion'

// A point lifted off the map plane, for pinning a marker or a label to the
// roof of a `fill-extrusion` prism. The building pass draws roofs through
// `buildingMatrix`; these hold the map's own projection to it.

const W = 1000
const H = 640

function makeMap(options: Record<string, unknown> = {}): Map {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const map = new Map(el, { center: [29.76, -95.37], zoom: 9, ...options })
  map._size = new Point(W, H)
  map._sizeChanged = false
  map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
  return map
}

/** Where the building pass draws a point `z` pixels above layer point x, y. */
function drawnAt(map: Map, x: number, y: number, z: number): Point {
  const pos = map._getMapPanePos()
  const m = buildingMatrix({ width: W, height: H, bearing: map._bearing, pitch: map._pitch, h: map._cameraGeometry().h, pos: [pos.x, pos.y] }, 1, [0, 0])
  const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!
  const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!
  const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
  return new Point((cx / cw + 1) * W / 2, (1 - cy / cw) * H / 2)
}

const CAMERAS: Array<[number, number]> = [[0, 0], [30, 0], [0, 60], [-25, 70], [140, 45]]

describe('Map.latLngToContainerPoint with an altitude', () => {
  test('without one, or at zero, it is the point on the ground', () => {
    for (const [bearing, pitch] of CAMERAS) {
      const map = makeMap({ bearing, pitch })
      const latlng = map.containerPointToLatLng([620, 410])
      const ground = map.layerPointToContainerPoint(map.latLngToLayerPoint(latlng))
      expect(map.latLngToContainerPoint(latlng).equals(ground)).toBe(true)
      expect(map.latLngToContainerPoint(latlng, 0).equals(ground)).toBe(true)
    }
  })

  test('lands where the building pass draws a roof of that height', () => {
    for (const [bearing, pitch] of CAMERAS) {
      const map = makeMap({ bearing, pitch })
      const ppm = map.getPixelsPerMetre()
      for (const [x, y] of [[500, 320], [220, 500], [800, 420]]) {
        const latlng = map.containerPointToLatLng([x!, y!])
        const layer = map.project(latlng).subtract(map.getPixelOrigin())
        for (const metres of [50, 4000, 30000]) {
          const got = map.latLngToContainerPoint(latlng, metres)
          const want = drawnAt(map, layer.x, layer.y, metres * ppm)
          // The matrix is single precision, as the GPU has it.
          expect(got.distanceTo(want)).toBeLessThan(0.05)
        }
      }
    }
  })

  test('agrees with the building pass after a flat drag has moved the pane', () => {
    const map = makeMap()
    map._rawPanBy(new Point(120, -80))
    const latlng = map.containerPointToLatLng([700, 200])
    const layer = map.project(latlng).subtract(map.getPixelOrigin())
    const got = map.latLngToContainerPoint(latlng, 20000)
    expect(got.distanceTo(drawnAt(map, layer.x, layer.y, 20000 * map.getPixelsPerMetre()))).toBeLessThan(0.05)
  })

  test('a roof stands above its footprint when the map tilts', () => {
    const map = makeMap({ pitch: 60 })
    const latlng = map.containerPointToLatLng([500, 400])
    expect(map.latLngToContainerPoint(latlng, 20000).y).toBeLessThan(map.latLngToContainerPoint(latlng).y - 50)
  })

  test('a point risen past the camera is nowhere on screen', () => {
    const map = makeMap({ pitch: 60 })
    const latlng = map.containerPointToLatLng([500, 600])
    // Far higher than the camera stands.
    const p = map.latLngToContainerPoint(latlng, 1e9)
    expect(Math.abs(p.x)).toBeGreaterThan(1e6)
    expect(p.y).toBeGreaterThan(1e6)
  })

  test('pixels per metre follow the zoom and the latitude', () => {
    const equator = makeMap({ center: [0, 0], zoom: 9 })
    const north = makeMap({ center: [60, 0], zoom: 9 })
    // 256·2^9 pixels round the equator.
    expect(equator.getPixelsPerMetre()).toBeCloseTo((256 * 512) / 40075016.686, 10)
    // Mercator doubles the ground at 60°.
    expect(north.getPixelsPerMetre() / equator.getPixelsPerMetre()).toBeCloseTo(2, 3)
    equator._zoom = 10
    expect(equator.getPixelsPerMetre()).toBeCloseTo((256 * 1024) / 40075016.686, 10)
  })
})

describe('a marker with an altitude', () => {
  test('stands at the elevated point, and follows the camera', () => {
    const map = makeMap()
    const latlng = map.containerPointToLatLng([600, 450])
    const marker = new Marker(latlng, { icon: new DivIcon({ iconSize: [10, 10] }), altitude: 15000 }).addTo(map)
    expect(marker.getAltitude()).toBe(15000)

    for (const [bearing, pitch] of [[0, 0], [40, 0], [0, 45], [40, 60]]) {
      map.setBearing(bearing!)
      map.setPitch(pitch!)
      const onScreen = map._uprightPointToContainerPoint(DomUtil.getPosition(marker._icon as HTMLElement))
      const want = map.latLngToContainerPoint(latlng, 15000)
      expect(onScreen.distanceTo(want)).toBeLessThanOrEqual(1)
      if (pitch)
        expect(onScreen.y).toBeLessThan(map.latLngToContainerPoint(latlng).y - 10)
    }
  })

  test('setAltitude moves it; zero puts it back on the ground', () => {
    const map = makeMap({ pitch: 55 })
    const latlng = map.containerPointToLatLng([500, 400])
    const marker = new Marker(latlng, { icon: new DivIcon({ iconSize: [10, 10] }) }).addTo(map)
    const at = (): Point => map._uprightPointToContainerPoint(DomUtil.getPosition(marker._icon as HTMLElement))

    const ground = at()
    marker.setAltitude(20000)
    expect(at().y).toBeLessThan(ground.y - 50)
    marker.setAltitude(0)
    expect(at().distanceTo(ground)).toBeLessThanOrEqual(1)
  })

  test('a popup takes its own altitude, or its marker\'s', () => {
    const map = makeMap({ pitch: 55 })
    const latlng = map.containerPointToLatLng([500, 400])
    const marker = new Marker(latlng, { icon: new DivIcon({ iconSize: [10, 10] }), altitude: 9000 }).addTo(map)

    expect(new Popup({}, marker)._altitude()).toBe(9000)
    expect(new Popup({ altitude: 120 }, marker)._altitude()).toBe(120)
    expect(new Popup({ altitude: 0 }, marker)._altitude()).toBe(0)
    expect(new Popup({})._altitude()).toBe(0)
  })
})

describe('the building pass', () => {
  test('raises every tile by the map\'s one scale, so a marker can match it', async () => {
    // Two rows of tiles, well apart in latitude: taken tile by tile, the same
    // height was drawn taller in the northern row.
    const h = extrusionHarness(
      collection(square('south', 5, -30, 5, { votes: 1000 }), square('north', 5, 20, 5, { votes: 1000 })),
      { 'fill-extrusion-height': ['get', 'votes'], 'fill-extrusion-color': '#f00' },
      { pitch: 50 },
    )
    await h.show(4, 4, 4)
    await h.show(4, 3, 4)

    const draws = h.draw()
    expect(draws).toHaveLength(2)
    for (const draw of draws)
      expect(draw.heightScale).toBe(h.map.getPixelsPerMetre())
  })
})
