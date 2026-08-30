// CollisionIndex — sparse spatial hash for symbol placement.
//
// Boxes are bucketed into every cell they overlap; `tryInsert` rejects when a
// colliding neighbour has priority >= the new box's.
//
// The grid is sparse and unbounded rather than a fixed cols×rows array, which
// is what lets one index span the whole viewport instead of a single tile.
// A per-tile index cannot see across a tile seam, so two halves of the same
// street name, or two towns either side of an edge, would each place happily
// and then overlap on screen. Callers now insert in world-pixel coordinates
// and share one index across every tile at a zoom level.
//
// Because tiles are drawn, discarded on pan, and drawn again, every box may
// carry an `owner` — the tile that placed it. `removeOwner` drops that tile's
// boxes before it redraws, so a tile never collides with the ghosts of its own
// previous placement.

export interface CollisionBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  priority?: number
  /** Whoever placed this box, for eviction. Usually a tile key. */
  owner?: string
}

export interface CollisionIndexOptions {
  /** Grid cell size in the same units as the boxes. Default 64. */
  cellSize?: number
  /** Accepted and ignored; the grid sizes itself. */
  width?: number
  height?: number
}

export class CollisionIndex {
  private _cellSize: number
  private _cells: Map<string, CollisionBox[]>
  private _ownerCells: Map<string, Set<string>>

  constructor(opts?: CollisionIndexOptions) {
    this._cellSize = opts?.cellSize ?? 64
    this._cells = new Map()
    this._ownerCells = new Map()
  }

  /**
   * Would this box be rejected, without claiming any space for it?
   *
   * What `icon-ignore-placement` needs: draw only if the spot is free, but
   * leave it free for whatever comes next.
   */
  hits(box: CollisionBox): boolean {
    const range = this._cellRange(box)
    for (let cy = range.y0; cy <= range.y1; cy++) {
      for (let cx = range.x0; cx <= range.x1; cx++) {
        const bucket = this._cells.get(cellKey(cx, cy))
        if (!bucket)
          continue
        for (const other of bucket) {
          if (!overlaps(box, other))
            continue
          if (other.priority === undefined || box.priority === undefined)
            return true
          if (other.priority >= box.priority)
            return true
        }
      }
    }
    return false
  }

  tryInsert(box: CollisionBox): boolean {
    const range = this._cellRange(box)
    for (let cy = range.y0; cy <= range.y1; cy++) {
      for (let cx = range.x0; cx <= range.x1; cx++) {
        const bucket = this._cells.get(cellKey(cx, cy))
        if (!bucket)
          continue
        for (const other of bucket) {
          if (!overlaps(box, other))
            continue
          // Undefined priority on either side → conservative reject. Otherwise
          // the existing (higher-or-equal priority) symbol wins.
          if (other.priority === undefined || box.priority === undefined)
            return false
          if (other.priority >= box.priority)
            return false
        }
      }
    }
    this._insertBucketed(box, range)
    return true
  }

  insert(box: CollisionBox): void {
    this._insertBucketed(box, this._cellRange(box))
  }

  /** Drop every box placed by `owner`. */
  removeOwner(owner: string): void {
    const cells = this._ownerCells.get(owner)
    if (!cells)
      return
    for (const key of cells) {
      const bucket = this._cells.get(key)
      if (!bucket)
        continue
      const kept = bucket.filter(box => box.owner !== owner)
      if (kept.length)
        this._cells.set(key, kept)
      else
        this._cells.delete(key)
    }
    this._ownerCells.delete(owner)
  }

  clear(): void {
    this._cells.clear()
    this._ownerCells.clear()
  }

  /** Number of boxes currently placed. Diagnostics and tests. */
  get size(): number {
    const seen = new Set<CollisionBox>()
    for (const bucket of this._cells.values()) {
      for (const box of bucket)
        seen.add(box)
    }
    return seen.size
  }

  private _cellRange(box: CollisionBox): { x0: number, y0: number, x1: number, y1: number } {
    const cs = this._cellSize
    return {
      x0: Math.floor(box.minX / cs),
      y0: Math.floor(box.minY / cs),
      x1: Math.floor(box.maxX / cs),
      y1: Math.floor(box.maxY / cs),
    }
  }

  private _insertBucketed(box: CollisionBox, range: { x0: number, y0: number, x1: number, y1: number }): void {
    let ownerCells: Set<string> | undefined
    if (box.owner !== undefined) {
      ownerCells = this._ownerCells.get(box.owner)
      if (!ownerCells) {
        ownerCells = new Set()
        this._ownerCells.set(box.owner, ownerCells)
      }
    }

    for (let cy = range.y0; cy <= range.y1; cy++) {
      for (let cx = range.x0; cx <= range.x1; cx++) {
        const key = cellKey(cx, cy)
        const bucket = this._cells.get(key)
        if (bucket)
          bucket.push(box)
        else
          this._cells.set(key, [box])
        ownerCells?.add(key)
      }
    }
  }
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`
}

function overlaps(a: CollisionBox, b: CollisionBox): boolean {
  if (a.maxX < b.minX)
    return false
  if (a.minX > b.maxX)
    return false
  if (a.maxY < b.minY)
    return false
  if (a.minY > b.maxY)
    return false
  return true
}
