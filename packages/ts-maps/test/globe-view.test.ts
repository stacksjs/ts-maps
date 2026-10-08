import type { GlobeCamera } from '../src/core-map/map/GlobeView'
import { describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { Map } from '../src/core-map/map/Map'
import { globeFade, globeProject, globeRadius, globeUnproject } from '../src/core-map/map/GlobeView'

const CAM: GlobeCamera = { lat: 40, lng: -100, radius: 200, cx: 400, cy: 300, bearing: 0 }

/** Degrees between two places, along the sphere. */
function apart(a: { lat: number, lng: number }, b: { lat: number, lng: number }): number {
  const r = Math.PI / 180
  const c = Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((a.lng - b.lng) * r)
  return Math.acos(Math.max(-1, Math.min(1, c))) / r
}

describe('globe geometry', () => {
  test('the centre of the view is the middle of the disc, facing out', () => {
    const p = globeProject(CAM, 40, -100)
    expect(p.x).toBeCloseTo(400, 6)
    expect(p.y).toBeCloseTo(300, 6)
    expect(p.z).toBeCloseTo(1, 6)
  })

  test('north is up and east is right', () => {
    const north = globeProject(CAM, 50, -100)
    const east = globeProject(CAM, 40, -90)
    expect(north.y).toBeLessThan(300)
    expect(north.x).toBeCloseTo(400, 6)
    expect(east.x).toBeGreaterThan(400)
  })

  test('the far side faces away', () => {
    expect(globeProject(CAM, -40, 80).z).toBeLessThan(0)
  })

  test('there and back, turned or not', () => {
    for (const bearing of [0, 37, 200]) {
      const cam = { ...CAM, bearing }
      for (const [lat, lng] of [[40, -100], [55, -120], [10, -60], [72, 170], [-5, -95]]) {
        const p = globeProject(cam, lat, lng)
        if (p.z <= 0.05)
          continue
        const back = globeUnproject(cam, p.x, p.y)
        expect(back.onGlobe).toBe(true)
        expect(apart(back, { lat, lng })).toBeLessThan(1e-6)
      }
    }
  })

  test('a bearing turns the map counter-clockwise, as the flat map does', () => {
    // At 90, east is up.
    const east = globeProject({ ...CAM, lat: 0, bearing: 90 }, 0, -90)
    expect(east.y).toBeLessThan(300)
    expect(east.x).toBeCloseTo(400, 0)
  })

  test('off the disc is the rim in that direction, a quarter of the world away', () => {
    const rim = globeUnproject(CAM, 400 + 500, 300)
    expect(rim.onGlobe).toBe(false)
    expect(apart(rim, CAM)).toBeGreaterThan(85)
    expect(apart(rim, CAM)).toBeLessThan(90)
    expect(rim.lng).toBeGreaterThan(CAM.lng)
  })

  test('longitudes come back within half a world of the centre', () => {
    const cam = { ...CAM, lng: 175 }
    const east = globeUnproject(cam, 400 + 150, 300)
    expect(east.lng).toBeGreaterThan(180)
    expect(east.lng - cam.lng).toBeLessThan(180)
  })

  test('the radius matches the flat map at the centre by the hand-over', () => {
    const world = 256 * 2 ** 2
    expect(globeRadius(world, 2, 60)).toBeCloseTo(world / (2 * Math.PI), 6)
    const at = 256 * 2 ** 5.5
    expect(globeRadius(at, 5.5, 60)).toBeCloseTo(at / (2 * Math.PI) * 2, 6)
    expect(globeRadius(at, 5.5, 0)).toBeCloseTo(at / (2 * Math.PI), 6)
  })

  test('the globe fades out between zoom 5.5 and 6', () => {
    expect(globeFade(3)).toBe(1)
    expect(globeFade(5.5)).toBe(1)
    expect(globeFade(5.75)).toBeCloseTo(0.5, 6)
    expect(globeFade(6)).toBe(0)
  })
})

describe('the map round the globe', () => {
  function globeMap(drawn: boolean): Map {
    const container = document.createElement('div')
    container.style.width = '800px'
    container.style.height = '600px'
    document.body.appendChild(container)
    const map = new Map(container, { center: [40, -100], zoom: 2, projection: 'globe', zoomAnimation: false })
    map._size = new Point(800, 600)
    map._sizeChanged = false
    // No WebGL here: stand in for a globe that is being drawn.
    if (drawn)
      map._globeView = { active: () => map.getZoom() < 6, remove: () => {} } as any
    return map
  }

  test('without WebGL the map stays flat', () => {
    const map = globeMap(false)
    expect(map._globeActive()).toBe(false)
    const ll = map.containerPointToLatLng([700, 300])
    expect(map.latLngToContainerPoint(ll).x).toBeCloseTo(700, 0)
  })

  test('points on screen are places on the sphere, and back', () => {
    const map = globeMap(true)
    expect(map._globeActive()).toBe(true)
    // The view's centre, as near 40, -100 as a whole pixel gets.
    const center = map.containerPointToLatLng([400, 300])
    expect(center.lat).toBeCloseTo(map.getCenter().lat, 6)
    expect(center.lng).toBeCloseTo(map.getCenter().lng, 6)
    expect(Math.abs(center.lat - 40)).toBeLessThan(0.36)
    const p = map.latLngToContainerPoint(map.containerPointToLatLng([460, 250]))
    expect(p.x).toBeCloseTo(460, 0)
    expect(p.y).toBeCloseTo(250, 0)
    // Round the back: nowhere on screen.
    expect(map.latLngToContainerPoint([-40, 80]).y).toBeGreaterThan(1e6)
  })

  test('markers stand where the sphere puts them', () => {
    const map = globeMap(true)
    const g = globeProject(map._globeCamera(), 50, -90)
    const upright = map._latLngToUprightPoint([50, -90])
    expect(upright.x).toBeCloseTo(g.x, 0)
    expect(upright.y).toBeCloseTo(g.y, 0)
  })

  test('setView goes to the centre it is given, the short way round', () => {
    const map = globeMap(true)
    map.setView([-20, 150], 2, { animate: false })
    expect(map.getCenter().lat).toBeCloseTo(-20, 4)
    // -100 to 150 is shorter west, across the antimeridian.
    expect(map.getCenter().lng).toBeCloseTo(-210, 4)
  })

  test('a pan holds on to the ground, not the space round it', () => {
    const map = globeMap(true)
    const cam = map._globeCamera()
    const held = map._clampToGround(new Point(cam.cx + cam.radius * 3, cam.cy))
    expect(held.x - cam.cx).toBeCloseTo(cam.radius * 0.85, 6)
    expect(map._groundCamera()).toBe(true)
  })

  test('zoomed past the hand-over, the flat map is back', () => {
    const map = globeMap(true)
    map.setView([40, -100], 7, { animate: false })
    expect(map._globeActive()).toBe(false)
    expect(map._groundCamera()).toBe(false)
  })
})
