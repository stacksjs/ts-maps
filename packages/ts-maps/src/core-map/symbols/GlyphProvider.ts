// The renderer's view of a style's glyph server.
//
// Text is drawn from system fonts wherever the viewer has them, which is
// sharper on a 2D canvas than resampling a distance field and costs no
// network. This is the case that cannot be answered locally: a style naming a
// typeface the viewer does not have. Until now the loader existed and nothing
// consulted it, so `text-font: ["Noto Sans Regular"]` on a machine without
// Noto Sans quietly rendered in the fallback stack — close enough to miss, and
// never what the style asked for.
//
// Loading is asynchronous and drawing is not, so the contract is: ask for the
// glyphs, get them or get `null`, and on `null` the label is skipped this pass
// and the provider schedules a redraw once the range arrives. A label that
// appears a frame late is better than one drawn with holes in it, and far
// better than one drawn in the wrong typeface.

import type { Glyph, GlyphSource } from './loadGlyphs'
import { GlyphBitmapCache, glyphsFor } from './GlyphRenderer'
import { rangeStartFor } from './loadGlyphs'

export interface GlyphProviderOptions {
  source: GlyphSource
  /** Whether the viewer already has this font stack installed. */
  // eslint-disable-next-line no-unused-vars
  isFontAvailable: (fontStack: string | string[] | undefined) => boolean
  /** Called when a requested range arrives and the map should redraw. */
  onLoad: () => void
}

export class GlyphProvider {
  cache: GlyphBitmapCache

  private _source: GlyphSource
  private _available: GlyphProviderOptions['isFontAvailable']
  private _onLoad: () => void
  private _requested: Set<string>
  private _availability: Map<string, boolean>

  constructor(options: GlyphProviderOptions) {
    this._source = options.source
    this._available = options.isFontAvailable
    this._onLoad = options.onLoad
    this._requested = new Set()
    this._availability = new Map()
    this.cache = new GlyphBitmapCache()
  }

  /**
   * Should this font stack come from the server?
   *
   * `document.fonts.check` is not free and a style uses a handful of stacks
   * across thousands of labels, so the answer is remembered.
   */
  needsServer(fontStack: string | string[] | undefined): boolean {
    const key = stackKey(fontStack)
    const cached = this._availability.get(key)
    if (cached !== undefined)
      return !cached

    const available = this._available(fontStack)
    this._availability.set(key, available)
    return !available
  }

  /**
   * The glyphs for a run of text, or `null` while any of them are still on
   * their way. Requesting is a side effect of asking, because the caller that
   * wants to draw is exactly the one that knows what is needed.
   */
  glyphs(fontStack: string | string[] | undefined, text: string): Glyph[] | null {
    const stack = stackKey(fontStack)
    const found = glyphsFor(codePoint => this._source.get(stack, codePoint), text)
    if (found)
      return found

    this._request(stack, text)
    return null
  }

  /** Drop remembered availability, e.g. after a font finishes loading. */
  invalidate(): void {
    this._availability.clear()
    this.cache.clear()
  }

  private _request(stack: string, text: string): void {
    for (const char of text) {
      const codePoint = char.codePointAt(0)
      if (codePoint === undefined)
        continue

      const start = rangeStartFor(codePoint)
      const key = `${stack}/${start}`
      // The source shares an in-flight request between callers, but this also
      // stops a failed range being asked for again on every single frame.
      if (this._requested.has(key))
        continue
      this._requested.add(key)

      this._source.load(stack, codePoint)
        .then(() => this._onLoad())
        .catch(() => {
          // A range that will not load stays marked as requested: retrying it
          // every frame would hammer the server for a font it does not have.
        })
    }
  }
}

/**
 * A font stack as the server names it.
 *
 * Glyph URLs take a comma-separated stack — `"Noto Sans Regular,Arial Unicode
 * MS Regular"` — which is also a serviceable cache key.
 */
export function stackKey(fontStack: string | string[] | undefined): string {
  if (Array.isArray(fontStack))
    return fontStack.join(',')
  return fontStack ?? ''
}
