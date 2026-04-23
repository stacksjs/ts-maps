// GeoJSON clustering source — an in-house, zero-dependency TypeScript port of
// the classic supercluster algorithm (https://github.com/mapbox/supercluster,
// BSD-3-Clause). The implementation is independent; credit to the upstream
// project for the original approach.
//
// The algorithm pre-projects each input point to a unit-square web-mercator
// coordinate, indexes it in a static KD-tree, and iteratively collapses
// neighbouring points into clusters at each integer zoom. Query time is
// O(log N) per bbox via the KD-tree.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClusterOptions {
  /** Cluster radius in pixels at the source tile extent (default 40). */
  radius?: number
  /** Above this zoom, no further clustering is performed (default 16). */
  maxZoom?: number
  /** Below this zoom, points fold into a single root cluster (default 0). */
  minZoom?: number
  /** Minimum number of points required to form a cluster (default 2). */
  minPoints?: number
  /** Tile extent used when converting the radius to unit coords (default 512). */
  extent?: number
  /** KD-tree leaf size (default 64). */
  nodeSize?: number
  /** Debug logging flag (default false). */
  log?: boolean
  /** Aggregator run during cluster formation: `acc` is mutated in place. */
  reduce?: (acc: Record<string, unknown>, props: Record<string, unknown>) => void
  /** Seed value generator for aggregation; called once per leaf. */
  map?: (props: Record<string, unknown>) => Record<string, unknown>
}

export interface ClusterPoint {
  type: 'Feature'
  geometry: { type: 'Point', coordinates: [number, number] }
  properties: Record<string, unknown>
  id?: number
}

// ---------------------------------------------------------------------------
// KDBush — a static 2-D spatial index tuned for sort-once / query-many.
// ---------------------------------------------------------------------------

export class KDBush {
  readonly nodeSize: number
  readonly points: Float64Array
  readonly ids: Uint32Array

  constructor(numItems: number, nodeSize: number = 64) {
    this.nodeSize = nodeSize
    this.points = new Float64Array(numItems * 2)
    this.ids = new Uint32Array(numItems)
    this._count = 0
    this._finished = false
  }

  private _count: number
  private _finished: boolean

  add(x: number, y: number): number {
    const i = this._count
    this.ids[i] = i
    this.points[i * 2] = x
    this.points[i * 2 + 1] = y
    this._count++
    return i
  }

  finish(): this {
    if (this._finished)
      return this
    sortKD(this.ids, this.points, this.nodeSize, 0, this.ids.length - 1, 0)
    this._finished = true
    return this
  }

  range(minX: number, minY: number, maxX: number, maxY: number): number[] {
    const out: number[] = []
    if (this.ids.length === 0)
      return out
    rangeKD(this.ids, this.points, minX, minY, maxX, maxY, 0, this.ids.length - 1, 0, this.nodeSize, out)
    return out
  }

  within(qx: number, qy: number, r: number): number[] {
    const out: number[] = []
    if (this.ids.length === 0)
      return out
    withinKD(this.ids, this.points, qx, qy, r, 0, this.ids.length - 1, 0, this.nodeSize, out)
    return out
  }
}

function sortKD(
  ids: Uint32Array,
  coords: Float64Array,
  nodeSize: number,
  left: number,
  right: number,
  axis: 0 | 1,
): void {
  if (right - left <= nodeSize)
    return
  const m = (left + right) >> 1
  select(ids, coords, m, left, right, axis)
  sortKD(ids, coords, nodeSize, left, m - 1, (1 - axis) as 0 | 1)
  sortKD(ids, coords, nodeSize, m + 1, right, (1 - axis) as 0 | 1)
}

function select(
  ids: Uint32Array,
  coords: Float64Array,
  k: number,
  left: number,
  right: number,
  axis: 0 | 1,
): void {
  while (right > left) {
    if (right - left > 600) {
      const n = right - left + 1
      const m = k - left + 1
      const z = Math.log(n)
      const s = 0.5 * Math.exp((2 * z) / 3)
      const sd = 0.5 * Math.sqrt((z * s * (n - s)) / n) * (m - n / 2 < 0 ? -1 : 1)
      const newLeft = Math.max(left, Math.floor(k - (m * s) / n + sd))
      const newRight = Math.min(right, Math.floor(k + ((n - m) * s) / n + sd))
      select(ids, coords, k, newLeft, newRight, axis)
    }
    const t = coords[2 * k + axis]!
    let i = left
    let j = right
    swapItem(ids, coords, left, k)
    if (coords[2 * right + axis]! > t)
      swapItem(ids, coords, left, right)
    while (i < j) {
      swapItem(ids, coords, i, j)
      i++
      j--
      while (coords[2 * i + axis]! < t) i++
      while (coords[2 * j + axis]! > t) j--
    }
    if (coords[2 * left + axis] === t)
      swapItem(ids, coords, left, j)
    else {
      j++
      swapItem(ids, coords, j, right)
    }
    if (j <= k)
      left = j + 1
    if (k <= j)
      right = j - 1
  }
}

function swapItem(ids: Uint32Array, coords: Float64Array, i: number, j: number): void {
  const id = ids[i]!
  ids[i] = ids[j]!
  ids[j] = id
  const ax = coords[2 * i]!
  const ay = coords[2 * i + 1]!
  coords[2 * i] = coords[2 * j]!
  coords[2 * i + 1] = coords[2 * j + 1]!
  coords[2 * j] = ax
  coords[2 * j + 1] = ay
}

function rangeKD(
  ids: Uint32Array,
  coords: Float64Array,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  left: number,
  right: number,
  axis: 0 | 1,
  nodeSize: number,
  out: number[],
): void {
  if (right - left <= nodeSize) {
    for (let i = left; i <= right; i++) {
      const x = coords[2 * i]!
      const y = coords[2 * i + 1]!
      if (x >= minX && x <= maxX && y >= minY && y <= maxY)
        out.push(ids[i]!)
    }
    return
  }
  const m = (left + right) >> 1
  const x = coords[2 * m]!
  const y = coords[2 * m + 1]!
  if (x >= minX && x <= maxX && y >= minY && y <= maxY)
    out.push(ids[m]!)
  if (axis === 0 ? minX <= x : minY <= y)
    rangeKD(ids, coords, minX, minY, maxX, maxY, left, m - 1, (1 - axis) as 0 | 1, nodeSize, out)
  if (axis === 0 ? maxX >= x : maxY >= y)
    rangeKD(ids, coords, minX, minY, maxX, maxY, m + 1, right, (1 - axis) as 0 | 1, nodeSize, out)
}

function withinKD(
  ids: Uint32Array,
  coords: Float64Array,
  qx: number,
  qy: number,
  r: number,
  left: number,
  right: number,
  axis: 0 | 1,
  nodeSize: number,
  out: number[],
): void {
  const r2 = r * r
  if (right - left <= nodeSize) {
    for (let i = left; i <= right; i++) {
      if (sqDist(coords[2 * i]!, coords[2 * i + 1]!, qx, qy) <= r2)
        out.push(ids[i]!)
    }
    return
  }
  const m = (left + right) >> 1
  const x = coords[2 * m]!
  const y = coords[2 * m + 1]!
  if (sqDist(x, y, qx, qy) <= r2)
    out.push(ids[m]!)
  if (axis === 0 ? qx - r <= x : qy - r <= y)
    withinKD(ids, coords, qx, qy, r, left, m - 1, (1 - axis) as 0 | 1, nodeSize, out)
  if (axis === 0 ? qx + r >= x : qy + r >= y)
    withinKD(ids, coords, qx, qy, r, m + 1, right, (1 - axis) as 0 | 1, nodeSize, out)
}

function sqDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

// ---------------------------------------------------------------------------
// Internal point record. Mutable, packed inside a typed array for each zoom.
// Layout per point:
//   [0] x (unit mercator)
//   [1] y (unit mercator)
//   [2] zoom at which the point became a cluster (Infinity if still a leaf)
//   [3] index into the zoom-level `points` array that points to either the
//       original leaf (at the bottom level) or the constituent cluster.
//   [4] parent cluster id
//   [5] number of points aggregated
// ---------------------------------------------------------------------------

const OFFSET_ZOOM = 2
const OFFSET_ID = 3
const OFFSET_PARENT = 4
const OFFSET_NUM_POINTS = 5
const OFFSET_PROPERTIES = 6
const STRIDE = 7

// ---------------------------------------------------------------------------
// GeoJSONClusterSource
// ---------------------------------------------------------------------------

export class GeoJSONClusterSource {
  private readonly options: Required<Omit<ClusterOptions, 'reduce' | 'map' | 'log'>> & {
    reduce?: ClusterOptions['reduce']
    map?: ClusterOptions['map']
    log: boolean
  }

  private _points: ClusterPoint[] = []
  private _trees: (KDBush | null)[] = []
  private _clusterProps: Record<string, unknown>[] = []
  // Parallel arrays for each tree level — indexed the same as the tree's
  // internal ids. Each array is `STRIDE` wide. Explicitly typed against the
  // concrete `ArrayBuffer` backing so assignment from helpers that allocate
  // their own buffer round-trips cleanly under the newer TS lib.d.ts.
  private _data: Float64Array<ArrayBuffer>[] = []

  constructor(opts: ClusterOptions = {}) {
    this.options = {
      radius: opts.radius ?? 40,
      maxZoom: opts.maxZoom ?? 16,
      minZoom: opts.minZoom ?? 0,
      minPoints: opts.minPoints ?? 2,
      extent: opts.extent ?? 512,
      nodeSize: opts.nodeSize ?? 64,
      reduce: opts.reduce,
      map: opts.map,
      log: opts.log ?? false,
    }
  }

  load(features: ClusterPoint[]): this {
    this._points = features
    this._trees = []
    this._clusterProps = []
    this._data = []

    const { maxZoom, minZoom } = this.options
    // Build the leaf-level data array (zoom = maxZoom + 1). Allocate the
    // backing `ArrayBuffer` explicitly so the Float64Array's generic parameter
    // lands on `ArrayBuffer` and matches the `_data` field type.
    const leafBuf = new ArrayBuffer(features.length * STRIDE * 8)
    const leafData = new Float64Array(leafBuf)
    for (let i = 0; i < features.length; i++) {
      const f = features[i]!
      if (!f.geometry)
        continue
      const [lng, lat] = f.geometry.coordinates
      leafData[i * STRIDE + 0] = lngX(lng)
      leafData[i * STRIDE + 1] = latY(lat)
      leafData[i * STRIDE + OFFSET_ZOOM] = Infinity
      leafData[i * STRIDE + OFFSET_ID] = i
      leafData[i * STRIDE + OFFSET_PARENT] = -1
      leafData[i * STRIDE + OFFSET_NUM_POINTS] = 1
      leafData[i * STRIDE + OFFSET_PROPERTIES] = -1
    }

    this._data[maxZoom + 1] = leafData
    this._trees[maxZoom + 1] = this._buildTree(leafData)

    // Cluster upwards, zoom by zoom, until minZoom.
    let data = leafData
    for (let z = maxZoom; z >= minZoom; z--) {
      data = this._cluster(data, z)
      this._data[z] = data
      this._trees[z] = this._buildTree(data)
    }

    return this
  }

  getClusters(bbox: [number, number, number, number], zoom: number): ClusterPoint[] {
    const clampedZoom = this._limitZoom(zoom)
    const tree = this._trees[clampedZoom]
    const data = this._data[clampedZoom]
    if (!tree || !data)
      return []
    let minLng = ((((bbox[0] + 180) % 360) + 360) % 360) - 180
    const minLat = Math.max(-90, Math.min(90, bbox[1]))
    let maxLng = bbox[2] === 180 ? 180 : ((((bbox[2] + 180) % 360) + 360) % 360) - 180
    const maxLat = Math.max(-90, Math.min(90, bbox[3]))

    if (bbox[2] - bbox[0] >= 360) {
      minLng = -180
      maxLng = 180
    }
    else if (minLng > maxLng) {
      const east = this.getClusters([minLng, minLat, 180, maxLat], zoom)
      const west = this.getClusters([-180, minLat, maxLng, maxLat], zoom)
      return east.concat(west)
    }

    const ids = tree.range(lngX(minLng), latY(maxLat), lngX(maxLng), latY(minLat))
    const out: ClusterPoint[] = []
    for (const id of ids) {
      out.push(this._dataToFeature(data, id))
    }
    return out
  }

  getChildren(clusterId: number): ClusterPoint[] {
    const originId = clusterId >> 5
    const originZoom = clusterId & 31
    const data = this._data[originZoom]
    if (!data)
      throw new Error('no cluster with the specified id')
    const r = this.options.radius / (this.options.extent * 2 ** (originZoom - 1))
    const tree = this._trees[originZoom]
    if (!tree)
      return []
    const x = data[originId * STRIDE]!
    const y = data[originId * STRIDE + 1]!
    const ids = tree.within(x, y, r)
    const out: ClusterPoint[] = []
    for (const id of ids) {
      if (data[id * STRIDE + OFFSET_PARENT] === clusterId)
        out.push(this._dataToFeature(data, id))
    }
    if (out.length === 0)
      throw new Error('no cluster with the specified id')
    return out
  }

  getLeaves(clusterId: number, limit = 10, offset = 0): ClusterPoint[] {
    const out: ClusterPoint[] = []
    this._appendLeaves(out, clusterId, limit, offset, 0)
    return out
  }

  getClusterExpansionZoom(clusterId: number): number {
    let expZoom = (clusterId & 31) - 1
    while (expZoom <= this.options.maxZoom) {
      const children = this.getChildren(clusterId)
      expZoom++
      if (children.length !== 1)
        break
      clusterId = children[0]!.properties.cluster_id as number
    }
    return expZoom
  }

  getTile(z: number, x: number, y: number): { features: ClusterPoint[] } | null {
    const data = this._data[this._limitZoom(z)]
    const tree = this._trees[this._limitZoom(z)]
    if (!data || !tree)
      return null
    const z2 = 2 ** z
    const padding = this.options.radius / this.options.extent
    const top = (y - padding) / z2
    const bottom = (y + 1 + padding) / z2
    const tile: { features: ClusterPoint[] } = { features: [] }
    this._addTileFeatures(
      tree.range((x - padding) / z2, top, (x + 1 + padding) / z2, bottom),
      data,
      x,
      y,
      z2,
      tile,
    )
    if (x === 0) {
      this._addTileFeatures(
        tree.range(1 - padding / z2, top, 1, bottom),
        data,
        z2,
        y,
        z2,
        tile,
      )
    }
    if (x === z2 - 1) {
      this._addTileFeatures(
        tree.range(0, top, padding / z2, bottom),
        data,
        -1,
        y,
        z2,
        tile,
      )
    }
    return tile.features.length > 0 ? tile : null
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private _limitZoom(z: number): number {
    return Math.max(this.options.minZoom, Math.min(Math.floor(z), this.options.maxZoom + 1))
  }

  private _buildTree(data: Float64Array): KDBush {
    const count = data.length / STRIDE
    const tree = new KDBush(count, this.options.nodeSize)
    for (let i = 0; i < count; i++) {
      tree.add(data[i * STRIDE]!, data[i * STRIDE + 1]!)
    }
    tree.finish()
    return tree
  }

  private _cluster(data: Float64Array, zoom: number): Float64Array<ArrayBuffer> {
    const { radius, extent, reduce, minPoints } = this.options
    const r = radius / (extent * 2 ** zoom)
    const sourceTree = this._trees[zoom + 1]!
    const nextBuffer: number[] = []

    for (let i = 0; i < data.length; i += STRIDE) {
      if (data[i + OFFSET_ZOOM]! <= zoom)
        continue
      data[i + OFFSET_ZOOM] = zoom
      const x = data[i]!
      const y = data[i + 1]!
      const neighbours = sourceTree.within(x, y, r)

      const numPointsOrigin = data[i + OFFSET_NUM_POINTS]!
      let numPoints = numPointsOrigin

      for (const neighbourId of neighbours) {
        const k = neighbourId * STRIDE
        if (data[k + OFFSET_ZOOM]! > zoom)
          numPoints += data[k + OFFSET_NUM_POINTS]!
      }

      if (numPoints > numPointsOrigin && numPoints >= minPoints) {
        let wx = x * numPointsOrigin
        let wy = y * numPointsOrigin
        let clusterProperties: Record<string, unknown> | undefined
        let clusterPropIdx = -1

        // Encode the originating point index and the zoom at which the cluster
        // formed into a single integer. Lower 5 bits hold `zoom + 1` (zoom
        // fits in [0, 30]); the rest holds the index. Matches supercluster's
        // convention.
        const clusterId = ((i / STRIDE) << 5) + (zoom + 1)

        for (const neighbourId of neighbours) {
          const k = neighbourId * STRIDE
          if (data[k + OFFSET_ZOOM]! <= zoom)
            continue
          data[k + OFFSET_ZOOM] = zoom
          const pointsForNeighbour = data[k + OFFSET_NUM_POINTS]!
          wx += data[k]! * pointsForNeighbour
          wy += data[k + 1]! * pointsForNeighbour
          data[k + OFFSET_PARENT] = clusterId
          if (reduce) {
            if (!clusterProperties)
              clusterProperties = this._mapForCluster(i, data)
            const neighbourProps = this._mapForCluster(k, data)
            reduce(clusterProperties, neighbourProps)
          }
        }

        data[i + OFFSET_PARENT] = clusterId
        if (clusterProperties) {
          clusterPropIdx = this._clusterProps.length
          this._clusterProps.push(clusterProperties)
        }
        nextBuffer.push(wx / numPoints, wy / numPoints, Infinity, clusterId, -1, numPoints, clusterPropIdx)
      }
      else {
        // Single point that didn't cluster — passes through to next zoom.
        for (let k = 0; k < STRIDE; k++)
          nextBuffer.push(data[i + k]!)
        nextBuffer[nextBuffer.length - STRIDE + OFFSET_ZOOM] = Infinity

        if (numPoints > 1) {
          // Special case: minPoints prevented clustering, but neighbours still
          // exist — collect them individually.
          for (const neighbourId of neighbours) {
            const k = neighbourId * STRIDE
            if (data[k + OFFSET_ZOOM]! <= zoom)
              continue
            data[k + OFFSET_ZOOM] = zoom
            for (let l = 0; l < STRIDE; l++)
              nextBuffer.push(data[k + l]!)
            nextBuffer[nextBuffer.length - STRIDE + OFFSET_ZOOM] = Infinity
          }
        }
      }
    }

    // Explicit ArrayBuffer construction keeps the result typed as
    // `Float64Array<ArrayBuffer>` under the newer TypeScript lib.d.ts where
    // `new Float64Array(numberArray)` widens the backing buffer to
    // `ArrayBufferLike`.
    const buf = new ArrayBuffer(nextBuffer.length * 8)
    const out = new Float64Array(buf)
    for (let i = 0; i < nextBuffer.length; i++)
      out[i] = nextBuffer[i]!
    return out
  }

  private _mapForCluster(i: number, data: Float64Array): Record<string, unknown> {
    const numPoints = data[i + OFFSET_NUM_POINTS]!
    const propIdx = data[i + OFFSET_PROPERTIES]!
    if (numPoints > 1 && propIdx >= 0)
      return { ...this._clusterProps[propIdx]! }
    const original = this._points[data[i + OFFSET_ID]!]
    if (this.options.map && original)
      return this.options.map({ ...(original.properties ?? {}) })
    return { ...(original?.properties ?? {}) }
  }

  private _addTileFeatures(
    ids: number[],
    data: Float64Array,
    x: number,
    y: number,
    z2: number,
    tile: { features: ClusterPoint[] },
  ): void {
    for (const id of ids) {
      const k = id * STRIDE
      const isCluster = data[k + OFFSET_NUM_POINTS]! > 1
      const px = (data[k]! * z2 - x) * this.options.extent
      const py = (data[k + 1]! * z2 - y) * this.options.extent
      tile.features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [px, py] },
        properties: isCluster
          ? this._getClusterProperties(data, k, data[k + OFFSET_ID]!)
          : { ...(this._points[data[k + OFFSET_ID]!]?.properties ?? {}) },
      })
    }
  }

  private _dataToFeature(data: Float64Array, id: number): ClusterPoint {
    const k = id * STRIDE
    const isCluster = data[k + OFFSET_NUM_POINTS]! > 1
    const lng = xLng(data[k]!)
    const lat = yLat(data[k + 1]!)
    if (isCluster) {
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: this._getClusterProperties(data, k, data[k + OFFSET_ID]!),
      }
    }
    const original = this._points[data[k + OFFSET_ID]!]!
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { ...(original.properties ?? {}) },
      id: original.id,
    }
  }

  private _getClusterProperties(data: Float64Array, k: number, clusterId: number): Record<string, unknown> {
    const propIdx = data[k + OFFSET_PROPERTIES]!
    const numPoints = data[k + OFFSET_NUM_POINTS]!
    const base: Record<string, unknown> = {
      cluster: true,
      cluster_id: clusterId,
      point_count: numPoints,
      point_count_abbreviated: numPoints >= 10000 ? `${Math.round(numPoints / 1000)}k` : numPoints >= 1000 ? `${(numPoints / 1000).toFixed(1)}k` : numPoints,
    }
    if (propIdx >= 0) {
      const extra = this._clusterProps[propIdx]
      if (extra)
        Object.assign(base, extra)
    }
    return base
  }

  private _appendLeaves(
    out: ClusterPoint[],
    clusterId: number,
    limit: number,
    offset: number,
    skipped: number,
  ): number {
    const children = this.getChildren(clusterId)
    for (const child of children) {
      const props = child.properties
      if (props && props.cluster)
        skipped = this._appendLeaves(out, props.cluster_id as number, limit, offset, skipped)
      else if (skipped < offset)
        skipped++
      else if (out.length < limit)
        out.push(child)
      if (out.length === limit)
        break
    }
    return skipped
  }
}

// ---------------------------------------------------------------------------
// Longitude/latitude ↔ unit Mercator helpers. Matches supercluster's
// convention so `getTile` coords are directly comparable with MVT tiles.
// ---------------------------------------------------------------------------

function lngX(lng: number): number {
  return lng / 360 + 0.5
}

function latY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180)
  const y = 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI
  return y < 0 ? 0 : y > 1 ? 1 : y
}

function xLng(x: number): number {
  return (x - 0.5) * 360
}

function yLat(y: number): number {
  const y2 = ((180 - y * 360) * Math.PI) / 180
  return (360 * Math.atan(Math.exp(y2))) / Math.PI - 90
}
