import type { Position } from '../src/core-map/geo/area'
import { describe, expect, test } from 'bun:test'
import { formatArea, formatDistance, haversine, multiPolygonArea, ringArea, ringPerimeter } from '../src/core-map/geo/area'
import { TerritoryStore } from '../src/core-map/game/TerritoryStore'

// The rules these check are the game's economy: a lap is worth its area, laps
// merge rather than stack, and running through someone's ground takes it. A
// bug in any of them is a bug in the scoreboard.

/** A square of roughly `metres` on a side, at a given corner. */
function square(lng: number, lat: number, metres: number): Position[] {
  const dLat = metres / 111320
  const dLng = metres / (111320 * Math.cos((lat * Math.PI) / 180))
  return [
    [lng, lat],
    [lng + dLng, lat],
    [lng + dLng, lat + dLat],
    [lng, lat + dLat],
    [lng, lat],
  ]
}

describe('geodesic area', () => {
  test('a 100 m square measures about a hectare', () => {
    const area = Math.abs(ringArea(square(-118.47, 34.02, 100)))
    expect(area).toBeGreaterThan(9900)
    expect(area).toBeLessThan(10100)
  })

  test('the same run is worth the same at any latitude', () => {
    // The reason not to measure in Web Mercator: there the same lap would be
    // worth several times more in Reykjavík than in Nairobi.
    const equator = Math.abs(ringArea(square(0, 0, 200)))
    const north = Math.abs(ringArea(square(0, 60, 200)))
    expect(north / equator).toBeGreaterThan(0.99)
    expect(north / equator).toBeLessThan(1.01)
  })

  test('winding decides the sign, not the size', () => {
    const ring = square(-118.47, 34.02, 100)
    const reversed = [...ring].reverse()
    expect(ringArea(ring)).toBeCloseTo(-ringArea(reversed), 6)
  })

  test('a polygon with a hole is measured net of it', () => {
    const outer = square(0, 0, 100)
    const inner = square(0.0002, 0.0002, 30)
    const withHole = [[outer, inner]]
    const solid = [[outer]]
    expect(multiPolygonArea(withHole)).toBeLessThan(multiPolygonArea(solid))
    expect(multiPolygonArea(solid) - multiPolygonArea(withHole)).toBeCloseTo(Math.abs(ringArea(inner)), 0)
  })

  test('a degenerate ring has no area', () => {
    expect(ringArea([[0, 0], [1, 1]])).toBe(0)
    expect(ringArea([])).toBe(0)
  })

  test('perimeter measures the ground covered', () => {
    // Four sides of 100 m.
    expect(ringPerimeter(square(-118.47, 34.02, 100))).toBeGreaterThan(395)
    expect(ringPerimeter(square(-118.47, 34.02, 100))).toBeLessThan(405)
  })

  test('haversine agrees with a known distance', () => {
    // One degree of latitude is close to 111 km anywhere.
    expect(haversine([0, 0], [0, 1])).toBeGreaterThan(111000)
    expect(haversine([0, 0], [0, 1])).toBeLessThan(111400)
  })
})

describe('formatting', () => {
  test('the unit follows the magnitude', () => {
    expect(formatArea(450, { locale: 'en-US' })).toBe('450 m²')
    expect(formatArea(25000, { locale: 'en-US' })).toBe('2.5 ha')
    expect(formatArea(4500000, { locale: 'en-US' })).toBe('4.5 km²')
  })

  test('imperial when asked', () => {
    expect(formatArea(100, { units: 'imperial', locale: 'en-US' })).toContain('ft²')
    expect(formatArea(50000, { units: 'imperial', locale: 'en-US' })).toContain('acres')
  })

  test('distances read the way a runner thinks about them', () => {
    expect(formatDistance(450, { locale: 'en-US' })).toBe('450 m')
    expect(formatDistance(5400, { locale: 'en-US' })).toBe('5.4 km')
  })

  test('negatives are clamped rather than shown', () => {
    expect(formatArea(-5, { locale: 'en-US' })).toBe('0 m²')
  })
})

describe('capture', () => {
  test('a first lap is worth its whole area', () => {
    const store = new TerritoryStore()
    const result = store.capture('sam', square(0, 0, 100))

    expect(result.areaGained).toBeCloseTo(result.areaClaimed, 0)
    expect(result.stolen).toEqual([])
    expect(store.areaOf('sam')).toBeCloseTo(result.areaClaimed, 0)
  })

  test('running the same lap twice gains nothing the second time', () => {
    const store = new TerritoryStore()
    const ring = square(0, 0, 100)
    store.capture('sam', ring)
    const second = store.capture('sam', ring)

    expect(second.areaGained).toBeCloseTo(0, 3)
    expect(store.areaOf('sam')).toBeCloseTo(Math.abs(ringArea(ring)), 0)
  })

  test('adjacent laps merge into one territory', () => {
    // Two blocks run separately are one holding, not two — the border between
    // them is not a border any more.
    const store = new TerritoryStore()
    store.capture('sam', square(0, 0, 100))
    const result = store.capture('sam', [
      [0.0008983, 0],
      [0.0017966, 0],
      [0.0017966, 0.0008983],
      [0.0008983, 0.0008983],
      [0.0008983, 0],
    ])

    expect(result.territory.length).toBe(1)
    expect(store.get('sam').length).toBe(1)
  })

  test('overlapping your own ground only counts the new part', () => {
    const store = new TerritoryStore()
    store.capture('sam', square(0, 0, 100))
    const overlapping = store.capture('sam', square(0.00045, 0, 100))

    expect(overlapping.areaGained).toBeGreaterThan(0)
    expect(overlapping.areaGained).toBeLessThan(overlapping.areaClaimed)
    expect(store.areaOf('sam')).toBeCloseTo(overlapping.totalArea, 6)
  })
})

describe('stealing', () => {
  test('a lap around a rival takes their ground', () => {
    const store = new TerritoryStore()
    store.capture('alex', square(0, 0, 100))
    const alexBefore = store.areaOf('alex')

    const result = store.capture('sam', square(-0.0004, -0.0004, 200))

    expect(result.stolen.length).toBe(1)
    expect(result.stolen[0].owner).toBe('alex')
    expect(result.stolen[0].area).toBeCloseTo(alexBefore, 0)
    expect(store.areaOf('alex')).toBeCloseTo(0, 0)
  })

  test('a partial overlap takes only the overlapping part', () => {
    const store = new TerritoryStore()
    store.capture('alex', square(0, 0, 100))
    const alexBefore = store.areaOf('alex')

    store.capture('sam', square(0.00045, 0, 100))

    expect(store.areaOf('alex')).toBeGreaterThan(0)
    expect(store.areaOf('alex')).toBeLessThan(alexBefore)
  })

  test('ground is never held twice', () => {
    // The totals are the scoreboard, so they have to add up.
    const store = new TerritoryStore()
    store.capture('alex', square(0, 0, 150))
    store.capture('sam', square(0.0005, 0.0005, 150))
    store.capture('alex', square(0.001, 0, 150))

    const claimed = store.leaderboard().reduce((sum, entry) => sum + entry.area, 0)
    const combined = multiPolygonArea([...store.get('alex'), ...store.get('sam')])
    expect(claimed).toBeCloseTo(combined, 3)
  })

  test('several rivals can lose ground to one lap', () => {
    const store = new TerritoryStore()
    store.capture('alex', square(0, 0, 80))
    store.capture('jo', square(0.0012, 0, 80))

    const result = store.capture('sam', square(-0.0004, -0.0004, 300))

    expect(result.stolen.map(s => s.owner).sort()).toEqual(['alex', 'jo'])
    // Reported largest loss first, so a notification can lead with it.
    expect(result.stolen[0].area).toBeGreaterThanOrEqual(result.stolen[1].area)
  })

  test('with stealing off, territories may overlap', () => {
    const store = new TerritoryStore({ steal: false })
    store.capture('alex', square(0, 0, 100))
    const before = store.areaOf('alex')
    store.capture('sam', square(0, 0, 100))

    expect(store.areaOf('alex')).toBeCloseTo(before, 6)
    expect(store.areaOf('sam')).toBeCloseTo(before, 6)
  })

  test('a lap that takes nothing reports nothing taken', () => {
    const store = new TerritoryStore()
    store.capture('alex', square(0, 0, 100))
    const result = store.capture('sam', square(0.01, 0.01, 100))
    expect(result.stolen).toEqual([])
  })
})

describe('preview', () => {
  test('reports what a lap would be worth without claiming it', () => {
    const store = new TerritoryStore()
    store.capture('alex', square(0, 0, 100))
    const alexBefore = store.areaOf('alex')

    const preview = store.preview('sam', square(-0.0004, -0.0004, 200))

    expect(preview.stolen[0].owner).toBe('alex')
    expect(preview.areaGained).toBeGreaterThan(0)
    // Nothing actually changed hands.
    expect(store.areaOf('alex')).toBeCloseTo(alexBefore, 6)
    expect(store.areaOf('sam')).toBe(0)
  })
})

describe('queries', () => {
  test('ownerAt finds who holds a spot', () => {
    const store = new TerritoryStore()
    store.capture('sam', square(0, 0, 100))

    expect(store.ownerAt([0.0004, 0.0004])).toBe('sam')
    expect(store.ownerAt([0.01, 0.01])).toBeNull()
  })

  test('the leaderboard is ordered by area', () => {
    const store = new TerritoryStore()
    store.capture('small', square(0, 0, 50))
    store.capture('big', square(0.01, 0.01, 200))

    const board = store.leaderboard()
    expect(board.map(e => e.owner)).toEqual(['big', 'small'])
    expect(board[0].pieces).toBe(1)
  })

  test('an owner wiped out drops off the board', () => {
    const store = new TerritoryStore()
    store.capture('alex', square(0, 0, 100))
    store.capture('sam', square(-0.0004, -0.0004, 200))

    expect(store.owners()).toEqual(['sam'])
    expect(store.leaderboard().map(e => e.owner)).toEqual(['sam'])
  })
})

describe('events', () => {
  test('capture fires with what changed', () => {
    const store = new TerritoryStore()
    const seen: any[] = []
    store.on('capture', (event: any) => seen.push(event))

    store.capture('sam', square(0, 0, 100))

    expect(seen.length).toBe(1)
    expect(seen[0].owner).toBe('sam')
    expect(seen[0].areaGained).toBeGreaterThan(0)
  })
})

describe('persistence', () => {
  test('a game survives a round trip through GeoJSON', () => {
    const store = new TerritoryStore()
    store.capture('sam', square(0, 0, 100))
    store.capture('alex', square(0.01, 0.01, 150))

    const restored = new TerritoryStore().loadGeoJSON(store.toGeoJSON())

    expect(restored.owners().sort()).toEqual(['alex', 'sam'])
    expect(restored.areaOf('sam')).toBeCloseTo(store.areaOf('sam'), 3)
    expect(restored.areaOf('alex')).toBeCloseTo(store.areaOf('alex'), 3)
  })

  test('the GeoJSON carries the owner and area on each feature', () => {
    const store = new TerritoryStore()
    store.capture('sam', square(0, 0, 100))

    const collection = store.toGeoJSON()
    expect(collection.features[0].properties.owner).toBe('sam')
    expect(collection.features[0].geometry.type).toBe('MultiPolygon')
    expect(collection.features[0].properties.area).toBeGreaterThan(0)
  })

  test('a plain Polygon feature loads too', () => {
    const store = new TerritoryStore().loadGeoJSON({
      features: [{
        properties: { owner: 'sam' },
        geometry: { type: 'Polygon', coordinates: [square(0, 0, 100)] },
      }],
    })
    expect(store.areaOf('sam')).toBeGreaterThan(9000)
  })
})
