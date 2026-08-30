import type { CollisionIndex } from './CollisionIndex'

/**
 * The canvas labels are drawn on, above the tiles rather than inside them.
 *
 * Symbols used to be painted into each tile's own canvas, which had three
 * consequences worth undoing:
 *
 *   - **WebGL tiles had no labels at all.** A canvas bound to a WebGL context
 *     cannot also hand out a 2D context, so the symbol pass was skipped
 *     entirely — you opted into the faster renderer and silently lost every
 *     piece of text on the map.
 *   - **Rotation was baked in.** Placement happened once, when the tile was
 *     drawn, so turning the map carried the labels round with it: text upside
 *     down at a bearing of 180, and collision boxes still computed for north.
 *   - **Labels stopped at tile edges**, because a tile can only draw inside
 *     itself however wide the collision index's view is.
 *
 * One viewport-sized canvas fixes all three. It lives in the map's own
 * `symbolPane`, which sits above the tiles and below markers and popups — a
 * marker should never end up behind a street name — and which the map
 * counter-rotates, so placement is done in screen space and glyphs stay
 * upright however the map is turned.
 *
 * Redrawing happens at settled moments: the end of a pan, a zoom, a rotation,
 * or when tiles arrive. In between the pane carries the canvas along with the
 * map, so labels stay stuck to the ground without re-placing hundreds of them
 * every frame.
 */
export interface SymbolOverlayHost {
  /** Draw every symbol into `ctx`, in container pixels. */
  drawSymbols: (ctx: CanvasRenderingContext2D, collision: CollisionIndex) => void
  /** A fresh collision index for one pass. */
  createCollisionIndex: () => CollisionIndex
}

export class SymbolOverlay {
  declare canvas: HTMLCanvasElement | null
  declare _map: any
  declare _host: SymbolOverlayHost
  declare _ratio: number
  declare _frame: number | null

  constructor(map: any, host: SymbolOverlayHost) {
    this._map = map
    this._host = host
    this.canvas = null
    this._ratio = 1
    this._frame = null
    this._attach()
  }

  _attach(): void {
    // The symbol pane, not the container: it sits above the tiles and below
    // markers and popups, and the map counter-rotates it so text stays
    // upright when the map turns.
    const pane = this._map?.getPane?.('symbolPane') ?? this._map?.getContainer?.()
    if (!pane || typeof pane.appendChild !== 'function')
      return

    const container = pane
    const doc = container.ownerDocument ?? document
    const canvas = doc.createElement('canvas')
    canvas.className = 'tsmap-symbol-overlay'
    // Never a pointer target: the tiles below it own hit-testing, and a
    // full-viewport canvas would otherwise swallow every drag and click.
    if (canvas.style) {
      canvas.style.position = 'absolute'
      canvas.style.top = '0'
      canvas.style.left = '0'
      canvas.style.pointerEvents = 'none'
    }
    container.appendChild(canvas)
    this.canvas = canvas
    this._resize()
  }

  _pixelRatio(): number {
    const ratio = typeof window !== 'undefined' ? window.devicePixelRatio : 1
    return Math.min(2, Math.max(1, ratio || 1))
  }

  _resize(): void {
    const canvas = this.canvas
    const map = this._map
    if (!canvas || !map?.getSize)
      return

    const size = map.getSize()
    const ratio = this._pixelRatio()
    this._ratio = ratio
    canvas.width = Math.max(1, Math.round(size.x * ratio))
    canvas.height = Math.max(1, Math.round(size.y * ratio))
    if (canvas.style) {
      canvas.style.width = `${size.x}px`
      canvas.style.height = `${size.y}px`
    }
  }

  /**
   * Park the canvas over the viewport.
   *
   * Its pane travels with the map, which is what makes labels stick to the
   * ground during a drag for free — but it also means the canvas drifts out of
   * view unless the pane's offset is cancelled here. Undone and redone around
   * each redraw, so the pixels only ever have to be right at rest.
   */
  _position(): void {
    const canvas = this.canvas
    const pos = this._map?._getMapPanePos?.()
    if (!canvas?.style || !pos)
      return
    canvas.style.transform = `translate3d(${-pos.x}px, ${-pos.y}px, 0)`
  }

  /** Redraw at the next frame, collapsing bursts into one pass. */
  schedule(): void {
    if (this._frame !== null || typeof requestAnimationFrame !== 'function') {
      if (typeof requestAnimationFrame !== 'function')
        this.redraw()
      return
    }
    this._frame = requestAnimationFrame(() => {
      this._frame = null
      this.redraw()
    })
  }

  redraw(): void {
    const canvas = this.canvas
    const map = this._map
    if (!canvas || !map)
      return

    const size = map.getSize?.()
    if (size && (canvas.width !== Math.round(size.x * this._ratio) || canvas.height !== Math.round(size.y * this._ratio)))
      this._resize()

    const ctx = canvas.getContext('2d')
    if (!ctx)
      return

    this._position()

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(this._ratio, 0, 0, this._ratio, 0, 0)

    // One index per pass. Nothing survives a redraw, so no eviction is needed
    // and a label can never collide with a stale copy of itself.
    this._host.drawSymbols(ctx, this._host.createCollisionIndex())
  }

  remove(): void {
    if (this._frame !== null && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(this._frame)
    this._frame = null
    this.canvas?.remove?.()
    this.canvas = null
  }
}
