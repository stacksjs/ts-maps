import { describe, expect, test } from 'bun:test'
import type { Route } from '../src/core-map/services/types'
import { abbreviateStreet, formatDistance, formatInstruction, maneuverIcon, parseManeuver, spokenInstruction } from '../src/core-map/services/instructions'
import { Navigator } from '../src/core-map/services/navigator'
import { RouteSimulator } from '../src/core-map/services/simulator'

// A street grid near the equator, where a degree is ~111 km both ways:
// 0.0009° ≈ 100 m. North 500 m on Main St, right onto 2nd St for 300 m,
// left onto Oak Ave for 200 m.
const P = (north: number, east: number) => ({ lat: north * 0.0009, lng: east * 0.0009 })
const route: Route = {
  distance: 1000,
  duration: 120,
  geometry: [P(0, 0), P(5, 0), P(5, 3), P(7, 3)],
  steps: [
    { distance: 500, duration: 60, instruction: '', geometry: [P(0, 0), P(5, 0)], maneuver: 'depart', name: 'Main Street' },
    { distance: 300, duration: 36, instruction: '', geometry: [P(5, 0), P(5, 3)], maneuver: 'turn-right', name: '2nd Street' },
    { distance: 200, duration: 24, instruction: '', geometry: [P(5, 3), P(7, 3)], maneuver: 'turn-left', name: 'Oak Avenue' },
    { distance: 0, duration: 0, instruction: '', geometry: [P(7, 3)], maneuver: 'arrive' },
  ],
}

describe('maneuvers and wording', () => {
  test('every provider dialect folds into one vocabulary', () => {
    expect(parseManeuver('turn-right')).toMatchObject({ kind: 'turn', direction: 'right', degree: 'normal' })
    expect(parseManeuver('turn-slight-left')).toMatchObject({ kind: 'turn', direction: 'left', degree: 'slight' })
    expect(parseManeuver('new-name-straight').kind).toBe('continue')
    expect(parseManeuver('on-ramp-right').kind).toBe('ramp')
    expect(parseManeuver('off-ramp-left').kind).toBe('exit')
    expect(parseManeuver('roundabout', 2)).toMatchObject({ kind: 'roundabout', exit: 2 })
    expect(parseManeuver('end-of-road-left')).toMatchObject({ kind: 'turn', direction: 'left' })
    expect(parseManeuver('turn-uturn').kind).toBe('uturn')
    expect(parseManeuver('arrive-right')).toMatchObject({ kind: 'arrive', direction: 'right' })
  })

  test('instructions read the way Apple Maps writes them', () => {
    expect(formatInstruction(parseManeuver('turn-right'), { name: 'Market Street', abbreviate: true })).toBe('Turn right onto Market St')
    expect(formatInstruction(parseManeuver('turn-slight-left'), { name: 'Van Ness Avenue' })).toBe('Slight left onto Van Ness Avenue')
    expect(formatInstruction(parseManeuver('roundabout', 3))).toBe('At the roundabout, take the third exit')
    expect(formatInstruction(parseManeuver('fork-left'), { name: 'I-80 East' })).toBe('Keep left onto I-80 East')
    expect(formatInstruction(parseManeuver('arrive'))).toBe('Arrive at your destination')
    expect(formatInstruction(parseManeuver('new-name-straight'), { name: 'Geary Blvd' })).toBe('Continue on Geary Blvd')
  })

  test('street names are shortened for the banner only', () => {
    expect(abbreviateStreet('North Van Ness Avenue')).toBe('N Van Ness Ave')
    expect(spokenInstruction(parseManeuver('turn-left'), 'Oak Avenue', 400, 'metric')).toBe('In 400 meters, turn left onto Oak Avenue')
  })

  test('distances are rounded the way a sign reads', () => {
    expect(formatDistance(123, 'metric')).toBe('100 m')
    expect(formatDistance(1234, 'metric')).toBe('1.2 km')
    expect(formatDistance(60, 'imperial')).toBe('200 ft')
    expect(formatDistance(482, 'imperial')).toBe('0.3 mi')
    expect(spokenInstruction(parseManeuver('turn-right'), undefined, 402, 'imperial')).toBe('In a quarter mile, turn right')
  })

  test('each maneuver has an arrow', () => {
    for (const code of ['turn-left', 'turn-sharp-right', 'turn-uturn', 'roundabout', 'fork-right', 'arrive', 'depart'])
      expect(maneuverIcon(parseManeuver(code))).toContain('<svg')
  })
})

describe('Navigator', () => {
  test('tracks the step, the next maneuver and what is left', () => {
    const nav = new Navigator(route, { units: 'metric' })
    const p = nav.update({ ...P(2, 0.05), time: 0 })
    expect(p.stepIndex).toBe(0)
    expect(p.nextManeuver).toMatchObject({ kind: 'turn', direction: 'right' })
    expect(p.banner).toBe('Turn right onto 2nd St')
    expect(p.distanceToManeuver).toBeGreaterThan(290)
    expect(p.distanceToManeuver).toBeLessThan(310)
    expect(p.distanceRemaining).toBeGreaterThan(790)
    expect(p.durationRemaining).toBeGreaterThan(90)
    expect(p.offRouteDistance).toBeLessThan(10)
    expect(p.heading).toBeCloseTo(0, 0)

    const after = nav.update({ ...P(5, 1.5), time: 10_000 })
    expect(after.stepIndex).toBe(1)
    expect(after.banner).toBe('Turn left onto Oak Ave')
    expect(after.heading).toBeCloseTo(90, 0)
  })

  test('announces early, to get ready, and at the turn — once each', () => {
    const nav = new Navigator(route, { profile: 'walking', units: 'metric' })
    const said: string[] = []
    nav.on('instruction', (e: any) => said.push(`${e.instruction.stage}: ${e.instruction.spoken}`))
    for (let north = 0; north <= 5; north += 0.1)
      nav.update({ ...P(north, 0), time: north * 10_000 })
    expect(said).toEqual([
      'early: In 150 meters, turn right onto 2nd Street',
      'prepare: In 50 meters, turn right onto 2nd Street',
      'now: Turn right onto 2nd Street',
    ])
  })

  test('says a stale warning never: arriving late at a turn gets "now"', () => {
    const nav = new Navigator(route, { profile: 'walking', units: 'metric' })
    const stages: string[] = []
    nav.on('instruction', (e: any) => stages.push(e.instruction.stage))
    nav.update({ ...P(4.95, 0), time: 0 })
    nav.update({ ...P(4.97, 0), time: 1000 })
    expect(stages).toEqual(['now'])
  })

  test('a few seconds off the route asks for a new one; one stray fix does not', () => {
    const nav = new Navigator(route)
    let off = 0
    nav.on('offroute', () => off++)
    nav.update({ ...P(1, 0), time: 0 })
    nav.update({ ...P(1.5, 1.5), time: 1000 })
    nav.update({ ...P(1.6, 0), time: 2000 })
    expect(off).toBe(0)
    for (let t = 3; t <= 7; t++)
      nav.update({ ...P(2, 2), time: t * 1000 })
    expect(off).toBe(1)
  })

  test('arrives at the destination', () => {
    const nav = new Navigator(route)
    let arrived = false
    nav.on('arrive', () => { arrived = true })
    nav.update({ ...P(6.9, 3), time: 0 })
    expect(arrived).toBe(true)
  })

  test('a route that doubles back is followed on the right pass', () => {
    const outAndBack: Route = {
      distance: 800,
      duration: 100,
      geometry: [P(0, 0), P(4, 0), P(4, 0.2), P(0, 0.2)],
      steps: [
        { distance: 400, duration: 50, instruction: '', geometry: [P(0, 0), P(4, 0)], maneuver: 'depart' },
        { distance: 400, duration: 50, instruction: '', geometry: [P(4, 0), P(4, 0.2), P(0, 0.2)], maneuver: 'turn-uturn' },
      ],
    }
    const nav = new Navigator(outAndBack)
    for (let n = 0; n <= 4; n += 0.5)
      nav.update({ ...P(n, 0), time: n * 5000 })
    // Back down the other side: must stay on the return pass, not jump to
    // the nearby outbound one.
    const p = nav.update({ ...P(3, 0.15), time: 30_000 })
    expect(p.distanceTraveled).toBeGreaterThan(400)
  })
})

describe('RouteSimulator', () => {
  test('drives the route, slowing for turns, and stops at the end', () => {
    const nav = new Navigator(route)
    const fixes: any[] = []
    const sim = new RouteSimulator(nav, fix => fixes.push(fix), { speed: 15 })
    for (let i = 0; i < 200 && sim.distance < nav.length; i++)
      sim.tick(1)
    expect(sim.distance).toBe(nav.length)
    const cruise = sim.speedAt(250)
    const turning = sim.speedAt(500)
    expect(cruise).toBe(15)
    expect(turning).toBeLessThan(cruise / 2)
    expect(fixes.every(f => typeof f.heading === 'number')).toBe(true)
  })
})
