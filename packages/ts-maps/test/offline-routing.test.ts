import { describe, expect, test } from 'bun:test'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import type { OfflineRoad } from '../src/core-map/offline'
import { extractTile, restrictionsFromOverpass, RoadGraph, routeOnGraph } from '../src/core-map/offline'
import { latToUnit, lngToUnit, unitToLat, unitToLng } from '../src/core-map/offline/plan'
import { encodeTile, road } from './helpers/mvt'

const Z = 14
const X = Math.floor(lngToUnit(-122.42) * 2 ** Z)
const Y = Math.floor(latToUnit(37.78) * 2 ** Z)
const at = (px: number, py: number): { lat: number, lng: number } => ({ lat: unitToLat((Y + py / 4096) / 2 ** Z), lng: unitToLng((X + px / 4096) / 2 ** Z) })
const roadsOf = (tile: Uint8Array): OfflineRoad[] => extractTile(tile, X, Y, Z).roads

/**
 * A city block, each side a street running on past the corners, so every
 * corner is a crossing. From the middle of its south side to the middle of
 * its north side is as far round the west as round the east: two right
 * turns one way, two left turns the other.
 */
const BLOCK = encodeTile({
  transportation: [
    road({ class: 'minor' }, [200, 3500], [3800, 3500]),
    road({ class: 'minor' }, [200, 500], [3800, 500]),
    road({ class: 'minor' }, [500, 200], [500, 3800]),
    road({ class: 'minor' }, [3500, 200], [3500, 3800]),
  ],
  transportation_name: [
    road({ class: 'minor', name: 'South Street' }, [200, 3500], [3800, 3500]),
    road({ class: 'minor', name: 'North Street' }, [200, 500], [3800, 500]),
    road({ class: 'minor', name: 'West Street' }, [500, 200], [500, 3800]),
    road({ class: 'minor', name: 'East Street' }, [3500, 200], [3500, 3800]),
  ],
})
const turns = (graph: RoadGraph): string[] => routeOnGraph(graph, [at(2000, 3500), at(2000, 500)])[0]!.steps.map(s => s.maneuver!).filter(m => m.startsWith('turn'))

describe('turn costs', () => {
  test('of two routes as long, the one turning with the traffic is taken', () => {
    expect(turns(new RoadGraph(roadsOf(BLOCK)))).toEqual(['turn-right', 'turn-right'])
    // Where traffic keeps left, a left turn is the easy one.
    expect(turns(new RoadGraph(roadsOf(BLOCK), { drivingSide: 'left' }))).toEqual(['turn-left', 'turn-left'])
  })

  test('a turn costs time, a U-turn more, going straight through the bigger road next to none', () => {
    const graph = new RoadGraph(roadsOf(BLOCK))
    const [route] = routeOnGraph(graph, [at(2000, 3500), at(2000, 500)])
    const driving = route!.distance / (30 / 3.6)
    // Two right turns at minor crossings: several seconds each, not minutes.
    expect(route!.duration - driving).toBeGreaterThan(10)
    expect(route!.duration - driving).toBeLessThan(30)
  })
})

describe('turn restrictions', () => {
  // At the south-west corner, coming from the east along South Street.
  const corner = { from: at(1000, 3500), via: at(500, 3500) }

  test('"no right turn" sends the route the other way round', () => {
    const graph = new RoadGraph(roadsOf(BLOCK), { restrictions: [{ type: 'no', ...corner, to: at(500, 3000) }] })
    expect(turns(graph)).toEqual(['turn-left', 'turn-left'])
  })

  test('"only straight on" does too', () => {
    const graph = new RoadGraph(roadsOf(BLOCK), { restrictions: [{ type: 'only', ...corner, to: at(200, 3500) }] })
    expect(turns(graph)).toEqual(['turn-left', 'turn-left'])
  })

  test('do not bind people on foot', () => {
    const graph = new RoadGraph(roadsOf(BLOCK), { profile: 'walking', restrictions: [{ type: 'no', ...corner, to: at(500, 3000) }] })
    expect(routeOnGraph(graph, [at(2000, 3500), at(500, 2000)])[0]!.distance).toBeLessThan(3200)
  })

  test('are read from OpenStreetMap relations, as Overpass returns them', () => {
    const via = { lat: 37.78, lon: -122.42 }
    const answer = {
      elements: [
        {
          type: 'relation',
          tags: { type: 'restriction', restriction: 'no_left_turn' },
          members: [
            { type: 'way', role: 'from', geometry: [{ lat: 37.779, lon: -122.42 }, { lat: 37.7795, lon: -122.42 }, via] },
            { type: 'node', role: 'via', ...via },
            { type: 'way', role: 'to', geometry: [via, { lat: 37.78, lon: -122.421 }, { lat: 37.78, lon: -122.422 }] },
          ],
        },
        // Through a way, not a node: left out.
        { type: 'relation', tags: { restriction: 'no_u_turn' }, members: [{ type: 'way', role: 'via' }] },
      ],
    }
    expect(restrictionsFromOverpass(answer)).toEqual([{
      type: 'no',
      from: { lat: 37.7795, lng: -122.42 },
      via: { lat: 37.78, lng: -122.42 },
      to: { lat: 37.78, lng: -122.421 },
    }])
  })
})

describe('access', () => {
  // A pedestrian street straight across, and the long way round by road.
  const tile = encodeTile({
    transportation: [
      road({ class: 'minor' }, [500, 2000], [1000, 2000]),
      road({ class: 'path', subclass: 'pedestrian', access: 'no', foot: 'yes' }, [1000, 2000], [3000, 2000]),
      road({ class: 'minor', access: 'no' }, [1000, 2000], [3000, 2010]),
      road({ class: 'minor' }, [1000, 2000], [1000, 3000], [3000, 3000], [3000, 2000]),
      road({ class: 'minor' }, [3000, 2000], [3500, 2000]),
      // A kerb ramp: a footway, not a slip road.
      road({ class: 'path', subclass: 'footway', ramp: 1 }, [500, 2050], [3500, 2050]),
    ],
  })

  test('a road closed to traffic is driven round, and walked through', () => {
    const roads = roadsOf(tile)
    expect(roads.filter(r => r.noCar).length).toBe(2)
    // `access=no` is everyone, unless `foot` says otherwise.
    expect(roads.filter(r => r.noFoot).map(r => r.kind)).toEqual(['minor'])
    const drive = routeOnGraph(new RoadGraph(roads), [at(500, 2000), at(3500, 2000)])[0]!
    const walk = routeOnGraph(new RoadGraph(roads, { profile: 'walking' }), [at(500, 2000), at(3500, 2000)])[0]!
    expect(drive.distance).toBeGreaterThan(walk.distance + 800)
  })

  test('driveways and parking aisles are slow', () => {
    const aisle = encodeTile({ transportation: [road({ class: 'service', service: 'parking_aisle' }, [500, 2000], [3500, 2000])] })
    const [route] = routeOnGraph(new RoadGraph(roadsOf(aisle)), [at(600, 2000), at(3400, 2000)])
    expect(route!.distance / route!.duration * 3.6).toBeLessThan(10)
  })
})

describe('snapping', () => {
  test('a waypoint by a scrap of footway cut off from everything goes to the street instead', () => {
    const tile = encodeTile({
      transportation: [
        road({ class: 'minor' }, [500, 2000], [3500, 2000]),
        road({ class: 'minor' }, [2000, 2000], [2000, 3500]),
        road({ class: 'path', subclass: 'footway' }, [490, 2100], [520, 2110]),
      ],
    })
    for (const profile of ['driving', 'walking'] as const)
      expect(routeOnGraph(new RoadGraph(roadsOf(tile), { profile }), [at(500, 2105), at(2000, 3400)])).toHaveLength(1)
  })
})

describe('on real tiles', () => {
  // OpenMapTiles z14 tiles of San Francisco's Civic Center and SoMa, from
  // Wildloop's planet, kept to their transportation layers.
  const roads = [2620, 2621].flatMap(x => extractTile(gunzipSync(readFileSync(`${import.meta.dir}/fixtures/sf-14-${x}-6332.roads.pbf.gz`)), x, 6332, 14).roads)
  const cityHall = { lat: 37.7793, lng: -122.4193 }
  const bryant = { lat: 37.7790, lng: -122.3990 }

  test('reads who may use each street', () => {
    expect(roads.length).toBeGreaterThan(5000)
    expect(roads.filter(r => r.noCar).length).toBeGreaterThan(100)
    expect(roads.filter(r => r.service === 'parking_aisle').length).toBeGreaterThan(10)
  })

  for (const [profile, minutes, steps] of [['driving', [3, 10], 7], ['cycling', [8, 18], 11], ['walking', [24, 40], 10]] as const) {
    test(`${profile}: City Hall to Bryant Street, in a few clear steps`, () => {
      const [route] = routeOnGraph(new RoadGraph(roads, { profile }), [cityHall, bryant])
      expect(route).toBeDefined()
      expect(route!.duration / 60).toBeGreaterThan(minutes[0])
      expect(route!.duration / 60).toBeLessThan(minutes[1])
      expect(route!.steps.length).toBeLessThanOrEqual(steps)
      // Every step but the arrival says which street it is on.
      expect(route!.steps.slice(0, -1).every(s => s.name)).toBe(true)
      expect(route!.steps[0]!.name).toBe('Van Ness Avenue')
      expect(route!.steps.at(-2)!.name).toBe('Bryant Street')
    })
  }
})
