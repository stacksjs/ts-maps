import { Pbf } from '../proto/Pbf'

/**
 * Load a style's glyph ranges.
 *
 * A style points at glyphs with a template — `"glyphs":
 * "https://example.com/fonts/{fontstack}/{range}.pbf"` — serving signed
 * distance fields in 256-codepoint blocks. ts-maps rasterises text from system
 * fonts, which is sharper on a 2D canvas and needs no network at all, so this
 * is not how labels are drawn. What it is for is the case that cannot be
 * served locally: a style whose typeface the viewer does not have installed.
 *
 * Ranges are fetched on demand and cached, because a stack is 65,536 code
 * points and a map shows a handful of blocks.
 *
 * Wire format (Mapbox `glyphs.proto`):
 *   1 fontstack { 1 name, 2 range, 3 glyph { 1 id, 2 bitmap, 3 width,
 *                 4 height, 5 left, 6 top, 7 advance } }
 */

export interface Glyph {
  id: number
  /**
   * Alpha-only SDF, `(width + 6) * (height + 6)` bytes — the 3px border
   * Mapbox bakes around every glyph. Empty for a space.
   */
  bitmap?: Uint8Array
  width: number
  height: number
  left: number
  top: number
  advance: number
}

export type GlyphRange = Map<number, Glyph>

export interface LoadGlyphsOptions {
  signal?: AbortSignal
  /** Swapped out in tests. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch
}

/** The border Mapbox bakes around each glyph's distance field. */
export const GLYPH_BORDER = 3

/** Fill `{fontstack}` and `{range}` in a glyphs template. */
export function glyphUrl(template: string, fontstack: string, rangeStart: number): string {
  const range = `${rangeStart}-${rangeStart + 255}`
  return template
    .replace('{fontstack}', encodeURIComponent(fontstack))
    .replace('{range}', range)
}

/** The 256-codepoint block a character falls in. */
export function rangeStartFor(codePoint: number): number {
  return Math.floor(codePoint / 256) * 256
}

/** Decode one `glyphs.proto` message. */
export function decodeGlyphPbf(bytes: Uint8Array): GlyphRange {
  const glyphs: GlyphRange = new Map()
  const pbf = new Pbf(bytes)

  while (pbf.pos < pbf.length) {
    const tag = pbf.readVarint() >> 3
    if (tag !== 1) {
      pbf.skip(tag << 3)
      continue
    }

    // fontstack — length-delimited.
    const stackEnd = pbf.readVarint() + pbf.pos
    while (pbf.pos < stackEnd) {
      const value = pbf.readVarint()
      const stackTag = value >> 3
      pbf.type = value & 0x7

      if (stackTag !== 3) {
        pbf.skip(value)
        continue
      }

      const glyphEnd = pbf.readVarint() + pbf.pos
      const glyph: Glyph = { id: 0, width: 0, height: 0, left: 0, top: 0, advance: 0 }

      while (pbf.pos < glyphEnd) {
        const gv = pbf.readVarint()
        const gTag = gv >> 3
        pbf.type = gv & 0x7

        switch (gTag) {
          case 1:
            glyph.id = pbf.readVarint()
            break
          case 2:
            glyph.bitmap = pbf.readBytes()
            break
          case 3:
            glyph.width = pbf.readVarint()
            break
          case 4:
            glyph.height = pbf.readVarint()
            break
          case 5:
            glyph.left = pbf.readSVarint()
            break
          case 6:
            glyph.top = pbf.readSVarint()
            break
          case 7:
            glyph.advance = pbf.readVarint()
            break
          default:
            pbf.skip(gv)
        }
      }

      pbf.pos = glyphEnd
      glyphs.set(glyph.id, glyph)
    }

    pbf.pos = stackEnd
  }

  return glyphs
}

/**
 * Fetches glyph ranges and remembers them.
 *
 * One instance per map. A range in flight is shared rather than fetched twice,
 * which matters when several tiles decode at once and all want the same block.
 */
export class GlyphSource {
  private _template: string
  private _fetch: typeof globalThis.fetch
  private _ranges: Map<string, GlyphRange>
  private _pending: Map<string, Promise<GlyphRange>>

  constructor(template: string, options: LoadGlyphsOptions = {}) {
    this._template = template
    this._fetch = options.fetch ?? globalThis.fetch
    this._ranges = new Map()
    this._pending = new Map()
  }

  /** A glyph, if its range has already been loaded. Never fetches. */
  get(fontstack: string, codePoint: number): Glyph | undefined {
    const key = `${fontstack}/${rangeStartFor(codePoint)}`
    return this._ranges.get(key)?.get(codePoint)
  }

  /** True once the block containing `codePoint` is in memory. */
  has(fontstack: string, codePoint: number): boolean {
    return this._ranges.has(`${fontstack}/${rangeStartFor(codePoint)}`)
  }

  /** Load the block containing `codePoint`, or hand back the one in flight. */
  async load(fontstack: string, codePoint: number, signal?: AbortSignal): Promise<GlyphRange> {
    const start = rangeStartFor(codePoint)
    const key = `${fontstack}/${start}`

    const cached = this._ranges.get(key)
    if (cached)
      return cached

    const inFlight = this._pending.get(key)
    if (inFlight)
      return inFlight

    const request = (async (): Promise<GlyphRange> => {
      const url = glyphUrl(this._template, fontstack, start)
      const response = await this._fetch(url, { signal })
      if (!response.ok)
        throw new Error(`HTTP ${response.status} fetching glyphs ${url}`)

      const range = decodeGlyphPbf(new Uint8Array(await response.arrayBuffer()))
      this._ranges.set(key, range)
      this._pending.delete(key)
      return range
    })()

    this._pending.set(key, request)

    // A failed range must not poison the cache — a later attempt should be
    // able to retry rather than inherit the rejection.
    request.catch(() => this._pending.delete(key))
    return request
  }

  /** Load every range a run of text needs. */
  async loadForText(fontstack: string, text: string, signal?: AbortSignal): Promise<void> {
    const starts = new Set<number>()
    for (const ch of text)
      starts.add(rangeStartFor(ch.codePointAt(0) ?? 0))

    await Promise.all([...starts].map(start => this.load(fontstack, start, signal)))
  }

  /** Ranges currently held, for diagnostics. */
  get size(): number {
    return this._ranges.size
  }
}
