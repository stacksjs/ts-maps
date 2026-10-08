/**
 * Where a polygon's label goes: its pole of inaccessibility, the point inside
 * it furthest from any edge — Mapbox's choice, and its algorithm (polylabel).
 * A centroid can fall outside an L-shaped room or a horseshoe of a building;
 * this never does, and sits where the name has the most room.
 */

interface XY {
  x: number
  y: number
}

/** Signed area, positive for a clockwise ring in y-down tile space. */
function area(ring: XY[]): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += (ring[j].x - ring[i].x) * (ring[i].y + ring[j].y)
  return sum / 2
}

/** Distance from a point to a polygon's edges: negative outside. */
function signedDistance(x: number, y: number, polygon: XY[][]): number {
  let inside = false
  let best = Infinity
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]
      const b = ring[j]
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
        inside = !inside
      best = Math.min(best, segmentDistance(x, y, a, b))
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(best)
}

function segmentDistance(px: number, py: number, a: XY, b: XY): number {
  let x = a.x
  let y = a.y
  let dx = b.x - x
  let dy = b.y - y
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy)
    if (t > 1) {
      x = b.x
      y = b.y
    }
    else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }
  dx = px - x
  dy = py - y
  return dx * dx + dy * dy
}

interface Cell {
  x: number
  y: number
  h: number
  d: number
  max: number
}

function cell(x: number, y: number, h: number, polygon: XY[][]): Cell {
  const d = signedDistance(x, y, polygon)
  return { x, y, h, d, max: d + h * Math.SQRT2 }
}

/** The pole of inaccessibility of one polygon (outer ring, then holes), to within `precision`. */
export function poleOfInaccessibility(polygon: XY[][], precision: number = 1): XY {
  const outer = polygon[0]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of outer) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const width = maxX - minX
  const height = maxY - minY
  const size = Math.min(width, height)
  if (size === 0)
    return { x: minX, y: minY }

  // Cells over the bounding box, finest-promising first. A sorted array
  // stands in for a priority queue: polygons here have tens of vertices.
  const queue: Cell[] = []
  const h = size / 2
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size)
      queue.push(cell(x + h, y + h, h, polygon))
  }

  let best = cell(minX + width / 2, minY + height / 2, 0, polygon)
  for (let i = 0; i < 500 && queue.length; i++) {
    queue.sort((a, b) => a.max - b.max)
    const c = queue.pop()!
    if (c.d > best.d)
      best = c
    if (c.max - best.d <= precision)
      continue
    const half = c.h / 2
    queue.push(cell(c.x - half, c.y - half, half, polygon), cell(c.x + half, c.y - half, half, polygon), cell(c.x - half, c.y + half, half, polygon), cell(c.x + half, c.y + half, half, polygon))
  }
  return { x: best.x, y: best.y }
}

/**
 * One label point per polygon in a tile feature's rings: each outer ring with
 * the holes that follow it, as vector tiles lay them out. Each comes with its
 * polygon's area, so of the pieces a tile edge cuts a polygon into, the
 * biggest can carry the name.
 */
export function polygonLabelPoints(rings: XY[][], precision: number = 1): Array<XY & { area: number }> {
  const polygons: XY[][][] = []
  let sign = 0
  for (const ring of rings) {
    const a = area(ring)
    if (a === 0)
      continue
    // The first ring's winding is the outer one's.
    if (!sign)
      sign = Math.sign(a)
    if (Math.sign(a) === sign)
      polygons.push([ring])
    else
      polygons[polygons.length - 1]?.push(ring)
  }
  return polygons.map(p => ({ ...poleOfInaccessibility(p, precision), area: Math.abs(area(p[0]!)) }))
}
