import type { MeshWriter, Vec3 } from './BuildingOverlay'
import { earcut } from '../../geometry/earcut'

/**
 * Pitched roofs, where a building's tile says what shape its roof is.
 *
 * OpenStreetMap tags `roof:shape` (gabled, hipped, pyramidal…) and
 * `roof:height`; Overture's buildings carry them as `roof_shape` and
 * `roof_height`. OpenMapTiles leaves them out, so most basemaps stay flat,
 * but a source that keeps them gets the roofs Apple draws.
 *
 * A roof is the lowest of a few planes over the footprint, set out on the
 * footprint's own rectangle: a gable is two planes meeting at a ridge along
 * the long side, a hip four, a pyramid four meeting at a point. Each plane
 * covers the part of the footprint where it is the lowest (always a convex
 * cut of it), so the roof is those pieces triangulated, and the walls rise
 * to meet it, gable ends included.
 */

export type RoofShape = 'flat' | 'gabled' | 'hipped' | 'pyramidal' | 'skillion'

export interface Roof {
  shape: RoofShape
  /** Metres from eave to ridge. Unset: a 30° pitch. */
  height?: number
  /** Degrees from north the roof slopes down towards, for a skillion. */
  direction?: number
  /** `across` puts a gable's ridge along the short side. */
  orientation?: 'along' | 'across'
}

/** OpenStreetMap's and Overture's shapes, as the few drawn. */
const SHAPES: Record<string, RoofShape> = {
  flat: 'flat',
  gabled: 'gabled',
  gambrel: 'gabled',
  saltbox: 'gabled',
  round: 'gabled',
  sawtooth: 'gabled',
  hipped: 'hipped',
  half_hipped: 'hipped',
  'half-hipped': 'hipped',
  side_hipped: 'hipped',
  mansard: 'hipped',
  pyramidal: 'pyramidal',
  dome: 'pyramidal',
  onion: 'pyramidal',
  cone: 'pyramidal',
  skillion: 'skillion',
  lean_to: 'skillion',
}

const LEVEL_HEIGHT = 3

/** A building's roof from its tile properties, or undefined for a flat one. */
export function roofOf(properties: Record<string, unknown> | undefined): Roof | undefined {
  if (!properties)
    return undefined
  const get = (...keys: string[]): unknown => keys.map(k => properties[k]).find(v => v !== undefined && v !== null && v !== '')
  const shape = SHAPES[String(get('roof:shape', 'roof_shape') ?? '').toLowerCase()]
  if (!shape || shape === 'flat')
    return undefined
  const roof: Roof = { shape }
  const height = Number.parseFloat(String(get('roof:height', 'roof_height') ?? ''))
  const levels = Number.parseFloat(String(get('roof:levels', 'roof_levels') ?? ''))
  if (height > 0)
    roof.height = height
  else if (levels > 0)
    roof.height = levels * LEVEL_HEIGHT
  const direction = Number.parseFloat(String(get('roof:direction', 'roof_direction') ?? ''))
  if (Number.isFinite(direction))
    roof.direction = direction
  if (get('roof:orientation', 'roof_orientation') === 'across')
    roof.orientation = 'across'
  return roof
}

/** h = c + ka·a + kb·b, in the footprint rectangle's coordinates. */
interface Plane { c: number, ka: number, kb: number }

export interface RoofSurface {
  /** The rectangle: its centre, long axis and half sizes, in pixels. */
  center: [number, number]
  axis: [number, number]
  planes: Plane[]
  /** Height of the roof at a point in pixels: the lowest plane there. */
  at: (x: number, y: number) => number
}

type Pt = { x: number, y: number }

/**
 * The smallest rectangle around a ring, as Apple's roofs are set out: the
 * ridge of a gable runs along its long side.
 */
export function footprintRectangle(ring: Pt[]): { center: [number, number], axis: [number, number], halfLength: number, halfWidth: number } {
  let best = { area: Infinity, center: [0, 0] as [number, number], axis: [1, 0] as [number, number], halfLength: 0, halfWidth: 0 }
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    const length = Math.hypot(q.x - p.x, q.y - p.y)
    if (!length)
      continue
    const ux = (q.x - p.x) / length
    const uy = (q.y - p.y) / length
    let a0 = Infinity
    let a1 = -Infinity
    let b0 = Infinity
    let b1 = -Infinity
    for (const r of ring) {
      const a = r.x * ux + r.y * uy
      const b = -r.x * uy + r.y * ux
      a0 = Math.min(a0, a)
      a1 = Math.max(a1, a)
      b0 = Math.min(b0, b)
      b1 = Math.max(b1, b)
    }
    const area = (a1 - a0) * (b1 - b0)
    if (area < best.area - 1e-9) {
      const ca = (a0 + a1) / 2
      const cb = (b0 + b1) / 2
      const center: [number, number] = [ca * ux - cb * uy, ca * uy + cb * ux]
      const long = a1 - a0 >= b1 - b0
      best = {
        area,
        center,
        axis: long ? [ux, uy] : [-uy, ux],
        halfLength: (long ? a1 - a0 : b1 - b0) / 2,
        halfWidth: (long ? b1 - b0 : a1 - a0) / 2,
      }
    }
  }
  return { center: best.center, axis: best.axis, halfLength: best.halfLength, halfWidth: best.halfWidth }
}

/** The surface of a roof over `ring`: its eave at `eave` metres, its ridge `rise` above. */
export function roofSurface(ring: Pt[], roof: Roof, eave: number, rise: number): RoofSurface | undefined {
  const rect = footprintRectangle(ring)
  let { axis, halfLength: L, halfWidth: W } = rect
  if (roof.orientation === 'across' && roof.shape === 'gabled') {
    axis = [-axis[1], axis[0]]
    const long = L
    L = W
    W = long
  }
  if (!(W > 0) || !(rise > 0))
    return undefined
  const R = rise
  let planes: Plane[]
  switch (roof.shape) {
    case 'gabled':
      planes = [{ c: eave + R, ka: 0, kb: -R / W }, { c: eave + R, ka: 0, kb: R / W }]
      break
    case 'hipped':
      // Every slope at the same pitch: the ends rise over the width too.
      planes = [
        { c: eave + R, ka: 0, kb: -R / W },
        { c: eave + R, ka: 0, kb: R / W },
        { c: eave + (R * L) / W, ka: -R / W, kb: 0 },
        { c: eave + (R * L) / W, ka: R / W, kb: 0 },
      ]
      break
    case 'pyramidal':
      planes = [
        { c: eave + R, ka: 0, kb: -R / W },
        { c: eave + R, ka: 0, kb: R / W },
        { c: eave + R, ka: -R / L, kb: 0 },
        { c: eave + R, ka: R / L, kb: 0 },
      ]
      break
    case 'skillion': {
      // Down towards `direction`, else across the short side.
      let da = 0
      let db = 1
      let half = W
      if (roof.direction !== undefined) {
        const d = (roof.direction * Math.PI) / 180
        // Pixels run east and south.
        const dx = Math.sin(d)
        const dy = -Math.cos(d)
        da = dx * axis[0] + dy * axis[1]
        db = -dx * axis[1] + dy * axis[0]
        half = Math.abs(da) * L + Math.abs(db) * W
      }
      planes = [{ c: eave + R / 2, ka: (-R / (2 * half)) * da, kb: (-R / (2 * half)) * db }]
      break
    }
    default:
      return undefined
  }
  const [cx, cy] = rect.center
  const [ux, uy] = axis
  const at = (x: number, y: number): number => {
    const a = (x - cx) * ux + (y - cy) * uy
    const b = -(x - cx) * uy + (y - cy) * ux
    let h = Infinity
    for (const p of planes)
      h = Math.min(h, p.c + p.ka * a + p.kb * b)
    return h
  }
  return { center: rect.center, axis, planes, at }
}

/** The default rise for a shape over a footprint: a 30° pitch, at most half the building. */
export function defaultRise(ring: Pt[], roof: Roof, mpp: number, room: number): number {
  const { halfLength, halfWidth } = footprintRectangle(ring)
  const run = (roof.shape === 'skillion' ? halfWidth * 2 : roof.orientation === 'across' && roof.shape === 'gabled' ? halfLength : halfWidth) * mpp
  return Math.min(run * Math.tan(Math.PI / 6), room / 2)
}

/** The part of `ring` where a + b·x + c·y ≤ 0: Sutherland–Hodgman against one line. */
function clip(ring: Pt[], k: [number, number, number]): Pt[] {
  const f = (p: Pt): number => k[0] + k[1] * p.x + k[2] * p.y
  const out: Pt[] = []
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    const fp = f(p)
    const fq = f(q)
    if (fp <= 1e-9)
      out.push(p)
    if ((fp < -1e-9 && fq > 1e-9) || (fp > 1e-9 && fq < -1e-9)) {
      const t = fp / (fp - fq)
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
    }
  }
  return out
}

/**
 * Write a building with a pitched roof: the roof, then walls up to it.
 * Returns false where the roof cannot be set out, for a flat one instead.
 */
export function writePitchedBuilding(out: MeshWriter, ring: Pt[], roof: Roof, top: number, base: number, mpp: number): boolean {
  if (ring.length > 1 && ring[0]!.x === ring.at(-1)!.x && ring[0]!.y === ring.at(-1)!.y)
    ring = ring.slice(0, -1)
  if (ring.length < 3)
    return false
  const room = top - base
  const rise = Math.min(roof.height ?? defaultRise(ring, roof, mpp, room), room)
  const eave = top - rise
  const surface = roofSurface(ring, roof, eave, rise)
  if (!surface)
    return false
  const { planes, center: [cx, cy], axis: [ux, uy] } = surface
  // A plane, and the lines between planes, in pixel coordinates.
  const inPixels = (p: Plane): [number, number, number] => {
    // a = (x-cx)ux + (y-cy)uy, b = -(x-cx)uy + (y-cy)ux
    const kx = p.ka * ux - p.kb * uy
    const ky = p.ka * uy + p.kb * ux
    return [p.c - kx * cx - ky * cy, kx, ky]
  }
  const pixelPlanes = planes.map(inPixels)

  // --- Roof: each plane over where it is the lowest. ---
  for (let i = 0; i < pixelPlanes.length; i++) {
    let piece = ring
    for (let j = 0; j < pixelPlanes.length && piece.length >= 3; j++) {
      if (j === i)
        continue
      const pi = pixelPlanes[i]!
      const pj = pixelPlanes[j]!
      // Plane i no higher than plane j.
      piece = clip(piece, [pi[0] - pj[0], pi[1] - pj[1], pi[2] - pj[2]])
    }
    if (piece.length < 3)
      continue
    const flat: number[] = []
    for (const p of piece)
      flat.push(p.x, p.y)
    const indices = earcut(flat, [], 2)
    const [c, kx, ky] = pixelPlanes[i]!
    const corner = (n: number): Vec3 => [flat[n * 2]!, flat[n * 2 + 1]!, c + kx * flat[n * 2]! + ky * flat[n * 2 + 1]!]
    for (let t = 0; t < indices.length; t += 3)
      out.face(corner(indices[t]!), corner(indices[t + 1]!), corner(indices[t + 2]!), mpp, true)
  }

  // --- Walls, up to the roof: a corner wherever an edge crosses a crease. ---
  const flip = ringSign(ring) < 0 ? -127 : 127
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    const dx = q.x - p.x
    const dy = q.y - p.y
    const length = Math.hypot(dx, dy)
    if (!length)
      continue
    const stops = [0, 1]
    for (let a = 0; a < pixelPlanes.length; a++) {
      for (let b = a + 1; b < pixelPlanes.length; b++) {
        const pa = pixelPlanes[a]!
        const pb = pixelPlanes[b]!
        const at = (t: number): number => (pa[0] - pb[0]) + (pa[1] - pb[1]) * (p.x + dx * t) + (pa[2] - pb[2]) * (p.y + dy * t)
        const f0 = at(0)
        const f1 = at(1)
        if (f0 * f1 < 0)
          stops.push(f0 / (f0 - f1))
      }
    }
    stops.sort((a, b) => a - b)
    const nx = Math.round((dy / length) * flip)
    const ny = Math.round((-dx / length) * flip)
    for (let s = 0; s + 1 < stops.length; s++) {
      const x0 = p.x + dx * stops[s]!
      const y0 = p.y + dy * stops[s]!
      const x1 = p.x + dx * stops[s + 1]!
      const y1 = p.y + dy * stops[s + 1]!
      if (x0 === x1 && y0 === y1)
        continue
      const h0 = surface.at(x0, y0)
      const h1 = surface.at(x1, y1)
      out.vertex(x0, y0, base, nx, ny, 0)
      out.vertex(x1, y1, base, nx, ny, 0)
      out.vertex(x1, y1, h1, nx, ny, 255)
      out.vertex(x0, y0, base, nx, ny, 0)
      out.vertex(x1, y1, h1, nx, ny, 255)
      out.vertex(x0, y0, h0, nx, ny, 255)
    }
  }
  return true
}

function ringSign(ring: Pt[]): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y
  return Math.sign(sum)
}
