// Earcut polygon triangulator.
//
// Zero-dependency TypeScript port of the classic earcut algorithm by Mapbox
// (https://github.com/mapbox/earcut — ISC license, © Mapbox). The algorithm
// and structural layout are preserved verbatim; the port is a direct
// translation with strict types and no external dependencies.
//
// The algorithm is O(n) for most real-world polygons and degrades gracefully
// via z-order hashing + "cure" passes (self-intersection splits) for the
// pathological cases. See the upstream README for a detailed walk-through.

// ---------------------------------------------------------------------------
// Linked-list node used as the internal polygon representation.
// ---------------------------------------------------------------------------

interface EarNode {
  i: number
  x: number
  y: number
  prev: EarNode
  next: EarNode
  z: number
  prevZ: EarNode | null
  nextZ: EarNode | null
  steiner: boolean
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function earcut(vertices: ArrayLike<number>, holes?: number[], dim?: number): number[] {
  const dimensions = dim ?? 2
  const hasHoles = holes && holes.length > 0
  const outerLen = hasHoles ? holes![0] * dimensions : vertices.length

  let outerNode = linkedList(vertices, 0, outerLen, dimensions, true)
  const triangles: number[] = []
  if (!outerNode || outerNode.next === outerNode.prev)
    return triangles

  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  let x = 0
  let y = 0
  let invSize = 0

  if (hasHoles)
    outerNode = eliminateHoles(vertices, holes!, outerNode, dimensions)

  // z-order hashing is only worthwhile for larger polygons — otherwise the
  // overhead of computing hashes outweighs the linear scan it replaces.
  if (vertices.length > 80 * dimensions) {
    minX = maxX = vertices[0] as number
    minY = maxY = vertices[1] as number

    for (let i = dimensions; i < outerLen; i += dimensions) {
      x = vertices[i] as number
      y = vertices[i + 1] as number
      if (x < minX)
        minX = x
      if (y < minY)
        minY = y
      if (x > maxX)
        maxX = x
      if (y > maxY)
        maxY = y
    }

    // minX / minY / size are used to transform coords into integers for
    // z-order hashing.
    invSize = Math.max(maxX - minX, maxY - minY)
    invSize = invSize !== 0 ? 32767 / invSize : 0
  }

  earcutLinked(outerNode, triangles, dimensions, minX, minY, invSize, 0)

  return triangles
}

// Compute the deviation between the polygon area and the total area of the
// produced triangulation. `0` means a perfect triangulation; small positive
// numbers indicate rounding error or degenerate geometry.
export function deviation(
  data: ArrayLike<number>,
  holes: number[] | undefined,
  dim: number,
  triangles: number[],
): number {
  const hasHoles = holes && holes.length > 0
  const outerLen = hasHoles ? holes![0] * dim : data.length

  let polygonArea = Math.abs(signedArea(data, 0, outerLen, dim))
  if (hasHoles) {
    for (let i = 0, len = holes!.length; i < len; i++) {
      const start = holes![i] * dim
      const end = i < len - 1 ? holes![i + 1] * dim : data.length
      polygonArea -= Math.abs(signedArea(data, start, end, dim))
    }
  }

  let trianglesArea = 0
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * dim
    const b = triangles[i + 1] * dim
    const c = triangles[i + 2] * dim
    trianglesArea += Math.abs(
      (data[a] - data[c]) * (data[b + 1] - data[a + 1])
      - (data[a] - data[b]) * (data[c + 1] - data[a + 1]),
    )
  }

  return polygonArea === 0 && trianglesArea === 0
    ? 0
    : Math.abs((trianglesArea - polygonArea) / polygonArea)
}

// Flatten a GeoJSON-style polygon (array of rings, each an array of points
// with `x`/`y`) into the flat buffers earcut consumes. Accepts the legacy
// `[x, y][][]` encoding as well. Hole indices are start-of-ring offsets
// expressed in vertex counts (not coordinate counts).
export function flatten(data: number[][][] | Array<Array<{ x: number, y: number }>>): {
  vertices: number[]
  holes: number[]
  dimensions: number
} {
  const vertices: number[] = []
  const holes: number[] = []
  const dimensions = 2

  let vertexCursor = 0
  for (let i = 0; i < data.length; i++) {
    const ring = data[i]
    if (i > 0)
      holes.push(vertexCursor)
    for (let j = 0; j < ring.length; j++) {
      const pt = ring[j]
      if (Array.isArray(pt)) {
        vertices.push(pt[0] as number, pt[1] as number)
      }
      else {
        vertices.push((pt as { x: number }).x, (pt as { y: number }).y)
      }
    }
    vertexCursor += ring.length
  }

  return { vertices, holes, dimensions }
}

// ---------------------------------------------------------------------------
// Linked-list construction
// ---------------------------------------------------------------------------

function linkedList(
  data: ArrayLike<number>,
  start: number,
  end: number,
  dim: number,
  clockwise: boolean,
): EarNode | null {
  let last: EarNode | null = null

  if (clockwise === signedArea(data, start, end, dim) > 0) {
    for (let i = start; i < end; i += dim)
      last = insertNode(i, data[i] as number, data[i + 1] as number, last)
  }
  else {
    for (let i = end - dim; i >= start; i -= dim)
      last = insertNode(i, data[i] as number, data[i + 1] as number, last)
  }

  if (last && equals(last, last.next)) {
    removeNode(last)
    last = last.next
  }

  return last
}

// Remove collinear / zero-area points from the linked list.
function filterPoints(start: EarNode | null, end?: EarNode | null): EarNode | null {
  if (!start)
    return start
  let endNode = end ?? start

  let p: EarNode = start
  let again = false
  do {
    again = false
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p)
      p = endNode = p.prev
      if (p === p.next)
        break
      again = true
    }
    else {
      p = p.next
    }
  } while (again || p !== endNode)

  return endNode
}

// ---------------------------------------------------------------------------
// Main earcut ear-clipping loop
// ---------------------------------------------------------------------------

function earcutLinked(
  earIn: EarNode | null,
  triangles: number[],
  dim: number,
  minX: number,
  minY: number,
  invSize: number,
  pass: number,
): void {
  if (!earIn)
    return

  let ear: EarNode = earIn

  // Interlink z-order curve hash on the first pass to enable fast ear checks.
  if (pass === 0 && invSize)
    indexCurve(ear, minX, minY, invSize)

  let stop: EarNode = ear

  while (ear.prev !== ear.next) {
    const prev = ear.prev
    const next = ear.next

    if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
      triangles.push(prev.i / dim | 0, ear.i / dim | 0, next.i / dim | 0)
      removeNode(ear)
      // Skipping the next vertex leads to a pair of collinear edges on
      // triangles with identical vertices — avoid both.
      ear = next.next
      stop = next.next
      continue
    }

    ear = next

    if (ear === stop) {
      if (pass === 0) {
        // Try splicing out fragile self-intersections and retry.
        earcutLinked(filterPoints(ear, null), triangles, dim, minX, minY, invSize, 1)
      }
      else if (pass === 1) {
        const cured = cureLocalIntersections(filterPoints(ear, null)!, triangles, dim)
        earcutLinked(cured, triangles, dim, minX, minY, invSize, 2)
      }
      else if (pass === 2) {
        splitEarcut(ear, triangles, dim, minX, minY, invSize)
      }
      break
    }
  }
}

function isEar(ear: EarNode): boolean {
  const a = ear.prev
  const b = ear
  const c = ear.next

  if (area(a, b, c) >= 0)
    return false // reflex, can't be an ear

  // triangle bbox; any vertex inside disqualifies the ear.
  const ax = a.x
  const bx = b.x
  const cx = c.x
  const ay = a.y
  const by = b.y
  const cy = c.y

  const x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx)
  const y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy)
  const x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx)
  const y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy)

  let p = c.next
  while (p !== a) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
      && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y)
      && area(p.prev, p, p.next) >= 0) {
      return false
    }
    p = p.next
  }
  return true
}

function isEarHashed(ear: EarNode, minX: number, minY: number, invSize: number): boolean {
  const a = ear.prev
  const b = ear
  const c = ear.next

  if (area(a, b, c) >= 0)
    return false

  const ax = a.x
  const bx = b.x
  const cx = c.x
  const ay = a.y
  const by = b.y
  const cy = c.y

  const x0 = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx)
  const y0 = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy)
  const x1 = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx)
  const y1 = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy)

  const minZ = zOrder(x0, y0, minX, minY, invSize)
  const maxZ = zOrder(x1, y1, minX, minY, invSize)

  let p: EarNode | null = ear.prevZ
  let n: EarNode | null = ear.nextZ

  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c
      && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y)
      && area(p.prev, p, p.next) >= 0) {
      return false
    }
    p = p.prevZ

    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c
      && pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y)
      && area(n.prev, n, n.next) >= 0) {
      return false
    }
    n = n.nextZ
  }

  while (p && p.z >= minZ) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c
      && pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y)
      && area(p.prev, p, p.next) >= 0) {
      return false
    }
    p = p.prevZ
  }

  while (n && n.z <= maxZ) {
    if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c
      && pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y)
      && area(n.prev, n, n.next) >= 0) {
      return false
    }
    n = n.nextZ
  }

  return true
}

// ---------------------------------------------------------------------------
// Repair helpers — used on successive earcut passes to escape impossible
// configurations (self-intersections, nested touching rings, etc.).
// ---------------------------------------------------------------------------

function cureLocalIntersections(startIn: EarNode, triangles: number[], dim: number): EarNode {
  let p: EarNode = startIn
  let start = startIn
  do {
    const a = p.prev
    const b = p.next.next

    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i / dim | 0, p.i / dim | 0, b.i / dim | 0)

      removeNode(p)
      removeNode(p.next)

      p = start = b
    }
    p = p.next
  } while (p !== start)

  return filterPoints(p, null)!
}

function splitEarcut(
  start: EarNode,
  triangles: number[],
  dim: number,
  minX: number,
  minY: number,
  invSize: number,
): void {
  let a: EarNode = start
  do {
    let b = a.next.next
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        const c: EarNode | null = splitPolygon(a, b)

        const aFiltered = filterPoints(a, a.next)
        const cFiltered = filterPoints(c!, c!.next)

        earcutLinked(aFiltered, triangles, dim, minX, minY, invSize, 0)
        earcutLinked(cFiltered, triangles, dim, minX, minY, invSize, 0)
        return
      }
      b = b.next
    }
    a = a.next
  } while (a !== start)
}

// ---------------------------------------------------------------------------
// Hole elimination — connect each hole to the outer ring via a bridge edge.
// ---------------------------------------------------------------------------

function eliminateHoles(
  data: ArrayLike<number>,
  holeIndices: number[],
  outerNodeIn: EarNode,
  dim: number,
): EarNode {
  const queue: EarNode[] = []

  for (let i = 0, len = holeIndices.length; i < len; i++) {
    const start = holeIndices[i] * dim
    const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length
    const list = linkedList(data, start, end, dim, false)
    if (!list)
      continue
    if (list === list.next)
      list.steiner = true
    queue.push(getLeftmost(list))
  }

  queue.sort((a, b) => a.x - b.x)

  let outerNode: EarNode = outerNodeIn
  for (let i = 0; i < queue.length; i++) {
    outerNode = eliminateHole(queue[i], outerNode)
  }

  return outerNode
}

function eliminateHole(hole: EarNode, outerNodeIn: EarNode): EarNode {
  const bridge = findHoleBridge(hole, outerNodeIn)
  if (!bridge)
    return outerNodeIn

  const bridgeReverse = splitPolygon(bridge, hole)

  // Filter collinear points around the bridge endpoints.
  filterPoints(bridgeReverse, bridgeReverse.next)
  return filterPoints(outerNodeIn, outerNodeIn.next)!
}

// Find a suitable bridge vertex on the outer ring for the given hole.
function findHoleBridge(hole: EarNode, outerNode: EarNode): EarNode | null {
  let p: EarNode = outerNode
  const hx = hole.x
  const hy = hole.y
  let qx = -Infinity
  let m: EarNode | null = null

  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y)
      if (x <= hx && x > qx) {
        qx = x
        m = p.x < p.next.x ? p : p.next
        if (x === hx)
          return m
      }
    }
    p = p.next
  } while (p !== outerNode)

  if (!m)
    return null

  // Look for points inside the triangle (hole, m, m.next) — if present,
  // choose the closest vertex as the bridge.
  const stop = m
  const mx = m.x
  const my = m.y
  let tanMin = Infinity
  let tan: number

  p = m
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x
      && pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      tan = Math.abs(hy - p.y) / (hx - p.x)

      if (locallyInside(p, hole)
        && (tan < tanMin || (tan === tanMin && (p.x > m!.x || (p.x === m!.x && sectorContainsSector(m!, p)))))) {
        m = p
        tanMin = tan
      }
    }
    p = p.next
  } while (p !== stop)

  return m
}

// ---------------------------------------------------------------------------
// Z-order curve support — enables O(n log n) ear search for large polygons.
// ---------------------------------------------------------------------------

function indexCurve(startIn: EarNode, minX: number, minY: number, invSize: number): void {
  let p: EarNode = startIn
  do {
    if (p.z === 0)
      p.z = zOrder(p.x, p.y, minX, minY, invSize)
    p.prevZ = p.prev
    p.nextZ = p.next
    p = p.next
  } while (p !== startIn)

  p.prevZ!.nextZ = null
  p.prevZ = null

  sortLinked(p)
}

function sortLinked(listIn: EarNode): EarNode {
  let list: EarNode | null = listIn
  let inSize = 1
  let numMerges: number

  do {
    let p: EarNode | null = list
    list = null
    let tail: EarNode | null = null
    numMerges = 0

    while (p) {
      numMerges++
      let q: EarNode | null = p
      let pSize = 0
      for (let i = 0; i < inSize; i++) {
        pSize++
        q = q!.nextZ
        if (!q)
          break
      }
      let qSize = inSize

      while (pSize > 0 || (qSize > 0 && q)) {
        let e: EarNode | null
        if (pSize !== 0 && (qSize === 0 || !q || p!.z <= q.z)) {
          e = p
          p = p!.nextZ
          pSize--
        }
        else {
          e = q
          q = q!.nextZ
          qSize--
        }

        if (tail)
          tail.nextZ = e
        else
          list = e
        e!.prevZ = tail
        tail = e
      }
      p = q
    }
    tail!.nextZ = null
    inSize *= 2
  } while (numMerges > 1)

  return list!
}

// Map 2D coordinates to a Morton-order (z-curve) hash in [0, 2^30).
function zOrder(xIn: number, yIn: number, minX: number, minY: number, invSize: number): number {
  let x = ((xIn - minX) * invSize) | 0
  let y = ((yIn - minY) * invSize) | 0

  x = (x | (x << 8)) & 0x00FF00FF
  x = (x | (x << 4)) & 0x0F0F0F0F
  x = (x | (x << 2)) & 0x33333333
  x = (x | (x << 1)) & 0x55555555

  y = (y | (y << 8)) & 0x00FF00FF
  y = (y | (y << 4)) & 0x0F0F0F0F
  y = (y | (y << 2)) & 0x33333333
  y = (y | (y << 1)) & 0x55555555

  return x | (y << 1)
}

// ---------------------------------------------------------------------------
// Geometric primitives
// ---------------------------------------------------------------------------

function getLeftmost(start: EarNode): EarNode {
  let p: EarNode = start
  let leftmost = start
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y))
      leftmost = p
    p = p.next
  } while (p !== start)
  return leftmost
}

function pointInTriangle(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  px: number, py: number,
): boolean {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py)
    && (ax - px) * (by - py) >= (bx - px) * (ay - py)
    && (bx - px) * (cy - py) >= (cx - px) * (by - py)
}

function isValidDiagonal(a: EarNode, b: EarNode): boolean {
  return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b)
    && ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b)
      && (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0))
      || (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0))
}

function area(p: EarNode, q: EarNode, r: EarNode): number {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
}

function equals(p1: EarNode, p2: EarNode): boolean {
  return p1.x === p2.x && p1.y === p2.y
}

function intersects(p1: EarNode, q1: EarNode, p2: EarNode, q2: EarNode): boolean {
  const o1 = sign(area(p1, q1, p2))
  const o2 = sign(area(p1, q1, q2))
  const o3 = sign(area(p2, q2, p1))
  const o4 = sign(area(p2, q2, q1))

  if (o1 !== o2 && o3 !== o4)
    return true

  if (o1 === 0 && onSegment(p1, p2, q1))
    return true
  if (o2 === 0 && onSegment(p1, q2, q1))
    return true
  if (o3 === 0 && onSegment(p2, p1, q2))
    return true
  if (o4 === 0 && onSegment(p2, q1, q2))
    return true
  return false
}

function onSegment(p: EarNode, q: EarNode, r: EarNode): boolean {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x)
    && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y)
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0
}

function intersectsPolygon(a: EarNode, b: EarNode): boolean {
  let p: EarNode = a
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i
      && intersects(p, p.next, a, b)) {
      return true
    }
    p = p.next
  } while (p !== a)
  return false
}

function locallyInside(a: EarNode, b: EarNode): boolean {
  return area(a.prev, a, a.next) < 0
    ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
    : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0
}

function middleInside(a: EarNode, b: EarNode): boolean {
  let p: EarNode = a
  let inside = false
  const px = (a.x + b.x) / 2
  const py = (a.y + b.y) / 2
  do {
    if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y
      && (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) {
      inside = !inside
    }
    p = p.next
  } while (p !== a)
  return inside
}

function sectorContainsSector(m: EarNode, p: EarNode): boolean {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0
}

function splitPolygon(a: EarNode, b: EarNode): EarNode {
  const a2: EarNode = makeNode(a.i, a.x, a.y)
  const b2: EarNode = makeNode(b.i, b.x, b.y)
  const an = a.next
  const bp = b.prev

  a.next = b
  b.prev = a

  a2.next = an
  an.prev = a2

  b2.next = a2
  a2.prev = b2

  bp.next = b2
  b2.prev = bp

  return b2
}

function insertNode(i: number, x: number, y: number, last: EarNode | null): EarNode {
  const p = makeNode(i, x, y)

  if (!last) {
    p.prev = p
    p.next = p
  }
  else {
    p.next = last.next
    p.prev = last
    last.next.prev = p
    last.next = p
  }
  return p
}

function removeNode(p: EarNode): void {
  p.next.prev = p.prev
  p.prev.next = p.next
  if (p.prevZ)
    p.prevZ.nextZ = p.nextZ
  if (p.nextZ)
    p.nextZ.prevZ = p.prevZ
}

function makeNode(i: number, x: number, y: number): EarNode {
  const node = {
    i,
    x,
    y,
    prev: null as unknown as EarNode,
    next: null as unknown as EarNode,
    z: 0,
    prevZ: null,
    nextZ: null,
    steiner: false,
  } as EarNode
  return node
}

function signedArea(data: ArrayLike<number>, start: number, end: number, dim: number): number {
  let sum = 0
  for (let i = start, j = end - dim; i < end; i += dim) {
    sum += ((data[j] as number) - (data[i] as number)) * ((data[i + 1] as number) + (data[j + 1] as number))
    j = i
  }
  return sum
}
