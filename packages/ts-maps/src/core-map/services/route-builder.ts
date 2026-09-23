// Drawing a route by tapping the map: waypoints, and the line between each
// pair — along real paths through a router, or straight. Headless, so any
// UI (a map click, a list of places, a test) drives the same logic.
//
//   const builder = new RouteBuilder({ router: directionsRouter(new ValhallaDirections(), 'walking') })
//   builder.onChange(() => line.setLatLngs(builder.path))
//   map.on('click', e => builder.add(e.latlng))

import type { DirectionsProvider, LatLngLike, TransportProfile } from './types'
import { distanceMeters, pathLengthMeters } from './paths'

/** The line from one waypoint to the next, first and last points included. */
export type SegmentRouter = (from: LatLngLike, to: LatLngLike, signal?: AbortSignal) => Promise<LatLngLike[]>

/** A straight line: for open ground, beaches, or when routing is off. */
export const straightRouter: SegmentRouter = async (from, to) => [from, to]

/** Route each segment through a directions provider — walking follows footpaths and trails. */
export function directionsRouter(provider: DirectionsProvider, profile: TransportProfile = 'walking'): SegmentRouter {
  return async (from, to, signal) => {
    const [route] = await provider.getDirections([from, to], { profile, signal })
    if (!route?.geometry?.length)
      throw new Error('No route between these points')
    return route.geometry
  }
}

export interface RouteBuilderOptions {
  /** How each new segment is drawn. Default: straight. */
  router?: SegmentRouter
  /**
   * When the router fails (no path, offline, rate-limited), draw that one
   * segment straight instead of refusing the tap. Default true: a route with
   * one straight stretch beats a map that ignores the person.
   */
  fallbackToStraight?: boolean
  /** A route whose ends are this close is a loop. Default 50 m. */
  loopToleranceMeters?: number
}

export interface RouteBuilderState {
  waypoints: LatLngLike[]
  /** segments[i] runs from waypoints[i] to waypoints[i + 1]. */
  segments: LatLngLike[][]
  /** Segments that fell back to a straight line. */
  straight: boolean[]
}

type Listener = (builder: RouteBuilder) => void

function samePoint(a: LatLngLike, b: LatLngLike): boolean {
  return a.lat === b.lat && a.lng === b.lng
}

export class RouteBuilder {
  private state: RouteBuilderState = { waypoints: [], segments: [], straight: [] }
  private history: RouteBuilderState[] = []
  private listeners = new Set<Listener>()
  private queue: Promise<void> = Promise.resolve()
  private pendingCount = 0
  private router: SegmentRouter
  private fallbackToStraight: boolean
  private loopTolerance: number
  /** Why the last segment could not be routed, if it could not. */
  lastError: string | null = null

  constructor(opts: RouteBuilderOptions = {}) {
    this.router = opts.router ?? straightRouter
    this.fallbackToStraight = opts.fallbackToStraight ?? true
    this.loopTolerance = opts.loopToleranceMeters ?? 50
  }

  get waypoints(): LatLngLike[] {
    return this.state.waypoints.slice()
  }

  get segments(): LatLngLike[][] {
    return this.state.segments.map(s => s.slice())
  }

  /** The whole line, segments joined without repeating their shared ends. */
  get path(): LatLngLike[] {
    const { waypoints, segments } = this.state
    if (!segments.length)
      return waypoints.slice(0, 1)
    const out: LatLngLike[] = []
    for (const segment of segments) {
      for (const point of segment) {
        if (!out.length || !samePoint(out[out.length - 1], point))
          out.push(point)
      }
    }
    return out
  }

  get distanceMeters(): number {
    return this.state.segments.reduce((sum, s) => sum + pathLengthMeters(s), 0)
  }

  /** Ends within the loop tolerance, and long enough to be a route at all. */
  get isLoop(): boolean {
    const w = this.state.waypoints
    return w.length > 2 && distanceMeters(w[0], w[w.length - 1]) <= this.loopTolerance
  }

  /** Segments being routed right now. */
  get pending(): number {
    return this.pendingCount
  }

  get canUndo(): boolean {
    return this.history.length > 0
  }

  /** Use a different router for segments added from now on. */
  setRouter(router: SegmentRouter): void {
    this.router = router
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Add a waypoint, routing the segment to it from the last one. Taps made
   * while a segment is still routing wait their turn, so a fast series of
   * taps still draws in order.
   */
  add(point: LatLngLike, opts: { router?: SegmentRouter } = {}): Promise<void> {
    const target = { lat: point.lat, lng: point.lng }
    this.pendingCount++
    this.emit()
    const run = async (): Promise<void> => {
      const before = this.snapshot()
      const { waypoints } = this.state
      if (!waypoints.length) {
        this.state = { waypoints: [target], segments: [], straight: [] }
      }
      else {
        const from = waypoints[waypoints.length - 1]
        const { segment, straight } = await this.route(from, target, opts.router ?? this.router)
        this.state = {
          waypoints: [...waypoints, target],
          segments: [...this.state.segments, segment],
          straight: [...this.state.straight, straight],
        }
      }
      this.history.push(before)
    }
    return this.enqueue(async () => {
      try {
        await run()
      }
      finally {
        this.pendingCount--
      }
    })
  }

  /** Route back to the first waypoint. */
  closeLoop(opts: { router?: SegmentRouter } = {}): Promise<void> {
    const start = this.state.waypoints[0]
    if (!start || this.state.waypoints.length < 2 || this.isLoop)
      return this.queue
    return this.add(start, opts)
  }

  /** Return the way you came: the path so far, mirrored onto its end. */
  outAndBack(): Promise<void> {
    const run = async (): Promise<void> => {
      const { waypoints, segments, straight } = this.state
      if (waypoints.length < 2)
        return
      this.history.push(this.snapshot())
      this.state = {
        waypoints: [...waypoints, ...waypoints.slice(0, -1).reverse()],
        segments: [...segments, ...segments.slice().reverse().map(s => s.slice().reverse())],
        straight: [...straight, ...straight.slice().reverse()],
      }
    }
    return this.enqueue(run)
  }

  /** Take back the last change — a waypoint, a loop, an out-and-back. */
  undo(): Promise<void> {
    return this.enqueue(async () => {
      const previous = this.history.pop()
      if (previous)
        this.state = previous
    })
  }

  clear(): Promise<void> {
    return this.enqueue(async () => {
      if (this.state.waypoints.length)
        this.history.push(this.snapshot())
      this.state = { waypoints: [], segments: [], straight: [] }
      this.lastError = null
    })
  }

  /** Start from an existing line (a catalog trail, a saved route). */
  load(path: LatLngLike[]): Promise<void> {
    return this.enqueue(async () => {
      this.history.push(this.snapshot())
      const points = path.map(p => ({ lat: p.lat, lng: p.lng }))
      this.state = points.length < 2
        ? { waypoints: points.slice(0, 1), segments: [], straight: [] }
        : { waypoints: [points[0], points[points.length - 1]], segments: [points], straight: [false] }
    })
  }

  /** Resolves once every queued change has been applied. */
  settled(): Promise<void> {
    return this.queue
  }

  toJSON(): { waypoints: LatLngLike[], path: LatLngLike[], distanceMeters: number, loop: boolean } {
    return { waypoints: this.waypoints, path: this.path, distanceMeters: this.distanceMeters, loop: this.isLoop }
  }

  private async route(from: LatLngLike, to: LatLngLike, router: SegmentRouter): Promise<{ segment: LatLngLike[], straight: boolean }> {
    try {
      const line = await router(from, to)
      this.lastError = null
      if (line.length >= 2) {
        // The router snaps to the nearest path; keep the exact taps as the
        // segment's ends so the next segment starts where the person tapped.
        const segment = line.slice()
        if (!samePoint(segment[0], from))
          segment.unshift(from)
        if (!samePoint(segment[segment.length - 1], to))
          segment.push(to)
        return { segment, straight: router === straightRouter }
      }
    }
    catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      if (!this.fallbackToStraight)
        throw error
    }
    return { segment: [from, to], straight: true }
  }

  /**
   * Run `task` after everything already queued. A task that throws rejects
   * its own promise but not the queue, so one failed segment cannot stop
   * every tap after it.
   */
  private enqueue(task: () => Promise<void>): Promise<void> {
    const result = this.queue.then(task)
    this.queue = result.catch(() => {}).finally(() => this.emit())
    return result
  }

  private snapshot(): RouteBuilderState {
    return {
      waypoints: this.state.waypoints.slice(),
      segments: this.state.segments.map(s => s.slice()),
      straight: this.state.straight.slice(),
    }
  }

  private emit(): void {
    for (const listener of this.listeners)
      listener(this)
  }
}
