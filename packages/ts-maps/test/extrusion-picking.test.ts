import type { Occluder } from '../src/core-map/symbols/BuildingOcclusion'
import { describe, expect, test } from 'bun:test'
import { Point } from '../src/core-map/geometry/Point'
import { OccluderIndex } from '../src/core-map/symbols/BuildingOcclusion'
import { collection, extrusionHarness, square } from './helpers/extrusion'

// Picking a prism by the face the pointer is on. A prism stands up off its
// footprint, so on a tilted map the ground under the pointer belongs to
// whatever is behind the prism being pointed at.

function box(x0: number, y0: number, x1: number, y1: number, top: number, extra: Partial<Occluder> = {}): Occluder {
  return { ring: new Float64Array([x0, y0, x1, y0, x1, y1, x0, y1]), minX: x0, minY: y0, maxX: x1, maxY: y1, top, base: 0, ...extra }
}

// An eye well south of the tile and 800 up, looking north along x = 150:
// a sight line from (150, y) on the ground climbs 800 over (1000 − y).
const EYE = { x: 150, y: 1000, rise: 800 }

function sight(index: OccluderIndex, x: number, y: number): Array<{ index: number, t: number }> {
  return index.pick(x, y, EYE.x, EYE.y, EYE.rise, 1).sort((a, b) => b.t - a.t)
}

describe('OccluderIndex.pick', () => {
  test('a line from ground behind the prism comes out through its roof', () => {
    const index = new OccluderIndex([box(100, 100, 200, 200, 100)], 512)
    const hits = sight(index, 150, 50)
    expect(hits).toHaveLength(1)
    // Out at the height of the roof: 100 of the 800 it climbs.
    expect(hits[0]!.t).toBeCloseTo(100 / 800, 9)
  })

  test('a line from inside the footprint comes out through the near wall', () => {
    const index = new OccluderIndex([box(100, 100, 200, 200, 100)], 512)
    const hits = sight(index, 150, 150)
    expect(hits).toHaveLength(1)
    // The wall at y = 200, 50 along a run of 850.
    expect(hits[0]!.t).toBeCloseTo(50 / 850, 9)
  })

  test('a line that has climbed over the roof by the time it reaches the prism misses', () => {
    const index = new OccluderIndex([box(100, 100, 200, 200, 100)], 512)
    expect(sight(index, 150, -60)).toEqual([])
    // And one that passes to the side.
    expect(index.pick(300, 50, 300, 1000, 800, 1)).toEqual([])
  })

  test('the prism nearer the eye wins where the line passes through two', () => {
    const far = box(100, 100, 200, 200, 300)
    const near = box(100, 300, 200, 400, 200)
    const index = new OccluderIndex([far, near], 512)
    // From ground inside the far one, the line leaves it by its wall and then
    // goes through the near one, to come out of its roof.
    const hits = sight(index, 150, 190)
    expect(hits.map(h => h.index)).toEqual([1, 0])
    expect(hits[0]!.t).toBeCloseTo(200 / 800, 9)
  })

  test('a tall prism is picked by the wall it shows above a short one in front', () => {
    const far = box(100, 100, 200, 200, 300)
    const near = box(100, 300, 200, 400, 50)
    const index = new OccluderIndex([far, near], 512)
    // The line is 210 up as it passes over the near one, which is 50 high.
    expect(sight(index, 150, 50).map(h => h.index)).toEqual([0])
  })

  test('a courtyard is seen into, unless the walls round it are tall enough to hide it', () => {
    const hole = new Float64Array([150, 150, 150, 250, 250, 250, 250, 150])
    const low = new OccluderIndex([box(100, 100, 300, 300, 30, { holes: [hole] })], 512)
    const high = new OccluderIndex([box(100, 100, 300, 300, 100, { holes: [hole] })], 512)
    // From the courtyard floor the line crosses the wing between it and the
    // eye 50–100 up.
    expect(low.pick(200, 200, 200, 1000, 800, 1)).toEqual([])
    const hits = high.pick(200, 200, 200, 1000, 800, 1)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.t).toBeCloseTo(100 / 800, 9)
  })

  test('a prism raised off the ground is missed by a line that passes under it', () => {
    const index = new OccluderIndex([box(100, 100, 200, 200, 400, { base: 300 })], 512)
    // Inside the footprint, but out of it again at 42 up — below the base.
    expect(sight(index, 150, 150)).toEqual([])
    // From far enough behind, the line is between base and roof inside it.
    expect(index.pick(150, -300, 150, 1000, 800, 1)).toHaveLength(1)
  })

  test('straight down, it is whatever stands on the point', () => {
    const index = new OccluderIndex([box(100, 100, 200, 200, 100), box(300, 300, 400, 400, 100)], 512)
    const hits = index.pick(150, 150, 150, 150, 800, 1)
    expect(hits.map(h => h.index)).toEqual([0])
    expect(index.pick(250, 250, 250, 250, 800, 1)).toEqual([])
  })

  test('finds a small prism wherever along a long line it stands', () => {
    // A diagonal across the tile, and prisms a few pixels wide on it.
    for (const at of [20, 63, 64, 65, 127, 129, 255, 300, 480]) {
      const index = new OccluderIndex([box(at - 2, at - 2, at + 2, at + 2, 1000)], 512)
      expect(index.pick(0, 0, 512, 512, 800, 1)).toHaveLength(1)
    }
  })

  test('a prism in the tile\'s buffer, past its edge, is still found', () => {
    const index = new OccluderIndex([box(-100, 100, -60, 200, 500)], 512)
    expect(index.pick(-80, 50, -80, 1000, 800, 1)).toHaveLength(1)
  })
})

// --- Through the layer -------------------------------------------------------

// A tower south of the view's centre, so lower on screen and nearer the eye,
// and a low slab north of it — behind it. At zoom 4 a metre is a ten-thousandth
// of a pixel, hence the heights.
function scene(): any {
  return collection(
    square('tower', 2, -8, 2, { h: 600000 }),
    square('slab', 0.5, -5.5, 5, { h: 1000 }),
  )
}

const PAINT = { 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-color': '#f00' }

function ids(hits: Array<{ feature: { id?: unknown } }>): unknown[] {
  return hits.map(h => h.feature.id)
}

describe('queryRenderedFeatures over standing prisms', () => {
  for (const bearing of [0, 40, -110]) {
    test(`pointing at a tower's wall picks the tower, not the ground behind it (bearing ${bearing})`, async () => {
      const h = extrusionHarness(scene(), PAINT, { pitch: 60, bearing })
      await h.show(4, 4, 4)
      h.draw()

      // Half way up the middle of the tower.
      const p = h.map.latLngToContainerPoint([-7, 3], 300000)
      // The ground under that pixel is not the tower's: it is behind it, as
      // the camera sees it, which facing north is the slab's.
      const under = h.map.containerPointToLatLng(p)
      const onTower = under.lat > -8 && under.lat < -6 && under.lng > 2 && under.lng < 4
      expect(onTower).toBe(false)

      expect(ids(h.layer.queryRenderedFeatures(p))[0]).toBe('tower')
      expect(ids(h.layer.queryRenderedFeatures({ point: [p.x, p.y] }))[0]).toBe('tower')
      if (bearing === 0) {
        expect(under.lat).toBeGreaterThan(-5.5)
        expect(under.lat).toBeLessThan(-0.5)
        expect(ids(h.layer.queryRenderedFeatures(p))).toEqual(['tower', 'slab'])
      }
    })
  }

  test('on the roof, and on open ground', async () => {
    const h = extrusionHarness(scene(), PAINT, { pitch: 60 })
    await h.show(4, 4, 4)
    h.draw()

    const roof = h.map.latLngToContainerPoint([-7, 3], 600000)
    expect(ids(h.layer.queryRenderedFeatures(roof))[0]).toBe('tower')

    // Just above the roof on screen: over the top of the tower, onto
    // whatever is behind.
    const over = new Point(roof.x, roof.y - 15)
    expect(ids(h.layer.queryRenderedFeatures(over))).not.toContain('tower')

    // South of both, nearer the eye: nothing stands there.
    expect(h.layer.queryRenderedFeatures(h.map.latLngToContainerPoint([-12, 3]))).toEqual([])
  })

  test('flat on the map, a prism is still picked on its own footprint', async () => {
    const h = extrusionHarness(scene(), PAINT)
    await h.show(4, 4, 4)
    h.draw()
    expect(ids(h.layer.queryRenderedFeatures(h.map.latLngToContainerPoint([-3, 1.5])))).toEqual(['slab'])
  })

  test('honours `layers` and `filter`', async () => {
    const h = extrusionHarness(scene(), PAINT, { pitch: 60 })
    await h.show(4, 4, 4)
    h.draw()
    const p = h.map.latLngToContainerPoint([-7, 3], 300000)

    expect(h.layer.queryRenderedFeatures(p, { layers: ['other'] })).toEqual([])
    expect(ids(h.layer.queryRenderedFeatures(p, { layers: ['prisms'] }))).toEqual(['tower', 'slab'])
    // With the tower filtered out, what is behind it.
    expect(ids(h.layer.queryRenderedFeatures(p, { filter: ['<', ['get', 'h'], 5000] }))).toEqual(['slab'])
  })

  test('a prism cut across two tiles is reported once', async () => {
    // Straddling the meridian, which is a tile edge at every zoom.
    const h = extrusionHarness(collection(square('wide', -2, -8, 4, { h: 600000 })), PAINT, { pitch: 60 })
    await h.show(4, 4, 4)
    await h.show(3, 4, 4)
    expect(h.draw()).toHaveLength(2)

    for (const lng of [-1, -0.05, 0.05, 1]) {
      const hits = h.layer.queryRenderedFeatures(h.map.latLngToContainerPoint([-6, lng], 300000))
      expect(ids(hits)).toEqual(['wide'])
    }
  })

  test('above the horizon there is nothing to pick', async () => {
    const h = extrusionHarness(scene(), PAINT, { pitch: 80 })
    await h.show(4, 4, 4)
    h.draw()
    expect(h.layer.queryRenderedFeatures(new Point(256, 2))).toEqual([])
  })

  test('with no 3D pass, prisms are flat and picked by footprint', async () => {
    const h = extrusionHarness(scene(), PAINT, { pitch: 60 })
    await h.show(4, 4, 4)
    h.draw()
    const p = h.map.latLngToContainerPoint([-7, 3], 300000)
    h.layer._buildingOverlay = null
    expect(ids(h.layer.queryRenderedFeatures(p))).toEqual(['slab'])
  })

  test('a box query keeps to footprints', async () => {
    const h = extrusionHarness(scene(), PAINT, { pitch: 60 })
    await h.show(4, 4, 4)
    h.draw()
    const c = h.map.latLngToContainerPoint([-7, 3])
    expect(ids(h.layer.queryRenderedFeatures([[c.x - 3, c.y - 3], [c.x + 3, c.y + 3]]))).toEqual(['tower'])
  })

  test('each part of a multipolygon can be picked, and a hole seen through', async () => {
    const parts = {
      type: 'Feature',
      id: 'isles',
      properties: { h: 600000 },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[2, -8], [4, -8], [4, -6], [2, -6], [2, -8]]],
          [
            [[10, -12], [18, -12], [18, -4], [10, -4], [10, -12]],
            // Clockwise: a hole.
            [[12, -10], [12, -6], [16, -6], [16, -10], [12, -10]],
          ],
        ],
      },
    }
    const h = extrusionHarness(collection(parts), PAINT)
    await h.show(4, 4, 4)
    h.draw()

    const at = (lat: number, lng: number): unknown[] => ids(h.layer.queryRenderedFeatures(h.map.latLngToContainerPoint([lat, lng])))
    expect(at(-7, 3)).toEqual(['isles'])
    expect(at(-11, 11)).toEqual(['isles'])
    // The middle of the hole, seen from straight above. Flat, the camera
    // looks straight down only at the view's centre, so the hole is put there:
    // the line is vertical and stays inside it.
    const flat = extrusionHarness(collection(parts), PAINT, { center: [-8, 14] })
    await flat.show(4, 4, 4)
    flat.draw()
    expect(flat.layer.queryRenderedFeatures(new Point(256, 256))).toEqual([])
  })
})
