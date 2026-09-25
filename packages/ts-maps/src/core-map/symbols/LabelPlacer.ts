import type { Vec } from './placement'
import { CollisionIndex } from './CollisionIndex'
import { placeGlyphsAlongLine } from './placement'

/**
 * Per-frame label placement, the way Apple Maps and Google Maps do it.
 *
 * Labels used to be placed once, when the camera came to rest, and carried
 * along as a picture in between. That picture is only right for a pure pan:
 * zoom and every label stays where it was on screen while the streets grow
 * under it, then the whole set jumps when the gesture ends. On a map that is
 * mostly labels, it reads as broken.
 *
 * This places every frame instead, which takes three things to make work:
 *
 *   - **Cheap frames.** Everything that depends only on the feature — text,
 *     font, size, colours, the text's own box — is resolved once per tile into
 *     a candidate (see `VectorTileMapLayer`). A frame is then a projection, a
 *     collision test and a `drawImage` per label. Text is rasterised once into
 *     a sprite, halo and all, because `strokeText` + `fillText` per label per
 *     frame is where the old pass spent most of its time.
 *   - **Stability.** Greedy placement in a fixed order is correct but twitchy:
 *     move the camera a pixel and two labels of equal rank can swap. Labels
 *     that were showing last frame are tried before ones that were not, within
 *     the same rank, so once something is on screen it stays until something
 *     that genuinely outranks it needs the space.
 *   - **Fading.** A label that wins or loses its slot fades over `fadeDuration`
 *     rather than switching, so the churn that zooming out necessarily causes
 *     looks like the map simplifying itself rather than flickering.
 *
 * And three more that keep a slow zoom from making the labels twitch:
 *
 *   - **One label across zoom levels.** A key carries a quantised position,
 *     and the same town from a z10 tile and its z11 replacement can land
 *     either side of a cell boundary. Two keys meant two labels: at every
 *     tile-level switch the one on screen dropped out and an identical copy
 *     faded in from nothing in its place. A point label that turns up under a
 *     new key within `IDENTITY_RADIUS` of one with the same `identity` last
 *     frame is that label, and carries its fade state on.
 *   - **Hysteresis.** A label that was not showing needs `HYSTERESIS` pixels
 *     more room than one that was. Without it a label whose box just touches
 *     a neighbour's appears and disappears on alternate frames as the camera
 *     creeps, which is what a slow trackpad zoom does all the way through.
 *   - **Whole device pixels.** Sprites are drawn at whole device pixels, moving
 *     or not. A bitmap blitted at a fractional offset is resampled, and the
 *     resampling changes as the offset does: text that slides smoothly by
 *     sub-pixels shimmers and swims while it goes. Snapping keeps every glyph
 *     the same shape from frame to frame, and costs a step of one device
 *     pixel — half a CSS pixel on a Retina screen.
 */

export interface LabelBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface LabelBase {
  /**
   * Identity across frames and across tiles: the same label from two tiles, or
   * from the tile it came from and its replacement a zoom level down, shares a
   * key, so it keeps its fade state instead of popping.
   */
  key: string
  /** The style layer it belongs to. */
  layer: string
  /** Style layer order, most important first. */
  rank: number
  /** `symbol-sort-key`; lower is placed first, as the style spec defines. */
  sortKey: number
  /** Tie-breaker, so placement order never depends on sort stability. */
  order: number
  allowOverlap: boolean
  ignorePlacement: boolean
  /** Extra room kept clear around the label, in CSS pixels. */
  padding: number
  /**
   * What the label says, without where it is: layer, text and icon. Two point
   * labels with the same identity within `IDENTITY_RADIUS` of each other are
   * one label, whatever their keys — see the class notes. Optional; without
   * it only the key identifies a label.
   */
  identity?: string
  /**
   * Whether a building in front hides it. True for what names a spot on the
   * ground — a street, a point of interest with its icon; false for the name
   * of an area, which floats over it in Apple Maps whatever is in the way.
   * Defaults to true.
   */
  occludable?: boolean
}

export interface PointLabel extends LabelBase {
  kind: 'point'
  /** The anchor, in the tile's own pixels. */
  x: number
  y: number
  /** Everything drawn, relative to the anchor, in CSS pixels. */
  box: LabelBox
  /** Room around `box` for halo and antialiasing, in CSS pixels. */
  bleed: number
  /** Draw the label with its anchor at the context's origin. */
  paint: (ctx: CanvasRenderingContext2D) => void
  /** Labels that would paint identically share a sprite. */
  signature: string
}

export interface LineLabel extends LabelBase {
  kind: 'line'
  /** The line, in the tile's own pixels. */
  line: Vec[]
  /** Distance along `line` of the label's centre, in the tile's own pixels. */
  anchor: number
  /** The text itself, so repeats of one name can be kept apart. */
  text: string
  /**
   * The closest, in screen pixels, two copies of this name may sit. Spacing
   * is laid out per tile, so without this a street crossing a tile edge — or
   * split into several features — is named twice a few blocks apart.
   */
  repeatDistance: number
  chars: string[]
  advances: number[]
  width: number
  height: number
  maxAngle: number
  bleed: number
  /** Draw one glyph with its left edge at the origin, riding on the line. */
  paintGlyph: (ctx: CanvasRenderingContext2D, char: string) => void
  /** Everything about the glyphs' look but the character itself. */
  signature: string
}

export type LabelCandidate = PointLabel | LineLabel

export interface LabelGroup {
  labels: LabelCandidate[]
  /** Tile pixels to container pixels, as the camera is right now. */
  project: (x: number, y: number) => Vec | null
}

export interface PlaceFrameOptions {
  width: number
  height: number
  /** Device pixel ratio of the target canvas. */
  ratio: number
  /** `performance.now()` for this frame. */
  now: number
  /**
   * Snap point labels to whole device pixels. On by default, moving or not:
   * see the class notes for why gliding by sub-pixels looks worse than
   * stepping by device pixels. `false` is for callers that scale the canvas
   * afterwards, where the snap would be undone anyway.
   */
  snap?: boolean
  /**
   * Whether the ground under a screen point is hidden from the camera — by a
   * 3D building, say. A hidden label fades out and claims no space.
   */
  occluded?: (x: number, y: number, key: string) => boolean
}

interface Sprite {
  canvas: HTMLCanvasElement
  /** Device pixels from the sprite's top-left to the anchor. */
  ox: number
  oy: number
}

interface FadeState {
  opacity: number
  /** Whether it won its slot last frame. */
  placed: boolean
}

interface Placed {
  label: LabelCandidate
  x: number
  y: number
  glyphs?: Array<{ x: number, y: number, angle: number, index: number }>
  state: FadeState
}

/** Screen margin a label's anchor may sit outside the view and still count. */
const CULL_MARGIN = 96
/**
 * How far, in CSS pixels, a point label may move between frames and still be
 * recognised under a new key. The same place from two zoom levels differs by
 * the tiles' quantisation — a fraction of a pixel — so this is generous; two
 * different places with the same name are much further apart than this, or
 * they would be drawn on top of each other anyway.
 */
export const IDENTITY_RADIUS = 6
/**
 * Extra clearance, in CSS pixels, a label needs to take a slot it did not have
 * last frame. See the class notes.
 */
export const HYSTERESIS = 3
const SPRITE_CACHE_LIMIT = 4000

export class LabelPlacer {
  /** Milliseconds for a label to fade fully in or out. */
  fadeDuration: number
  _states: Map<string, FadeState>
  _sprites: Map<string, Sprite | null>
  _spriteRatio: number
  _lastTime: number
  /**
   * Last frame's point labels by `identity`, with where they were and their
   * fade state, so a label that reappears under a new key can be matched.
   */
  _lastSeen: Map<string, Array<{ x: number, y: number, state: FadeState }>>

  constructor(options?: { fadeDuration?: number }) {
    this.fadeDuration = options?.fadeDuration ?? 200
    this._states = new Map()
    this._sprites = new Map()
    this._spriteRatio = 0
    this._lastTime = 0
    this._lastSeen = new Map()
  }

  /** Forget every fade, as after a style change: nothing carries over. */
  reset(): void {
    this._states.clear()
    this._sprites.clear()
    this._lastSeen.clear()
    this._lastTime = 0
  }

  /**
   * The fade state a label carries into this frame: its own, or — for a point
   * label seen for the first time under this key — that of the label with the
   * same identity that was in the same spot last frame.
   */
  _stateFor(label: LabelCandidate, x: number, y: number): FadeState | undefined {
    const own = this._states.get(label.key)
    if (own || label.kind !== 'point' || !label.identity)
      return own
    let best: FadeState | undefined
    let bestDistance = IDENTITY_RADIUS * IDENTITY_RADIUS
    for (const seen of this._lastSeen.get(label.identity) ?? []) {
      const dx = seen.x - x
      const dy = seen.y - y
      const distance = dx * dx + dy * dy
      if (distance <= bestDistance) {
        best = seen.state
        bestDistance = distance
      }
    }
    if (best)
      this._states.set(label.key, best)
    return best
  }

  /**
   * Place and draw one frame. Returns true while a fade is still running, so
   * the caller knows to come back next frame even if the camera has stopped.
   */
  drawFrame(ctx: CanvasRenderingContext2D, groups: LabelGroup[], options: PlaceFrameOptions): boolean {
    const { width, height, ratio, now } = options

    // Sprites are rasterised for one pixel ratio. Moving the window to a
    // different screen invalidates all of them at once.
    if (ratio !== this._spriteRatio) {
      this._sprites.clear()
      this._spriteRatio = ratio
    }

    // The first frame after a quiet spell must not fade by however long the
    // quiet spell lasted, or everything would appear at full opacity at once.
    const gap = now - this._lastTime
    const elapsed = this._lastTime && gap >= 0 && gap < 100 ? gap : 16
    this._lastTime = now
    const step = this.fadeDuration > 0 ? elapsed / this.fadeDuration : 1

    // --- Project everything that could be on screen ------------------------
    const live: Placed[] = []
    for (const group of groups) {
      for (const label of group.labels) {
        const entry = label.kind === 'point'
          ? projectPoint(label, group.project, width, height)
          : projectLine(label, group.project, width, height)
        if (!entry)
          continue
        const state = this._stateFor(label, entry.x, entry.y)
        live.push({ label, x: entry.x, y: entry.y, glyphs: entry.glyphs, state: state ?? { opacity: 0, placed: false } })
      }
    }

    // --- Decide who gets a slot --------------------------------------------
    live.sort((a, b) =>
      a.label.rank - b.label.rank
      || a.label.sortKey - b.label.sortKey
      || Number(b.state.placed) - Number(a.state.placed)
      || a.label.order - b.label.order,
    )

    const collision = new CollisionIndex()
    const seen = new Set<string>()
    // Fade states already decided this frame. Two keys can share one — the
    // same label from two zoom levels — and only the first copy is drawn.
    const decided = new Set<FadeState>()
    // Point labels handled so far, by identity, for this frame's `_lastSeen`
    // and to drop a second copy of one sitting on top of the first.
    const points = new Map<string, Array<{ x: number, y: number, state: FadeState }>>()
    // Centres of the line labels placed so far, by layer and name.
    const named = new Map<string, Vec[]>()
    const shown: Placed[] = []
    let fading = false

    for (const item of live) {
      const { label } = item
      // The same label from two tiles — a feature in both tiles' buffers, or a
      // tile and its not-yet-replaced parent. First one wins; the rest are it.
      if (seen.has(label.key))
        continue
      seen.add(label.key)
      if (decided.has(item.state))
        continue
      if (label.kind === 'point' && label.identity) {
        const list = points.get(label.identity)
        const twin = list?.find(p => (p.x - item.x) ** 2 + (p.y - item.y) ** 2 <= IDENTITY_RADIUS * IDENTITY_RADIUS)
        if (twin) {
          // The same label again: it shares the fate of the copy drawn.
          this._states.set(label.key, twin.state)
          continue
        }
        const record = { x: item.x, y: item.y, state: item.state }
        if (list)
          list.push(record)
        else
          points.set(label.identity, [record])
      }
      decided.add(item.state)

      const box = screenBox(item)
      let repeatKey = ''
      let centre: Vec | null = null
      let tooClose = false
      if (label.kind === 'line' && label.repeatDistance > 0) {
        repeatKey = `${label.layer}\u0000${label.text}`
        centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
        const limit = label.repeatDistance * label.repeatDistance
        for (const other of named.get(repeatKey) ?? []) {
          const dx = other.x - centre.x
          const dy = other.y - centre.y
          if (dx * dx + dy * dy < limit) {
            tooClose = true
            break
          }
        }
      }

      // Behind a building: tested at the anchor for a point label and the
      // middle of the run for a street name. Asked only of a label that would
      // otherwise have its slot — the test is the costly one.
      const hidden = (): boolean => !!options.occluded && label.occludable !== false && (label.kind === 'point'
        ? options.occluded(item.x, item.y, label.key)
        : options.occluded((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, label.key))

      // A newcomer has to clear its neighbours by a margin; a label already
      // showing only has to not overlap them.
      const test = item.state.placed ? box : inflate(box, HYSTERESIS)

      let placed: boolean
      if (tooClose) {
        placed = false
      }
      else if (!label.allowOverlap && !label.ignorePlacement && collision.hits(test)) {
        placed = false
      }
      else if (hidden()) {
        placed = false
      }
      else if (label.allowOverlap) {
        if (!label.ignorePlacement)
          collision.insert(box)
        placed = true
      }
      else if (label.ignorePlacement) {
        placed = !collision.hits(test)
      }
      else {
        // Already known to fit: `test` contains `box`.
        collision.insert(box)
        placed = true
      }
      if (placed && centre) {
        const list = named.get(repeatKey)
        if (list)
          list.push(centre)
        else
          named.set(repeatKey, [centre])
      }

      const state = item.state
      if (!this._states.has(label.key))
        this._states.set(label.key, state)
      state.placed = placed
      state.opacity = placed ? Math.min(1, state.opacity + step) : Math.max(0, state.opacity - step)
      if (placed ? state.opacity < 1 : state.opacity > 0)
        fading = true
      if (state.opacity > 0)
        shown.push(item)
    }

    // A label that left the view, or whose tile went away, has nothing left to
    // fade from. Dropping it means it fades in afresh if it comes back.
    for (const key of this._states.keys()) {
      if (!seen.has(key))
        this._states.delete(key)
    }
    this._lastSeen = points

    // --- Draw ---------------------------------------------------------------
    // Back to front: the most important label is placed first and drawn last,
    // so if a fading label and its replacement overlap, the winner is on top.
    for (let i = shown.length - 1; i >= 0; i--) {
      const item = shown[i]!
      ctx.globalAlpha = item.state.opacity
      if (item.label.kind === 'point')
        this._drawPoint(ctx, item.label, item.x, item.y, ratio, options.snap !== false)
      else if (item.glyphs)
        this._drawLine(ctx, item.label, item.glyphs, ratio)
    }
    ctx.globalAlpha = 1
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

    this._trimSprites()
    return fading
  }

  _drawPoint(ctx: CanvasRenderingContext2D, label: PointLabel, x: number, y: number, ratio: number, snap: boolean): void {
    const sprite = this._sprite(label.signature, () => rasterise(label.box, label.bleed, ratio, label.paint))
    if (!sprite)
      return
    const dx = snap ? Math.round(x * ratio) : x * ratio
    const dy = snap ? Math.round(y * ratio) : y * ratio
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(sprite.canvas, dx - sprite.ox, dy - sprite.oy)
  }

  _drawLine(ctx: CanvasRenderingContext2D, label: LineLabel, glyphs: NonNullable<Placed['glyphs']>, ratio: number): void {
    for (const glyph of glyphs) {
      const char = label.chars[glyph.index]!
      const advance = label.advances[glyph.index]!
      const sprite = this._sprite(`${label.signature}\u0000${char}`, () => rasterise(
        { minX: 0, minY: -label.height, maxX: advance, maxY: label.height },
        label.bleed,
        ratio,
        c => label.paintGlyph(c, char),
      ))
      if (!sprite)
        continue
      const cos = Math.cos(glyph.angle)
      const sin = Math.sin(glyph.angle)
      ctx.setTransform(cos, sin, -sin, cos, glyph.x * ratio, glyph.y * ratio)
      ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy)
    }
  }

  _sprite(key: string, build: () => Sprite | null): Sprite | null {
    const cached = this._sprites.get(key)
    if (cached !== undefined) {
      // Re-inserting keeps the Map in least-recently-used order for trimming.
      this._sprites.delete(key)
      this._sprites.set(key, cached)
      return cached
    }
    const sprite = build()
    this._sprites.set(key, sprite)
    return sprite
  }

  _trimSprites(): void {
    if (this._sprites.size <= SPRITE_CACHE_LIMIT)
      return
    let excess = this._sprites.size - SPRITE_CACHE_LIMIT * 0.75
    for (const key of this._sprites.keys()) {
      if (excess-- <= 0)
        break
      this._sprites.delete(key)
    }
  }
}

function projectPoint(label: PointLabel, project: LabelGroup['project'], width: number, height: number): { x: number, y: number, glyphs?: undefined } | null {
  const at = project(label.x, label.y)
  if (!at)
    return null
  if (at.x < -CULL_MARGIN || at.y < -CULL_MARGIN || at.x > width + CULL_MARGIN || at.y > height + CULL_MARGIN)
    return null
  return { x: at.x, y: at.y }
}

/**
 * Lay a line label out along its road as the road looks right now.
 *
 * The label keeps its place on the road — the anchor is a distance along the
 * line in the tile's own pixels, carried to screen space every frame — so a
 * street name rides with its street through a zoom instead of sliding along
 * it the way it would if the anchors were re-spaced on screen.
 */
function projectLine(label: LineLabel, project: LabelGroup['project'], width: number, height: number): { x: number, y: number, glyphs: NonNullable<Placed['glyphs']> } | null {
  const src = label.line
  const screen: Vec[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  // Screen distance of the anchor, found while walking the line.
  let anchor = -1
  let travelledSrc = 0
  let travelledScreen = 0

  for (let i = 0; i < src.length; i++) {
    const at = project(src[i]!.x, src[i]!.y)
    if (!at)
      return null
    screen.push(at)
    if (at.x < minX) minX = at.x
    if (at.y < minY) minY = at.y
    if (at.x > maxX) maxX = at.x
    if (at.y > maxY) maxY = at.y

    if (i > 0) {
      const a = src[i - 1]!
      const b = src[i]!
      const segSrc = Math.hypot(b.x - a.x, b.y - a.y)
      const prev = screen[i - 1]!
      const segScreen = Math.hypot(at.x - prev.x, at.y - prev.y)
      if (anchor < 0 && segSrc > 0 && travelledSrc + segSrc >= label.anchor)
        anchor = travelledScreen + ((label.anchor - travelledSrc) / segSrc) * segScreen
      travelledSrc += segSrc
      travelledScreen += segScreen
    }
  }

  if (anchor < 0)
    return null
  if (maxX < -CULL_MARGIN || maxY < -CULL_MARGIN || minX > width + CULL_MARGIN || minY > height + CULL_MARGIN)
    return null

  const glyphs = placeGlyphsAlongLine(screen, {
    advances: label.advances,
    start: anchor - label.width / 2,
    maxAngle: label.maxAngle,
  })
  if (!glyphs)
    return null
  return { x: glyphs[0]!.x, y: glyphs[0]!.y, glyphs }
}

function inflate(box: LabelBox, by: number): LabelBox {
  return { minX: box.minX - by, minY: box.minY - by, maxX: box.maxX + by, maxY: box.maxY + by }
}

function screenBox(item: Placed): LabelBox {
  const pad = item.label.padding
  if (item.label.kind === 'point') {
    const box = item.label.box
    return { minX: item.x + box.minX - pad, minY: item.y + box.minY - pad, maxX: item.x + box.maxX + pad, maxY: item.y + box.maxY + pad }
  }

  // One box around the whole label: reserving per glyph would let another
  // label thread through the gaps between characters.
  const label = item.label
  const half = label.height / 2
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const g of item.glyphs!) {
    const advance = label.advances[g.index]!
    const cos = Math.cos(g.angle)
    const sin = Math.sin(g.angle)
    // The glyph's two ends along the line, each widened by half the height
    // across it.
    const ex = g.x + cos * advance
    const ey = g.y + sin * advance
    const nx = Math.abs(sin) * half
    const ny = Math.abs(cos) * half
    minX = Math.min(minX, g.x - nx, ex - nx)
    maxX = Math.max(maxX, g.x + nx, ex + nx)
    minY = Math.min(minY, g.y - ny, ey - ny)
    maxY = Math.max(maxY, g.y + ny, ey + ny)
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

/** Draw `paint` once into a canvas of its own, at device resolution. */
function rasterise(box: LabelBox, bleed: number, ratio: number, paint: (ctx: CanvasRenderingContext2D) => void): Sprite | null {
  if (typeof document === 'undefined')
    return null
  const left = Math.floor((box.minX - bleed) * ratio)
  const top = Math.floor((box.minY - bleed) * ratio)
  const w = Math.ceil((box.maxX + bleed) * ratio) - left
  const h = Math.ceil((box.maxY + bleed) * ratio) - top
  // Nothing sensible is a sixteen-megapixel label; refuse rather than
  // allocate one.
  if (!(w > 0 && h > 0) || w * h > 4_000_000)
    return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return null
  ctx.setTransform(ratio, 0, 0, ratio, -left, -top)
  paint(ctx)
  return { canvas, ox: -left, oy: -top }
}
