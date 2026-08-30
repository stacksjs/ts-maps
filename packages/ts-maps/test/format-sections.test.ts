import type { FormattedSection } from '../src/core-map/style-spec/expressions/formatted'
import { describe, expect, test } from 'bun:test'
import { GlyphAtlas } from '../src/core-map/symbols/GlyphAtlas'
import { drawSections, measureSections } from '../src/core-map/symbols/sections'

// A `format` label is one placement but several runs of text. What has to hold
// is that the runs are laid out on one baseline and measured as one box —
// otherwise collision sees the wrong footprint — while each still draws with
// its own size, font and colour.

const BASE = { size: 16, color: '#111111' }

/** Records what was drawn, since the harness has no rasteriser to inspect. */
function recordingContext(): { ctx: any, calls: Array<{ text: string, x: number, y: number, font: string, fill: string }> } {
  const calls: Array<{ text: string, x: number, y: number, font: string, fill: string }> = []
  const ctx: any = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '',
    miterLimit: 0,
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    strokeText() {},
    fillText(text: string, x: number, y: number) {
      calls.push({ text, x, y, font: ctx.font, fill: ctx.fillStyle })
    },
    measureText(text: string) {
      // Enough of a metrics object for the atlas: width proportional to the
      // font size parsed out of the font string.
      const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? '16')
      return {
        width: text.length * size * 0.5,
        fontBoundingBoxAscent: size * 0.8,
        fontBoundingBoxDescent: size * 0.2,
      }
    },
  }
  return { ctx, calls }
}

/** An atlas whose measurements come from a context we control. */
function atlasWith(ctx: any): GlyphAtlas {
  const atlas = new GlyphAtlas()
  ;(atlas as any)._ctx = ctx
  return atlas
}

describe('measureSections', () => {
  test('adds section widths and takes the tallest for height', () => {
    const { ctx } = recordingContext()
    const atlas = atlasWith(ctx)
    const sections: FormattedSection[] = [
      { text: 'ab', scale: 1 },
      { text: 'cd', scale: 2 },
    ]

    const layout = measureSections(atlas, sections, BASE)

    // 2 chars at 16px plus 2 chars at 32px, at half-size advances.
    expect(layout.width).toBe(2 * 16 * 0.5 + 2 * 32 * 0.5)
    // The taller section sets the box, so a small section beside a large one
    // does not shrink the footprint collision reserves.
    expect(layout.ascent).toBe(32 * 0.8)
    expect(layout.height).toBe(32 * 0.8 + 32 * 0.2)
  })

  test('an unstyled section measures as the layer would draw it', () => {
    const { ctx } = recordingContext()
    const atlas = atlasWith(ctx)
    const sections: FormattedSection[] = [{ text: 'abcd' }]
    expect(measureSections(atlas, sections, BASE).width).toBe(atlas.measureText('abcd', 16).width)
  })

  test('empty sections contribute nothing', () => {
    const { ctx } = recordingContext()
    const atlas = atlasWith(ctx)
    const with_ = measureSections(atlas, [{ text: 'ab' }, { text: '' }], BASE)
    const without = measureSections(atlas, [{ text: 'ab' }], BASE)
    expect(with_.width).toBe(without.width)
  })
})

describe('drawSections', () => {
  test('each section draws at its own size and colour', () => {
    const { ctx, calls } = recordingContext()
    const atlas = atlasWith(ctx)

    drawSections(ctx, atlas, [
      { text: 'M', scale: 1.5, color: '#ff0000' },
      { text: '5', scale: 0.5 },
    ], 100, 200, BASE)

    expect(calls.length).toBe(2)
    expect(calls[0].text).toBe('M')
    expect(calls[0].font).toContain('24px')
    expect(calls[0].fill).toBe('#ff0000')
    // No colour of its own, so the layer's `text-color` stands.
    expect(calls[1].font).toContain('8px')
    expect(calls[1].fill).toBe('#111111')
  })

  test('sections advance along a shared baseline', () => {
    const { ctx, calls } = recordingContext()
    const atlas = atlasWith(ctx)

    drawSections(ctx, atlas, [{ text: 'ab' }, { text: 'cd', scale: 2 }], 50, 90, BASE)

    expect(calls[0].x).toBe(50)
    // The second starts where the first ended, not at the same origin.
    expect(calls[1].x).toBe(50 + 2 * 16 * 0.5)
    // One line of text, not two runs that happen to be adjacent.
    expect(calls[0].y).toBe(90)
    expect(calls[1].y).toBe(90)
  })

  test('a section font stack carries its own weight and slant', () => {
    const { ctx, calls } = recordingContext()
    const atlas = atlasWith(ctx)

    drawSections(ctx, atlas, [{ text: 'x', fontStack: ['Noto Sans Bold Italic'] }], 0, 0, BASE)

    // Weight and slant are carried in the style-spec font name and split out
    // into CSS font properties, leaving the family behind.
    expect(calls[0].font).toContain('700')
    expect(calls[0].font).toContain('italic')
    expect(calls[0].font).toContain('Noto Sans')
  })

  test('an empty section draws nothing at all', () => {
    const { ctx, calls } = recordingContext()
    const atlas = atlasWith(ctx)
    drawSections(ctx, atlas, [{ text: '' }, { text: 'a' }], 0, 0, BASE)
    expect(calls.map(c => c.text)).toEqual(['a'])
  })
})
