// Drawing text from a glyph server's distance fields.
//
// Labels are normally rasterised from system fonts, which is sharper on a 2D
// canvas than resampling a distance field and needs no network at all. This is
// the case that cannot be served locally: a style naming a typeface the viewer
// does not have installed. Without it, `text-font: ["Noto Sans Regular"]`
// silently renders in whatever the fallback stack resolves to — usually not
// wrong enough to notice, and never what the style asked for.
//
// The format is the same one SDF icons use, so the colouring is the same
// arithmetic: alpha holds distance from the glyph's edge, thresholded at 0.5
// with a narrow band for antialiasing. Mapbox bakes a fixed border around each
// glyph and rasterises at a fixed em size; both are constants here rather than
// anything to discover per font.

import type { Glyph, GlyphRange } from './loadGlyphs'
import { GLYPH_BORDER } from './loadGlyphs'
import { renderSdfPixels } from './sdf'

/** The em size Mapbox's glyph generator rasterises at. */
export const GLYPH_EM = 24

export interface GlyphDrawOptions {
  size: number
  color: string
  haloColor?: string
  haloWidth?: number
}

export interface GlyphTextMetrics {
  width: number
  height: number
  ascent: number
  descent: number
}

/**
 * Look glyphs up for a run of text.
 *
 * Returns `null` if any character's range has not been loaded, because a label
 * drawn with holes in it is worse than a label that appears a moment later.
 * The caller's job on `null` is to request the ranges and redraw.
 */
export function glyphsFor(range: (codePoint: number) => Glyph | undefined, text: string): Glyph[] | null {
  const glyphs: Glyph[] = []
  for (const char of text) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined)
      continue
    const glyph = range(codePoint)
    if (!glyph)
      return null
    glyphs.push(glyph)
  }
  return glyphs
}

/** Measure a run laid out from server glyphs. */
export function measureGlyphs(glyphs: Glyph[], size: number): GlyphTextMetrics {
  const scale = size / GLYPH_EM
  let width = 0
  let top = 0
  let bottom = 0

  for (const glyph of glyphs) {
    width += glyph.advance * scale
    // `top` is the distance from the baseline up to the bitmap's top edge, so
    // a glyph that sits below the baseline has a negative one.
    top = Math.max(top, glyph.top * scale)
    bottom = Math.max(bottom, (glyph.height - glyph.top) * scale)
  }

  // Fall back to the em box for a run of spaces, so an all-whitespace label
  // still reserves a sensible height rather than collapsing to nothing.
  const ascent = top || size * 0.8
  const descent = bottom || size * 0.2
  return { width, height: ascent + descent, ascent, descent }
}

/**
 * Draw a run of server glyphs with `x` at its left edge and `y` on its
 * baseline — the same contract as the canvas text path, so a caller does not
 * have to know which one it got.
 */
export function drawGlyphs(
  ctx: CanvasRenderingContext2D,
  glyphs: Glyph[],
  x: number,
  y: number,
  options: GlyphDrawOptions,
  cache?: GlyphBitmapCache,
): void {
  const scale = options.size / GLYPH_EM
  let cursor = x

  for (const glyph of glyphs) {
    // A space has an advance and no bitmap.
    if (glyph.bitmap && glyph.width > 0 && glyph.height > 0) {
      const bitmap = cache
        ? cache.get(glyph, options)
        : renderGlyphBitmap(glyph, options)

      if (bitmap) {
        // The border is baked into the bitmap on every side, and the glyph's
        // own `left`/`top` are measured from the glyph, not the padded box.
        const w = (glyph.width + GLYPH_BORDER * 2) * scale
        const h = (glyph.height + GLYPH_BORDER * 2) * scale
        const dx = cursor + (glyph.left - GLYPH_BORDER) * scale
        const dy = y - (glyph.top + GLYPH_BORDER) * scale
        ctx.drawImage(bitmap, dx, dy, w, h)
      }
    }
    cursor += glyph.advance * scale
  }
}

/** Colour one glyph's field into a bitmap ready to blit. */
export function renderGlyphBitmap(glyph: Glyph, options: GlyphDrawOptions): HTMLCanvasElement | null {
  if (!glyph.bitmap)
    return null

  const w = glyph.width + GLYPH_BORDER * 2
  const h = glyph.height + GLYPH_BORDER * 2
  if (glyph.bitmap.length < w * h)
    return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return null

  // The server sends alpha only; `renderSdfPixels` reads the alpha channel of
  // an RGBA buffer, so the field is widened into one.
  const field = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++)
    field[i * 4 + 3] = glyph.bitmap[i]

  const pixels = ctx.createImageData(w, h)
  pixels.data.set(renderSdfPixels(field, w, h, {
    color: options.color,
    haloColor: options.haloColor,
    haloWidth: options.haloWidth,
  }))
  ctx.putImageData(pixels, 0, 0)
  return canvas
}

/**
 * Coloured glyph bitmaps, keyed by glyph and appearance.
 *
 * A label is redrawn on every pan and zoom, and the same few hundred glyphs
 * recur across every tile on screen; colouring each field per frame would be
 * the most expensive thing the renderer does.
 */
export class GlyphBitmapCache {
  private _entries: Map<string, HTMLCanvasElement | null>
  private _limit: number

  constructor(limit = 2048) {
    this._entries = new Map()
    this._limit = limit
  }

  get(glyph: Glyph, options: GlyphDrawOptions): HTMLCanvasElement | null {
    // Size is not part of the key: the bitmap is drawn scaled, so one
    // rasterisation serves every size — which is the reason to use a distance
    // field rather than a bitmap font in the first place.
    const key = `${glyph.id}|${options.color}|${options.haloColor ?? ''}|${options.haloWidth ?? 0}`
    if (this._entries.has(key))
      return this._entries.get(key) ?? null

    const bitmap = renderGlyphBitmap(glyph, options)
    if (this._entries.size >= this._limit)
      this._entries.clear()
    this._entries.set(key, bitmap)
    return bitmap
  }

  clear(): void {
    this._entries.clear()
  }

  get size(): number {
    return this._entries.size
  }
}

/** A `GlyphRange` as the lookup `glyphsFor` wants. */
export function rangeLookup(ranges: GlyphRange[]): (codePoint: number) => Glyph | undefined {
  return (codePoint) => {
    for (const range of ranges) {
      const glyph = range.get(codePoint)
      if (glyph)
        return glyph
    }
    return undefined
  }
}
