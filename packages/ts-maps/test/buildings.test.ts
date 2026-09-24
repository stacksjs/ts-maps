import { describe, expect, test } from 'bun:test'
import type { BuildingFootprint, BuildingMesh } from '../src/core-map/renderer/webgl/BuildingOverlay'
import { buildBuildingMesh, buildingMatrix, readBuildingVertex } from '../src/core-map/renderer/webgl/BuildingOverlay'
import { Point } from '../src/core-map/geometry/Point'
import { styles } from '../src/core-map'
import { TsMap } from '../src/core-map/map/Map'

const GREY: [number, number, number, number] = [0.8, 0.8, 0.8, 1]

/** A square footprint, wound as the vector tile spec winds outer rings. */
function square(x: number, y: number, w: number, extra: Partial<BuildingFootprint> = {}): BuildingFootprint {
  return {
    rings: [[{ x, y }, { x: x + w, y }, { x: x + w, y: y + w }, { x, y: y + w }]],
    height: 30,
    base: 0,
    color: GREY,
    ...extra,
  }
}

function vertices(mesh: BuildingMesh): Array<ReturnType<typeof readBuildingVertex>> {
  return Array.from({ length: mesh.count }, (_, i) => readBuildingVertex(mesh, i))
}

/** Wall vertices, grouped by the direction their normal faces. */
function wallNormals(mesh: BuildingMesh): Array<[number, number]> {
  const seen = new Map<string, [number, number]>()
  for (const v of vertices(mesh)) {
    if (Math.hypot(v.nx, v.ny) < 0.5)
      continue
    seen.set(`${Math.round(v.nx)},${Math.round(v.ny)}`, [Math.round(v.nx), Math.round(v.ny)])
  }
  return [...seen.values()]
}

describe('building meshes', () => {
  test('a box is a roof and four walls', () => {
    const mesh = buildBuildingMesh([square(100, 100, 50)], 512)
    // Two roof triangles, and two triangles for each of four walls.
    expect(mesh.count).toBe(6 + 4 * 6)
    const roof = vertices(mesh).filter(v => Math.hypot(v.nx, v.ny) < 0.5)
    expect(roof.length).toBe(6)
    expect(roof.every(v => v.height === 30)).toBe(true)
  })

  test('walls face out of the building', () => {
    const normals = wallNormals(buildBuildingMesh([square(100, 100, 50)], 512))
    // Screen axes: north is −y. One wall facing each way.
    expect(normals).toContainEqual([0, -1])
    expect(normals).toContainEqual([1, 0])
    expect(normals).toContainEqual([0, 1])
    expect(normals).toContainEqual([-1, 0])
    // And specifically the north wall (y = 100) faces north.
    const north = vertices(buildBuildingMesh([square(100, 100, 50)], 512)).find(v => v.y === 100 && Math.hypot(v.nx, v.ny) > 0.5 && v.ny < -0.5)
    expect(north).toBeDefined()
  })

  test('data wound the other way still lights from the outside', () => {
    const reversed = square(100, 100, 50)
    reversed.rings[0]!.reverse()
    const north = vertices(buildBuildingMesh([reversed], 512)).filter(v => v.y === 100 && v.ny !== 0 && Math.abs(v.nx) < 0.1)
    expect(north.every(v => v.ny < 0)).toBe(true)
  })

  test('walls run along the tile edge are left for the tile they belong to', () => {
    // Clipped at the tile's right edge: the cut is not a real wall.
    const mesh = buildBuildingMesh([square(480, 100, 60)], 512)
    const atEdge = vertices(mesh).filter(v => v.x >= 512 && Math.abs(v.nx) > 0.5)
    expect(atEdge.length).toBe(0)
  })

  test('a courtyard stays open and gets walls of its own', () => {
    const building: BuildingFootprint = {
      rings: [
        [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
        // Hole, wound the other way.
        [{ x: 40, y: 40 }, { x: 40, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 40 }],
      ],
      height: 20,
      base: 0,
      color: GREY,
    }
    const mesh = buildBuildingMesh([building], 512)
    const verts = vertices(mesh)
    // No roof triangle has its centre in the courtyard.
    const roof = verts.filter(v => Math.hypot(v.nx, v.ny) < 0.5)
    for (let i = 0; i < roof.length; i += 3) {
      const cx = (roof[i]!.x + roof[i + 1]!.x + roof[i + 2]!.x) / 3
      const cy = (roof[i]!.y + roof[i + 1]!.y + roof[i + 2]!.y) / 3
      expect(cx > 40 && cx < 60 && cy > 40 && cy < 60).toBe(false)
    }
    // The courtyard's walls face into it: the one at x = 40 faces east.
    const courtyardWest = verts.filter(v => v.x === 40 && v.y >= 40 && v.y <= 60 && Math.abs(v.nx) > 0.5)
    expect(courtyardWest.length).toBeGreaterThan(0)
    expect(courtyardWest.every(v => v.nx > 0)).toBe(true)
  })

  test('a building no taller than its base is skipped', () => {
    expect(buildBuildingMesh([square(0, 0, 10, { height: 5, base: 5 })], 512).count).toBe(0)
  })

  test('walls darken toward their foot, roofs do not', () => {
    const verts = vertices(buildBuildingMesh([square(100, 100, 50, { base: 10 })], 512))
    const walls = verts.filter(v => Math.hypot(v.nx, v.ny) > 0.5)
    expect(walls.filter(v => v.height === 10).every(v => v.t === 0)).toBe(true)
    expect(walls.filter(v => v.height === 30).every(v => v.t === 1)).toBe(true)
  })
})

function makeMap(options: Record<string, unknown> = {}): TsMap {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const map = new TsMap(el, { center: [37.7915, -122.3985], zoom: 16, ...options })
  map._size = new Point(1000, 640)
  map._sizeChanged = false
  map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
  map._applyCameraTransform()
  return map
}

/** Apply a clip-space matrix to (x, y, z) and return container pixels. */
function project(m: Float32Array, x: number, y: number, z: number, W: number, H: number): { x: number, y: number } {
  const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!
  const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!
  const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
  return { x: (cx / cw + 1) * W / 2, y: (1 - cy / cw) * H / 2 }
}

function cameraOf(map: TsMap) {
  const pos = map._getMapPanePos()
  return { width: 1000, height: 640, bearing: map._bearing, pitch: map._pitch, h: map._cameraGeometry().h, pos: [pos.x, pos.y] as [number, number] }
}

describe('the building camera', () => {
  test('a building\'s footprint lands exactly on the ground under it', () => {
    for (const [bearing, pitch] of [[0, 0], [30, 0], [0, 60], [-25, 75]]) {
      const map = makeMap({ bearing, pitch })
      // Tile pixels = layer pixels here: scale 1, origin 0.
      const m = buildingMatrix(cameraOf(map), 1, [0, 0])
      for (const [x, y] of [[500, 320], [200, 500], [800, 400]]) {
        const layer = map.containerPointToLayerPoint(new Point(x, y))
        const p = project(m, layer.x, layer.y, 0, 1000, 640)
        expect(p.x).toBeCloseTo(x, 3)
        expect(p.y).toBeCloseTo(y, 3)
      }
    }
  })

  test('a roof stands above its footprint on screen when the map tilts', () => {
    const map = makeMap({ pitch: 60 })
    const m = buildingMatrix(cameraOf(map), 1, [0, 0])
    const layer = map.containerPointToLayerPoint(new Point(500, 400))
    const foot = project(m, layer.x, layer.y, 0, 1000, 640)
    const roof = project(m, layer.x, layer.y, 100, 1000, 640)
    expect(roof.y).toBeLessThan(foot.y - 50)
  })

  test('seen from straight above, tall buildings lean away from the centre', () => {
    const map = makeMap()
    const m = buildingMatrix(cameraOf(map), 1, [0, 0])
    const layer = map.containerPointToLayerPoint(new Point(800, 320))
    const foot = project(m, layer.x, layer.y, 0, 1000, 640)
    const roof = project(m, layer.x, layer.y, 100, 1000, 640)
    expect(roof.x).toBeGreaterThan(foot.x)
  })
})

describe('the built-in style', () => {
  test('buildings are extruded to their mapped height', () => {
    const style = styles.light({ tiles: 'https://tiles/{z}/{x}/{y}.pbf' })
    const building = style.layers.find(l => l.id === 'building') as any
    expect(building.type).toBe('fill-extrusion')
    expect(JSON.stringify(building.paint['fill-extrusion-height'])).toContain('render_height')
  })
})
