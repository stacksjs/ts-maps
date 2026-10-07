import { afterEach, describe, expect, test } from 'bun:test'
import type { GltfJson } from '../src/core-map'
import { landmark, loadModel, modelFromGltf, parseGLB, plantTrees, roofOf, styles, treeKind, trees, TsMap } from '../src/core-map'
import { landmarkDraws, replacedPoints } from '../src/core-map/landmarks/Landmark'
import { sceneOf } from '../src/core-map/landmarks/scene'
import { buildTreeMesh } from '../src/core-map/landmarks/trees'
import type { BuildingMesh } from '../src/core-map/renderer/webgl/BuildingOverlay'
import { buildBuildingMesh, readBuildingVertex } from '../src/core-map/renderer/webgl/BuildingOverlay'

const SF: [number, number] = [37.7952, -122.4028]

function makeMap(zoom = 17): TsMap {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 800 })
  Object.defineProperty(container, 'clientHeight', { value: 600 })
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false, fadeAnimation: false })
  map.setView(SF, zoom)
  return map
}

afterEach(() => {
  document.body.replaceChildren()
})

function vertices(mesh: BuildingMesh): ReturnType<typeof readBuildingVertex>[] {
  return Array.from({ length: mesh.count }, (_, i) => readBuildingVertex(mesh, i))
}

/** A GLB from glTF JSON and its one binary buffer. */
function glb(json: GltfJson, bin: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = Math.ceil(text.length / 4) * 4
  const binLength = Math.ceil(bin.length / 4) * 4
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546C67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, out.length, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4E4F534A, true)
  out.fill(0x20, 20, 20 + jsonLength)
  out.set(text, 20)
  const at = 20 + jsonLength
  view.setUint32(at, binLength, true)
  view.setUint32(at + 4, 0x004E4942, true)
  out.set(bin, at + 8)
  return out
}

/**
 * A 10 m tall, 2 m wide wedge pointing up +Y, its tip leaning towards +X:
 * one triangle facing +Z, and a red material. Its node lifts it 1 m.
 */
function wedge(): { json: GltfJson, bin: Uint8Array } {
  const positions = new Float32Array([-1, 0, 0, 1, 0, 0, 1, 10, 0])
  const indices = new Uint16Array([0, 1, 2])
  const bin = new Uint8Array(positions.byteLength + 8)
  bin.set(new Uint8Array(positions.buffer), 0)
  bin.set(new Uint8Array(indices.buffer), positions.byteLength)
  const json: GltfJson = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [0, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: 6 }],
    buffers: [{ byteLength: bin.length }],
  }
  return { json, bin }
}

describe('pitched roofs', () => {
  const ring = [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 20 }, { x: 10, y: 20 }]
  const box = (roof: ReturnType<typeof roofOf>, rings = [ring]): ReturnType<typeof vertices> =>
    vertices(buildBuildingMesh([{ rings, height: 12, base: 0, color: [1, 1, 1, 1], ...(roof ? { roof } : {}) }], 512, 1))

  test('reads OpenStreetMap\'s and Overture\'s tags', () => {
    expect(roofOf({ 'roof:shape': 'gabled', 'roof:height': '4' })).toEqual({ shape: 'gabled', height: 4 })
    expect(roofOf({ roof_shape: 'hipped', roof_levels: 2 })).toEqual({ shape: 'hipped', height: 6 })
    expect(roofOf({ 'roof:shape': 'dome' })!.shape).toBe('pyramidal')
    expect(roofOf({ 'roof:shape': 'skillion', 'roof:direction': '90' })).toEqual({ shape: 'skillion', direction: 90 })
    expect(roofOf({ 'roof:shape': 'flat' })).toBeUndefined()
    expect(roofOf({ class: 'building' })).toBeUndefined()
  })

  test('a gable\'s ridge runs along the long side, and the gable ends rise to it', () => {
    const v = box({ shape: 'gabled', height: 4 })
    const top = Math.max(...v.map(p => p.height))
    expect(top).toBeCloseTo(12)
    const ridge = v.filter(p => Math.abs(p.height - 12) < 1e-4)
    expect(new Set(ridge.map(p => p.y))).toEqual(new Set([15]))
    expect(Math.min(...ridge.map(p => p.x))).toBeCloseTo(10)
    expect(Math.max(...ridge.map(p => p.x))).toBeCloseTo(30)
    // The long walls stop at the eave.
    const north = v.filter(p => p.y === 10 && p.ny < -0.9)
    expect(Math.max(...north.map(p => p.height))).toBeCloseTo(8)
    // The roof faces away from the ridge, and up.
    const slopes = v.filter(p => p.height > 8.01 && p.height < 11.99 && Math.hypot(p.nx, p.ny) > 0.05)
    for (const p of slopes) {
      expect(Math.sign(p.ny)).toBe(p.y < 15 ? -1 : 1)
      expect(Math.hypot(p.nx, p.ny)).toBeLessThan(0.95)
    }
  })

  test('a hip ends in slopes, a pyramid in a point', () => {
    const hip = box({ shape: 'hipped', height: 4 }).filter(p => Math.abs(p.height - 12) < 1e-4)
    expect(Math.min(...hip.map(p => p.x))).toBeCloseTo(15)
    expect(Math.max(...hip.map(p => p.x))).toBeCloseTo(25)
    const pyramid = box({ shape: 'pyramidal', height: 4 }).filter(p => Math.abs(p.height - 12) < 1e-4)
    expect(new Set(pyramid.map(p => `${p.x},${p.y}`))).toEqual(new Set(['20,15']))
  })

  test('a skillion slopes down the way it says', () => {
    // Down towards the east: high on the west wall.
    const v = box({ shape: 'skillion', height: 4, direction: 90 })
    const high = v.filter(p => Math.abs(p.height - 12) < 1e-4)
    expect(new Set(high.map(p => p.x))).toEqual(new Set([10]))
  })

  test('a roof over a courtyard, or cut by the tile edge, stays flat', () => {
    const hole = [{ x: 15, y: 12 }, { x: 15, y: 18 }, { x: 25, y: 18 }, { x: 25, y: 12 }]
    expect(new Set(box({ shape: 'gabled', height: 4 }, [ring, hole]).map(p => p.height))).toEqual(new Set([0, 12]))
    const edge = [{ x: 0, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 20 }, { x: 0, y: 20 }]
    expect(new Set(box({ shape: 'gabled', height: 4 }, [edge]).map(p => p.height))).toEqual(new Set([0, 12]))
  })

  test('without a height, a 30° pitch, no more than half the building', () => {
    const v = box({ shape: 'gabled' })
    // Half-width 5 m: 5·tan 30° ≈ 2.89 m.
    const eave = Math.max(...v.filter(p => p.y === 10 && p.ny < -0.9).map(p => p.height))
    expect(12 - eave).toBeCloseTo(5 * Math.tan(Math.PI / 6), 3)
  })
})

describe('landmark models', () => {
  test('reads a GLB: node transform, material colour, on the map\'s axes', () => {
    const { json, bin } = wedge()
    const parsed = parseGLB(glb(json, bin))
    const model = modelFromGltf(parsed.json, [parsed.bin!])
    expect(model.count).toBe(3)
    // glTF Y up becomes the third axis, lifted 1 m by its node.
    expect(Array.from(model.positions)).toEqual([-1, 0, 1, 1, 0, 1, 1, 0, 11])
    expect(model.bounds).toEqual([-1, 0, 1, 1, 0, 11])
    // Facing glTF +Z: south.
    expect(model.normals[1]).toBeCloseTo(1)
    expect(Array.from(model.colors.slice(0, 4))).toEqual([1, 0, 0, 1])
  })

  test('reads a .gltf with its buffer inline, and one fetched beside it', async () => {
    const { json, bin } = wedge()
    const base64 = btoa(String.fromCharCode(...bin))
    const inline = await loadModel({ ...json, buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${base64}` }] })
    expect(inline.count).toBe(3)

    const asked: string[] = []
    const fetcher = (async (url: string) => {
      asked.push(url)
      const body = url.endsWith('.gltf') ? new TextEncoder().encode(JSON.stringify({ ...json, buffers: [{ byteLength: bin.length, uri: 'tower.bin' }] })) : bin
      return new Response(body as BodyInit)
    }) as unknown as typeof fetch
    const fetched = await loadModel('https://models.test/sf/tower.gltf', { fetch: fetcher })
    expect(fetched.count).toBe(3)
    expect(asked).toEqual(['https://models.test/sf/tower.gltf', 'https://models.test/sf/tower.bin'])
  })

  test('says so for compression it cannot read', () => {
    expect(() => modelFromGltf({ ...wedge().json, extensionsRequired: ['KHR_draco_mesh_compression'] })).toThrow('KHR_draco_mesh_compression')
  })

  test('turns clockwise, scales and lifts', async () => {
    const { json, bin } = wedge()
    const tower = await landmark({ model: glb(json, bin), position: SF, rotation: 90, scale: 2, altitude: 5 }).ready()
    const v = vertices(tower.mesh!)
    // The tip leant east (+x); turned 90° clockwise it leans south (+y).
    expect(v[2]!.x).toBeCloseTo(0)
    expect(v[2]!.y).toBeCloseTo(2)
    expect(v[2]!.height).toBeCloseTo(11 * 2 + 5)
    // Its face turned from south to west.
    expect(v[0]!.nx).toBeCloseTo(-1, 1)
    expect(tower._occluders).toBeDefined()
  })

  test('draws where it stands, through the building camera', async () => {
    const map = makeMap()
    const { json, bin } = wedge()
    const tower = (await landmark({ model: glb(json, bin), position: SF }).ready()).addTo(map)
    expect(sceneOf(map).landmarks.has(tower)).toBe(true)
    const size = map.getSize()
    const camera = { width: size.x, height: size.y, bearing: 0, pitch: 0, h: map._cameraGeometry().h, pos: [0, 0] as [number, number] }
    const { draws, occlusion } = landmarkDraws(map, sceneOf(map).landmarks, camera, Infinity)
    expect(draws).toHaveLength(1)
    expect(occlusion).toHaveLength(1)
    // The model's origin lands on its coordinate's pixel.
    const m = draws[0]!.matrix
    const point = map.latLngToContainerPoint(SF)
    expect(((m[12]! / m[15]!) + 1) / 2 * size.x).toBeCloseTo(point.x, 0)
    expect((1 - m[13]! / m[15]!) / 2 * size.y).toBeCloseTo(point.y, 0)
    // Zoomed out past its minZoom, it is not drawn.
    map.setZoom(13)
    expect(landmarkDraws(map, sceneOf(map).landmarks, camera, Infinity).draws).toHaveLength(0)
    tower.remove()
    expect(sceneOf(map).landmarks.size).toBe(0)
  })

  test('sync moves, turns and fades it, leaving what has not changed', async () => {
    const map = makeMap()
    const { json, bin } = wedge()
    const tower = (await landmark({ model: glb(json, bin), position: SF }).ready()).addTo(map)
    const mesh = tower.mesh
    tower.sync({ position: SF, rotation: 0, opacity: 1 })
    expect(tower.mesh).toBe(mesh)
    tower.sync({ position: [37.8, -122.4], rotation: 45, opacity: 0.5 })
    expect(tower.position.lat).toBe(37.8)
    expect(tower.options.rotation).toBe(45)
    expect(tower.options.opacity).toBe(0.5)
    expect(tower.mesh).not.toBe(mesh)
  })

  test('marks where it stands in a tile, to leave the building there out', async () => {
    const map = makeMap()
    const { json, bin } = wedge()
    const tower = (await landmark({ model: glb(json, bin), position: SF }).ready()).addTo(map)
    const p = map.project(SF, 16)
    const tile = { x: Math.floor(p.x / 512), y: Math.floor(p.y / 512), z: 16 }
    const [[x, y]] = replacedPoints(map, [tower], tile, 512) as [[number, number]]
    expect(x).toBeCloseTo(p.x - tile.x * 512)
    expect(y).toBeCloseTo(p.y - tile.y * 512)
    tower.options.replace = false
    expect(replacedPoints(map, [tower], tile, 512)).toEqual([])
  })
})

describe('trees', () => {
  const tile = { x: 100, y: 200, z: 15, size: 512, mpp: 1 }
  const square = (x0: number, y0: number, x1: number, y1: number): Array<{ x: number, y: number }> => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]

  test('knows the woods in OpenMapTiles, Protomaps and Shortbread, and single trees', () => {
    expect(treeKind('landcover', { class: 'wood', subclass: 'forest' })).toBe('wood')
    expect(treeKind('landuse', { kind: 'forest' })).toBe('wood')
    expect(treeKind('land', { kind: 'forest' })).toBe('wood')
    expect(treeKind('poi', { natural: 'tree' })).toBe('tree')
    expect(treeKind('landcover', { class: 'grass' })).toBeUndefined()
    expect(treeKind('water', { class: 'wood' })).toBeUndefined()
  })

  test('plants a wood evenly, the same every time, and not in its clearing', () => {
    const wood = { kind: 'wood' as const, geometry: [square(100, 100, 200, 200), square(140, 140, 160, 160)] }
    const planted = plantTrees([wood], tile)
    expect(planted).toEqual(plantTrees([wood], tile))
    // 100 m square at 9 m spacing, less the clearing: about a hundred.
    expect(planted.length).toBeGreaterThan(90)
    expect(planted.length).toBeLessThan(140)
    for (const t of planted) {
      expect(t.x > 100 && t.x < 200 && t.y > 100 && t.y < 200).toBe(true)
      expect(t.x > 140 && t.x < 160 && t.y > 140 && t.y < 160).toBe(false)
    }
  })

  test('a wood over a tile edge is planted once, the same from either side', () => {
    const left = plantTrees([{ kind: 'wood', geometry: [square(400, 0, 600, 100)] }], tile)
    const right = plantTrees([{ kind: 'wood', geometry: [square(-112, 0, 88, 100)] }], { ...tile, x: 101 })
    const world = (t: { x: number, y: number }, x: number): string => `${(x * 512 + t.x).toFixed(3)},${t.y.toFixed(3)}`
    const a = new Set(left.map(t => world(t, 100)))
    const b = new Set(right.map(t => world(t, 101)))
    expect([...a].filter(k => b.has(k))).toEqual([])
    expect(left.every(t => t.x < 512)).toBe(true)
    expect(right.every(t => t.x >= 0)).toBe(true)
  })

  test('thins a big forest to the budget, and plants single trees where they are', () => {
    const forest = plantTrees([{ kind: 'wood', geometry: [square(0, 0, 512, 512)] }], tile, { maxPerTile: 500 })
    expect(forest.length).toBeGreaterThan(350)
    expect(forest.length).toBeLessThan(650)
    expect(plantTrees([{ kind: 'tree', geometry: [[{ x: 10, y: 20 }]] }], tile)).toHaveLength(1)
  })

  test('a tree is a trunk and a crown, lit from outside', () => {
    const mesh = buildTreeMesh([{ x: 50, y: 50, seed: 0.5 }], tile)
    const v = vertices(mesh)
    expect(mesh.count).toBe(54)
    expect(Math.max(...v.map(p => p.height))).toBeCloseTo(10.5)
    for (let i = 0; i < v.length; i += 3) {
      const cx = (v[i]!.x + v[i + 1]!.x + v[i + 2]!.x) / 3 - 50
      const cy = (v[i]!.y + v[i + 1]!.y + v[i + 2]!.y) / 3 - 50
      expect(cx * v[i]!.nx + cy * v[i]!.ny).toBeGreaterThan(0)
    }
  })

  test('come in with the tilt, past their zoom', () => {
    const map = makeMap()
    const forest = trees({ minZoom: 15, minPitch: 20 }).addTo(map)
    expect(sceneOf(map).trees).toBe(forest)
    expect(forest.visibility(17, 0)).toBe(0)
    expect(forest.visibility(14, 60)).toBe(0)
    expect(forest.visibility(17, 25)).toBeCloseTo(0.6)
    expect(forest.visibility(17, 60)).toBe(1)
    forest.remove()
    expect(sceneOf(map).trees).toBeUndefined()
  })
})

describe('the building pass', () => {
  test('draws landmarks from the basemap layer, even with no buildings in the style', async () => {
    const map = makeMap()
    map.setStyle(styles.light({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf' }))
    const { json, bin } = wedge()
    const tower = (await landmark({ model: glb(json, bin), position: SF }).ready()).addTo(map)
    const layer = (Object.values((map as any)._layers) as any[]).find(l => typeof l._buildingsFor === 'function')
    const rendered: any[][] = []
    layer._buildingOverlay = { active: true, resize() {}, clear() {}, release() {}, render: (draws: any[]) => rendered.push(draws) }
    layer._styleLayers = layer._styleLayers.filter((l: any) => l.type !== 'fill-extrusion')
    layer._drawBuildings()
    expect(rendered.at(-1)!.map(d => d.key)).toEqual([tower])
    // Labels behind it are hidden as behind a building.
    expect(layer._occlusion?.sources).toHaveLength(1)
  })
})
