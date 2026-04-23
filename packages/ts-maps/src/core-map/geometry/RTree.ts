// Zero-dep R-tree with incremental insertion, bulk-loading (STR), removal, and
// bbox/point search. Inspired by the public-domain algorithms popularized by
// rbush (MIT) — this implementation is written fresh in TypeScript and does
// not reuse any of its code.
//
// The tree stores axis-aligned bounding boxes associated with arbitrary data.
// Non-leaf nodes keep a union bbox over their children; leaf nodes hold the
// user-provided `data`. Keeping the separation explicit (via `leaf: true`)
// lets us walk the tree without instanceof checks and keeps the structure
// compatible with `isolatedDeclarations`.

export type BBox = [minX: number, minY: number, maxX: number, maxY: number]

export interface RTreeNode<T> {
  bbox: BBox
  children?: Array<RTreeNode<T>>
  leaf?: boolean
  data?: T
}

export interface RTreeEntry<T> {
  bbox: BBox
  data: T
}

// ---------------------------------------------------------------------------
// Geometry helpers — these stay module-local so they can be inlined and so
// the class itself reads as plain tree bookkeeping.
// ---------------------------------------------------------------------------

function bboxArea(b: BBox): number {
  return (b[2] - b[0]) * (b[3] - b[1])
}

function bboxMargin(b: BBox): number {
  return (b[2] - b[0]) + (b[3] - b[1])
}

function enlargedArea(a: BBox, b: BBox): number {
  const w = Math.max(a[2], b[2]) - Math.min(a[0], b[0])
  const h = Math.max(a[3], b[3]) - Math.min(a[1], b[1])
  return w * h
}

function intersectionArea(a: BBox, b: BBox): number {
  const minX = Math.max(a[0], b[0])
  const minY = Math.max(a[1], b[1])
  const maxX = Math.min(a[2], b[2])
  const maxY = Math.min(a[3], b[3])
  if (maxX < minX || maxY < minY)
    return 0
  return (maxX - minX) * (maxY - minY)
}

function bboxContains(a: BBox, b: BBox): boolean {
  return a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3]
}

function bboxIntersects(a: BBox, b: BBox): boolean {
  return b[0] <= a[2] && b[1] <= a[3] && b[2] >= a[0] && b[3] >= a[1]
}

function bboxContainsPoint(b: BBox, x: number, y: number): boolean {
  return b[0] <= x && x <= b[2] && b[1] <= y && y <= b[3]
}

function emptyBBox(): BBox {
  return [Infinity, Infinity, -Infinity, -Infinity]
}

function extend(target: BBox, other: BBox): BBox {
  if (other[0] < target[0])
    target[0] = other[0]
  if (other[1] < target[1])
    target[1] = other[1]
  if (other[2] > target[2])
    target[2] = other[2]
  if (other[3] > target[3])
    target[3] = other[3]
  return target
}

function computeBBox<T>(node: RTreeNode<T>, k: number, p: number): void {
  const bbox = node.bbox
  bbox[0] = Infinity
  bbox[1] = Infinity
  bbox[2] = -Infinity
  bbox[3] = -Infinity
  const children = node.children!
  for (let i = k; i < p; i++)
    extend(bbox, children[i].bbox)
}

function createNode<T>(children: Array<RTreeNode<T>>): RTreeNode<T> {
  return { bbox: emptyBBox(), children, leaf: false }
}

// ---------------------------------------------------------------------------
// R-tree
// ---------------------------------------------------------------------------

export class RTree<T> {
  private _maxEntries: number
  private _minEntries: number
  private _root: RTreeNode<T>
  private _size: number

  constructor(opts?: { maxEntries?: number, minEntries?: number }) {
    const max = Math.max(4, opts?.maxEntries ?? 9)
    const min = Math.max(2, opts?.minEntries ?? Math.ceil(max * 0.4))
    this._maxEntries = max
    this._minEntries = Math.min(min, Math.floor(max / 2))
    this._root = { bbox: emptyBBox(), children: [], leaf: true }
    this._size = 0
  }

  size(): number {
    return this._size
  }

  clear(): this {
    this._root = { bbox: emptyBBox(), children: [], leaf: true }
    this._size = 0
    return this
  }

  insert(bbox: BBox, data: T): this {
    // Store a child record whose own `leaf` flag is undefined — this is a
    // data entry, not a node. `leaf: true` is reserved for nodes whose
    // children are data entries.
    const record: RTreeNode<T> = { bbox: [bbox[0], bbox[1], bbox[2], bbox[3]], data }
    this._insertRecord(record)
    this._size++
    return this
  }

  remove(bbox: BBox, data: T, equalsFn?: (a: T, b: T) => boolean): this {
    const eq = equalsFn ?? ((a: T, b: T) => a === b)
    const path: Array<RTreeNode<T>> = []

    const removed = this._removeFrom(this._root, bbox, data, eq, path)
    if (removed) {
      this._size--
      this._condense(path)
    }
    return this
  }

  private _removeFrom(
    node: RTreeNode<T>,
    bbox: BBox,
    data: T,
    eq: (a: T, b: T) => boolean,
    path: Array<RTreeNode<T>>,
  ): boolean {
    const children = node.children
    if (!children)
      return false

    path.push(node)

    if (node.leaf) {
      for (let i = 0; i < children.length; i++) {
        const c = children[i]
        if (c.data !== undefined && eq(c.data, data)) {
          children.splice(i, 1)
          return true
        }
      }
      path.pop()
      return false
    }

    for (let i = 0; i < children.length; i++) {
      const c = children[i]
      if (!bboxContains(c.bbox, bbox))
        continue
      if (this._removeFrom(c, bbox, data, eq, path))
        return true
    }

    path.pop()
    return false
  }

  search(bbox: BBox): Array<RTreeEntry<T>> {
    const out: Array<RTreeEntry<T>> = []
    const root = this._root
    if (!bboxIntersects(root.bbox, bbox))
      return out

    const stack: Array<RTreeNode<T>> = [root]
    while (stack.length > 0) {
      const node = stack.pop()!
      const children = node.children
      if (!children)
        continue
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (!bboxIntersects(child.bbox, bbox))
          continue
        if (node.leaf) {
          out.push({ bbox: child.bbox, data: child.data as T })
        }
        else if (bboxContains(bbox, child.bbox)) {
          // Whole subtree is inside — enumerate everything underneath.
          this._collectAll(child, out)
        }
        else {
          stack.push(child)
        }
      }
    }
    return out
  }

  searchPoint(x: number, y: number): Array<RTreeEntry<T>> {
    const out: Array<RTreeEntry<T>> = []
    const root = this._root
    if (!bboxContainsPoint(root.bbox, x, y))
      return out

    const stack: Array<RTreeNode<T>> = [root]
    while (stack.length > 0) {
      const node = stack.pop()!
      const children = node.children
      if (!children)
        continue
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (!bboxContainsPoint(child.bbox, x, y))
          continue
        if (node.leaf)
          out.push({ bbox: child.bbox, data: child.data as T })
        else
          stack.push(child)
      }
    }
    return out
  }

  all(): Array<RTreeEntry<T>> {
    const out: Array<RTreeEntry<T>> = []
    this._collectAll(this._root, out)
    return out
  }

  load(items: Array<RTreeEntry<T>>): this {
    if (items.length === 0)
      return this

    // For small loads, incremental insertion keeps the tree well-balanced.
    if (items.length < this._minEntries) {
      for (const it of items)
        this.insert(it.bbox, it.data)
      return this
    }

    // Build a fresh tree from items via STR packing.
    const records: Array<RTreeNode<T>> = items.map((it) => {
      return { bbox: [it.bbox[0], it.bbox[1], it.bbox[2], it.bbox[3]] as BBox, data: it.data }
    })
    const built = this._buildSTR(records, 0, records.length - 1, this._chooseHeight(records.length))

    if (this._size === 0) {
      this._root = built
      this._size = items.length
      return this
    }

    const existingHeight = this._height(this._root)
    const builtHeight = this._height(built)

    if (existingHeight === builtHeight) {
      // Same depth — merge children of the two roots.
      this._mergeRoots(built)
      this._size += items.length
    }
    else if (existingHeight < builtHeight) {
      // Existing tree is shorter — flip and re-insert the smaller tree.
      const old = this._root
      this._root = built
      this._size = items.length
      const oldEntries: Array<RTreeEntry<T>> = []
      this._collectAll(old, oldEntries)
      for (const it of oldEntries)
        this.insert(it.bbox, it.data)
    }
    else {
      const targetDepth = existingHeight - builtHeight
      this._insertSubtree(built, targetDepth)
      this._size += items.length
    }

    return this
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private _collectAll(node: RTreeNode<T>, out: Array<RTreeEntry<T>>): void {
    const stack: Array<RTreeNode<T>> = [node]
    while (stack.length > 0) {
      const current = stack.pop()!
      const children = current.children
      if (!children)
        continue
      if (current.leaf) {
        for (let i = 0; i < children.length; i++) {
          const c = children[i]
          out.push({ bbox: c.bbox, data: c.data as T })
        }
      }
      else {
        for (let i = 0; i < children.length; i++)
          stack.push(children[i])
      }
    }
  }

  // Height of a node as the number of edges from the node down to a leaf
  // node (a node containing data records). A tree whose root is itself a
  // leaf has height 0; a root whose children are leaves has height 1.
  private _height(node: RTreeNode<T>): number {
    let h = 0
    let cur: RTreeNode<T> = node
    while (!cur.leaf) {
      h++
      const next = cur.children?.[0]
      if (!next)
        break
      cur = next
    }
    return h
  }

  private _mergeRoots(other: RTreeNode<T>): void {
    const root = this._root
    // When the two roots are the same kind (both leaves or both internal),
    // splice other's children directly into root. Splits on overflow.
    if (root.leaf !== other.leaf) {
      // Different kinds — fall back to re-inserting.
      const entries: Array<RTreeEntry<T>> = []
      this._collectAll(other, entries)
      for (const it of entries)
        this.insert(it.bbox, it.data)
      return
    }

    const otherChildren = other.children!
    for (const child of otherChildren)
      root.children!.push(child)
    computeBBox(root, 0, root.children!.length)

    if (root.children!.length > this._maxEntries) {
      const split = this._splitChildren(root)
      const newRoot = createNode<T>([root, split])
      this._root = newRoot
      computeBBox(newRoot, 0, 2)
    }
  }

  private _chooseHeight(count: number): number {
    // Height (edges root→record) of a balanced M-ary tree holding `count`
    // records. A tree small enough to fit in one node has height 0.
    if (count <= this._maxEntries)
      return 0
    return Math.ceil(Math.log(count) / Math.log(this._maxEntries))
  }

  // STR (Sort-Tile-Recursive) packing. `packingRecords` marks the initial
  // call — we're grouping data records into leaf nodes. After that we're
  // grouping nodes into non-leaf nodes. Recurses upward until a single root
  // remains.
  private _buildSTR(
    items: Array<RTreeNode<T>>,
    left: number,
    right: number,
    height: number,
  ): RTreeNode<T> {
    return this._buildSTRInner(items, left, right, height, true)
  }

  private _buildSTRInner(
    items: Array<RTreeNode<T>>,
    left: number,
    right: number,
    height: number,
    packingRecords: boolean,
  ): RTreeNode<T> {
    const count = right - left + 1
    const M = this._maxEntries

    if (count <= M) {
      const slice = items.slice(left, right + 1)
      const node: RTreeNode<T> = {
        bbox: emptyBBox(),
        children: slice,
        leaf: packingRecords,
      }
      computeBBox(node, 0, slice.length)
      return node
    }

    // `nodeSize` = how many items each node at this level will hold.
    const exp = Math.max(height - 1, 0)
    const nodeSize = Math.ceil(count / M ** exp)
    const stripCount = Math.ceil(Math.sqrt(Math.ceil(count / nodeSize)))
    const stripSize = nodeSize * stripCount

    multiSelectSort(items, left, right, stripSize, compareCentroidX)

    const parents: Array<RTreeNode<T>> = []
    for (let i = left; i <= right; i += stripSize) {
      const stripRight = Math.min(i + stripSize - 1, right)
      multiSelectSort(items, i, stripRight, nodeSize, compareCentroidY)
      for (let j = i; j <= stripRight; j += nodeSize) {
        const groupRight = Math.min(j + nodeSize - 1, stripRight)
        const children = items.slice(j, groupRight + 1)
        const node: RTreeNode<T> = {
          bbox: emptyBBox(),
          children,
          leaf: packingRecords,
        }
        computeBBox(node, 0, children.length)
        parents.push(node)
      }
    }

    if (parents.length === 1)
      return parents[0]

    return this._buildSTRInner(parents, 0, parents.length - 1, height - 1, false)
  }

  // Insert a data-entry record into the correct leaf node. The record has
  // no `children` and no `leaf` flag — that's what distinguishes it from a
  // subtree.
  private _insertRecord(record: RTreeNode<T>): void {
    const path: Array<RTreeNode<T>> = []
    // Walk down to a leaf (a node whose children are data entries).
    let node = this._root
    while (!node.leaf) {
      path.push(node)
      const children = node.children!
      let target = children[0]
      let minEnlargement = enlargedArea(target.bbox, record.bbox) - bboxArea(target.bbox)
      let minArea = bboxArea(target.bbox)
      for (let i = 1; i < children.length; i++) {
        const c = children[i]
        const area = bboxArea(c.bbox)
        const enlargement = enlargedArea(c.bbox, record.bbox) - area
        if (enlargement < minEnlargement) {
          minEnlargement = enlargement
          minArea = area
          target = c
        }
        else if (enlargement === minEnlargement && area < minArea) {
          minArea = area
          target = c
        }
      }
      node = target
    }
    path.push(node)

    node.children!.push(record)
    extend(node.bbox, record.bbox)

    // Walk back up, splitting overfull nodes and refreshing bboxes.
    let level = path.length - 1
    while (level >= 0) {
      if (path[level].children!.length > this._maxEntries) {
        this._split(path, level)
      }
      else {
        extend(path[level].bbox, record.bbox)
      }
      level--
    }
  }

  // Insert an entire pre-built subtree at the depth where its height matches
  // the existing tree's structure. Used by `load()` when the caller bulk-
  // loads into an already-populated tree and the built subtree is shallower
  // than the existing tree.
  private _insertSubtree(sub: RTreeNode<T>, targetDepth: number): void {
    const path: Array<RTreeNode<T>> = []
    let node = this._root
    let depth = 0
    while (depth < targetDepth && !node.leaf) {
      path.push(node)
      const children = node.children!
      let target = children[0]
      let minEnlargement = enlargedArea(target.bbox, sub.bbox) - bboxArea(target.bbox)
      let minArea = bboxArea(target.bbox)
      for (let i = 1; i < children.length; i++) {
        const c = children[i]
        const area = bboxArea(c.bbox)
        const enlargement = enlargedArea(c.bbox, sub.bbox) - area
        if (enlargement < minEnlargement) {
          minEnlargement = enlargement
          minArea = area
          target = c
        }
      }
      node = target
      depth++
    }
    path.push(node)

    node.children!.push(sub)
    extend(node.bbox, sub.bbox)

    let level = path.length - 1
    while (level >= 0) {
      if (path[level].children!.length > this._maxEntries) {
        this._split(path, level)
      }
      else {
        extend(path[level].bbox, sub.bbox)
      }
      level--
    }
  }

  private _split(insertPath: Array<RTreeNode<T>>, level: number): void {
    const node = insertPath[level]
    const newNode = this._splitChildren(node)

    if (level === 0) {
      // Grow the tree.
      this._root = createNode<T>([node, newNode])
      computeBBox(this._root, 0, 2)
    }
    else {
      insertPath[level - 1].children!.push(newNode)
      computeBBox(insertPath[level - 1], 0, insertPath[level - 1].children!.length)
    }
  }

  private _splitChildren(node: RTreeNode<T>): RTreeNode<T> {
    const children = node.children!
    const M = this._maxEntries
    const m = this._minEntries

    // Choose split axis via perimeter-sum heuristic (same idea as R*-tree's
    // `ChooseSplitAxis`).
    this._chooseSplitAxis(children, m, M)
    const index = this._chooseSplitIndex(children, m, M)

    const rightChildren = children.splice(index, children.length - index)
    const newNode: RTreeNode<T> = {
      bbox: emptyBBox(),
      children: rightChildren,
      leaf: node.leaf,
    }
    computeBBox(node, 0, children.length)
    computeBBox(newNode, 0, rightChildren.length)
    return newNode
  }

  private _chooseSplitAxis(children: Array<RTreeNode<T>>, m: number, M: number): void {
    children.sort(compareMinX)
    const xMargin = this._allDistMargin(children, m, M)
    children.sort(compareMinY)
    const yMargin = this._allDistMargin(children, m, M)
    if (xMargin < yMargin)
      children.sort(compareMinX)
  }

  private _allDistMargin(children: Array<RTreeNode<T>>, m: number, M: number): number {
    const leftBBox = emptyBBox()
    const rightBBox = emptyBBox()
    for (let i = 0; i < m; i++)
      extend(leftBBox, children[i].bbox)
    for (let i = children.length - m; i < children.length; i++)
      extend(rightBBox, children[i].bbox)

    let margin = bboxMargin(leftBBox) + bboxMargin(rightBBox)
    const total = children.length

    for (let i = m; i < total - m; i++) {
      extend(leftBBox, children[i].bbox)
      margin += bboxMargin(leftBBox)
    }

    for (let i = total - m - 1; i >= m; i--) {
      extend(rightBBox, children[i].bbox)
      margin += bboxMargin(rightBBox)
    }

    return margin
  }

  private _chooseSplitIndex(children: Array<RTreeNode<T>>, m: number, M: number): number {
    let index = m
    let minOverlap = Infinity
    let minArea = Infinity
    const total = children.length

    for (let i = m; i <= total - m; i++) {
      const leftBBox = emptyBBox()
      for (let k = 0; k < i; k++)
        extend(leftBBox, children[k].bbox)
      const rightBBox = emptyBBox()
      for (let k = i; k < total; k++)
        extend(rightBBox, children[k].bbox)

      const overlap = intersectionArea(leftBBox, rightBBox)
      const area = bboxArea(leftBBox) + bboxArea(rightBBox)

      if (overlap < minOverlap) {
        minOverlap = overlap
        minArea = area
        index = i
      }
      else if (overlap === minOverlap && area < minArea) {
        minArea = area
        index = i
      }
    }
    return index
  }

  private _condense(path: Array<RTreeNode<T>>): void {
    // Walk up from the deepest node we touched. If a node has fewer than
    // `minEntries` children (and it isn't the root), splice it out and re-
    // insert its descendants. Always recompute parent bboxes on the way up.
    const reinsertPool: Array<RTreeNode<T>> = []
    for (let i = path.length - 1; i >= 0; i--) {
      const node = path[i]
      if (node.children && node.children.length === 0) {
        if (i > 0) {
          const parent = path[i - 1]
          const idx = parent.children!.indexOf(node)
          if (idx >= 0)
            parent.children!.splice(idx, 1)
        }
        else {
          this.clear()
          return
        }
      }
      else if (node.children && node.children.length < this._minEntries && i > 0) {
        // Collect all descendant leaves to reinsert.
        this._collectLeafNodes(node, reinsertPool)
        const parent = path[i - 1]
        const idx = parent.children!.indexOf(node)
        if (idx >= 0)
          parent.children!.splice(idx, 1)
      }
      else {
        computeBBox(node, 0, node.children?.length ?? 0)
      }
    }

    // Reinsert leaf entries. Each `insert()` call increments `_size`; cancel
    // that so net size reflects the actual removal (orphaned records were
    // still counted pre-condense).
    if (reinsertPool.length > 0) {
      for (const leaf of reinsertPool) {
        const children = leaf.children
        if (!children)
          continue
        for (const c of children) {
          this.insert(c.bbox, c.data as T)
          this._size--
        }
      }
    }
  }

  private _collectLeafNodes(node: RTreeNode<T>, out: Array<RTreeNode<T>>): void {
    const stack: Array<RTreeNode<T>> = [node]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (cur.leaf) {
        out.push(cur)
      }
      else if (cur.children) {
        for (const c of cur.children)
          stack.push(c)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Sorting helpers. `multiSelectSort` performs a partial sort: it guarantees
// that consecutive strips of `step` entries are in order relative to each
// other, without paying for a full O(N log N) sort of the whole range.
// ---------------------------------------------------------------------------

function compareMinX<T>(a: RTreeNode<T>, b: RTreeNode<T>): number {
  return a.bbox[0] - b.bbox[0]
}
function compareMinY<T>(a: RTreeNode<T>, b: RTreeNode<T>): number {
  return a.bbox[1] - b.bbox[1]
}
function compareCentroidX<T>(a: RTreeNode<T>, b: RTreeNode<T>): number {
  return (a.bbox[0] + a.bbox[2]) - (b.bbox[0] + b.bbox[2])
}
function compareCentroidY<T>(a: RTreeNode<T>, b: RTreeNode<T>): number {
  return (a.bbox[1] + a.bbox[3]) - (b.bbox[1] + b.bbox[3])
}

function multiSelectSort<T>(
  arr: Array<RTreeNode<T>>,
  left: number,
  right: number,
  step: number,
  compare: (a: RTreeNode<T>, b: RTreeNode<T>) => number,
): void {
  // Bulk-load ranges are typically small; a full sort of the slice is simpler
  // and correctness-preserving vs. a quickselect-based partial sort. We work
  // on the subarray and splice it back in place.
  const slice = arr.slice(left, right + 1)
  slice.sort(compare)
  for (let i = 0; i < slice.length; i++)
    arr[left + i] = slice[i]
  // `step` is retained for API parity with the classic STR algorithm — with a
  // full sort the result already satisfies the per-strip ordering.
  void step
}
