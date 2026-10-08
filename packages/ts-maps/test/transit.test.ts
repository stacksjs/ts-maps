import { afterEach, describe, expect, test } from 'bun:test'
import type { Route } from '../src/core-map/services/types'
import { styles, transitSummary, Map, TurnByTurn } from '../src/core-map'
import { Point } from '../src/core-map/geometry/Point'
import { decodePolyline, encodePolyline, OpenTripPlannerDirections, OSRMDirections, transitInstruction, transitRides, transitVehicle } from '../src/core-map/services'
import { GoogleDirections } from '../src/core-map/services/providers/Google'
import { validateStyle } from '../src/core-map/style-spec/validate'

// From the Ferry Building to Ocean Beach: walk, the N Judah, walk.
const T0 = Date.parse('2026-10-07T17:10:00Z')
const at = (minutes: number): number => T0 + minutes * 60_000
const OTP = {
  data: {
    plan: {
      itineraries: [{
        startTime: at(0),
        endTime: at(48),
        duration: 48 * 60,
        legs: [
          { mode: 'WALK', startTime: at(0), endTime: at(4), duration: 240, distance: 300, from: { name: 'Origin', lat: 37.7955, lon: -122.3937 }, to: { name: 'Embarcadero Station', lat: 37.793, lon: -122.3965 }, route: null, legGeometry: { points: encodePolyline([{ lat: 37.7955, lng: -122.3937 }, { lat: 37.793, lng: -122.3965 }]) } },
          { mode: 'TRAM', startTime: at(6), endTime: at(44), duration: 2280, distance: 9500, headsign: 'Ocean Beach', from: { name: 'Embarcadero Station', lat: 37.793, lon: -122.3965 }, to: { name: 'Judah St & La Playa St', lat: 37.7605, lon: -122.5091 }, route: { shortName: 'N', longName: 'Judah', color: '005B95', textColor: 'FFFFFF', agency: { name: 'SFMTA' } }, intermediateStops: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }], legGeometry: { points: encodePolyline([{ lat: 37.793, lng: -122.3965 }, { lat: 37.7605, lng: -122.5091 }]) } },
          { mode: 'WALK', startTime: at(44), endTime: at(48), duration: 240, distance: 280, from: { name: 'Judah St & La Playa St', lat: 37.7605, lon: -122.5091 }, to: { name: 'Destination', lat: 37.7598, lon: -122.5107 }, route: null, legGeometry: null },
        ],
      }],
    },
  },
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  document.body.replaceChildren()
})

describe('polylines', () => {
  test('round-trip at precision 5 and 6', () => {
    const points = [{ lat: 37.79552, lng: -122.39372 }, { lat: 37.76051, lng: -122.50913 }, { lat: -33.8688, lng: 151.2093 }]
    for (const precision of [5, 6]) {
      const back = decodePolyline(encodePolyline(points, precision), precision)
      back.forEach((p, i) => {
        expect(p.lat).toBeCloseTo(points[i]!.lat, precision - 1)
        expect(p.lng).toBeCloseTo(points[i]!.lng, precision - 1)
      })
    }
    // Google's own example.
    expect(encodePolyline([{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }])).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
  })
})

describe('transit wording', () => {
  test('says the line, the way and the stops', () => {
    const ride = { vehicle: 'tram' as const, line: 'N', lineName: 'Judah', headsign: 'Ocean Beach', from: { name: 'Embarcadero' }, to: { name: 'La Playa' }, departure: new Date(at(6)), arrival: new Date(at(44)), stops: 6 }
    expect(transitInstruction(ride)).toBe('Take the N Judah toward Ocean Beach, 6 stops')
    expect(transitInstruction({ ...ride, vehicle: 'bus', line: '38', lineName: undefined, stops: 1 })).toBe('Take the 38 bus toward Ocean Beach, 1 stop')
    expect(transitVehicle(1)).toBe('subway')
    expect(transitVehicle('HEAVY_RAIL')).toBe('rail')
  })
})

describe('OpenTripPlannerDirections', () => {
  test('plans walk, ride, walk, with the line, its colour and its times', async () => {
    const asked: any[] = []
    const otp = new OpenTripPlannerDirections({
      url: 'https://otp.test/otp/gtfs/v1',
      fetch: (async (_url: string, init: RequestInit) => {
        asked.push(JSON.parse(String(init.body)))
        return new Response(JSON.stringify(OTP))
      }) as unknown as typeof fetch,
    })
    const leave = new Date(2026, 9, 7, 10, 10)
    const [route] = await otp.getDirections([{ lat: 37.7955, lng: -122.3937 }, { lat: 37.7598, lng: -122.5107 }], { profile: 'transit', departAt: leave })
    expect(asked[0].variables).toMatchObject({ date: '2026-10-07', time: '10:10', arriveBy: false })
    expect(route!.steps.map(s => s.maneuver)).toEqual(['walk', 'transit', 'walk'])
    expect(route!.steps[0]!.instruction).toBe('Walk to Embarcadero Station')
    expect(route!.steps[1]!.instruction).toBe('Take the N Judah toward Ocean Beach, 6 stops')
    expect(route!.steps[1]!.transit).toMatchObject({ line: 'N', color: '#005B95', agency: 'SFMTA', stops: 6, vehicle: 'tram' })
    expect(route!.steps[2]!.instruction).toBe('Walk to your destination')
    expect(route!.departure!.getTime()).toBe(at(0))
    expect(transitRides(route!)).toHaveLength(1)
  })

  test('street providers say plainly they have no transit', async () => {
    await expect(new OSRMDirections().getDirections([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }], { profile: 'transit' })).rejects.toThrow('no transit')
  })
})

describe('Google transit', () => {
  test('reads transit_details into the same rides', async () => {
    const asked: string[] = []
    globalThis.fetch = (async (url: string) => {
      asked.push(url)
      return new Response(JSON.stringify({ status: 'OK', routes: [{ legs: [{ departure_time: { value: at(0) / 1000 }, arrival_time: { value: at(30) / 1000 }, distance: { value: 5000 }, duration: { value: 1800 }, steps: [
        { travel_mode: 'WALKING', distance: { value: 200 }, duration: { value: 180 }, html_instructions: 'Walk to Market St &amp; 4th St' },
        { travel_mode: 'TRANSIT', distance: { value: 4800 }, duration: { value: 1500 }, transit_details: { line: { short_name: '38R', name: 'Geary Rapid', color: '#c4161c', vehicle: { type: 'BUS' } }, headsign: 'Ocean Beach', num_stops: 9, departure_stop: { name: 'Market St & 4th St' }, arrival_stop: { name: 'Geary Blvd & 33rd Ave' }, departure_time: { value: at(3) / 1000 }, arrival_time: { value: at(28) / 1000 } } },
      ] }] }] }))
    }) as unknown as typeof fetch
    const [route] = await new GoogleDirections({ apiKey: 'k' }).getDirections([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }], { profile: 'transit' })
    expect(asked[0]).toContain('mode=transit')
    expect(route!.steps.map(s => s.maneuver)).toEqual(['walk', 'transit'])
    expect(route!.steps[1]!.instruction).toBe('Take the 38R Geary Rapid toward Ocean Beach, 9 stops')
    expect(route!.arrival!.getTime()).toBe(at(30))
  })
})

describe('transit in turn-by-turn', () => {
  test('the preview shows each ride as its line, and when it leaves and arrives', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const map = new Map(el, { center: [37.78, -122.45], zoom: 12 })
    map._size = new Point(430, 860)
    map._sizeChanged = false
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
    const directions = new OpenTripPlannerDirections({ url: 'https://otp.test', fetch: (async () => new Response(JSON.stringify(OTP))) as unknown as typeof fetch })
    const nav = new TurnByTurn(map, { directions, profile: 'transit', voice: false })
    await nav.preview({ lat: 37.7955, lng: -122.3937 }, { lat: 37.7598, lng: -122.5107 })
    const line = map.getContainer().querySelector<HTMLElement>('.tsmap-nav-line')!
    expect(line.textContent).toBe('N')
    expect(line.getAttribute('style')).toContain('#005B95')
    expect(map.getContainer().querySelector('.tsmap-nav-option-detail')!.textContent).toContain('–')
    nav.stop()
  })

  test('a route summary reads like the card', () => {
    const route = { distance: 0, duration: 0, geometry: [], steps: [{ distance: 0, duration: 0, instruction: '', geometry: [], transit: { vehicle: 'bus', line: '38', from: { name: '' }, to: { name: '' }, departure: new Date(at(0)), arrival: new Date(at(20)), stops: 4 } }] } as unknown as Route
    expect(transitSummary(route)).toContain('>38<')
  })
})

describe('the transit map', () => {
  test('validates, draws lines and stations, and quietens streets', () => {
    const style = styles.transit({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf' })
    expect(validateStyle(style)).toEqual([])
    const ids = style.layers.map(l => l.id)
    expect(ids.indexOf('transit-line')).toBeLessThan(ids.indexOf('building'))
    expect(ids).toContain('transit-station-label')
    expect((style.layers.find(l => l.id === 'road-major') as any).paint['line-color']).toBe('#f2f0eb')
  })
})
