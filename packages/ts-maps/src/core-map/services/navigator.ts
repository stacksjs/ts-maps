import type { LatLngLike, Route, RouteStep, TransportProfile } from './types'
import type { DistanceUnits, Maneuver } from './instructions'
import { Evented } from '../core/Events'
import { formatInstruction, parseManeuver, spokenInstruction } from './instructions'

/**
 * Turn-by-turn guidance along a route: where you are on it, what is next, how
 * long is left, when to speak, and when you have left it.
 *
 * Feed it positions with `update()` — from the Geolocation API, a simulator,
 * or a recorded trace — and listen for:
 *
 *   - `progress` — every fix: position on the route, distance to the next
 *     maneuver, distance and time remaining, arrival time.
 *   - `step` — the next maneuver changed.
 *   - `instruction` — something to say: early warning, get ready, now.
 *   - `offroute` — the position has left the route; reroute from here.
 *   - `arrive` — at the destination.
 *
 * No map, no DOM: the UI in `TurnByTurn` is one consumer of this, and a test
 * or a server-side replay can be another.
 */

export interface PositionFix extends LatLngLike {
  /** Degrees clockwise from north, when the device knows it. */
  heading?: number | null
  /** Metres per second. */
  speed?: number | null
  /** Horizontal accuracy in metres. */
  accuracy?: number | null
  /** Milliseconds; defaults to now. */
  time?: number
}

export interface NavigationProgress {
  /** The fix, snapped onto the route. */
  location: LatLngLike
  /** The fix as it arrived. */
  raw: PositionFix
  /** How far the fix is from the route, in metres. */
  offRouteDistance: number
  /** Direction of travel along the route here, degrees clockwise from north. */
  heading: number
  /** Metres per second: the fix's own, or estimated from the last two. */
  speed: number
  distanceTraveled: number
  distanceRemaining: number
  /** Seconds. */
  durationRemaining: number
  arrival: Date
  /** The step being driven along. */
  stepIndex: number
  /** The maneuver coming up at the end of it, and the step it leads onto. */
  nextStep: RouteStep | undefined
  nextManeuver: Maneuver
  /** Metres to that maneuver. */
  distanceToManeuver: number
  /** The banner text for it: "Turn right onto Market St". */
  banner: string
  /** The maneuver after next, when it follows closely — Apple's "Then". */
  thenManeuver?: Maneuver
}

export interface NavigatorOptions {
  profile?: TransportProfile
  units?: DistanceUnits
  /** Metres from the route before a fix counts as off it. */
  offRouteThreshold?: number
  /** Metres from the destination that count as arrived. */
  arrivalThreshold?: number
}

export interface Instruction {
  /** For the screen. */
  text: string
  /** For the voice. */
  spoken: string
  /** Which announcement of the maneuver this is. */
  stage: 'early' | 'prepare' | 'now'
  stepIndex: number
  distance: number
}

/** When to announce a maneuver, in metres before it, by profile. */
const ANNOUNCE: Record<TransportProfile, { early: number, prepare: number, now: number }> = {
  driving: { early: 800, prepare: 250, now: 45 },
  cycling: { early: 300, prepare: 100, now: 20 },
  walking: { early: 150, prepare: 50, now: 12 },
}

/** Local flat projection, metres, around a reference latitude. */
function projector(lat0: number): (p: LatLngLike) => [number, number] {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 110540
  return p => [p.lng * kx, p.lat * ky]
}

export class Navigator extends Evented {
  route: Route
  options: Required<NavigatorOptions>
  /** The route line, step by step, with each point's distance along it. */
  points: LatLngLike[] = []
  along: number[] = []
  /** Where each step starts along the line. */
  stepStarts: number[] = []
  length = 0
  progress: NavigationProgress | null = null

  _project: (p: LatLngLike) => [number, number]
  _xy: Array<[number, number]> = []
  _stepShown = -1
  _announced: Set<string> = new Set()
  _offRouteSince: number | null = null
  _offRouteFired = false
  _arrived = false
  _last: { distance: number, time: number } | null = null

  constructor(route: Route, options: NavigatorOptions = {}) {
    super()
    this.options = {
      profile: options.profile ?? 'driving',
      units: options.units ?? 'metric',
      offRouteThreshold: options.offRouteThreshold ?? (options.profile === 'walking' ? 25 : 40),
      arrivalThreshold: options.arrivalThreshold ?? 25,
    }
    this.route = route
    this._project = projector(route.geometry[0]?.lat ?? 0)
    this.setRoute(route)
  }

  /** Swap in a new route — after a reroute — keeping the announcement state clean. */
  setRoute(route: Route): void {
    this.route = route
    const steps = route.steps.length ? route.steps : [{ distance: route.distance, duration: route.duration, instruction: '', geometry: route.geometry, maneuver: 'depart' }]

    // The line is rebuilt from the steps, so step boundaries fall exactly on
    // it; the overview geometry and the step geometries need not agree.
    const points: LatLngLike[] = []
    const starts: number[] = []
    for (const step of steps) {
      // A step starts where the last one ended; that shared point is kept
      // once, and the step starts on it.
      const first = step.geometry[0]
      const last = points[points.length - 1]
      starts.push(first && last && first.lat === last.lat && first.lng === last.lng ? points.length - 1 : points.length)
      for (const p of step.geometry) {
        const last = points[points.length - 1]
        if (!last || last.lat !== p.lat || last.lng !== p.lng)
          points.push(p)
      }
    }
    if (points.length < 2)
      points.push(...route.geometry)

    this._project = projector(points[0]?.lat ?? 0)
    this.points = points
    this._xy = points.map(this._project)
    this.along = [0]
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = this._xy[i - 1]!
      const [bx, by] = this._xy[i]!
      this.along.push(this.along[i - 1]! + Math.hypot(bx - ax, by - ay))
    }
    this.length = this.along[this.along.length - 1] ?? 0
    this.stepStarts = starts.map(i => this.along[Math.min(i, this.along.length - 1)] ?? 0)

    this._stepShown = -1
    this._announced.clear()
    this._offRouteSince = null
    this._offRouteFired = false
    this._arrived = false
    this._last = null
    this.progress = null
  }

  get steps(): RouteStep[] {
    return this.route.steps
  }

  /** The point on the route at a distance along it, with the heading there. */
  pointAt(distance: number): { location: LatLngLike, heading: number } {
    const d = Math.max(0, Math.min(this.length, distance))
    let i = 1
    while (i < this.along.length - 1 && this.along[i]! < d)
      i++
    const a = this.points[i - 1]!
    const b = this.points[i] ?? a
    const span = (this.along[i] ?? 0) - (this.along[i - 1] ?? 0)
    const t = span > 0 ? (d - this.along[i - 1]!) / span : 0
    const [ax, ay] = this._xy[i - 1]!
    const [bx, by] = this._xy[i] ?? this._xy[i - 1]!
    return {
      location: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
      heading: (Math.atan2(bx - ax, by - ay) * 180 / Math.PI + 360) % 360,
    }
  }

  /**
   * Where a fix falls on the route. Searched near where the last fix was
   * first — a route that doubles back past itself would otherwise let a fix
   * jump to the wrong pass.
   */
  snap(fix: LatLngLike): { distance: number, offset: number } {
    const [px, py] = this._project(fix)
    const search = (from: number, to: number): { distance: number, offset: number } => {
      let best = { distance: 0, offset: Infinity }
      for (let i = 1; i < this._xy.length; i++) {
        if (this.along[i]! < from || this.along[i - 1]! > to)
          continue
        const [ax, ay] = this._xy[i - 1]!
        const [bx, by] = this._xy[i]!
        const dx = bx - ax
        const dy = by - ay
        const len2 = dx * dx + dy * dy
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
        const offset = Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
        if (offset < best.offset)
          best = { distance: this.along[i - 1]! + Math.sqrt(len2) * t, offset }
      }
      return best
    }
    if (this._last) {
      const near = search(this._last.distance - 60, this._last.distance + 600)
      if (near.offset < this.options.offRouteThreshold)
        return near
    }
    return search(-Infinity, Infinity)
  }

  /** Feed a position. Returns the progress it produced. */
  update(fix: PositionFix): NavigationProgress {
    const time = fix.time ?? Date.now()
    const { distance, offset } = this.snap(fix)

    // Speed: the device's, or distance over time along the route.
    let speed = typeof fix.speed === 'number' && fix.speed >= 0 ? fix.speed : 0
    if (!(speed > 0) && this._last && time > this._last.time)
      speed = Math.max(0, (distance - this._last.distance) / ((time - this._last.time) / 1000))
    this._last = { distance, time }

    const stepIndex = this._stepAt(distance)
    const next = this.route.steps[stepIndex + 1]
    const stepEnd = this.stepStarts[stepIndex + 1] ?? this.length
    const distanceToManeuver = Math.max(0, stepEnd - distance)
    const nextManeuver = parseManeuver(next?.maneuver ?? 'arrive', next?.exit)
    const after = this.route.steps[stepIndex + 2]
    const afterGap = (this.stepStarts[stepIndex + 2] ?? this.length) - stepEnd
    // Apple shows "Then ↰" when a second maneuver follows the next closely.
    const thenManeuver = after && afterGap < (this.options.profile === 'walking' ? 40 : 150)
      ? parseManeuver(after.maneuver, after.exit)
      : undefined

    const distanceRemaining = Math.max(0, this.length - distance)
    const durationRemaining = this._durationFrom(distance, stepIndex)
    const { heading } = this.pointAt(distance)

    const progress: NavigationProgress = {
      location: this.pointAt(distance).location,
      raw: fix,
      offRouteDistance: offset,
      heading,
      speed,
      distanceTraveled: distance,
      distanceRemaining,
      durationRemaining,
      arrival: new Date(time + durationRemaining * 1000),
      stepIndex,
      nextStep: next,
      nextManeuver,
      distanceToManeuver,
      banner: formatInstruction(nextManeuver, { name: next?.name, abbreviate: true }),
      thenManeuver,
    }
    this.progress = progress

    if (stepIndex !== this._stepShown) {
      this._stepShown = stepIndex
      this.fire('step', { progress })
    }

    // Leaving the route: well off it, for more than a moment. One reading is
    // GPS noise; a few seconds of them is a wrong turn.
    const threshold = Math.max(this.options.offRouteThreshold, (fix.accuracy ?? 0) * 1.5)
    if (offset > threshold) {
      this._offRouteSince ??= time
      if (!this._offRouteFired && time - this._offRouteSince >= 3000) {
        this._offRouteFired = true
        this.fire('offroute', { progress })
      }
    }
    else {
      this._offRouteSince = null
      this._offRouteFired = false
    }

    if (!this._arrived && offset <= threshold && distanceRemaining <= this.options.arrivalThreshold) {
      this._arrived = true
      this.fire('arrive', { progress })
    }
    else if (!this._offRouteFired) {
      this._announce(progress)
    }

    this.fire('progress', { progress })
    return progress
  }

  /** The step whose stretch of road a distance falls on. */
  _stepAt(distance: number): number {
    let i = 0
    while (i + 1 < this.stepStarts.length && this.stepStarts[i + 1]! <= distance)
      i++
    return i
  }

  /** Seconds left: the rest of this step pro rata, and every step after. */
  _durationFrom(distance: number, stepIndex: number): number {
    const steps = this.route.steps
    if (!steps.length)
      return this.length > 0 ? this.route.duration * (1 - distance / this.length) : 0
    const start = this.stepStarts[stepIndex] ?? 0
    const end = this.stepStarts[stepIndex + 1] ?? this.length
    const fraction = end > start ? (end - distance) / (end - start) : 0
    let total = (steps[stepIndex]?.duration ?? 0) * Math.max(0, Math.min(1, fraction))
    for (let i = stepIndex + 1; i < steps.length; i++)
      total += steps[i]!.duration
    return total
  }

  /**
   * Speak each maneuver up to three times: early, on a stretch long enough to
   * give warning; again to get ready; and as it happens. Each stage is said
   * once, and saying a more urgent one retires any less urgent one not yet
   * said — arriving late at a maneuver gets "now", not a stale "in 800 m".
   */
  _announce(progress: NavigationProgress): void {
    const next = progress.nextStep
    if (!next)
      return
    const thresholds = ANNOUNCE[this.options.profile]
    const stepLength = (this.stepStarts[progress.stepIndex + 1] ?? this.length) - (this.stepStarts[progress.stepIndex] ?? 0)
    const d = progress.distanceToManeuver
    // Most urgent first.
    const stages: Array<[Instruction['stage'], number]> = [['now', thresholds.now], ['prepare', thresholds.prepare], ['early', thresholds.early]]

    for (let i = 0; i < stages.length; i++) {
      const [stage, at] = stages[i]!
      if (d > at)
        continue
      // On a stretch shorter than the early warning's distance, the warning
      // would land right on top of the previous maneuver; "get ready" covers
      // it.
      if (stage === 'early' && stepLength < at * 1.2)
        return
      const key = `${progress.stepIndex}:${stage}`
      if (this._announced.has(key))
        return
      for (let j = i; j < stages.length; j++)
        this._announced.add(`${progress.stepIndex}:${stages[j]![0]}`)

      const instruction: Instruction = {
        text: formatInstruction(progress.nextManeuver, { name: next.name }),
        spoken: spokenInstruction(progress.nextManeuver, next.name, stage === 'now' ? undefined : d, this.options.units),
        stage,
        stepIndex: progress.stepIndex,
        distance: d,
      }
      this.fire('instruction', { instruction, progress })
      return
    }
  }
}
