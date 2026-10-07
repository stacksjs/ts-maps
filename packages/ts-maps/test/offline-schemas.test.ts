import { describe, expect, test } from 'bun:test'
import { detectSchema, extractTile, MAPBOX_STREETS, OPENMAPTILES, PROTOMAPS, RoadGraph, roadClassForHighway, routeOnGraph, SHORTBREAD } from '../src/core-map/offline'
import { latToUnit, lngToUnit, unitToLat, unitToLng } from '../src/core-map/offline/plan'
import { VectorTile } from '../src/core-map/mvt'
import { Pbf } from '../src/core-map/proto'
import { SEARCH_CATEGORIES, SearchEngine } from '../src/core-map/search'
import { encodeTile, road } from './helpers/mvt'

// The same corner of San Francisco in four schemas: two streets meeting at
// (2000, 1000), one of them one-way, a café, and a neighbourhood.
const Z = 14
const X = Math.floor(lngToUnit(-122.42) * 2 ** Z)
const Y = Math.floor(latToUnit(37.78) * 2 ** Z)
const at = (px: number, py: number): { lat: number, lng: number } => ({ lat: unitToLat((Y + py / 4096) / 2 ** Z), lng: unitToLng((X + px / 4096) / 2 ** Z) })
const point = (props: Record<string, string | number | boolean>, x: number, y: number) => ({ type: 1 as const, props, lines: [[[x, y] as [number, number]]] })

const MARKET: Array<[number, number]> = [[500, 1000], [2000, 1000], [3500, 1000]]
const VAN_NESS: Array<[number, number]> = [[2000, 500], [2000, 1000], [2000, 3500]]

const FIXTURES = {
  protomaps: encodeTile({
    roads: [
      road({ kind: 'minor_road', kind_detail: 'residential', name: 'Market Street' }, ...MARKET),
      road({ kind: 'major_road', kind_detail: 'secondary', name: 'Van Ness Avenue', oneway: 'yes' }, ...VAN_NESS),
      road({ kind: 'path', kind_detail: 'footway' }, [500, 3000], [3500, 3000]),
      road({ kind: 'rail', kind_detail: 'rail' }, [500, 2000], [3500, 2000]),
    ],
    pois: [point({ kind: 'cafe', name: 'Blue Bottle Coffee', min_zoom: 15 }, 2100, 1100)],
    places: [point({ kind: 'neighbourhood', kind_detail: 'neighbourhood', name: 'Hayes Valley' }, 1500, 2000)],
  }),
  shortbread: encodeTile({
    streets: [
      road({ kind: 'residential', name: 'Market Street' }, ...MARKET),
      road({ kind: 'secondary', name: 'Van Ness Avenue', oneway: true }, ...VAN_NESS),
      road({ kind: 'footway' }, [500, 3000], [3500, 3000]),
    ],
    street_labels: [road({ kind: 'residential', name: 'Market Street' }, ...MARKET)],
    pois: [point({ amenity: 'cafe', name: 'Blue Bottle Coffee' }, 2100, 1100)],
    place_labels: [point({ kind: 'neighbourhood', name: 'Hayes Valley' }, 1500, 2000)],
  }),
  mapbox: encodeTile({
    road: [
      road({ class: 'street', name: 'Market Street' }, ...MARKET),
      road({ class: 'secondary', name: 'Van Ness Avenue', oneway: 'true' }, ...VAN_NESS),
      road({ class: 'path', type: 'footway' }, [500, 3000], [3500, 3000]),
      road({ class: 'major_rail' }, [500, 2000], [3500, 2000]),
    ],
    poi_label: [point({ class: 'food_and_drink', maki: 'cafe', type: 'Cafe', name: 'Blue Bottle Coffee', filterrank: 2 }, 2100, 1100)],
    place_label: [point({ class: 'settlement_subdivision', type: 'neighbourhood', name: 'Hayes Valley' }, 1500, 2000)],
  }),
  openmaptiles: encodeTile({
    transportation: [
      road({ class: 'minor' }, ...MARKET),
      road({ class: 'secondary', oneway: 1 }, ...VAN_NESS),
      road({ class: 'path', subclass: 'footway' }, [500, 3000], [3500, 3000]),
      road({ class: 'rail' }, [500, 2000], [3500, 2000]),
    ],
    transportation_name: [
      road({ class: 'minor', name: 'Market Street' }, ...MARKET),
      road({ class: 'secondary', name: 'Van Ness Avenue' }, ...VAN_NESS),
    ],
    poi: [point({ class: 'cafe', subclass: 'cafe', name: 'Blue Bottle Coffee', rank: 5 }, 2100, 1100)],
    place: [point({ class: 'neighbourhood', name: 'Hayes Valley' }, 1500, 2000)],
  }),
}

describe('tile schemas', () => {
  test('are told apart by their layer names', () => {
    expect(detectSchema(['transportation', 'poi', 'place'])).toBe(OPENMAPTILES)
    expect(detectSchema(['roads', 'pois', 'places', 'earth'])).toBe(PROTOMAPS)
    expect(detectSchema(['streets', 'street_labels', 'place_labels'])).toBe(SHORTBREAD)
    expect(detectSchema(['road', 'poi_label', 'place_label'])).toBe(MAPBOX_STREETS)
    expect(detectSchema(['something_else'])).toBe(OPENMAPTILES)
  })

  test('OSM highway values read as OpenMapTiles road classes', () => {
    expect(roadClassForHighway('motorway_link')).toBe('motorway')
    expect(roadClassForHighway('residential')).toBe('minor')
    expect(roadClassForHighway('street_limited')).toBe('minor')
    expect(roadClassForHighway('footway')).toBe('path:footway')
    expect(roadClassForHighway('rail')).toBeUndefined()
  })

  for (const [name, tile] of Object.entries(FIXTURES)) {
    describe(name, () => {
      const index = extractTile(tile, X, Y, Z)

      test('finds the café and the neighbourhood, and the streets by name, for search', () => {
        const byName = new Map(index.places.map(p => [p.name, p]))
        expect(byName.get('Blue Bottle Coffee')?.kind).toBe('cafe')
        expect(byName.get('Hayes Valley')?.kind).toBe('neighbourhood')
        expect(byName.get('Market Street')?.kind).toBe('street')
      })

      test('reads the roads, and leaves the railway out', () => {
        const kinds = index.roads.map(r => r.kind).sort()
        expect(kinds).toContain('secondary')
        expect(kinds).toContain('minor')
        expect(kinds).toContain('path:footway')
        expect(kinds.some(k => k.includes('rail'))).toBe(false)
        expect(index.roads.find(r => r.kind === 'secondary')?.oneway).toBe(1)
      })

      test('routes over them, naming the streets', () => {
        const [route] = routeOnGraph(new RoadGraph(index.roads), [at(700, 1000), at(2000, 3000)])
        expect(route).toBeDefined()
        expect(route!.steps.map(s => s.maneuver)).toEqual(['depart', 'turn-right', 'arrive'])
        expect(route!.steps[1]!.instruction).toBe('Turn right onto Van Ness Avenue')
      })
    })
  }

  test('a schema can be passed rather than found', () => {
    // Protomaps' tile read as OpenMapTiles finds nothing: the layers are not there.
    expect(extractTile(FIXTURES.protomaps, X, Y, Z, OPENMAPTILES).roads).toEqual([])
    expect(extractTile(FIXTURES.protomaps, X, Y, Z, PROTOMAPS).roads.length).toBeGreaterThan(0)
  })

  test('map search reads what the map has loaded, in whichever schema', async () => {
    for (const bytes of [FIXTURES.protomaps, FIXTURES.shortbread, FIXTURES.mapbox]) {
      const tile = new VectorTile(new Pbf(bytes))
      const host = {
        _decodedTiles: new Map([['14/x/y', { tile }]]),
        querySourceFeatures: ({ sourceLayer }: { sourceLayer: string }) => {
          const layer = tile.layers[sourceLayer]
          return layer ? Array.from({ length: layer.length }, (_, i) => ({ feature: layer.feature(i), tile: { x: X, y: Y, z: Z } })) : []
        },
        _subTile: (c: { x: number, y: number, z: number }) => ({ ...c, f: 1, sx: 0, sy: 0 }),
        _getZoomForUrl: (z: number) => z,
      }
      const map = { _style: { sourceLayers: new Map([['basemap', host]]) }, getCenter: () => at(2000, 2000), getZoom: () => 16 }
      const engine = new SearchEngine({ map, provider: null, offline: null })
      const found = await engine.search('blue bottle')
      expect(found[0]?.name).toBe('Blue Bottle Coffee')
      const coffee = SEARCH_CATEGORIES.find(c => c.id === 'coffee')!
      expect((await engine.nearby(coffee)).map(p => p.name)).toContain('Blue Bottle Coffee')
      expect((await engine.search('hayes')).map(p => p.name)).toContain('Hayes Valley')
    }
  })
})
