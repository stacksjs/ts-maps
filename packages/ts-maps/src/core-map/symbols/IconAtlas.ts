import { renderSdfPixels } from './sdf'

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
  /**
   * A signed-distance icon rather than a picture.
   *
   * The sheet stores distance-from-edge in the alpha channel instead of the
   * icon's own colours, which is what lets one grey shape serve every
   * `icon-color` in a style — and stay crisp at any size, since the edge is
   * recovered from the field rather than resampled from pixels.
   */
  sdf?: boolean
}

export interface DrawIconOptions {
  size?: number
  rotation?: number
  /** Fill for an SDF icon. Ignored by ordinary sprites, which carry colours. */
  color?: string
  opacity?: number
  haloColor?: string
  /** Halo width in icon pixels. */
  haloWidth?: number
}

export class IconAtlas {
  canvas: HTMLCanvasElement

  private _ctx: CanvasRenderingContext2D | null
  private _sprites: Map<string, SpriteEntry>
  private _cursorX: number
  private _cursorY: number
  private _rowH: number
  private _sdfCache: Map<string, HTMLCanvasElement>

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 512
    this.canvas.height = 512
    this._ctx = this.canvas.getContext('2d')
    this._sprites = new Map()
    this._cursorX = 0
    this._cursorY = 0
    this._rowH = 0
    this._sdfCache = new Map()
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
      sdf: entry.sdf,
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
    opts?: DrawIconOptions,
  ): void {
    const s = this._sprites.get(id)
    if (!s)
      return

    const target = opts?.size ?? s.width
    const scale = target / s.width
    const w = s.width * scale
    const h = s.height * scale

    // An SDF icon is a shape, not a picture: it has to be resolved to pixels
    // at the colour and size being asked for. That result is cached, because
    // a style typically draws the same handful of icons in the same handful
    // of colours across every tile on screen.
    const source = s.sdf ? this._renderSdf(s, opts) : this.canvas
    const sx = source === this.canvas ? s.x : 0
    const sy = source === this.canvas ? s.y : 0

    const previousAlpha = ctx.globalAlpha
    const opacity = opts?.opacity
    if (opacity !== undefined && opacity < 1)
      ctx.globalAlpha = previousAlpha * Math.max(0, opacity)

    if (opts?.rotation) {
      ctx.save()
      ctx.translate(dx, dy)
      ctx.rotate(opts.rotation)
      ctx.drawImage(source, sx, sy, s.width, s.height, -w / 2, -h / 2, w, h)
      ctx.restore()
    }
    else {
      ctx.drawImage(source, sx, sy, s.width, s.height, dx - w / 2, dy - h / 2, w, h)
    }

    ctx.globalAlpha = previousAlpha
  }

  /**
   * Resolve one SDF icon to a coloured bitmap.
   *
   * The alpha channel holds distance from the shape's edge, encoded so that
   * 0.5 is the edge itself. Recovering the icon means thresholding there —
   * which is the whole point of the format, since it stays sharp however far
   * the icon is scaled — with a narrow band either side so the result is
   * antialiased rather than jagged.
   *
   * A halo comes free from the same field: it is the identical test against a
   * lower threshold, drawn underneath.
   */
  private _renderSdf(entry: SpriteEntry, opts?: DrawIconOptions): HTMLCanvasElement {
    const color = opts?.color ?? '#000000'
    const haloColor = opts?.haloColor
    const haloWidth = opts?.haloWidth ?? 0
    const key = `${entry.id}|${color}|${haloColor ?? ''}|${haloWidth}`

    const cached = this._sdfCache.get(key)
    if (cached)
      return cached

    const w = entry.width
    const h = entry.height
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const octx = out.getContext('2d')
    const src = this._ctx
    if (!octx || !src)
      return out

    let field: ImageData
    try {
      field = src.getImageData(entry.x, entry.y, w, h)
    }
    catch {
      // A tainted sheet cannot be read back. Nothing useful to draw.
      return out
    }

    const pixels = octx.createImageData(w, h)
    pixels.data.set(renderSdfPixels(field.data, w, h, { color, haloColor, haloWidth }))
    octx.putImageData(pixels, 0, 0)

    // Unbounded growth would be a leak under a data-driven `icon-color`; the
    // cache is capped because the alternative is worse, not because entries
    // go stale.
    if (this._sdfCache.size > 128)
      this._sdfCache.clear()
    this._sdfCache.set(key, out)
    return out
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
