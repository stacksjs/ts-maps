// PMTiles tile ids — in-house, zero-dep.
// Independent TypeScript implementation of the addressing scheme in the
// PMTiles v3 spec (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md).
//
// A PMTiles archive does not key tiles by (z, x, y). It keys them by a single
// integer, the *tile id*, chosen so that tiles which are near each other on
// the map are near each other in the file:
//
//   tileId(z, x, y) = (number of tiles in every zoom below z)
//                   + (position of (x, y) along a Hilbert curve over 2^z × 2^z)
//
// The first term is the geometric series 4^0 + 4^1 + … + 4^(z-1) = (4^z - 1) / 3,
// so zoom 0 is id 0, zoom 1 is ids 1..4, zoom 2 is ids 5..20, and so on: every
// zoom level occupies its own contiguous block of ids.
//
// The second term is what makes the format fast over the network. A Hilbert
// curve visits every cell of a square grid while only ever stepping to an
// adjacent cell, so a viewport — a compact rectangle of tiles — maps to a few
// short runs of ids rather than one id per row. Archives written in id order
// ("clustered") therefore store a viewport's tiles in a handful of contiguous
// byte ranges, and the directories that index them compress well because
// consecutive ids differ by small deltas.
//
// Numbers stay plain JS Numbers. The largest id at zoom 26 (the spec's limit)
// is (4^27 - 1) / 3 ≈ 6.0e15, below 2^53, so nothing here needs BigInt. Bitwise
// operators are only applied to x / y (< 2^26, comfortably inside int32);
// anything touching an id uses arithmetic instead.

/** Highest zoom the spec allows. 4^27 / 3 still fits in a double exactly. */
export const PMTILES_MAX_ZOOM = 26

/**
 * First tile id of each zoom: `ZOOM_START[z] = (4^z - 1) / 3`. Precomputed
 * because `tileIdToZxy` walks it on every lookup.
 */
const ZOOM_START: number[] = (() => {
  const starts: number[] = []
  let acc = 0
  for (let z = 0; z <= PMTILES_MAX_ZOOM + 1; z++) {
    starts.push(acc)
    acc += 4 ** z
  }
  return starts
})()

// Rotate / flip a quadrant so the curve's sub-squares line up end to end.
// This is the textbook `rot` from the Hilbert curve literature; `xy` is
// mutated in place to avoid allocating per level.
function rotate(n: number, xy: [number, number], rx: number, ry: number): void {
  if (ry === 0) {
    if (rx === 1) {
      xy[0] = n - 1 - xy[0]
      xy[1] = n - 1 - xy[1]
    }
    const t = xy[0]
    xy[0] = xy[1]
    xy[1] = t
  }
}

/** Tile id of slippy-map tile `z/x/y`. Throws on coordinates outside the grid. */
export function zxyToTileId(z: number, x: number, y: number): number {
  if (!Number.isInteger(z) || z < 0 || z > PMTILES_MAX_ZOOM)
    throw new RangeError(`PMTiles: zoom ${z} is outside 0..${PMTILES_MAX_ZOOM}`)
  const n = 2 ** z
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n)
    throw new RangeError(`PMTiles: tile ${z}/${x}/${y} is outside the ${n}×${n} grid`)

  // Walk the curve from the coarsest quadrant to the finest. At each level `s`
  // the pair of bits (rx, ry) picks one of four quadrants, which contributes
  // s² × (its order along the curve: 0, 1, 2, 3 for (0,0), (0,1), (1,1), (1,0)).
  const xy: [number, number] = [x, y]
  let d = 0
  for (let s = n / 2; s >= 1; s /= 2) {
    const rx = (xy[0] & s) > 0 ? 1 : 0
    const ry = (xy[1] & s) > 0 ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)
    rotate(n, xy, rx, ry)
  }
  return ZOOM_START[z]! + d
}

/** Inverse of `zxyToTileId`. Throws on negative / non-integer / oversized ids. */
export function tileIdToZxy(id: number): [z: number, x: number, y: number] {
  if (!Number.isInteger(id) || id < 0 || id >= ZOOM_START[PMTILES_MAX_ZOOM + 1]!)
    throw new RangeError(`PMTiles: tile id ${id} is out of range`)

  let z = 0
  while (ZOOM_START[z + 1]! <= id)
    z++
  const n = 2 ** z

  // Undo the walk, finest level first. `t` holds the remaining curve position;
  // its low two bits name the quadrant at level `s`. Arithmetic, not `&` / `>>`,
  // because `t` can exceed 32 bits at high zooms.
  let t = id - ZOOM_START[z]!
  const xy: [number, number] = [0, 0]
  for (let s = 1; s < n; s *= 2) {
    const rx = Math.floor(t / 2) % 2
    const ry = (t % 2) ^ rx
    rotate(s, xy, rx, ry)
    xy[0] += s * rx
    xy[1] += s * ry
    t = Math.floor(t / 4)
  }
  return [z, xy[0], xy[1]]
}

/** WGS84 bounds of a slippy-map tile as `[west, south, east, north]`. */
export function tileBounds(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z
  const lon = (tx: number): number => (tx / n) * 360 - 180
  const lat = (ty: number): number => {
    const k = Math.PI - (2 * Math.PI * ty) / n
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)))
  }
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)]
}
