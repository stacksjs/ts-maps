import { afterEach, describe, expect, test } from 'bun:test'
import type { LaneInfo, Route } from '../src/core-map/services/types'
import { laneHint, laneIcon, laneIndicationFor, lanesMatter, parseManeuver, spokenInstruction } from '../src/core-map/services/instructions'
import { Navigator } from '../src/core-map/services/navigator'
import { OSRMDirections } from '../src/core-map/services/providers/OSRM'
import { Point } from '../src/core-map/geometry/Point'
import { TsMap } from '../src/core-map/map/Map'
import { TurnByTurn } from '../src/core-map/navigation/TurnByTurn'

const lane = (indications: string[], valid: boolean): LaneInfo => ({ indications, valid })
// Turn left onto Broadway from the Embarcadero, as OSRM describes it.
const broadway = [lane(['left'], true), lane(['straight'], false), lane(['none'], false)]

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

describe('lanes from providers', () => {
  test('OSRM lanes are read from the maneuver’s own intersection', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      code: 'Ok',
      routes: [{
        distance: 100,
        duration: 10,
        geometry: { type: 'LineString', coordinates: [[0, 0], [0, 0.001]] },
        legs: [{
          distance: 100,
          duration: 10,
          steps: [
            { distance: 100, duration: 10, name: 'Broadway', geometry: { type: 'LineString', coordinates: [[0, 0], [0, 0.001]] }, maneuver: { type: 'turn', modifier: 'left' }, intersections: [{ lanes: [{ indications: ['left'], valid: true }, { indications: ['straight'], valid: false }] }, { lanes: [{ indications: ['straight'], valid: true }] }] },
          ],
        }],
      }],
    }))) as unknown as typeof fetch
    const [route] = await new OSRMDirections().getDirections([{ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 }])
    expect(route!.steps[0]!.lanes).toEqual([lane(['left'], true), lane(['straight'], false)])
  })
})

describe('lane wording and arrows', () => {
  test('guidance is shown only when there is a lane choice to make', () => {
    expect(lanesMatter(broadway)).toBe(true)
    expect(lanesMatter([lane(['straight'], true), lane(['straight'], true)])).toBe(false)
    expect(lanesMatter([lane(['left'], true)])).toBe(false)
    expect(lanesMatter(undefined)).toBe(false)
  })

  test('which lanes to be in, the way a person says it', () => {
    expect(laneHint(broadway)).toBe('the left lane')
    expect(laneHint([lane(['left'], true), lane(['left'], true), lane(['straight'], false)])).toBe('the left 2 lanes')
    expect(laneHint([lane(['left'], false), lane(['straight'], false), lane(['right'], true)])).toBe('the right lane')
    expect(laneHint([lane(['left'], false), lane(['straight'], true), lane(['right'], false)])).toBe('the middle lane')
    expect(laneHint([lane(['left'], false), lane(['straight'], true), lane(['straight'], false), lane(['right'], false)])).toBe('the second lane from the left')
    // Not side by side: no tidy way to say it, so nothing is said.
    expect(laneHint([lane(['left'], true), lane(['straight'], false), lane(['left'], true)])).toBeUndefined()
  })

  test('the voice names the lane with the warning, not at the turn', () => {
    const left = parseManeuver('turn-left')
    expect(spokenInstruction(left, 'Broadway', 400, 'metric', broadway)).toBe('In 400 meters, use the left lane to turn left onto Broadway')
    expect(spokenInstruction(left, 'Broadway', undefined, 'metric', broadway)).toBe('Turn left onto Broadway')
  })

  test('a shared lane uses the arrow that matches the maneuver', () => {
    const shared = lane(['straight', 'right'], true)
    expect(laneIndicationFor(shared, parseManeuver('turn-right'))).toBe('right')
    expect(laneIndicationFor(shared, parseManeuver('new-name-straight'))).toBe('straight')
    expect(laneIndicationFor(lane(['straight', 'slight right'], true), parseManeuver('off-ramp-right'))).toBe('slight right')
  })

  test('a lane to be in is drawn solid; one to avoid, faint', () => {
    const left = parseManeuver('turn-left')
    expect(laneIcon(broadway[0]!, left)).toContain('stroke-opacity="1"')
    expect(laneIcon(broadway[1]!, left)).not.toContain('stroke-opacity="1"')
    // Both arrows of a shared lane are drawn, the unused one faint.
    const shared = laneIcon(lane(['straight', 'right'], true), parseManeuver('turn-right'))
    expect(shared.match(/stroke-opacity="1"/g)!.length).toBe(1)
    expect(shared.match(/stroke-opacity="0.35"/g)!.length).toBe(1)
  })
})

// North 1 km on the Embarcadero, then left onto Broadway.
const P = (north: number, east: number) => ({ lat: north * 0.0009, lng: east * 0.0009 })
const route: Route = {
  distance: 1300,
  duration: 150,
  geometry: [P(0, 0), P(10, 0), P(10, -3)],
  steps: [
    { distance: 1000, duration: 110, instruction: '', geometry: [P(0, 0), P(10, 0)], maneuver: 'depart', name: 'The Embarcadero' },
    { distance: 300, duration: 40, instruction: '', geometry: [P(10, 0), P(10, -3)], maneuver: 'turn-left', name: 'Broadway', lanes: broadway },
    { distance: 0, duration: 0, instruction: '', geometry: [P(10, -3)], maneuver: 'arrive' },
  ],
}

describe('lane guidance on the way', () => {
  test('lanes appear as the maneuver draws near, and not before', () => {
    const nav = new Navigator(route)
    expect(nav.update({ ...P(1, 0), time: 0 }).lanes).toBeUndefined()
    expect(nav.update({ ...P(4, 0), time: 20_000 }).lanes).toEqual(broadway)
  })

  test('walking directions leave lanes out', () => {
    const nav = new Navigator(route, { profile: 'walking' })
    expect(nav.update({ ...P(9.5, 0), time: 0 }).lanes).toBeUndefined()
  })

  test('the early warning says which lane to be in', () => {
    const nav = new Navigator(route, { units: 'metric' })
    const said: string[] = []
    nav.on('instruction', (e: any) => said.push(e.instruction.spoken))
    for (let north = 0; north <= 10; north += 0.25)
      nav.update({ ...P(north, 0), time: north * 10_000 })
    expect(said[0]).toBe('In 800 meters, use the left lane to turn left onto Broadway')
    expect(said.at(-1)).toBe('Turn left onto Broadway')
  })

  test('the banner shows the lane strip', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const map = new TsMap(el, { center: P(5, 0), zoom: 15 })
    map._size = new Point(430, 860)
    map._sizeChanged = false
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
    const nav = new TurnByTurn(map, { directions: { name: 'fake', getDirections: async () => [route] }, voice: false })
    await nav.preview(P(0, 0), P(10, -3))
    nav.start()
    nav.update({ ...P(8, 0), time: 0 })
    const lanes = map.getContainer().querySelectorAll('.tsmap-nav-lane')
    expect(lanes.length).toBe(3)
    expect(lanes[0]!.classList.contains('tsmap-nav-lane-valid')).toBe(true)
    expect(lanes[1]!.classList.contains('tsmap-nav-lane-valid')).toBe(false)
    nav.stop()
  })
})
