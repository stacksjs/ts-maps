// Drawing a label whose parts are styled differently.
//
// `["format", "M", { "font-scale": 1.4 }, "5", { "font-scale": 0.8 }]` is one
// label, one collision box, one placement — but two runs of text at two sizes.
// A road shield, a place name over a smaller subtitle, a value with its unit
// in a lighter colour: all the same shape.
//
// The sections are laid out on a shared baseline and measured as a whole, so
// collision still sees one box. What varies per section is size, font and
// colour; anything a section does not specify falls through to the layer's own
// text properties, which is what the spec asks for and also what makes a
// `format` with no options behave exactly like a plain string.

import type { FormattedSection } from '../style-spec/expressions/formatted'
import type { GlyphAtlas } from './GlyphAtlas'

export interface SectionBaseStyle {
  size: number
  color: string
  italic?: boolean
  bold?: boolean
  family?: string
  haloColor?: string
  haloWidth?: number
}

export interface SectionLayout {
  width: number
  height: number
  ascent: number
  descent: number
}

/** One section resolved against the layer's defaults. */
function resolve(
  atlas: GlyphAtlas,
  section: FormattedSection,
  base: SectionBaseStyle,
): { size: number, color: string, italic: boolean, bold: boolean, family: string | undefined } {
  const size = base.size * (section.scale ?? 1)
  if (!section.fontStack)
    return { size, color: section.color ?? base.color, italic: !!base.italic, bold: !!base.bold, family: base.family }

  // A section's own `text-font` carries weight and slant in the name, the same
  // way the layer's does — "Noto Sans Bold Italic" — so it goes through the
  // same resolution rather than being treated as a bare family.
  const font = atlas.resolveFont(section.fontStack)
  return { size, color: section.color ?? base.color, italic: font.italic, bold: font.bold, family: font.family }
}

/**
 * Measure a formatted label as one box.
 *
 * Height is the tallest section's, so a small section next to a large one does
 * not shrink the label's footprint and let something else overlap it.
 */
export function measureSections(
  atlas: GlyphAtlas,
  sections: FormattedSection[],
  base: SectionBaseStyle,
): SectionLayout {
  let width = 0
  let ascent = 0
  let descent = 0

  for (const section of sections) {
    if (!section.text)
      continue
    const style = resolve(atlas, section, base)
    const m = atlas.measureText(section.text, style.size, style)
    width += m.width
    ascent = Math.max(ascent, m.ascent)
    descent = Math.max(descent, m.descent)
  }

  return { width, height: ascent + descent, ascent, descent }
}

/**
 * Draw a formatted label from `x` along a shared baseline at `y`.
 *
 * Sections sit on the baseline rather than being centred on it, which is what
 * keeps a size change reading as one line of text instead of two runs that
 * happen to be adjacent.
 */
export function drawSections(
  ctx: CanvasRenderingContext2D,
  atlas: GlyphAtlas,
  sections: FormattedSection[],
  x: number,
  y: number,
  base: SectionBaseStyle,
): void {
  let cursor = x

  for (const section of sections) {
    if (!section.text)
      continue
    const style = resolve(atlas, section, base)
    atlas.drawText(ctx, section.text, cursor, y, {
      color: style.color,
      haloColor: base.haloColor,
      haloWidth: base.haloWidth,
      size: style.size,
      italic: style.italic,
      bold: style.bold,
      family: style.family,
    })
    cursor += atlas.measureText(section.text, style.size, style).width
  }
}
