// IconAtlas — packs caller-supplied sprite entries into a single canvas.
// Sprite pixel data may come from an HTMLImageElement, an HTMLCanvasElement,
// or a raw ImageData buffer; callers keep ownership of the source bitmap.

export interface SpriteEntry {
  id: string
  x: number
  y: number
  width: number
  height: number
  pixelRatio?: number
}

export class IconAtlas {
  canvas: HTMLCanvasElement

  private _ctx: CanvasRenderingContext2D | null
  private _sprites: Map<string, SpriteEntry>
  private _cursorX: number
  private _cursorY: number
  private _rowH: number

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 512
    this.canvas.height = 512
    this._ctx = this.canvas.getContext('2d')
    this._sprites = new Map()
    this._cursorX = 0
    this._cursorY = 0
    this._rowH = 0
  }

  addSprite(entry: SpriteEntry, source: HTMLImageElement | HTMLCanvasElement | ImageData): void {
    const w = entry.width
    const h = entry.height

    if (this._cursorX + w > this.canvas.width) {
      this._cursorY += this._rowH
      this._cursorX = 0
      this._rowH = 0
    }
    if (this._cursorY + h > this.canvas.height)
      this._grow(Math.max(this.canvas.width * 2, this._cursorY + h))

    const dx = this._cursorX
    const dy = this._cursorY

    const ctx = this._ctx
    if (ctx) {
      if (isImageData(source)) {
        // Blit via a detour canvas because putImageData ignores the current
        // transform and can't honour sub-rects cleanly.
        const detour = document.createElement('canvas')
        detour.width = source.width
        detour.height = source.height
        const dctx = detour.getContext('2d')
        if (dctx) {
          dctx.putImageData(source, 0, 0)
          ctx.drawImage(detour, entry.x, entry.y, w, h, dx, dy, w, h)
        }
      }
      else {
        ctx.drawImage(source as HTMLImageElement | HTMLCanvasElement, entry.x, entry.y, w, h, dx, dy, w, h)
      }
    }

    const packed: SpriteEntry = {
      id: entry.id,
      x: dx,
      y: dy,
      width: w,
      height: h,
      pixelRatio: entry.pixelRatio ?? 1,
    }
    this._sprites.set(entry.id, packed)

    this._cursorX += w
    if (h > this._rowH)
      this._rowH = h
  }

  get(id: string): SpriteEntry | undefined {
    return this._sprites.get(id)
  }

  drawIcon(
    ctx: CanvasRenderingContext2D,
    id: string,
    dx: number,
    dy: number,
    opts?: { size?: number, rotation?: number },
  ): void {
    const s = this._sprites.get(id)
    if (!s)
      return

    const target = opts?.size ?? s.width
    const scale = target / s.width
    const w = s.width * scale
    const h = s.height * scale

    if (opts?.rotation) {
      ctx.save()
      ctx.translate(dx, dy)
      ctx.rotate(opts.rotation)
      ctx.drawImage(this.canvas, s.x, s.y, s.width, s.height, -w / 2, -h / 2, w, h)
      ctx.restore()
    }
    else {
      ctx.drawImage(this.canvas, s.x, s.y, s.width, s.height, dx - w / 2, dy - h / 2, w, h)
    }
  }

  private _grow(newSide: number): void {
    const old = this.canvas
    const target = document.createElement('canvas')
    target.width = Math.max(newSide, old.width)
    target.height = Math.max(newSide, old.height)
    const tctx = target.getContext('2d')
    if (tctx)
      tctx.drawImage(old, 0, 0)
    this.canvas = target
    this._ctx = tctx
  }
}

// `instanceof ImageData` doesn't work under harnesses that omit the global
// (e.g. some happy-dom variants). Duck-type via shape instead.
function isImageData(v: unknown): v is ImageData {
  if (!v || typeof v !== 'object')
    return false
  const anyV = v as { data?: unknown, width?: unknown, height?: unknown }
  return (
    typeof anyV.width === 'number'
    && typeof anyV.height === 'number'
    && (anyV.data instanceof Uint8ClampedArray || anyV.data instanceof Uint8Array)
  )
}
