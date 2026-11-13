import { describe, expect, test } from 'bun:test'
import { Map as MapClass } from '../src/core-map/map/Map'
import { readBuildingVertex } from '../src/core-map/renderer/webgl/BuildingOverlay'
import { validateStyle } from '../src/core-map/style-spec'
import { collection, extrusionHarness, square } from './helpers/extrusion'

// A geojson source drawn as `fill-extrusion`: your own polygons stood up as
// prisms, with no basemap under them. Centred on [0, 0] at zoom 4, grid tile
// (4,4) is the 45° square south-east of the origin, so the fixtures sit there.

const HEIGHT = ['get', 'votes']
const COLOR = ['case', ['boolean', ['feature-state', 'hover'], false], '#ffffff', ['get', 'color']]

function fixture(): any {
  return collection(
    square('a', 5, -10, 5, { votes: 1000, color: '#ff0000' }),
    square('b', 20, -10, 5, { votes: 250, color: '#0000ff' }),
    square('flat', 30, -10, 5, { votes: 0, color: '#00ff00' }),
  )
}

/** The colours and heights of a mesh's vertices, in order. */
function vertices(mesh: { data: ArrayBuffer, count: number }): Array<ReturnType<typeof readBuildingVertex>> {
  return Array.from({ length: mesh.count }, (_, i) => readBuildingVertex(mesh, i))
}

describe('fill-extrusion over a geojson source', () => {
  test('stands each polygon up as a prism, at its own height and colour', async () => {
    const h = extrusionHarness(fixture(), { 'fill-extrusion-height': HEIGHT, 'fill-extrusion-color': COLOR })
    await h.show(4, 4, 4)

    const draws = h.draw()
    expect(draws).toHaveLength(1)

    // A roof of two triangles and four walls of two each, per square; the one
    // with no height is not a prism at all.
    const all = vertices(draws[0]!.mesh)
    expect(all).toHaveLength(2 * 30)

    const red = all.filter(v => v.color[0] === 1 && v.color[2] === 0)
    const blue = all.filter(v => v.color[2] === 1 && v.color[0] === 0)
    expect(red).toHaveLength(30)
    expect(blue).toHaveLength(30)
    expect(Math.max(...red.map(v => v.height))).toBe(1000)
    expect(Math.max(...blue.map(v => v.height))).toBe(250)
    // Walls stand on the ground.
    expect(Math.min(...red.map(v => v.height))).toBe(0)
  })

  test('reads feature-state when it meshes', async () => {
    const h = extrusionHarness(fixture(), { 'fill-extrusion-height': HEIGHT, 'fill-extrusion-color': COLOR })
    h.state.a = { hover: true }
    await h.show(4, 4, 4)

    const all = vertices(h.draw()[0]!.mesh)
    expect(all.filter(v => v.color[0] === 1 && v.color[1] === 1 && v.color[2] === 1)).toHaveLength(30)
    expect(all.filter(v => v.color[0] === 1 && v.color[1] === 0)).toHaveLength(0)
  })

  test('new data replaces the prisms of the old', async () => {
    const h = extrusionHarness(fixture(), { 'fill-extrusion-height': HEIGHT, 'fill-extrusion-color': COLOR })
    await h.show(4, 4, 4)
    expect(Math.max(...vertices(h.draw()[0]!.mesh).map(v => v.height))).toBe(1000)

    // What `Map.setSourceData` does: reindex, then redraw the layer. The tile
    // grid itself cannot run in the test DOM, so its part is played by hand.
    h.source.setData(collection(square('a', 5, -10, 5, { votes: 4000, color: '#ff0000' })))
    h.layer._removeAllTiles = () => {
      h.layer._decodedTiles.clear()
      h.layer._tiles = {}
    }
    h.layer._updateLevels = () => undefined
    h.layer._update = () => {}
    h.layer.redraw()
    await h.show(4, 4, 4)

    const all = vertices(h.draw()[0]!.mesh)
    expect(all).toHaveLength(30)
    expect(Math.max(...all.map(v => v.height))).toBe(4000)
  })

  test('a tile arriving asks for a frame, so prisms show without the camera moving', async () => {
    const h = extrusionHarness(fixture(), { 'fill-extrusion-height': HEIGHT, 'fill-extrusion-color': COLOR })
    let asked = 0
    h.layer._refreshSymbols = () => { asked++ }
    await h.show(4, 4, 4)
    expect(asked).toBeGreaterThan(0)
  })
})

describe('fill-extrusion-fade-range', () => {
  const paint = { 'fill-extrusion-height': HEIGHT, 'fill-extrusion-color': COLOR }

  test('by default prisms fade between 3 and 10 camera heights away', async () => {
    const h = extrusionHarness(fixture(), paint)
    await h.show(4, 4, 4)
    const { h: height } = h.map._cameraGeometry()
    expect(h.draw()[0]!.fog).toEqual([height * 3, height * 10])
  })

  test('a layer sets its own range, and [0, 0] turns the fade off', async () => {
    const near = extrusionHarness(fixture(), { ...paint, 'fill-extrusion-fade-range': [1, 2] })
    await near.show(4, 4, 4)
    const { h: height } = near.map._cameraGeometry()
    expect(near.draw()[0]!.fog).toEqual([height, height * 2])

    const never = extrusionHarness(fixture(), { ...paint, 'fill-extrusion-fade-range': [0, 0] })
    await never.show(4, 4, 4)
    expect(never.draw()[0]!.fog).toEqual([0, 0])
  })

  test('a tile past the end of the range is not built; with the fade off it is', async () => {
    // Twenty tiles north of the centre at zoom 8, seen at 80°: some fourteen
    // camera heights away.
    const far = collection(square('far', 1, 47.5, 0.5, { votes: 1000, color: '#ff0000' }))
    const camera = { zoom: 8, pitch: 80 }

    const faded = extrusionHarness(far, paint, camera)
    await faded.show(64, 44, 8)
    expect(faded.draw()).toEqual([])
    expect(faded.layer._buildingMeshes?.size ?? 0).toBe(0)

    const solid = extrusionHarness(far, { ...paint, 'fill-extrusion-fade-range': [0, 0] }, camera)
    await solid.show(64, 44, 8)
    expect(solid.draw()).toHaveLength(1)
  })

  test('is accepted by the style validator, as is a plain boolean gradient', () => {
    const style = (extra: Record<string, unknown>): any => ({
      version: 8,
      sources: { cells: { type: 'geojson', data: fixture() } },
      layers: [{ id: 'prisms', type: 'fill-extrusion', source: 'cells', paint: { ...paint, ...extra } }],
    })
    expect(validateStyle(style({ 'fill-extrusion-fade-range': [0, 0], 'fill-extrusion-vertical-gradient': false }))).toEqual([])
    expect(validateStyle(style({ 'fill-extrusion-fade-range': [3] })).length).toBeGreaterThan(0)
  })
})

describe('fill-extrusion-vertical-gradient', () => {
  test('is on unless the layer turns it off', async () => {
    const paint = { 'fill-extrusion-height': HEIGHT, 'fill-extrusion-color': COLOR }
    const shaded = extrusionHarness(fixture(), paint)
    await shaded.show(4, 4, 4)
    expect(shaded.draw()[0]!.gradient).toBe(true)

    const flat = extrusionHarness(fixture(), { ...paint, 'fill-extrusion-vertical-gradient': false })
    await flat.show(4, 4, 4)
    expect(flat.draw()[0]!.gradient).toBe(false)
  })
})

describe('feature state on standing prisms', () => {
  const paint = {
    'fill-extrusion-height': ['case', ['boolean', ['feature-state', 'raised'], false], ['*', 2, ['get', 'votes']], ['get', 'votes']],
    'fill-extrusion-color': COLOR,
  }
  const white = (v: { color: number[] }): boolean => v.color[0] === 1 && v.color[1] === 1 && v.color[2] === 1

  test('a hover recolours one prism where it lies, and meshes nothing', async () => {
    const h = extrusionHarness(fixture(), paint)
    await h.show(4, 4, 4)
    const mesh = h.draw()[0]!.mesh
    const builds = h.layer._meshBuilds
    expect(vertices(mesh).filter(white)).toHaveLength(0)

    h.state.a = { hover: true }
    h.layer._featureStateChanged('a')

    // The same mesh, thirty of its vertices changed, and those sent again.
    const after = h.draw()[0]!.mesh
    expect(after).toBe(mesh)
    expect(h.layer._meshBuilds).toBe(builds)
    expect(vertices(mesh).filter(white)).toHaveLength(30)
    expect(vertices(mesh).filter(v => v.color[2] === 1 && v.color[0] === 0)).toHaveLength(30)
    expect(h.patches).toHaveLength(1)
    expect(h.patches[0]![2]).toBe(30)

    // And back.
    h.state.a = {}
    h.layer._featureStateChanged('a')
    expect(vertices(mesh).filter(white)).toHaveLength(0)
    expect(h.layer._meshBuilds).toBe(builds)
  })

  test('a height from feature state re-raises the prism, and is picked at its new height', async () => {
    const h = extrusionHarness(fixture(), paint, { pitch: 60 })
    await h.show(4, 4, 4)
    const mesh = h.draw()[0]!.mesh
    const builds = h.layer._meshBuilds

    h.state.a = { raised: true }
    h.layer._featureStateChanged('a')

    const red = vertices(mesh).filter(v => v.color[0] === 1 && v.color[2] === 0)
    expect(Math.max(...red.map(v => v.height))).toBe(2000)
    expect(Math.min(...red.map(v => v.height))).toBe(0)
    expect(h.layer._meshBuilds).toBe(builds)
    const cached = [...h.layer._buildingMeshes!.values()][0]!
    expect(cached.occluders.buildings.find(b => b.id === 'a')!.top).toBe(2000)
  })

  test('a prism that appears is beyond patching: its tile alone is meshed again', async () => {
    const h = extrusionHarness(
      collection(square('a', 5, -10, 5, { votes: 1000, color: '#ff0000' }), square('flat', 30, -10, 5, { votes: 0, color: '#00ff00' }), square('north', 5, 20, 5, { votes: 500, color: '#0000ff' })),
      { ...paint, 'fill-extrusion-height': ['case', ['boolean', ['feature-state', 'raised'], false], 500, ['get', 'votes']] },
    )
    await h.show(4, 4, 4)
    await h.show(4, 3, 4)
    expect(h.draw()).toHaveLength(2)
    const builds = h.layer._meshBuilds

    // Hovering the flat one changes nothing that stands.
    h.state.flat = { hover: true }
    h.layer._featureStateChanged('flat')
    h.draw()
    expect(h.layer._meshBuilds).toBe(builds)

    // Raising it does: the tile it is in, and not the other.
    h.state.flat = { raised: true }
    h.layer._featureStateChanged('flat')
    const draws = h.draw()
    expect(h.layer._meshBuilds).toBe(builds + 1)
    expect(draws.reduce((n, d) => n + d.mesh.count, 0)).toBe(3 * 30)
  })

  test('a style that reads no feature state is left alone', async () => {
    const h = extrusionHarness(fixture(), { 'fill-extrusion-height': HEIGHT, 'fill-extrusion-color': ['get', 'color'] })
    await h.show(4, 4, 4)
    h.draw()
    let asked = 0
    h.layer._refreshSymbols = () => { asked++ }
    const version = h.layer._meshVersion

    h.state.a = { hover: true }
    h.layer._featureStateChanged('a')
    expect(asked).toBe(0)
    expect(h.layer._meshVersion).toBe(version)
    expect(h.patches).toHaveLength(0)
  })

  test('with no id to go on, every prism is meshed again', async () => {
    const h = extrusionHarness(fixture(), paint)
    await h.show(4, 4, 4)
    h.draw()
    const builds = h.layer._meshBuilds
    h.state.a = { hover: true }
    h.layer._featureStateChanged()
    expect(vertices(h.draw()[0]!.mesh).filter(white)).toHaveLength(30)
    expect(h.layer._meshBuilds).toBe(builds + 1)
  })

  test('a tile waiting its turn to be meshed again keeps showing what it had', async () => {
    const h = extrusionHarness(fixture(), paint)
    await h.show(4, 4, 4)
    const mesh = h.draw()[0]!.mesh

    // A change that re-meshes everything, in a frame with no time left.
    h.layer._invalidateMeshes()
    const now = performance.now
    let clock = 0
    performance.now = () => (clock += 100)
    try {
      const draws = h.draw()
      expect(draws).toHaveLength(1)
      expect(draws[0]!.mesh).toBe(mesh)
    }
    finally {
      performance.now = now
    }
    // And is rebuilt when there is.
    expect(h.draw()[0]!.mesh).not.toBe(mesh)
  })
})

describe('Map.setFeatureState', () => {
  function watched(): { map: any, changes: Array<number | string | undefined> } {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const map: any = new MapClass(el, { center: [0, 0], zoom: 2 })
    const changes: Array<number | string | undefined> = []
    map._style = {
      spec: { sources: { cells: { type: 'geojson' } }, layers: [] },
      sourceLayers: new globalThis.Map([['cells', { _featureStateChanged: (id?: number | string) => changes.push(id) }]]),
    }
    return { map, changes }
  }

  test('tells the source which feature changed', () => {
    const { map, changes } = watched()
    map.setFeatureState({ source: 'cells', id: '48201' }, { hover: true })
    expect(changes).toEqual(['48201'])
    map.removeFeatureState({ source: 'cells', id: '48201' }, 'hover')
    expect(changes).toEqual(['48201', '48201'])
  })

  test('setting what is already set, or removing what is not there, repaints nothing', () => {
    const { map, changes } = watched()
    map.setFeatureState({ source: 'cells', id: 7 }, { hover: true })
    map.setFeatureState({ source: 'cells', id: 7 }, { hover: true })
    map.setFeatureState({ source: 'cells', id: 7 }, {})
    map.removeFeatureState({ source: 'cells', id: 7 }, 'selected')
    map.removeFeatureState({ source: 'cells', id: 8 })
    expect(changes).toEqual([7])

    map.setFeatureState({ source: 'cells', id: 7 }, { hover: false })
    expect(changes).toEqual([7, 7])
  })
})
