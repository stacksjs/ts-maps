/**
 * What search and routing need from a downloaded map, read out of its vector
 * tiles: the names of places, and the road network.
 *
 * Works on the OpenMapTiles schema the built-in styles use. Tiles from a
 * source with other layer names can be read by passing `layers`.
 */

import type { OfflineIndex, OfflinePlace, OfflineRoad } from './OfflineStore'
import { VectorTile } from '../mvt/VectorTile'
import { Pbf } from '../proto/Pbf'
import { unitToLat, unitToLng } from './plan'

export interface ExtractLayers {
  place: string
  poi: string
  waterName: string
  transportation: string
  transportationName: string
  park: string
  mountainPeak: string
  aerodrome: string
}

const OPENMAPTILES: ExtractLayers = {
  place: 'place',
  poi: 'poi',
  waterName: 'water_name',
  transportation: 'transportation',
  transportationName: 'transportation_name',
  park: 'park',
  mountainPeak: 'mountain_peak',
  aerodrome: 'aerodrome_label',
}

/** How prominent each kind of place is, when the tile does not say. */
const PLACE_RANK: Record<string, number> = {
  continent: 0,
  country: 1,
  state: 2,
  province: 2,
  city: 3,
  town: 4,
  village: 6,
  suburb: 6,
  quarter: 7,
  neighbourhood: 8,
  hamlet: 8,
  island: 5,
  islet: 8,
  locality: 9,
  isolated_dwelling: 10,
}

/** Classes of transportation feature that are not roads. */
const NOT_ROADS = new Set(['rail', 'transit', 'ferry', 'cable_car', 'aerialway', 'bus_guideway', 'raceway'])

type Pt = [number, number]

function nameOf(props: Record<string, unknown>): string | undefined {
  const name = props['name:latin'] ?? props.name ?? props['name:en'] ?? props.name_en
  return typeof name === 'string' && name.trim() ? name.trim() : undefined
}

/** Clip a polyline to the tile's own square, dropping the buffer beyond it. */
function clipLine(line: Pt[], extent: number): Pt[][] {
  const out: Pt[][] = []
  let current: Pt[] = []
  const inside = (p: Pt): boolean => p[0] >= 0 && p[0] <= extent && p[1] >= 0 && p[1] <= extent

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!
    const b = line[i + 1]!
    // Liang–Barsky against [0, extent]².
    let t0 = 0
    let t1 = 1
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    let visible = true
    for (const [p, q] of [[-dx, a[0]], [dx, extent - a[0]], [-dy, a[1]], [dy, extent - a[1]]] as Array<[number, number]>) {
      if (p === 0) {
        if (q < 0) {
          visible = false
          break
        }
        continue
      }
      const r = q / p
      if (p < 0) {
        if (r > t1) {
          visible = false
          break
        }
        if (r > t0)
          t0 = r
      }
      else {
        if (r < t0) {
          visible = false
          break
        }
        if (r < t1)
          t1 = r
      }
    }
    if (!visible) {
      if (current.length > 1)
        out.push(current)
      current = []
      continue
    }
    const start: Pt = t0 > 0 ? [a[0] + dx * t0, a[1] + dy * t0] : a
    const end: Pt = t1 < 1 ? [a[0] + dx * t1, a[1] + dy * t1] : b
    if (!current.length)
      current.push(start)
    current.push(end)
    if (t1 < 1 || !inside(b)) {
      if (current.length > 1)
        out.push(current)
      current = []
    }
  }
  if (current.length > 1)
    out.push(current)
  return out
}

function distToSegmentSq(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = dx * dx + dy * dy
  let t = len ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len : 0
  t = Math.max(0, Math.min(1, t))
  const x = a[0] + dx * t - p[0]
  const y = a[1] + dy * t - p[1]
  return x * x + y * y
}

/**
 * Read one tile. `x`, `y`, `z` are the tile's own coordinates, which place its
 * features on the globe.
 */
export function extractTile(bytes: Uint8Array, x: number, y: number, z: number, layers: Partial<ExtractLayers> = {}): OfflineIndex {
  const names = { ...OPENMAPTILES, ...layers }
  const places: OfflinePlace[] = []
  const roads: OfflineRoad[] = []
  if (!bytes.length)
    return { places, roads }

  let tile: VectorTile
  try {
    tile = new VectorTile(new Pbf(bytes))
  }
  catch {
    return { places, roads }
  }
  const n = 2 ** z

  const toLatLng = (p: Pt, extent: number): [number, number] => [
    unitToLat((y + p[1] / extent) / n),
    unitToLng((x + p[0] / extent) / n),
  ]

  const eachFeature = (layerName: string, fn: (props: Record<string, unknown>, geometry: Pt[][], type: number, extent: number) => void): void => {
    const layer = tile.layers[layerName]
    if (!layer)
      return
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i)
      const geometry = feature.loadGeometry().map(line => line.map(p => [p.x, p.y] as Pt))
      fn(feature.properties as Record<string, unknown>, geometry, feature.type, layer.extent)
    }
  }

  /** A point for a feature: itself, the middle of a line, or a polygon's centroid. */
  const anchor = (geometry: Pt[][], type: number, extent: number): Pt | undefined => {
    const ring = geometry[0]
    if (!ring?.length)
      return undefined
    let p: Pt
    if (type === 1) {
      p = ring[0]!
    }
    else if (type === 2) {
      // Halfway along, by length.
      let total = 0
      for (let i = 1; i < ring.length; i++)
        total += Math.hypot(ring[i]![0] - ring[i - 1]![0], ring[i]![1] - ring[i - 1]![1])
      let left = total / 2
      p = ring[0]!
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]!
        const b = ring[i]!
        const d = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (d >= left) {
          const t = d ? left / d : 0
          p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
          break
        }
        left -= d
      }
    }
    else {
      let sx = 0
      let sy = 0
      for (const q of ring) {
        sx += q[0]
        sy += q[1]
      }
      p = [sx / ring.length, sy / ring.length]
    }
    // Points in the buffer belong to the neighbouring tile.
    return p[0] >= 0 && p[0] < extent && p[1] >= 0 && p[1] < extent ? p : undefined
  }

  const addPlace = (props: Record<string, unknown>, geometry: Pt[][], type: number, extent: number, kind: string, rank: number): void => {
    const name = nameOf(props)
    const p = anchor(geometry, type, extent)
    if (!name || !p)
      return
    const [lat, lng] = toLatLng(p, extent)
    places.push({ name, lat, lng, kind, rank })
  }

  eachFeature(names.place, (props, g, type, extent) => {
    const kind = String(props.class ?? 'place')
    const rank = typeof props.rank === 'number' ? props.rank : PLACE_RANK[kind] ?? 9
    addPlace(props, g, type, extent, kind, Math.min(rank, PLACE_RANK[kind] ?? rank))
  })
  eachFeature(names.poi, (props, g, type, extent) => {
    const kind = String(props.subclass ?? props.class ?? 'poi')
    addPlace(props, g, type, extent, kind, 12 + (typeof props.rank === 'number' ? Math.min(props.rank, 60) / 10 : 3))
  })
  eachFeature(names.waterName, (props, g, type, extent) => addPlace(props, g, type, extent, String(props.class ?? 'water'), 10))
  eachFeature(names.park, (props, g, type, extent) => addPlace(props, g, type, extent, 'park', 11))
  eachFeature(names.mountainPeak, (props, g, type, extent) => addPlace(props, g, type, extent, 'peak', 11))
  eachFeature(names.aerodrome, (props, g, type, extent) => addPlace(props, g, type, extent, 'airport', 9))

  // Street names are drawn from their own layer, whose lines are merged for
  // labelling and do not match the road lines one for one. Each road takes
  // the name of the named line lying along it.
  const named: Array<{ name: string, kind: string, line: Pt[] }> = []
  eachFeature(names.transportationName, (props, g, type, extent) => {
    const name = nameOf(props) ?? (typeof props.ref === 'string' ? props.ref : undefined)
    if (!name)
      return
    for (const line of g)
      named.push({ name, kind: String(props.class ?? ''), line })
    // One entry per street per tile, for search.
    if (type === 2)
      addPlace({ name }, g, type, extent, 'street', 13)
  })

  // Named segments bucketed on a coarse grid, so each road looks only at the
  // names near it rather than every name in the tile.
  const CELL = 128
  const buckets = new Map<number, Array<{ name: string, kind: string, a: Pt, b: Pt }>>()
  const cellKey = (cx: number, cy: number): number => (cx + 64) * 4096 + (cy + 64)
  for (const candidate of named) {
    for (let i = 0; i < candidate.line.length - 1; i++) {
      const a = candidate.line[i]!
      const b = candidate.line[i + 1]!
      const segment = { name: candidate.name, kind: candidate.kind, a, b }
      for (let cx = Math.floor(Math.min(a[0], b[0]) / CELL); cx <= Math.floor(Math.max(a[0], b[0]) / CELL); cx++) {
        for (let cy = Math.floor(Math.min(a[1], b[1]) / CELL); cy <= Math.floor(Math.max(a[1], b[1]) / CELL); cy++) {
          const key = cellKey(cx, cy)
          const list = buckets.get(key)
          if (list)
            list.push(segment)
          else
            buckets.set(key, [segment])
        }
      }
    }
  }

  /** The name of the street segment `a`–`b` lies along, probed at its middle. */
  const nameFor = (a: Pt, b: Pt, kind: string, extent: number): string | undefined => {
    // A sidewalk mapped on its own runs a few metres from its street, and
    // takes its name: walking directions say "onto Market Street" too.
    const sidewalk = kind === 'path'
    const tolerance = (extent / 4096) * (sidewalk ? 40 : 24)
    const probe: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const dir = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    let best: string | undefined
    let bestD = tolerance * tolerance
    const cx = Math.floor(probe[0] / CELL)
    const cy = Math.floor(probe[1] / CELL)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const segment of buckets.get(cellKey(cx + dx, cy + dy)) ?? []) {
          if (!sidewalk && segment.kind && kind && segment.kind !== kind && !kind.startsWith(segment.kind))
            continue
          // Running alongside, not across: at a junction the cross street's
          // name is just as near.
          const sx = segment.b[0] - segment.a[0]
          const sy = segment.b[1] - segment.a[1]
          const cos = Math.abs(((b[0] - a[0]) * sx + (b[1] - a[1]) * sy) / (dir * (Math.hypot(sx, sy) || 1)))
          if (cos < 0.8)
            continue
          const d = distToSegmentSq(probe, segment.a, segment.b)
          if (d < bestD) {
            bestD = d
            best = segment.name
          }
        }
      }
    }
    return best
  }

  eachFeature(names.transportation, (props, g, type, extent) => {
    const kind = String(props.class ?? 'minor')
    if (type !== 2 || NOT_ROADS.has(kind) || kind.endsWith('_construction'))
      return
    const oneway = props.oneway === 1 || props.oneway === '1' || props.oneway === true
      ? 1
      : props.oneway === -1 || props.oneway === '-1' ? -1 : 0
    const ramp = props.ramp === 1 || props.ramp === true
    const level = typeof props.layer === 'number' && props.layer !== 0
      ? props.layer
      : props.brunnel === 'bridge' ? 1 : props.brunnel === 'tunnel' ? -1 : 0
    for (const line of g) {
      for (const piece of clipLine(line, extent)) {
        // Lines are merged by class when tiles are made, not by name, so one
        // line can run along several streets. Split it where the name
        // changes; a stretch with no name found between two with the same
        // one is taken to be that street too.
        const names = piece.slice(1).map((p, i) => nameFor(piece[i]!, p, kind, extent))
        for (let i = 1; i < names.length - 1; i++) {
          if (names[i] === undefined && names[i - 1] !== undefined && names[i - 1] === names.slice(i + 1).find(n => n !== undefined))
            names[i] = names[i - 1]
        }
        let start = 0
        for (let i = 1; i <= names.length; i++) {
          if (i < names.length && names[i] === names[start])
            continue
          const coords: number[] = []
          for (const p of piece.slice(start, i + 1)) {
            const [lat, lng] = toLatLng(p, extent)
            coords.push(lat, lng)
          }
          const road: OfflineRoad = { coords, kind: kind === 'path' && props.subclass ? `path:${props.subclass}` : kind, oneway }
          if (ramp)
            road.ramp = true
          if (level)
            road.level = level
          if (names[start])
            road.name = names[start]
          roads.push(road)
          start = i
        }
      }
    }
  })

  return { places, roads }
}

/**
 * Fold many tiles' places into one list: a street crossing twenty tiles is
 * one result, not twenty.
 */
export function mergePlaces(places: OfflinePlace[]): OfflinePlace[] {
  const out: OfflinePlace[] = []
  const byName = new Map<string, OfflinePlace[]>()
  for (const place of places) {
    const key = `${place.kind === 'street' ? 'street' : 'place'}|${place.name.toLowerCase()}`
    const same = byName.get(key) ?? []
    // Within about 1.5 km: the same street, or the same place labelled twice.
    const near = same.find(p => Math.abs(p.lat - place.lat) < 0.014 && Math.abs(p.lng - place.lng) < 0.018)
    if (near) {
      near.rank = Math.min(near.rank, place.rank)
      continue
    }
    same.push(place)
    byName.set(key, same)
    out.push(place)
  }
  return out
}
