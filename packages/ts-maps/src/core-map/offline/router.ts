/**
 * Directions with no network, from the roads in downloaded maps.
 *
 * The road lines read from each tile are joined into one graph — shared
 * vertices are junctions, and the ends where a road was cut at a tile's edge
 * are sewn to their continuation in the next tile — then searched with A*.
 * The route found is described in the same steps and maneuver codes an online
 * provider returns, so the turn-by-turn UI cannot tell the difference.
 */

import type { LatLngLike, Route, RouteStep, TransportProfile } from '../services/types'
import type { OfflineRoad } from './OfflineStore'
import { formatInstruction, parseManeuver } from '../services/instructions'

const EARTH = 6371008.8
const RAD = Math.PI / 180

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * RAD
  const dLng = (bLng - aLng) * RAD
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(s)))
}

function bearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const y = Math.sin((bLng - aLng) * RAD) * Math.cos(bLat * RAD)
  const x = Math.cos(aLat * RAD) * Math.sin(bLat * RAD) - Math.sin(aLat * RAD) * Math.cos(bLat * RAD) * Math.cos((bLng - aLng) * RAD)
  return (Math.atan2(y, x) / RAD + 360) % 360
}

/** Speeds in km/h by road class; a class missing here cannot be used. */
const SPEEDS: Record<TransportProfile, Record<string, number>> = {
  driving: { motorway: 100, trunk: 80, primary: 60, secondary: 50, tertiary: 40, minor: 30, service: 15, track: 10 },
  cycling: { trunk: 16, primary: 16, secondary: 17, tertiary: 17, minor: 17, service: 14, track: 12, path: 15 },
  walking: { primary: 5, secondary: 5, tertiary: 5, minor: 5, service: 5, track: 5, path: 5 },
}

function speedFor(profile: TransportProfile, road: OfflineRoad): number {
  const table = SPEEDS[profile]
  const [kind, sub] = road.kind.split(':') as [string, string | undefined]
  if (profile === 'driving' && road.ramp)
    return 50
  if (kind === 'path') {
    // Paths are for people: cycleways for bikes, footways for walking.
    if (profile === 'cycling' && sub && sub !== 'cycleway' && sub !== 'path')
      return sub === 'footway' || sub === 'pedestrian' ? 6 : 0
    return table.path ?? 0
  }
  return table[kind] ?? 0
}

/** Seconds lost at each junction passed through. */
const JUNCTION_DELAY: Record<TransportProfile, number> = { driving: 7, cycling: 3, walking: 1.5 }

interface Edge {
  to: number
  /** Metres. */
  length: number
  /** Seconds. */
  cost: number
  road: number
}

export interface RoadGraphOptions {
  profile?: TransportProfile
}

/** A searchable road network, built once per set of roads and profile. */
export class RoadGraph {
  profile: TransportProfile
  lat: number[] = []
  lng: number[] = []
  edges: Edge[][] = []
  roads: OfflineRoad[]
  _keys: Map<string, number> = new Map()
  /** Nodes where a road was cut at a tile edge, bucketed for sewing. */
  _cuts: Map<string, number[]> = new Map()
  /** Every node on a coarse grid, for snapping a waypoint onto the network. */
  _grid: Map<string, number[]> = new Map()
  _maxSpeed = 1

  /** Points where each segment must be split, keyed by road then segment. */
  _splits: Map<number, Map<number, Array<{ t: number, lat: number, lng: number }>>> = new Map()

  constructor(roads: OfflineRoad[], options: RoadGraphOptions = {}) {
    this.profile = options.profile ?? 'driving'
    this.roads = roads
    this._findJunctions()
    for (let r = 0; r < roads.length; r++)
      this._addRoad(r)
    this._splits.clear()
    this._junctionDelays()
  }

  /**
   * Time lost at junctions: lights, stop signs, giving way. Without it a
   * drive across a city grid comes out at motorway pace.
   */
  _junctionDelays(): void {
    const delay = JUNCTION_DELAY[this.profile]
    const neighbours = this.edges.map(() => new Set<number>())
    this.edges.forEach((list, from) => {
      for (const edge of list) {
        if (edge.road < 0)
          continue
        neighbours[from]!.add(edge.to)
        neighbours[edge.to]!.add(from)
      }
    })
    for (const list of this.edges) {
      for (const edge of list) {
        if (edge.road >= 0 && neighbours[edge.to]!.size >= 3)
          edge.cost += delay
      }
    }
  }

  /**
   * Find where roads meet without sharing a vertex.
   *
   * Tiles are simplified as they are made, which drops the vertices of a
   * straight street — including the one where a side street joins it, or
   * where two straight streets cross. Left as they are, a city grid would be
   * a heap of unconnected lines. So every crossing, and every road end lying
   * on another road, becomes a junction — unless one passes over the other:
   * roads only meet at the same level, so a bridge never joins the street
   * below it.
   */
  _findJunctions(): void {
    const roads = this.roads
    const usable = roads.map(road => speedFor(this.profile, road) > 0)
    const ref = roads.find((_, i) => usable[i])
    if (!ref)
      return
    // A local plane in metres: flat enough over a city.
    const M = 111_320
    const kx = Math.cos((ref.coords[0]! * Math.PI) / 180)
    const CELL = 60
    const TOUCH = 1.5

    type Seg = { r: number, i: number, ax: number, ay: number, bx: number, by: number, level: number, a: [number, number], b: [number, number] }
    const segs: Seg[] = []
    const grid = new Map<number, number[]>()
    const key = (cx: number, cy: number): number => (cx + 1e6) * 2e6 + (cy + 1e6)
    for (let r = 0; r < roads.length; r++) {
      if (!usable[r])
        continue
      const c = roads[r]!.coords
      const level = roads[r]!.level ?? 0
      for (let i = 0; i + 3 < c.length; i += 2) {
        const seg: Seg = {
          r,
          i: i / 2,
          ax: c[i + 1]! * kx * M,
          ay: c[i]! * M,
          bx: c[i + 3]! * kx * M,
          by: c[i + 2]! * M,
          level,
          a: [c[i]!, c[i + 1]!],
          b: [c[i + 2]!, c[i + 3]!],
        }
        const id = segs.push(seg) - 1
        const x0 = Math.floor((Math.min(seg.ax, seg.bx) - TOUCH) / CELL)
        const x1 = Math.floor((Math.max(seg.ax, seg.bx) + TOUCH) / CELL)
        const y0 = Math.floor((Math.min(seg.ay, seg.by) - TOUCH) / CELL)
        const y1 = Math.floor((Math.max(seg.ay, seg.by) + TOUCH) / CELL)
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const k = key(cx, cy)
            const list = grid.get(k)
            if (list)
              list.push(id)
            else
              grid.set(k, [id])
          }
        }
      }
    }

    const split = (s: Seg, t: number, lat: number, lng: number): void => {
      // Ends are vertices already.
      if (t <= 1e-9 || t >= 1 - 1e-9)
        return
      let byRoad = this._splits.get(s.r)
      if (!byRoad)
        this._splits.set(s.r, byRoad = new Map())
      const list = byRoad.get(s.i)
      const point = { t, lat, lng }
      if (list)
        list.push(point)
      else
        byRoad.set(s.i, [point])
    }
    /** Where an end of `a` lies on `b`, if it does. */
    const touch = (px: number, py: number, b: Seg): number | undefined => {
      const vx = b.bx - b.ax
      const vy = b.by - b.ay
      const len = vx * vx + vy * vy
      if (!len)
        return undefined
      const t = ((px - b.ax) * vx + (py - b.ay) * vy) / len
      if (t < 0 || t > 1)
        return undefined
      return Math.hypot(b.ax + vx * t - px, b.ay + vy * t - py) <= TOUCH ? t : undefined
    }

    const seen = new Set<number>()
    for (const list of grid.values()) {
      for (let m = 0; m < list.length; m++) {
        for (let n = m + 1; n < list.length; n++) {
          const ia = list[m]!
          const ib = list[n]!
          const a = segs[ia]!
          const b = segs[ib]!
          if (a.level !== b.level || (a.r === b.r && Math.abs(a.i - b.i) <= 1))
            continue
          const pair = ia < ib ? ia * segs.length + ib : ib * segs.length + ia
          if (seen.has(pair))
            continue
          seen.add(pair)

          // A proper crossing.
          const rx = a.bx - a.ax
          const ry = a.by - a.ay
          const sx = b.bx - b.ax
          const sy = b.by - b.ay
          const denom = rx * sy - ry * sx
          if (Math.abs(denom) > 1e-9) {
            const t = ((b.ax - a.ax) * sy - (b.ay - a.ay) * sx) / denom
            const u = ((b.ax - a.ax) * ry - (b.ay - a.ay) * rx) / denom
            if (t > 0 && t < 1 && u > 0 && u < 1) {
              const lat = (a.ay + ry * t) / M
              const lng = (a.ax + rx * t) / (kx * M)
              split(a, t, lat, lng)
              split(b, u, lat, lng)
              continue
            }
          }
          // An end of one lying on the other: a T-junction, or a road cut
          // at a tile's edge meeting its continuation.
          // The end's own coordinates become the junction, so it is the
          // same node as the end.
          for (const [p, other] of [[a, b], [b, a]] as Array<[Seg, Seg]>) {
            const ta = touch(p.ax, p.ay, other)
            if (ta !== undefined)
              split(other, ta, p.a[0], p.a[1])
            const tb = touch(p.bx, p.by, other)
            if (tb !== undefined)
              split(other, tb, p.b[0], p.b[1])
          }
        }
      }
    }
  }

  get size(): number {
    return this.lat.length
  }

  _node(lat: number, lng: number): number {
    // About a metre: tiles quantize the same vertex to the same place, so
    // junctions shared across tiles land on the same key.
    const key = `${Math.round(lat * 1e5)},${Math.round(lng * 1e5)}`
    let id = this._keys.get(key)
    if (id !== undefined)
      return id
    id = this.lat.length
    this.lat.push(lat)
    this.lng.push(lng)
    this.edges.push([])
    this._keys.set(key, id)
    const cell = `${Math.floor(lat * 200)},${Math.floor(lng * 200)}`
    const list = this._grid.get(cell)
    if (list)
      list.push(id)
    else
      this._grid.set(cell, [id])
    return id
  }

  /** Join an end of a road to whatever it meets within a couple of metres. */
  _sew(id: number): void {
    const lat = this.lat[id]!
    const lng = this.lng[id]!
    const cx = Math.floor(lat * 20000)
    const cy = Math.floor(lng * 20000)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of this._cuts.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (other === id || haversine(lat, lng, this.lat[other]!, this.lng[other]!) > 3)
            continue
          if (!this.edges[id]!.some(e => e.to === other)) {
            this.edges[id]!.push({ to: other, length: 0, cost: 0, road: -1 })
            this.edges[other]!.push({ to: id, length: 0, cost: 0, road: -1 })
          }
        }
      }
    }
    const key = `${cx},${cy}`
    const list = this._cuts.get(key)
    if (list)
      list.push(id)
    else
      this._cuts.set(key, [id])
  }

  _addRoad(r: number): void {
    const road = this.roads[r]!
    const speed = speedFor(this.profile, road)
    if (speed <= 0)
      return
    this._maxSpeed = Math.max(this._maxSpeed, speed)
    const mps = speed / 3.6
    const c = road.coords
    const oneway = this.profile === 'walking' ? 0 : road.oneway
    const splits = this._splits.get(r)
    let prev = this._node(c[0]!, c[1]!)
    const first = prev
    const link = (next: number): void => {
      if (next === prev)
        return
      const length = haversine(this.lat[prev]!, this.lng[prev]!, this.lat[next]!, this.lng[next]!)
      const cost = length / mps
      if (oneway !== -1)
        this.edges[prev]!.push({ to: next, length, cost, road: r })
      if (oneway !== 1)
        this.edges[next]!.push({ to: prev, length, cost, road: r })
      prev = next
    }
    for (let i = 2; i < c.length; i += 2) {
      const cuts = splits?.get(i / 2 - 1)
      if (cuts) {
        cuts.sort((a, b) => a.t - b.t)
        for (const cut of cuts)
          link(this._node(cut.lat, cut.lng))
      }
      link(this._node(c[i]!, c[i + 1]!))
    }
    this._sew(first)
    this._sew(prev)
  }

  /** The nearest point on the network to `p`, as the edge it lies on. */
  snap(p: LatLngLike): { from: number, to: number, t: number, lat: number, lng: number, distance: number } | undefined {
    let best: { from: number, to: number, t: number, lat: number, lng: number, distance: number } | undefined
    const kx = Math.cos(p.lat * RAD)
    const cx = Math.floor(p.lat * 200)
    const cy = Math.floor(p.lng * 200)
    for (let ring = 1; ring <= 3 && !best; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          for (const a of this._grid.get(`${cx + dx},${cy + dy}`) ?? []) {
            for (const edge of this.edges[a]!) {
              if (edge.road < 0)
                continue
              const b = edge.to
              // Project in a local equirectangular frame: fine over one edge.
              const ax = this.lng[a]! * kx
              const ay = this.lat[a]!
              const bx = this.lng[b]! * kx
              const by = this.lat[b]!
              const px = p.lng * kx
              const vx = bx - ax
              const vy = by - ay
              const len = vx * vx + vy * vy
              const t = len ? Math.max(0, Math.min(1, ((px - ax) * vx + (p.lat - ay) * vy) / len)) : 0
              const lat = ay + vy * t
              const lng = (ax + vx * t) / kx
              const distance = haversine(p.lat, p.lng, lat, lng)
              if (!best || distance < best.distance)
                best = { from: a, to: b, t, lat, lng, distance }
            }
          }
        }
      }
    }
    return best
  }

  /**
   * The quickest path between two points, as node ids with the virtual start
   * and end points on either side. `penalty` scales the cost of edges already
   * used, which is how alternatives are found.
   */
  search(from: LatLngLike, to: LatLngLike, penalty?: Map<string, number>): { nodes: number[], start: ReturnType<RoadGraph['snap']>, end: ReturnType<RoadGraph['snap']> } | undefined {
    const start = this.snap(from)
    const end = this.snap(to)
    if (!start || !end)
      return undefined

    const n = this.size
    const START = n
    const END = n + 1
    const g = new Float64Array(n + 2).fill(Infinity)
    const came = new Int32Array(n + 2).fill(-1)
    const closed = new Uint8Array(n + 2)
    const mps = this._maxSpeed / 3.6
    const h = (id: number): number => id === END ? 0 : haversine(id === START ? start.lat : this.lat[id]!, id === START ? start.lng : this.lng[id]!, end.lat, end.lng) / mps

    // Binary heap of [f, id].
    const heap: Array<[number, number]> = []
    const push = (f: number, id: number): void => {
      heap.push([f, id])
      let i = heap.length - 1
      while (i > 0) {
        const parent = (i - 1) >> 1
        if (heap[parent]![0] <= heap[i]![0])
          break
        const swap = heap[parent]!
        heap[parent] = heap[i]!
        heap[i] = swap
        i = parent
      }
    }
    const pop = (): [number, number] => {
      const top = heap[0]!
      const last = heap.pop()!
      if (heap.length) {
        heap[0] = last
        let i = 0
        for (;;) {
          const l = i * 2 + 1
          const r = l + 1
          let m = i
          if (l < heap.length && heap[l]![0] < heap[m]![0])
            m = l
          if (r < heap.length && heap[r]![0] < heap[m]![0])
            m = r
          if (m === i)
            break
          const swap = heap[m]!
          heap[m] = heap[i]!
          heap[i] = swap
          i = m
        }
      }
      return top
    }

    const edgeCost = (a: number, b: number, base: number): number => {
      const p = penalty?.get(a < b ? `${a}-${b}` : `${b}-${a}`)
      return p ? base * p : base
    }

    // From the snapped start, along its edge to either end — or only forward
    // on a one-way street.
    const startCost = (fraction: number): number => {
      const edge = this.edges[start.from]!.find(e => e.to === start.to)
      return edge ? edge.cost * fraction : 0
    }
    g[START] = 0
    const reachable = (a: number, b: number): boolean => this.edges[a]!.some(e => e.to === b)
    if (reachable(start.from, start.to)) {
      g[start.to] = startCost(1 - start.t)
      came[start.to] = START
      push(g[start.to]! + h(start.to), start.to)
    }
    if (reachable(start.to, start.from)) {
      const back = this.edges[start.to]!.find(e => e.to === start.from)!.cost * start.t
      if (back < g[start.from]!) {
        g[start.from] = back
        came[start.from] = START
        push(back + h(start.from), start.from)
      }
    }
    // Both on the same edge, heading the right way along it.
    if (start.from === end.from && start.to === end.to) {
      const along = end.t >= start.t ? reachable(start.from, start.to) : reachable(start.to, start.from)
      if (along) {
        g[END] = this._edge(start.from, start.to)!.cost * Math.abs(end.t - start.t)
        came[END] = START
        push(g[END]!, END)
      }
    }

    const endEdge = (node: number): number | undefined => {
      // Arriving at the end point from one of its edge's ends.
      if (node === end.from && reachable(end.from, end.to))
        return this.edges[end.from]!.find(e => e.to === end.to)!.cost * end.t
      if (node === end.to && reachable(end.to, end.from))
        return this.edges[end.to]!.find(e => e.to === end.from)!.cost * (1 - end.t)
      return undefined
    }

    while (heap.length) {
      const [, id] = pop()
      if (closed[id])
        continue
      closed[id] = 1
      if (id === END)
        break
      const last = endEdge(id)
      if (last !== undefined && g[id]! + last < g[END]!) {
        g[END] = g[id]! + last
        came[END] = id
        push(g[END]!, END)
      }
      for (const edge of this.edges[id]!) {
        const cost = g[id]! + edgeCost(id, edge.to, edge.cost)
        if (cost < g[edge.to]!) {
          g[edge.to] = cost
          came[edge.to] = id
          push(cost + h(edge.to), edge.to)
        }
      }
    }

    if (!Number.isFinite(g[END]!))
      return undefined
    const nodes: number[] = []
    for (let id = came[END]!; id !== START && id >= 0; id = came[id]!)
      nodes.push(id)
    nodes.reverse()
    return { nodes, start, end }
  }

  _edge(a: number, b: number): Edge | undefined {
    return this.edges[a]!.find(e => e.to === b) ?? this.edges[b]!.find(e => e.to === a)
  }
}

interface Hop {
  from: LatLngLike
  to: LatLngLike
  length: number
  cost: number
  road?: OfflineRoad
  /** The node the hop ends on; junction degree decides whether a bend is a turn. */
  node?: number
}

function turnCode(delta: number): string {
  const a = Math.abs(delta)
  const side = delta < 0 ? 'left' : 'right'
  if (a < 25)
    return 'continue'
  if (a < 50)
    return `turn-slight-${side}`
  if (a < 125)
    return `turn-${side}`
  if (a < 165)
    return `turn-sharp-${side}`
  return `uturn-${side}`
}

function roadKey(road: OfflineRoad | undefined): string {
  return road?.name ?? (road ? `~${road.kind.split(':')[0]}` : '')
}

/** The heading a path leaves `i` with, looking about 20 m ahead so a kink in the data is not a turn. */
function headingFrom(points: LatLngLike[], i: number, forward: boolean): number {
  const origin = points[i]!
  let j = i
  let travelled = 0
  do {
    const k = forward ? j + 1 : j - 1
    if (k < 0 || k >= points.length)
      break
    travelled += haversine(points[j]!.lat, points[j]!.lng, points[k]!.lat, points[k]!.lng)
    j = k
  } while (travelled < 20)
  if (j === i)
    return 0
  return forward
    ? bearing(origin.lat, origin.lng, points[j]!.lat, points[j]!.lng)
    : bearing(points[j]!.lat, points[j]!.lng, origin.lat, origin.lng)
}

/** The time for part or all of an edge, junction delay included where the whole edge is. */
function hopCost(graph: RoadGraph, edge: Edge | undefined, road: OfflineRoad | undefined, length: number): number {
  if (edge && edge.length > 0 && length >= edge.length - 0.01)
    return edge.cost
  const mps = road ? speedFor(graph.profile, road) / 3.6 : 1
  return length / Math.max(mps, 0.1)
}

/**
 * Tidy the steps the way a person would describe the route: a street's name
 * flickering to another for a few metres and back is not two maneuvers, and
 * a jog of a few metres is not worth announcing.
 */
function tidySteps(steps: RouteStep[]): RouteStep[] {
  const straight = (s: RouteStep): boolean => s.maneuver === 'new-name-straight' || s.maneuver === 'continue'
  const absorb = (into: RouteStep, from: RouteStep): void => {
    into.geometry.push(...from.geometry.slice(1))
    into.distance += from.distance
    into.duration += from.duration
  }
  const out: RouteStep[] = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    const prev = out[out.length - 1]
    const next = steps[i + 1]
    // A–B–A: a short stretch under another name, then back.
    if (prev && next && step.distance < 80 && straight(step) && straight(next) && next.name && next.name === prev.name) {
      absorb(prev, step)
      absorb(prev, next)
      i++
      continue
    }
    // A short unnamed stretch — a crossing, a bit of sidewalk — between two
    // steps on the same street.
    if (prev && next && !step.name && step.distance < 60 && next.name && next.name === prev.name) {
      absorb(prev, step)
      absorb(prev, next)
      i++
      continue
    }
    // A few metres, or a short unnamed jog: part of the step before.
    if (prev && (step.distance < 15 ? straight(step) : !step.name && step.distance < 30)) {
      absorb(prev, step)
      continue
    }
    // Carrying on along the same street — or, on foot, crossing it to carry
    // on along the other side.
    if (prev && step.name && step.name === prev.name && !step.maneuver?.startsWith('uturn')) {
      absorb(prev, step)
      continue
    }
    out.push(step)
  }
  return out
}

/** Turn a path through the graph into a route with steps. */
function describe(graph: RoadGraph, found: NonNullable<ReturnType<RoadGraph['search']>>, from: LatLngLike, to: LatLngLike): Route {
  const { nodes, start, end } = found
  const hops: Hop[] = []
  const points: LatLngLike[] = [{ lat: start!.lat, lng: start!.lng }]
  const firstEdge = graph._edge(start!.from, start!.to)
  let prev: LatLngLike = points[0]!
  let prevNode = -1
  for (const id of nodes) {
    const here = { lat: graph.lat[id]!, lng: graph.lng[id]! }
    const edge = prevNode < 0 ? firstEdge : graph._edge(prevNode, id)
    const length = haversine(prev.lat, prev.lng, here.lat, here.lng)
    if (length > 0.01) {
      const road = edge && edge.road >= 0 ? graph.roads[edge.road] : undefined
      hops.push({ from: prev, to: here, length, cost: hopCost(graph, edge, road, length), road, node: id })
      points.push(here)
    }
    else if (hops.length) {
      hops[hops.length - 1]!.node = id
    }
    prev = here
    prevNode = id
  }
  const lastEdge = graph._edge(end!.from, end!.to)
  const endPoint = { lat: end!.lat, lng: end!.lng }
  const tail = haversine(prev.lat, prev.lng, endPoint.lat, endPoint.lng)
  if (tail > 0.01 || !hops.length) {
    const road = lastEdge && lastEdge.road >= 0 ? graph.roads[lastEdge.road] : undefined
    hops.push({ from: prev, to: endPoint, length: tail, cost: hopCost(graph, undefined, road, tail), road })
    points.push(endPoint)
  }
  // Sewn joins have no road; they carry on the road either side.
  for (let i = 0; i < hops.length; i++)
    hops[i]!.road ??= hops[i - 1]?.road ?? hops.find(h => h.road)?.road

  // Break the path wherever the road changes, or bends hard at a junction.
  const steps: RouteStep[] = []
  let stepStart = 0
  let code = 'depart'
  const flush = (endHop: number, nextCode: string): void => {
    const slice = hops.slice(stepStart, endHop)
    const geometry = [slice[0]!.from, ...slice.map(h => h.to)]
    const road = slice.find(h => h.road?.name)?.road ?? slice[0]!.road
    const name = road?.name
    const step: RouteStep = {
      distance: slice.reduce((s, h) => s + h.length, 0),
      duration: slice.reduce((s, h) => s + h.cost, 0),
      instruction: formatInstruction(parseManeuver(code), { name }),
      geometry,
      maneuver: code,
    }
    if (name)
      step.name = name
    steps.push(step)
    stepStart = endHop
    code = nextCode
  }

  let pointIndex = 0
  for (let i = 1; i < hops.length; i++) {
    pointIndex = i
    const before = hops[i - 1]!
    const after = hops[i]!
    const degree = before.node !== undefined ? graph.edges[before.node]!.filter(e => e.road >= 0).length : 2
    const delta = ((headingFrom(points, pointIndex, true) - headingFrom(points, pointIndex, false) + 540) % 360) - 180
    const renamed = roadKey(before.road) !== roadKey(after.road)
    const junction = degree > 2
    let next: string | undefined
    if (after.road?.ramp && !before.road?.ramp)
      next = before.road?.kind === 'motorway' || before.road?.kind === 'trunk' ? `off-ramp-${delta < 0 ? 'left' : 'right'}` : `on-ramp-${delta < 0 ? 'left' : 'right'}`
    else if (before.road?.ramp && !after.road?.ramp && (after.road?.kind === 'motorway' || after.road?.kind === 'trunk'))
      next = `merge-${delta < 0 ? 'left' : 'right'}`
    else if (renamed && (junction || Math.abs(delta) >= 25) && !(before.road?.ramp && after.road?.ramp))
      next = Math.abs(delta) < 25 ? 'new-name-straight' : turnCode(delta)
    else if (junction && Math.abs(delta) >= 50)
      next = turnCode(delta)
    if (next)
      flush(i, next)
  }
  flush(hops.length, 'arrive')
  const tidy = tidySteps(steps)
  steps.length = 0
  steps.push(...tidy)

  // The arrival, as providers give it: a step of no length at the end, and
  // which side of the road the destination is on.
  const lastHop = hops[hops.length - 1]!
  const heading = bearing(lastHop.from.lat, lastHop.from.lng, lastHop.to.lat, lastHop.to.lng)
  const toTarget = bearing(endPoint.lat, endPoint.lng, to.lat, to.lng)
  const side = end!.distance > 5 ? (((toTarget - heading + 540) % 360) - 180 < 0 ? 'arrive-left' : 'arrive-right') : 'arrive'
  steps.push({
    distance: 0,
    duration: 0,
    instruction: formatInstruction(parseManeuver(side)),
    geometry: [endPoint],
    maneuver: side,
  })

  const geometry = [from, ...points, to].filter((p, i, all) => i === 0 || haversine(p.lat, p.lng, all[i - 1]!.lat, all[i - 1]!.lng) > 0.01)
  return {
    distance: hops.reduce((s, h) => s + h.length, 0),
    duration: hops.reduce((s, h) => s + h.cost, 0),
    geometry,
    steps,
  }
}

export interface RouteOptions {
  profile?: TransportProfile
  alternatives?: boolean
}

/**
 * Routes between waypoints over `graph`. With `alternatives`, up to two more
 * routes that differ meaningfully from the best one: found by making the best
 * route's roads dearer and searching again, and kept only if they are not
 * much slower and not mostly the same road.
 */
export function routeOnGraph(graph: RoadGraph, waypoints: LatLngLike[], options: RouteOptions = {}): Route[] {
  if (waypoints.length < 2)
    throw new Error('Directions need at least two waypoints')

  const legs: Route[] = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const found = graph.search(waypoints[i]!, waypoints[i + 1]!)
    if (!found)
      return []
    legs.push(describe(graph, found, waypoints[i]!, waypoints[i + 1]!))
  }
  const best = joinLegs(legs)
  const routes = [best]

  if (options.alternatives && waypoints.length === 2) {
    const penalty = new Map<string, number>()
    const used = (nodes: number[]): Set<string> => {
      const out = new Set<string>()
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1]!
        const b = nodes[i]!
        out.add(a < b ? `${a}-${b}` : `${b}-${a}`)
      }
      return out
    }
    const first = graph.search(waypoints[0]!, waypoints[1]!)!
    const taken = [used(first.nodes)]
    for (const key of taken[0]!)
      penalty.set(key, 1.6)
    for (let attempt = 0; attempt < 3 && routes.length < 3; attempt++) {
      const found = graph.search(waypoints[0]!, waypoints[1]!, penalty)
      if (!found)
        break
      const edges = used(found.nodes)
      for (const key of edges)
        penalty.set(key, (penalty.get(key) ?? 1) * 1.6)
      const overlap = Math.max(...taken.map(t => [...edges].filter(e => t.has(e)).length / Math.max(1, edges.size)))
      const route = describe(graph, found, waypoints[0]!, waypoints[1]!)
      if (overlap < 0.7 && route.duration < best.duration * 1.5) {
        taken.push(edges)
        routes.push(route)
      }
    }
  }
  return routes
}

function joinLegs(legs: Route[]): Route {
  if (legs.length === 1)
    return legs[0]!
  const steps: RouteStep[] = []
  legs.forEach((leg, i) => {
    // A via point is an arrival and a departure; only the last arrival is kept.
    steps.push(...(i < legs.length - 1 ? leg.steps.slice(0, -1) : leg.steps))
  })
  return {
    distance: legs.reduce((s, l) => s + l.distance, 0),
    duration: legs.reduce((s, l) => s + l.duration, 0),
    geometry: legs.flatMap((l, i) => (i ? l.geometry.slice(1) : l.geometry)),
    steps,
    legs,
  }
}
