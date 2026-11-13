/**
 * Which labels a 3D building stands in front of.
 *
 * Apple Maps hides a street name when the street is behind a tower, rather
 * than painting it across the tower's face. The test here is the one the eye
 * makes: follow the line of sight from the label's spot on the ground back to
 * the camera, and see whether it passes through a building on the way — below
 * its roof and above its base.
 *
 * It runs on the CPU, against the same footprints the building renderer
 * meshes, so there is nothing to read back from the GPU. Each source tile's
 * buildings are bucketed into a coarse grid, and a sight line only visits the
 * cells it crosses, and only as far as the tallest building in the tile could
 * still reach it.
 */

export interface Occluder {
  /** Outer ring, flat [x0, y0, x1, y1, …], in the source tile's pixels. */
  ring: Float64Array
  minX: number
  minY: number
  maxX: number
  maxY: number
  /** Metres. */
  top: number
  base: number
  /** Courtyards, as `ring` is. Seen through when picking; not by labels. */
  holes?: Float64Array[]
  /** The style layer that drew it, and the feature's place in its tile layer. */
  layer?: string
  feature?: number
  id?: number | string
}

/** A prism a sight line passes through, and how far along it. */
export interface PrismHit {
  /** Index into the tile's `buildings`. */
  index: number
  /**
   * Where the line leaves the prism on its way up to the camera, as a
   * fraction of its length from the ground: the larger, the nearer the eye.
   */
  t: number
}

const CELL = 64
/** Cells of margin around the tile, for buildings in its buffer. */
const MARGIN = 2

/** A source tile's buildings, bucketed for sight-line queries. */
export class OccluderIndex {
  buildings: Occluder[]
  cells: number[][]
  cols: number
  maxTop: number
  size: number
  /** Per building, the query that last looked at it — cheaper than a set. */
  stamps: Uint32Array
  query = 0

  constructor(buildings: Occluder[], size: number) {
    this.buildings = buildings
    this.size = size
    this.cols = Math.ceil(size / CELL) + MARGIN * 2
    this.cells = Array.from({ length: this.cols * this.cols }, () => [])
    this.maxTop = 0
    this.stamps = new Uint32Array(buildings.length)
    buildings.forEach((b, i) => {
      this.maxTop = Math.max(this.maxTop, b.top)
      const x0 = this._cell(b.minX)
      const x1 = this._cell(b.maxX)
      const y0 = this._cell(b.minY)
      const y1 = this._cell(b.maxY)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++)
          this.cells[y * this.cols + x]!.push(i)
      }
    })
  }

  _cell(v: number): number {
    return Math.max(0, Math.min(this.cols - 1, Math.floor(v / CELL) + MARGIN))
  }

  /**
   * Does the sight line from (ax, ay) on the ground to (bx, by) at height
   * `rise` pass through a building? Everything in this tile's pixels, with
   * heights converted by `pxPerMetre`.
   */
  blocks(ax: number, ay: number, bx: number, by: number, rise: number, pxPerMetre: number): boolean {
    if (!this.buildings.length || rise <= 0)
      return false

    // Beyond the point where the line has climbed past the tallest roof here,
    // nothing in this tile can be in the way.
    const reach = Math.min(1, (this.maxTop * pxPerMetre) / rise)
    const ex = ax + (bx - ax) * reach
    const ey = ay + (by - ay) * reach
    const lo = -MARGIN * CELL
    const hi = this.size + MARGIN * CELL
    if (Math.max(ax, ex) < lo || Math.min(ax, ex) > hi || Math.max(ay, ey) < lo || Math.min(ay, ey) > hi)
      return false

    const length = Math.hypot(ex - ax, ey - ay)
    const steps = Math.max(1, Math.ceil(length / (CELL / 2)))
    const stamp = ++this.query
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((ex - ax) * s) / steps
      const y = ay + ((ey - ay) * s) / steps
      if (x < lo || x > hi || y < lo || y > hi)
        continue
      for (const i of this.cells[this._cell(y) * this.cols + this._cell(x)]!) {
        if (this.stamps[i] === stamp)
          continue
        this.stamps[i] = stamp
        const b = this.buildings[i]!
        if (Math.max(ax, ex) < b.minX || Math.min(ax, ex) > b.maxX || Math.max(ay, ey) < b.minY || Math.min(ay, ey) > b.maxY)
          continue
        const entry = segmentEntry(b.ring, ax, ay, bx, by)
        // A label on the building itself — its name, say — is not hidden by
        // it.
        if (entry === null || entry <= 0)
          continue
        const height = entry * rise
        if (height < b.top * pxPerMetre && height >= b.base * pxPerMetre)
          return true
      }
    }
    return false
  }

  /**
   * Every prism the sight line passes through, from (ax, ay) on the ground up
   * to (bx, by) at height `rise` — the line of a pointer on screen, which is
   * how a prism is picked by the face it shows rather than by the ground
   * under the cursor. Units as `blocks`.
   *
   * Unordered. A caller wanting what the pointer is on takes the largest `t`:
   * the prism the line is last inside before it reaches the eye.
   */
  pick(ax: number, ay: number, bx: number, by: number, rise: number, pxPerMetre: number): PrismHit[] {
    const hits: PrismHit[] = []
    if (!this.buildings.length || rise <= 0)
      return hits

    // Past the height of the tallest roof here the line is over everything.
    const reach = Math.min(1, (this.maxTop * pxPerMetre) / rise)
    const ex = ax + (bx - ax) * reach
    const ey = ay + (by - ay) * reach
    const lo = -MARGIN * CELL
    const hi = this.size + MARGIN * CELL
    const minX = Math.min(ax, ex)
    const maxX = Math.max(ax, ex)
    const minY = Math.min(ay, ey)
    const maxY = Math.max(ay, ey)
    if (maxX < lo || minX > hi || maxY < lo || minY > hi)
      return hits

    // Every cell the line's box covers, less those the line itself misses.
    // Sampling along it, as `blocks` does, can step over the corner of a
    // cell — harmless for a label, which is tested again next frame, but a
    // pick is asked once.
    const stamp = ++this.query
    const x0 = this._cell(minX)
    const x1 = this._cell(maxX)
    const y0 = this._cell(minY)
    const y1 = this._cell(maxY)
    const last = this.cols - 1
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        // An edge cell stands for everything beyond it too.
        const edge = cx === 0 || cy === 0 || cx === last || cy === last
        if (!edge && !segmentTouchesBox(ax, ay, ex, ey, (cx - MARGIN) * CELL, (cy - MARGIN) * CELL, (cx - MARGIN + 1) * CELL, (cy - MARGIN + 1) * CELL))
          continue
        for (const i of this.cells[cy * this.cols + cx]!) {
          if (this.stamps[i] === stamp)
            continue
          this.stamps[i] = stamp
          const b = this.buildings[i]!
          if (maxX < b.minX || minX > b.maxX || maxY < b.minY || minY > b.maxY)
            continue
          const t = prismExit(b, ax, ay, bx, by, (b.base * pxPerMetre) / rise, (b.top * pxPerMetre) / rise)
          if (t !== null)
            hits.push({ index: i, t })
        }
      }
    }
    return hits
  }
}

/** Whether the segment a–b touches the axis-aligned box. */
function segmentTouchesBox(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): boolean {
  // Liang–Barsky: clip the segment's parameter against each side in turn.
  let from = 0
  let to = 1
  const dx = bx - ax
  const dy = by - ay
  const sides: Array<[number, number]> = [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0)
        return false
      continue
    }
    const r = q / p
    if (p < 0)
      from = Math.max(from, r)
    else
      to = Math.min(to, r)
    if (from > to)
      return false
  }
  return true
}

/**
 * Where the sight line from a (on the ground) to b (the eye) is last inside
 * the prism, as a fraction of its length, or null if it never is.
 *
 * The line is inside the footprint over some stretches of its length —
 * between crossings of the outer ring and of any courtyard — and at the
 * prism's height over one: between `low` and `high`, the fractions at which
 * it has climbed to the base and to the roof. Where a stretch of each
 * overlap, the line is in the prism; the top of the overlap is where it
 * comes out, through a wall or through the roof.
 */
function prismExit(b: Occluder, ax: number, ay: number, bx: number, by: number, low: number, high: number): number | null {
  const crossings: number[] = []
  let inside = false
  const dx = bx - ax
  const dy = by - ay
  const each = (ring: Float64Array): void => {
    const n = ring.length / 2
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const px = ring[j * 2]!
      const py = ring[j * 2 + 1]!
      const qx = ring[i * 2]!
      const qy = ring[i * 2 + 1]!
      // Even–odd over every ring: inside the outline and in no courtyard.
      if ((qy > ay) !== (py > ay) && ax < ((px - qx) * (ay - qy)) / (py - qy) + qx)
        inside = !inside
      const ex = qx - px
      const ey = qy - py
      const denom = dx * ey - dy * ex
      if (denom === 0)
        continue
      const t = ((px - ax) * ey - (py - ay) * ex) / denom
      const u = ((px - ax) * dy - (py - ay) * dx) / denom
      // Half-open along the edge, so a crossing at a shared corner counts once.
      if (t > 0 && t <= 1 && u >= 0 && u < 1)
        crossings.push(t)
    }
  }
  each(b.ring)
  for (const hole of b.holes ?? [])
    each(hole)
  crossings.sort((m, n) => m - n)

  let exit: number | null = null
  const stretch = (from: number, to: number): void => {
    const top = Math.min(to, high)
    if (Math.max(from, low) <= top && (exit === null || top > exit))
      exit = top
  }
  let entered: number | null = inside ? 0 : null
  for (const t of crossings) {
    if (entered === null) {
      entered = t
    }
    else {
      stretch(entered, t)
      entered = null
    }
  }
  if (entered !== null)
    stretch(entered, 1)
  return exit
}

/**
 * Where the segment from a to b first enters the polygon, as a fraction of
 * its length: 0 if a is inside, null if it never enters.
 */
export function segmentEntry(ring: Float64Array, ax: number, ay: number, bx: number, by: number): number | null {
  const n = ring.length / 2
  if (n < 3)
    return null
  let inside = false
  let first = Infinity
  const dx = bx - ax
  const dy = by - ay
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const px = ring[j * 2]!
    const py = ring[j * 2 + 1]!
    const qx = ring[i * 2]!
    const qy = ring[i * 2 + 1]!
    // Point in polygon, for a itself.
    if ((qy > ay) !== (py > ay) && ax < ((px - qx) * (ay - qy)) / (py - qy) + qx)
      inside = !inside
    // Segment against this edge.
    const ex = qx - px
    const ey = qy - py
    const denom = dx * ey - dy * ex
    if (denom === 0)
      continue
    const t = ((px - ax) * ey - (py - ay) * ex) / denom
    const u = ((px - ax) * dy - (py - ay) * dx) / denom
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < first)
      first = t
  }
  if (inside)
    return 0
  return Number.isFinite(first) ? first : null
}

export interface OcclusionSource {
  index: OccluderIndex
  /** Tile pixels to layer pixels: layer = tile·scale + origin. */
  scale: number
  origin: [number, number]
  /** Pixels per metre, at the map's zoom and this tile's latitude. */
  pxPerMetre: number
}

/**
 * Whether a point on the ground, in layer pixels, is hidden from a camera
 * standing at `camera` (ground position, layer pixels) and `rise` pixels up.
 */
export function occluded(sources: OcclusionSource[], point: { x: number, y: number }, camera: { x: number, y: number }, rise: number): boolean {
  for (const source of sources) {
    const toTile = (p: { x: number, y: number }): [number, number] => [(p.x - source.origin[0]) / source.scale, (p.y - source.origin[1]) / source.scale]
    const [ax, ay] = toTile(point)
    const [bx, by] = toTile(camera)
    // Heights in tile pixels, which run `scale` times smaller than layer ones.
    if (source.index.blocks(ax, ay, bx, by, rise / source.scale, source.pxPerMetre / source.scale))
      return true
  }
  return false
}
