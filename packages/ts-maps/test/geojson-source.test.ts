import { describe, expect, test } from 'bun:test'
import { GeoJSONTileSource, TsMap } from '../src/core-map'

function point(lng: number, lat: number, properties: Record<string, unknown> = {}): any {
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lng, lat] } }
}

function collection(...features: any[]): any {
  return { type: 'FeatureCollection', features }
}

/**
 * Deliberately left without a view: setting one makes GridLayer build tiles,
 * and the test DOM's canvas element has no `classList`, so any tile layer
 * attached to a positioned map explodes in `_initTile`. These tests are about
 * source wiring, which happens before a single tile is asked for.
 */
function makeMap(): TsMap {
  const container = document.createElement('div')
  container.style.width = '400px'
  container.style.height = '400px'
  document.body.appendChild(container)
  return new TsMap(container, { zoomAnimation: false })
}

describe('GeoJSONTileSource', () => {
  test('places a point in the tile that contains it, and no other', () => {
    const source = new GeoJSONTileSource(collection(point(0, 0, { name: 'null island' })))

    // At z1 the origin sits on the corner of all four tiles; z1/1/0 is the
    // north-east quadrant, which owns longitude 0 going east.
    const inside = source.getTile(1, 1, 0)
    expect(inside).not.toBeNull()
    expect(inside!.layers.geojson.length).toBe(1)
    expect(inside!.layers.geojson.feature(0).properties.name).toBe('null island')

    expect(source.getTile(1, 0, 1)?.layers.geojson.length ?? 0).toBeLessThanOrEqual(1)
    expect(source.getTile(2, 0, 0)).toBeNull()
  })

  test('projects into tile-local extent coordinates', () => {
    const source = new GeoJSONTileSource(collection(point(0, 0)))
    const tile = source.getTile(1, 1, 0)!
    const [ring] = tile.layers.geojson.feature(0).loadGeometry()

    // Tile 1/1/0 is the north-east quadrant, so the origin lands on its
    // south-west corner: hard left, hard bottom.
    expect(ring![0]!.x).toBe(0)
    expect(ring![0]!.y).toBe(4096)
  })

  test('reports the MVT geometry type for each input shape', () => {
    const source = new GeoJSONTileSource(collection(
      point(0.1, 0.1),
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0.1, 0.1], [0.2, 0.2]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3], [0.1, 0.1]]] } },
    ))

    const layer = source.getTile(0, 0, 0)!.layers.geojson
    expect(layer.length).toBe(3)
    expect(layer.feature(0).type).toBe(1)
    expect(layer.feature(1).type).toBe(2)
    expect(layer.feature(2).type).toBe(3)
  })

  test('clips a line that crosses a tile edge, and splits re-entries', () => {
    // Runs west to east across the antimeridian-free middle of the world,
    // passing through tile 1/0/0 and out the far side.
    const source = new GeoJSONTileSource(collection({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[-170, 10], [170, 10]] },
    }))

    const tile = source.getTile(1, 0, 0)!
    const rings = tile.layers.geojson.feature(0).loadGeometry()
    for (const ring of rings) {
      for (const p of ring) {
        // Inside the tile, allowing for the edge buffer.
        expect(p.x).toBeGreaterThanOrEqual(-128)
        expect(p.x).toBeLessThanOrEqual(4096 + 128)
      }
    }
  })

  test('an empty tile is null rather than an empty layer', () => {
    const source = new GeoJSONTileSource(collection(point(0, 0)))
    expect(source.getTile(4, 15, 15)).toBeNull()
  })

  test('setData replaces the whole dataset', () => {
    const source = new GeoJSONTileSource(collection(point(0, 0), point(0.1, 0.1)))
    expect(source.length).toBe(2)

    source.setData(collection(point(0, 0)))
    expect(source.length).toBe(1)
  })

  test('features without usable geometry are skipped, not fatal', () => {
    const source = new GeoJSONTileSource(collection(
      point(0, 0),
      { type: 'Feature', properties: {}, geometry: null },
      { type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [] } },
    ))
    expect(source.length).toBe(1)
  })

  test('bbox covers every ring of a feature', () => {
    const source = new GeoJSONTileSource(collection({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
    }))
    const [minX, minY, maxX, maxY] = source.getTile(0, 0, 0)!.layers.geojson.feature(0).bbox()
    expect(maxX).toBeGreaterThan(minX)
    expect(maxY).toBeGreaterThan(minY)
  })
})

describe('geojson sources in setStyle', () => {
  const style = (data: unknown, cluster = false): any => ({
    version: 8,
    sources: { incidents: { type: 'geojson', data, ...(cluster ? { cluster: true } : {}) } },
    layers: [{
      id: 'incident-dots',
      type: 'circle',
      source: 'incidents',
      'source-layer': 'incidents',
      paint: { 'circle-radius': 6, 'circle-color': '#ff3b30' },
    }],
  })

  test('a geojson source no longer throws', () => {
    const map = makeMap()
    expect(() => map.setStyle(style(collection(point(-118.47, 34.02))))).not.toThrow()
    expect(map.getSource('incidents')).toBeDefined()
  })

  test('setSourceData reindexes in place', () => {
    const map = makeMap()
    map.setStyle(style(collection(point(-118.47, 34.02))))
    const before = map.getSource('incidents')

    let reported: any
    map.on('sourcedata', (event: any) => { reported = event })

    map.setSourceData('incidents', collection(point(-118.47, 34.02), point(-118.46, 34.03)))

    expect(reported.sourceId).toBe('incidents')
    // The same layer instance survives — no teardown, no flash.
    expect(map.getSource('incidents')).toBe(before)
    expect((map as any)._geoJSONSources.incidents.index.length).toBe(2)
  })

  test('a clustered source indexes through the cluster path', () => {
    const map = makeMap()
    map.setStyle(style(collection(point(-118.47, 34.02), point(-118.4701, 34.0201)), true))

    const entry = (map as any)._geoJSONSources.incidents
    expect(entry.clustered).toBe(true)

    // Two points a few metres apart collapse into one cluster when zoomed out.
    const clusters = entry.index.getClusters([-119, 33, -118, 35], 5)
    expect(clusters.length).toBe(1)
    expect(clusters[0].properties.cluster).toBe(true)
  })

  test('setSourceData on an unknown source is an explicit error', () => {
    const map = makeMap()
    map.setStyle(style(collection(point(0, 0))))
    expect(() => map.setSourceData('nope', collection())).toThrow(/not a geojson source/)
  })

  test('removeSource forgets the index too', () => {
    const map = makeMap()
    map.setStyle(style(collection(point(0, 0))))
    map.removeSource('incidents')
    expect((map as any)._geoJSONSources.incidents).toBeUndefined()
  })
})
