import { describe, expect, test } from 'bun:test'
import { GeoJSONClusterSource } from '../src/core-map/layer/GeoJSONClusterSource'
import type { ClusterPoint } from '../src/core-map/layer/GeoJSONClusterSource'

// A deterministic linear-congruential generator — keeps fixtures stable under
// test re-runs without adding a runtime dependency on a seeded RNG lib.
function makeRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xFFFFFFFF
  }
}

function makePoint(lng: number, lat: number, props: Record<string, unknown> = {}): ClusterPoint {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: props,
  }
}

describe('GeoJSONClusterSource', () => {
  test('empty load returns 0 clusters at any zoom', () => {
    const src = new GeoJSONClusterSource().load([])
    expect(src.getClusters([-180, -85, 180, 85], 0).length).toBe(0)
    expect(src.getClusters([-180, -85, 180, 85], 10).length).toBe(0)
    expect(src.getClusters([-180, -85, 180, 85], 16).length).toBe(0)
  })

  test('clusters at low zoom, individual points at high zoom', () => {
    const rand = makeRandom(42)
    const points: ClusterPoint[] = []
    for (let i = 0; i < 100; i++) {
      // Pack 100 points into a 1°×1° bbox so they all collide at low zoom.
      points.push(makePoint(10 + rand(), 20 + rand(), { idx: i }))
    }
    const src = new GeoJSONClusterSource().load(points)

    // At zoom 0 the whole bbox aggregates into a handful of clusters.
    const lowZoom = src.getClusters([-180, -85, 180, 85], 0)
    expect(lowZoom.length).toBeLessThan(points.length)

    const totalAtLowZoom = lowZoom.reduce((acc, f) => acc + ((f.properties.point_count as number) ?? 1), 0)
    expect(totalAtLowZoom).toBe(points.length)

    // At zoom 17 (above maxZoom 16) all points are rendered individually.
    const highZoom = src.getClusters([9, 19, 12, 22], 17)
    expect(highZoom.length).toBe(points.length)
    for (const f of highZoom) {
      expect(f.properties.cluster).toBeUndefined()
    }
  })

  test('minPoints is respected', () => {
    const points: ClusterPoint[] = [
      makePoint(0, 0),
      makePoint(0.001, 0.001),
      makePoint(0.002, 0),
    ]
    const src = new GeoJSONClusterSource({ minPoints: 5 }).load(points)
    const clusters = src.getClusters([-1, -1, 1, 1], 0)
    // With 3 points and minPoints: 5 no cluster should form — all features
    // should appear as individual (non-cluster) points.
    for (const f of clusters) {
      expect(f.properties.cluster).toBeUndefined()
    }
    expect(clusters.length).toBe(3)
  })

  test('getChildren and getLeaves round-trip', () => {
    const rand = makeRandom(7)
    const points: ClusterPoint[] = []
    for (let i = 0; i < 50; i++)
      points.push(makePoint(rand() * 0.5, rand() * 0.5, { idx: i }))
    const src = new GeoJSONClusterSource().load(points)

    const clustersAtZero = src.getClusters([-180, -85, 180, 85], 0)
    const parent = clustersAtZero.find(f => f.properties.cluster === true)
    expect(parent).toBeDefined()

    const clusterId = parent!.properties.cluster_id as number
    const children = src.getChildren(clusterId)
    expect(children.length).toBeGreaterThan(0)

    const leaves = src.getLeaves(clusterId, 1000, 0)
    // Leaves should be the actual input points — no cluster entries.
    for (const leaf of leaves)
      expect(leaf.properties.cluster).toBeUndefined()
    expect(leaves.length).toBe(parent!.properties.point_count as number)
  })

  test('getClusterExpansionZoom returns a zoom >= current', () => {
    const rand = makeRandom(9)
    const points: ClusterPoint[] = []
    for (let i = 0; i < 20; i++)
      points.push(makePoint(rand() * 0.1, rand() * 0.1))
    const src = new GeoJSONClusterSource().load(points)
    const clusters = src.getClusters([-1, -1, 1, 1], 0)
    const parent = clusters.find(f => f.properties.cluster === true)
    expect(parent).toBeDefined()
    const expansion = src.getClusterExpansionZoom(parent!.properties.cluster_id as number)
    expect(expansion).toBeGreaterThan(0)
    expect(expansion).toBeLessThanOrEqual(17) // maxZoom default is 16, +1
  })

  test('reduce aggregates custom cluster properties', () => {
    const points: ClusterPoint[] = [
      makePoint(0, 0, { weight: 5 }),
      makePoint(0.001, 0.001, { weight: 10 }),
      makePoint(0.002, 0, { weight: 3 }),
    ]
    const src = new GeoJSONClusterSource({
      minPoints: 2,
      map: props => ({ total: props.weight as number }),
      reduce: (acc, props) => {
        acc.total = (acc.total as number) + (props.total as number)
      },
    }).load(points)
    const clusters = src.getClusters([-1, -1, 1, 1], 0)
    const cluster = clusters.find(f => f.properties.cluster === true)
    expect(cluster).toBeDefined()
    // Aggregated weight: 5 + 10 + 3 = 18.
    expect(cluster!.properties.total).toBe(18)
  })
})
