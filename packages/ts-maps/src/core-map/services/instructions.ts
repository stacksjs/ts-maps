/**
 * Turn-by-turn wording, after Apple Maps: what the banner says, what the voice
 * says, how far away a turn is, and the arrow drawn beside it.
 *
 * Providers describe maneuvers in their own dialects — OSRM's `turn-left` and
 * `new-name-straight`, Google's `turn-slight-left` and `ramp-right`, Valhalla's
 * numbered types (mapped on parse). `parseManeuver` folds them into one small
 * vocabulary, and everything else here works from that.
 */

import type { LaneInfo } from './types'

export type ManeuverKind
  = | 'depart'
    | 'arrive'
    | 'continue'
    | 'turn'
    | 'uturn'
    | 'merge'
    | 'fork'
    | 'keep'
    | 'ramp'
    | 'exit'
    | 'roundabout'
    | 'roundabout-exit'

export type ManeuverDirection = 'left' | 'right' | 'straight'
export type ManeuverDegree = 'slight' | 'normal' | 'sharp'

export interface Maneuver {
  kind: ManeuverKind
  direction: ManeuverDirection
  degree: ManeuverDegree
  /** Roundabout exit to take, counting from 1. */
  exit?: number
}

export type DistanceUnits = 'metric' | 'imperial'

/** Fold any provider's maneuver code into the shared vocabulary. */
export function parseManeuver(code: string | undefined, exit?: number): Maneuver {
  const c = (code ?? '').toLowerCase().replace(/[\s_]+/g, '-')
  const direction: ManeuverDirection = /left/.test(c) ? 'left' : /right/.test(c) ? 'right' : 'straight'
  const degree: ManeuverDegree = /sharp/.test(c) ? 'sharp' : /slight/.test(c) ? 'slight' : 'normal'
  const base = { direction, degree, exit }

  if (c.includes('arrive'))
    return { ...base, kind: 'arrive' }
  if (c.includes('depart'))
    return { ...base, kind: 'depart' }
  if (c.includes('exit-roundabout') || c.includes('exit-rotary'))
    return { ...base, kind: 'roundabout-exit' }
  if (c.includes('roundabout') || c.includes('rotary'))
    return { ...base, kind: 'roundabout' }
  if (c.includes('uturn') || c.includes('u-turn'))
    return { ...base, kind: 'uturn' }
  if (c.includes('merge'))
    return { ...base, kind: 'merge' }
  if (c.includes('off-ramp'))
    return { ...base, kind: 'exit' }
  if (c.includes('ramp'))
    return { ...base, kind: 'ramp' }
  if (c.includes('fork'))
    return { ...base, kind: direction === 'straight' ? 'continue' : 'fork' }
  if (c.includes('keep'))
    return { ...base, kind: direction === 'straight' ? 'continue' : 'keep' }
  if (direction === 'straight')
    return { ...base, kind: 'continue' }
  // `turn-*`, `end-of-road-*`, and `continue-*` with a side, which is how
  // OSRM says the road bends and you must turn to stay on it.
  return { ...base, kind: 'turn' }
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth']

function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`
}

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bStreet\b/g, 'St'],
  [/\bAvenue\b/g, 'Ave'],
  [/\bBoulevard\b/g, 'Blvd'],
  [/\bDrive\b/g, 'Dr'],
  [/\bRoad\b/g, 'Rd'],
  [/\bLane\b/g, 'Ln'],
  [/\bPlace\b/g, 'Pl'],
  [/\bCourt\b/g, 'Ct'],
  [/\bHighway\b/g, 'Hwy'],
  [/\bParkway\b/g, 'Pkwy'],
  [/\bExpressway\b/g, 'Expy'],
  [/\bFreeway\b/g, 'Fwy'],
  [/\bTerrace\b/g, 'Ter'],
  [/\bNorth\b/g, 'N'],
  [/\bSouth\b/g, 'S'],
  [/\bEast\b/g, 'E'],
  [/\bWest\b/g, 'W'],
]

/**
 * A street name as a banner shows it: "Market St", "Van Ness Ave". Spoken
 * instructions keep the full name.
 */
export function abbreviateStreet(name: string): string {
  let out = name
  for (const [pattern, short] of ABBREVIATIONS)
    out = out.replace(pattern, short)
  return out
}

export interface InstructionOptions {
  /** Road the maneuver leads onto. */
  name?: string
  /** Abbreviate street names, as the banner does. */
  abbreviate?: boolean
}

/**
 * The instruction for a maneuver, in the words Apple Maps uses: "Turn right
 * onto Market St", "Slight left onto I-80 E", "At the roundabout, take the
 * second exit".
 */
export function formatInstruction(maneuver: Maneuver, options: InstructionOptions = {}): string {
  const raw = options.name?.trim()
  const name = raw ? (options.abbreviate ? abbreviateStreet(raw) : raw) : ''
  const onto = name ? ` onto ${name}` : ''
  const side = maneuver.direction === 'straight' ? '' : maneuver.direction
  const Side = side ? side[0]!.toUpperCase() + side.slice(1) : ''

  switch (maneuver.kind) {
    case 'depart':
      return name ? `Start on ${name}` : 'Start'
    case 'arrive':
      return side ? `Arrive at your destination on the ${side}` : 'Arrive at your destination'
    case 'continue':
      return name ? `Continue on ${name}` : 'Continue straight'
    case 'turn':
      if (maneuver.degree === 'slight')
        return `Slight ${side}${onto}`
      if (maneuver.degree === 'sharp')
        return `Sharp ${side}${onto}`
      return `Turn ${side}${onto}`
    case 'uturn':
      return `Make a U-turn${onto}`
    case 'merge':
      return `Merge${side ? ` ${side}` : ''}${onto}`
    case 'fork':
    case 'keep':
      return `Keep ${side}${onto}`
    case 'ramp':
      return side ? `Take the ramp on the ${side}${onto}` : `Take the ramp${onto}`
    case 'exit':
      return side ? `Take the exit on the ${side}${onto}` : `Take the exit${onto}`
    case 'roundabout':
      return maneuver.exit
        ? `At the roundabout, take the ${ordinal(maneuver.exit)} exit${onto}`
        : `Enter the roundabout${onto}`
    case 'roundabout-exit':
      return `Exit the roundabout${onto}`
    default:
      return Side ? `Turn ${side}${onto}` : `Continue${onto}`
  }
}

/** Whether a locale reads distances in miles and feet. */
export function prefersImperial(locale?: string): boolean {
  const l = (locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US')).toLowerCase()
  return l.endsWith('-us') || l.endsWith('-lr') || l.endsWith('-mm') || l === 'en'
}

/**
 * A distance as the banner shows it, rounded the way a driver reads a sign:
 * "150 m", "1.2 km", "400 ft", "0.3 mi".
 */
export function formatDistance(meters: number, units: DistanceUnits): string {
  const m = Math.max(0, meters)
  if (units === 'imperial') {
    const feet = m * 3.28084
    if (feet < 528) {
      const step = feet < 100 ? 10 : 50
      return `${Math.max(step, Math.round(feet / step) * step)} ft`
    }
    const miles = m / 1609.344
    return miles < 10 ? `${(Math.round(miles * 10) / 10).toFixed(1)} mi` : `${Math.round(miles)} mi`
  }
  if (m < 1000) {
    const step = m < 100 ? 10 : 50
    return `${Math.max(step, Math.round(m / step) * step)} m`
  }
  const km = m / 1000
  return km < 10 ? `${(Math.round(km * 10) / 10).toFixed(1)} km` : `${Math.round(km)} km`
}

/** A distance as the voice says it: "400 feet", "a quarter mile", "1.2 kilometers". */
export function spokenDistance(meters: number, units: DistanceUnits): string {
  if (units === 'imperial') {
    const miles = meters / 1609.344
    if (miles >= 0.2) {
      // Common fractions read the way people say them.
      for (const [value, words] of [[0.25, 'a quarter mile'], [0.5, 'half a mile'], [0.75, 'three quarters of a mile'], [1, '1 mile']] as Array<[number, string]>) {
        if (Math.abs(miles - value) < 0.06)
          return words
      }
    }
    return formatDistance(meters, units).replace(/ ft$/, ' feet').replace(/ mi$/, ' miles')
  }
  return formatDistance(meters, units).replace(/ km$/, ' kilometers').replace(/ m$/, ' meters')
}

/**
 * What the voice says: "In 400 feet, turn right onto Market Street", or with
 * no distance, the instruction on its own for the moment of the turn. Given
 * the lanes, and a warning to give, it says which to be in, as Apple Maps
 * does: "In 400 feet, use the left 2 lanes to turn left onto Broadway".
 */
export function spokenInstruction(maneuver: Maneuver, name: string | undefined, distance: number | undefined, units: DistanceUnits, lanes?: LaneInfo[]): string {
  const text = formatInstruction(maneuver, { name })
  if (distance === undefined)
    return text
  const lower = `${text[0]!.toLowerCase()}${text.slice(1)}`
  const hint = laneHint(lanes)
  return hint
    ? `In ${spokenDistance(distance, units)}, use ${hint} to ${lower}`
    : `In ${spokenDistance(distance, units)}, ${lower}`
}

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

/** Where each painted lane arrow points, degrees from straight ahead, clockwise. */
const INDICATION_ANGLES: Record<string, number> = {
  'sharp left': -135,
  'left': -90,
  'slight left': -45,
  'merge to left': -30,
  'straight': 0,
  'none': 0,
  'merge to right': 30,
  'slight right': 45,
  'right': 90,
  'sharp right': 135,
  'uturn': -180,
}

/** Which way a maneuver goes, in the same terms as a lane arrow. */
export function maneuverAngle(maneuver: Maneuver): number {
  if (maneuver.kind === 'uturn')
    return -180
  if (maneuver.direction === 'straight')
    return 0
  const sign = maneuver.direction === 'left' ? -1 : 1
  if (maneuver.kind === 'turn')
    return sign * (maneuver.degree === 'slight' ? 45 : maneuver.degree === 'sharp' ? 135 : 90)
  // Ramps, exits, forks, keeps and merges bear off rather than turn.
  return sign * 45
}

/** The arrow on a lane that the maneuver uses: the one pointing closest to it. */
export function laneIndicationFor(lane: LaneInfo, maneuver: Maneuver): string {
  const target = maneuverAngle(maneuver)
  let best = lane.indications[0] ?? 'none'
  let gap = Infinity
  for (const indication of lane.indications) {
    const angle = INDICATION_ANGLES[indication] ?? 0
    const d = Math.abs(angle - target)
    if (d < gap) {
      gap = d
      best = indication
    }
  }
  return best
}

/**
 * Whether lane guidance is worth showing: more than one lane, and a choice to
 * make between them. Where every lane works, or none is marked usable, there
 * is nothing to tell the driver.
 */
export function lanesMatter(lanes: LaneInfo[] | undefined): boolean {
  if (!lanes || lanes.length < 2)
    return false
  const valid = lanes.filter(l => l.valid).length
  return valid > 0 && valid < lanes.length
}

/**
 * Which lanes to be in, the way a person says it: "the left lane", "the
 * right 2 lanes", "the middle lane", "the second lane from the left".
 * Nothing when every lane will do.
 */
export function laneHint(lanes: LaneInfo[] | undefined): string | undefined {
  if (!lanes || !lanesMatter(lanes))
    return undefined
  const valid = lanes.map((l, i) => (l.valid ? i : -1)).filter(i => i >= 0)
  const n = lanes.length
  const k = valid.length
  const first = valid[0]!
  const last = valid[k - 1]!
  const contiguous = last - first === k - 1
  if (!contiguous)
    return undefined
  if (first === 0)
    return k === 1 ? 'the left lane' : `the left ${k} lanes`
  if (last === n - 1)
    return k === 1 ? 'the right lane' : `the right ${k} lanes`
  if (k === 1)
    return n === 3 ? 'the middle lane' : `the ${ordinal(first + 1)} lane from the left`
  return `the middle ${k} lanes`
}

/**
 * One lane's arrows, as an SVG string in `currentColor`: every arrow painted
 * on the lane, the one the maneuver uses solid and the rest faint, and the
 * whole lane faint when it is not one to be in — Apple's lane strip.
 */
export function laneIcon(lane: LaneInfo, maneuver: Maneuver): string {
  const used = laneIndicationFor(lane, maneuver)
  const stroke = 'stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"'
  const arrows = [...new Set(lane.indications.length ? lane.indications : ['none'])]
    // The one in use last, so it is drawn over the others.
    .sort((a, b) => Number(a === used) - Number(b === used))
    .map((indication) => {
      const opacity = lane.valid && indication === used ? 1 : 0.35
      const head = (x: number, y: number, a: number): string => {
        const s = 5
        const p = (d: number, r: number): string => `${(x + Math.sin(a + d) * r).toFixed(1)} ${(y - Math.cos(a + d) * r).toFixed(1)}`
        return `<path d="M${p(0, s)}L${p(2.4, s * 0.85)}L${p(-2.4, s * 0.85)}Z" fill="currentColor" fill-opacity="${opacity}"/>`
      }
      if (indication === 'uturn')
        return `<path d="M15 30V13a4 4 0 0 0-8 0v5" ${stroke} stroke-opacity="${opacity}"/>${head(7, 21, Math.PI)}`
      const angle = ((INDICATION_ANGLES[indication] ?? 0) * Math.PI) / 180
      if (angle === 0)
        return `<path d="M12 30V7" ${stroke} stroke-opacity="${opacity}"/>${head(12, 5, 0)}`
      // Up most of the lane before bending, as a painted arrow does.
      const bend = 13
      const ex = 12 + Math.sin(angle) * 8
      const ey = bend - Math.cos(angle) * 8
      return `<path d="M12 30V${bend + 3}Q12 ${bend} ${((12 + ex) / 2).toFixed(1)} ${((bend + ey) / 2).toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}" ${stroke} stroke-opacity="${opacity}"/>${head(ex, ey, angle)}`
    })
  return `<svg viewBox="0 0 24 32" width="24" height="32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-valid="${lane.valid}">${arrows.join('')}</svg>`
}

/**
 * The arrow for a maneuver, as an SVG string on a 48-unit grid in
 * `currentColor` — thick, rounded, and legible at a glance, like the banner
 * arrows in Apple Maps. Branching maneuvers draw the road not taken faintly
 * behind the arrow.
 */
export function maneuverIcon(maneuver: Maneuver): string {
  const stroke = 'stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" fill="none"'
  const wrap = (body: string): string => `<svg viewBox="0 0 48 48" width="48" height="48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`
  const head = (x: number, y: number, angle: number): string => {
    // A filled triangle pointing along `angle` (radians, 0 = up, clockwise).
    const s = 8
    const tip = [x + Math.sin(angle) * s, y - Math.cos(angle) * s]
    const left = [x + Math.sin(angle - 2.3) * s * 0.9, y - Math.cos(angle - 2.3) * s * 0.9]
    const right = [x + Math.sin(angle + 2.3) * s * 0.9, y - Math.cos(angle + 2.3) * s * 0.9]
    return `<path d="M${tip[0]!.toFixed(1)} ${tip[1]!.toFixed(1)}L${left[0]!.toFixed(1)} ${left[1]!.toFixed(1)}L${right[0]!.toFixed(1)} ${right[1]!.toFixed(1)}Z" fill="currentColor"/>`
  }
  const sign = maneuver.direction === 'left' ? -1 : 1

  if (maneuver.kind === 'arrive') {
    return wrap(`<path d="M24 6c-7.2 0-12 5.3-12 12 0 8.5 12 22 12 22s12-13.5 12-22c0-6.7-4.8-12-12-12Z" fill="currentColor"/><circle cx="24" cy="18" r="4.5" fill="#000" fill-opacity=".35"/>`)
  }
  if (maneuver.kind === 'uturn') {
    // U-turns swing left where traffic drives on the right.
    const s = maneuver.direction === 'right' ? 1 : -1
    return wrap(`<path d="M${24 - 6 * s} 42V20a${8} ${8} 0 0 ${s > 0 ? 1 : 0} ${16 * s} 0v8" ${stroke}/>${head(24 + 10 * s, 32, Math.PI)}`)
  }
  if (maneuver.kind === 'roundabout' || maneuver.kind === 'roundabout-exit') {
    const exitAngle = maneuver.direction === 'straight' ? 0 : sign * Math.PI / 2
    const ex = 24 + Math.sin(exitAngle) * 18
    const ey = 20 - Math.cos(exitAngle) * 18
    return wrap(`<circle cx="24" cy="20" r="9" ${stroke}/><path d="M24 42V29" ${stroke}/><path d="M${24 + Math.sin(exitAngle) * 9} ${20 - Math.cos(exitAngle) * 9}L${ex - Math.sin(exitAngle) * 5} ${ey + Math.cos(exitAngle) * 5}" ${stroke}/>${head(ex, ey, exitAngle)}`)
  }

  // Everything else is an arrow bending from straight up by some angle.
  let angle = 0
  if (maneuver.direction !== 'straight') {
    const degrees = maneuver.kind === 'turn'
      ? (maneuver.degree === 'slight' ? 45 : maneuver.degree === 'sharp' ? 135 : 90)
      : 40
    angle = (sign * degrees * Math.PI) / 180
  }
  const bend = 22
  const length = 13
  const ex = 24 + Math.sin(angle) * length
  const ey = bend - Math.cos(angle) * length
  const branch = maneuver.kind === 'fork' || maneuver.kind === 'keep' || maneuver.kind === 'ramp' || maneuver.kind === 'exit' || maneuver.kind === 'merge'
  // The road not taken, faintly: straight on, for a fork or an exit.
  const ghost = branch && angle !== 0 ? `<path d="M24 ${bend}V6" ${stroke} stroke-opacity=".35"/>` : ''
  const d = angle === 0 ? `M24 42V12` : `M24 42V${bend}Q24 ${bend - 4} ${(24 + ex) / 2} ${(bend + ey) / 2}L${ex.toFixed(1)} ${ey.toFixed(1)}`
  return wrap(`${ghost}<path d="${d}" ${stroke}/>${head(angle === 0 ? 24 : ex, angle === 0 ? 10 : ey, angle)}`)
}
