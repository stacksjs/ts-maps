/**
 * The raised ground's maths (map/TerrainView.ts), without WebGL: the camera
 * agrees with the flat map's at no height, height lifts a point up the
 * screen, a click cast onto the surface lands where the surface is drawn,
 * and the shared patch grid and the DEM lookups it reads from.
 */

import type { TerrainCamera } from '../src/core-map/map/TerrainView'
import { describe, expect, test } from 'bun:test'
import { buildTerrainGrid } from '../src/core-map/geo/terrainMesh'
import { TerrainSource } from '../src/core-map/geo/TerrainSource'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'
import { pixelsPerMetre, projectTerrainPoint, TerrainView, unprojectTerrainPoint } from '../src/core-map/map/TerrainView'

function createMap(pitch: number, bearing: number): TsMap {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const map = new TsMap(container, { center: [46, 7.6], zoom: 12, pitch, bearing })
  // The test DOM has no layout: give the map its size by hand.
  map._size = new Point(800, 600)
  map._sizeChanged = false
  map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
  return map
}

function cameraOf(map: TsMap): TerrainCamera {
  const size = map.getSize()
  const pos = map._getMapPanePos()
  return {
    cx: size.x / 2 + pos.x,
    cy: size.y / 2 + pos.y,
    lx: size.x / 2,
    ly: size.y / 2,
    bearing: map._bearing ?? 0,
    pitch: map._pitch ?? 0,
    h: map._cameraGeometry().h,
  }
}

const views: Array<[number, number]> = [[0, 0], [0, 30], [45, 0], [45, -20], [60, 135], [75, 300]]
// Layer points around the view, all on ground in front of the camera.
const points: Array<[number, number]> = [[400, 300], [0, 0], [800, 600], [150, 520], [640, 80], [400, 100]]

describe('terrain camera', () => {
  for (const [pitch, bearing] of views) {
    test(`at no height, lands where the flat map draws it (pitch ${pitch}, bearing ${bearing})`, () => {
      const map = createMap(pitch, bearing)
      const cam = cameraOf(map)
      for (const [x, y] of points) {
        const flat = map.layerPointToContainerPoint(new Point(x, y))
        const p = projectTerrainPoint(cam, x, y, 0)
        expect(p.depth).toBeGreaterThan(0)
        expect(p.x).toBeCloseTo(flat.x, 6)
        expect(p.y).toBeCloseTo(flat.y, 6)
      }
      map.remove()
    })

    test(`at no height, unprojects as the flat map does (pitch ${pitch}, bearing ${bearing})`, () => {
      const map = createMap(pitch, bearing)
      const cam = cameraOf(map)
      for (const [sx, sy] of [[400, 300], [10, 590], [790, 400], [300, 250]]) {
        const flat = map.containerPointToLayerPoint(new Point(sx, sy))
        const p = unprojectTerrainPoint(cam, sx, sy, 0)!
        expect(p.x).toBeCloseTo(flat.x, 6)
        expect(p.y).toBeCloseTo(flat.y, 6)
      }
      map.remove()
    })
  }

  test('unprojecting at a height is the inverse of projecting at it', () => {
    const map = createMap(55, 40)
    const cam = cameraOf(map)
    for (const lift of [-120, -10, 35, 200]) {
      for (const [x, y] of points) {
        const p = projectTerrainPoint(cam, x, y, lift)
        const back = unprojectTerrainPoint(cam, p.x, p.y, lift)!
        expect(back.x).toBeCloseTo(x, 6)
        expect(back.y).toBeCloseTo(y, 6)
      }
    }
    map.remove()
  })

  test('height lifts a point up the screen when the map is tilted', () => {
    const map = createMap(45, 0)
    const cam = cameraOf(map)
    for (const [x, y] of points) {
      const low = projectTerrainPoint(cam, x, y, 0)
      const high = projectTerrainPoint(cam, x, y, 100)
      expect(high.y).toBeLessThan(low.y)
      // Nearer the camera, too.
      expect(high.depth).toBeLessThan(low.depth)
    }
    // A valley sinks.
    const sunk = projectTerrainPoint(cam, 400, 300, -100)
    expect(sunk.y).toBeGreaterThan(300)
    map.remove()
  })

  test('looking straight down, height spreads points out from the centre and leaves the centre still', () => {
    const map = createMap(0, 0)
    const cam = cameraOf(map)
    const centre = projectTerrainPoint(cam, 400, 300, 150)
    expect(centre.x).toBeCloseTo(400, 9)
    expect(centre.y).toBeCloseTo(300, 9)
    const p = projectTerrainPoint(cam, 600, 450, 150)
    expect(p.x).toBeGreaterThan(600)
    expect(p.y).toBeGreaterThan(450)
    map.remove()
  })

  test('the turn of the bearing comes before the lift: the lift is straight up the screen at any bearing', () => {
    const map = createMap(50, 70)
    const cam = cameraOf(map)
    const centre = map.getSize().divideBy(2)
    const low = projectTerrainPoint(cam, centre.x, centre.y, 0)
    const high = projectTerrainPoint(cam, centre.x, centre.y, 80)
    expect(high.x).toBeCloseTo(low.x, 9)
    expect(high.y).toBeLessThan(low.y)
    map.remove()
  })

  test('a metre is drawn the size Mercator draws a metre of ground', () => {
    // The equator at zoom 0: the world's 256 px over its circumference.
    expect(pixelsPerMetre(256, 0.5)).toBeCloseTo(256 / (2 * Math.PI * 6378137), 15)
    // At 60° the ground is stretched twice over, and so is a height.
    const lat = 60 * Math.PI / 180
    const fy = (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2
    expect(pixelsPerMetre(256, fy) / pixelsPerMetre(256, 0.5)).toBeCloseTo(2, 9)
  })
})

describe('terrain view without WebGL', () => {
  function withTerrain(pitch: number, bearing: number, height: (fx: number, fy: number) => number): { map: TsMap, view: TerrainView } {
    const map = createMap(pitch, bearing)
    map.setTerrain({ source: 'dem' })
    const src = map.getTerrainSource()!
    // One z8 tile, reaching well past the view either way.
    const size = 256
    const z = 8
    const fx0 = (7.6 + 180) / 360
    const tx = Math.floor(fx0 * 2 ** z)
    const lat = 46 * Math.PI / 180
    const ty = Math.floor((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * 2 ** z)
    const grid = new Float32Array(size * size)
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++)
        grid[j * size + i] = height((tx + (i + 0.5) / size) / 2 ** z, (ty + (j + 0.5) / size) / 2 ** z)
    }
    src.addTileElevation({ z, x: tx, y: ty }, grid)
    const view = new TerrainView(map as any)
    return { map, view }
  }

  test('draws nothing and changes nothing', () => {
    const { map, view } = withTerrain(45, 0, () => 1000)
    expect(view.ready).toBe(false)
    expect(view.active()).toBe(false)
    // The map keeps none, so its maths stay the flat map's.
    expect(map._terrainView).toBeUndefined()
    expect(map._terrainActive()).toBe(false)
    view.remove()
    map.remove()
  })

  test('measures heights from the ground at the centre of the view', () => {
    // A slope rising to the east: 2000 m at the centre's longitude.
    const fxCentre = (7.6 + 180) / 360
    const { map, view } = withTerrain(45, 0, fx => 2000 + (fx - fxCentre) * 1e6)
    const frame = view.frame()
    expect(frame.ref).toBeCloseTo(2000, -1)
    expect(view.liftAt(400, 300)).toBeCloseTo(0, 1)
    expect(view.liftAt(600, 300)).toBeGreaterThan(0)
    expect(view.liftAt(200, 300)).toBeLessThan(0)
    view.remove()
    map.remove()
  })

  test('a click is cast onto the surface: projecting the ground it finds lands on the click', () => {
    const fxCentre = (7.6 + 180) / 360
    // A ridge east of the centre, standing well up off the flat map.
    const { map, view } = withTerrain(60, 20, fx => 1500 + 2500 * Math.exp(-(((fx - fxCentre) * 2 ** 12) ** 2)))
    view._range = { min: 1500, max: 4000 }
    for (const [sx, sy] of [[400, 300], [520, 260], [300, 420], [650, 200]]) {
      const ground = view.pick(sx, sy)
      const back = view.project(ground.x, ground.y)
      expect(back.x).toBeCloseTo(sx, 1)
      expect(back.y).toBeCloseTo(sy, 1)
    }
    view.remove()
    map.remove()
  })
})

describe('buildTerrainGrid', () => {
  test('a square grid with a skirt round its edge', () => {
    const n = 8
    const grid = buildTerrainGrid(n)
    expect(grid.side).toBe(n + 1)
    expect(grid.vertexCount).toBe((n + 1) ** 2 + 4 * (n + 1))
    expect(grid.indexCount).toBe(n * n * 6 + 4 * n * 6)
    expect(grid.vertices.length).toBe(grid.vertexCount * 3)
    for (const i of grid.indices)
      expect(i).toBeLessThan(grid.vertexCount)
    // Grid vertices first, row by row, at their own heights.
    expect([grid.vertices[0], grid.vertices[1], grid.vertices[2]]).toEqual([0, 0, 0])
    const last = (n + 1) ** 2 - 1
    expect([grid.vertices[last * 3], grid.vertices[last * 3 + 1], grid.vertices[last * 3 + 2]]).toEqual([1, 1, 0])
    for (let v = 0; v <= last; v++)
      expect(grid.heightIndex[v]).toBe(v)
  })

  test('each skirt vertex hangs from an edge vertex at the same place', () => {
    const n = 4
    const grid = buildTerrainGrid(n)
    const side = n + 1
    for (let v = side * side; v < grid.vertexCount; v++) {
      const top = grid.heightIndex[v]!
      expect(grid.vertices[v * 3 + 2]).toBe(1)
      expect(grid.vertices[v * 3]).toBe(grid.vertices[top * 3]!)
      expect(grid.vertices[v * 3 + 1]).toBe(grid.vertices[top * 3 + 1]!)
      const i = top % side
      const j = Math.floor(top / side)
      expect(i === 0 || j === 0 || i === n || j === n).toBe(true)
    }
  })

  test('refuses a grid 16-bit indices cannot reach', () => {
    expect(() => buildTerrainGrid(300)).toThrow(RangeError)
  })
})

describe('TerrainSource.sampleWorld', () => {
  test('agrees with queryElevation', () => {
    const src = new TerrainSource({ demSize: 256 })
    const grid = new Float32Array(256 * 256)
    for (let i = 0; i < grid.length; i++)
      grid[i] = (i % 256) * 3 + Math.floor(i / 256)
    src.addTileElevation({ z: 1, x: 1, y: 0 }, grid)
    for (const [lng, lat] of [[10, 10], [90, 45], [170, 80]]) {
      const fx = (lng + 180) / 360
      const r = lat * Math.PI / 180
      const fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2
      expect(src.sampleWorld(fx, fy, 3)).toBeCloseTo(src.queryElevation(lng, lat, 3)!, 6)
    }
  })

  test('reads a 512 px DEM tile across its whole width', () => {
    const src = new TerrainSource({ demSize: 512 })
    const grid = new Float32Array(512 * 512)
    for (let i = 0; i < grid.length; i++)
      grid[i] = i % 512
    src.addTileElevation({ z: 0, x: 0, y: 0 }, grid)
    // Three quarters of the way east is sample 383.5 of 512.
    expect(src.sampleWorld(0.75, 0.5, 0)).toBeCloseTo(383.5, 6)
  })

  test('sees a finer tile as soon as it arrives', () => {
    const src = new TerrainSource({ demSize: 4 })
    src.addTileElevation({ z: 0, x: 0, y: 0 }, new Float32Array(16).fill(100))
    expect(src.sampleWorld(0.3, 0.3, 2)).toBe(100)
    src.addTileElevation({ z: 1, x: 0, y: 0 }, new Float32Array(16).fill(250))
    expect(src.sampleWorld(0.3, 0.3, 2)).toBe(250)
    src.deleteTile({ z: 1, x: 0, y: 0 })
    expect(src.sampleWorld(0.3, 0.3, 2)).toBe(100)
  })

  test('keeps no more than maxTiles, dropping the oldest', () => {
    const src = new TerrainSource({ demSize: 2, maxTiles: 3 })
    for (let x = 0; x < 5; x++)
      src.addTileElevation({ z: 3, x, y: 0 }, new Float32Array(4))
    expect(src.size()).toBe(3)
    expect(src.hasTile({ z: 3, x: 0, y: 0 })).toBe(false)
    expect(src.hasTile({ z: 3, x: 4, y: 0 })).toBe(true)
  })
})
