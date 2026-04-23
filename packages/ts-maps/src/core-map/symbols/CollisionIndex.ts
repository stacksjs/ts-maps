// CollisionIndex — uniform grid collision detector for symbol placement.
// Each inserted box is bucketed into every cell it overlaps; `tryInsert`
// rejects when a colliding neighbour has priority >= the new box's.

export interface CollisionBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  priority?: number
}

export interface CollisionIndexOptions {
  width: number
  height: number
  cellSize?: number
}

export class CollisionIndex {
  private _cellSize: number
  private _cols: number
  private _rows: number
  private _cells: CollisionBox[][]

  constructor(opts?: CollisionIndexOptions) {
    this._cellSize = opts?.cellSize ?? 64
    const width = opts?.width ?? 1
    const height = opts?.height ?? 1
    this._cols = Math.max(1, Math.ceil(width / this._cellSize))
    this._rows = Math.max(1, Math.ceil(height / this._cellSize))
    this._cells = []
    for (let i = 0; i < this._cols * this._rows; i++)
      this._cells.push([])
  }

  tryInsert(box: CollisionBox): boolean {
    const range = this._cellRange(box)
    for (let cy = range.y0; cy <= range.y1; cy++) {
      for (let cx = range.x0; cx <= range.x1; cx++) {
        const bucket = this._cells[cy * this._cols + cx]
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

  clear(): void {
    for (let i = 0; i < this._cells.length; i++)
      this._cells[i] = []
  }

  private _cellRange(box: CollisionBox): { x0: number, y0: number, x1: number, y1: number } {
    const cs = this._cellSize
    let x0 = Math.floor(box.minX / cs)
    let y0 = Math.floor(box.minY / cs)
    let x1 = Math.floor(box.maxX / cs)
    let y1 = Math.floor(box.maxY / cs)
    if (x0 < 0)
      x0 = 0
    if (y0 < 0)
      y0 = 0
    if (x1 > this._cols - 1)
      x1 = this._cols - 1
    if (y1 > this._rows - 1)
      y1 = this._rows - 1
    // Boxes fully off the grid land in the nearest edge cell so they still
    // collide with neighbours that overlap the boundary.
    if (x1 < x0)
      x1 = x0
    if (y1 < y0)
      y1 = y0
    return { x0, y0, x1, y1 }
  }

  private _insertBucketed(box: CollisionBox, range: { x0: number, y0: number, x1: number, y1: number }): void {
    for (let cy = range.y0; cy <= range.y1; cy++) {
      for (let cx = range.x0; cx <= range.x1; cx++) {
        this._cells[cy * this._cols + cx].push(box)
      }
    }
  }
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
