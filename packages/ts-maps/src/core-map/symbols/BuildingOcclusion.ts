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
