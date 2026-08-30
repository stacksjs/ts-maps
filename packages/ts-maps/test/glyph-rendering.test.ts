import type { Glyph } from '../src/core-map/symbols/loadGlyphs'
import { describe, expect, test } from 'bun:test'
import { GlyphProvider, stackKey } from '../src/core-map/symbols/GlyphProvider'
import { drawGlyphs, GLYPH_EM, glyphsFor, measureGlyphs } from '../src/core-map/symbols/GlyphRenderer'
import { GLYPH_BORDER } from '../src/core-map/symbols/loadGlyphs'

// The glyph loader existed and nothing drew with it, so a style naming a font
// the viewer does not have rendered in the fallback stack — close enough to
// miss, and never what the style asked for.

function glyph(id: number, over: Partial<Glyph> = {}): Glyph {
  const width = over.width ?? 10
  const height = over.height ?? 14
  const padded = (width + GLYPH_BORDER * 2) * (height + GLYPH_BORDER * 2)
  return {
    id,
    width,
    height,
    left: over.left ?? 1,
    top: over.top ?? 12,
    advance: over.advance ?? 12,
    // A field that is solidly "inside" everywhere, which is enough to check
    // geometry without needing a real distance field.
    bitmap: over.bitmap ?? new Uint8Array(padded).fill(255),
    ...over,
  }
}

describe('glyphsFor', () => {
  test('resolves every character, in order', () => {
    const table = new Map([[97, glyph(97)], [98, glyph(98)]])
    const found = glyphsFor(cp => table.get(cp), 'ab')
    expect(found?.map(g => g.id)).toEqual([97, 98])
  })

  test('one missing glyph means the whole run waits', () => {
    // A label with holes in it is worse than one that appears a frame later.
    const table = new Map([[97, glyph(97)]])
    expect(glyphsFor(cp => table.get(cp), 'ab')).toBeNull()
  })

  test('handles characters outside the basic plane', () => {
    const emoji = '😀'.codePointAt(0)!
    const table = new Map([[emoji, glyph(emoji)]])
    // One code point, not two surrogate halves.
    expect(glyphsFor(cp => table.get(cp), '😀')?.length).toBe(1)
  })
})

describe('measureGlyphs', () => {
  test('sums advances scaled to the requested size', () => {
    const glyphs = [glyph(1, { advance: 12 }), glyph(2, { advance: 6 })]
    // Glyphs are rasterised at a fixed em size and drawn scaled.
    expect(measureGlyphs(glyphs, GLYPH_EM).width).toBe(18)
    expect(measureGlyphs(glyphs, GLYPH_EM / 2).width).toBe(9)
  })

  test('height spans the tallest ascent and deepest descent in the run', () => {
    const glyphs = [
      glyph(1, { top: 18, height: 18 }),
      glyph(2, { top: 12, height: 18 }),
    ]
    const m = measureGlyphs(glyphs, GLYPH_EM)
    expect(m.ascent).toBe(18)
    // The second glyph drops 6 below the baseline.
    expect(m.descent).toBe(6)
    expect(m.height).toBe(24)
  })

  test('a run of spaces still reserves a sensible box', () => {
    const space = glyph(32, { width: 0, height: 0, top: 0, bitmap: undefined })
    const m = measureGlyphs([space], 16)
    expect(m.height).toBeGreaterThan(0)
  })
})

describe('drawGlyphs', () => {
  function recorder(): { ctx: any, drawn: Array<{ dx: number, dy: number, w: number, h: number }> } {
    const drawn: Array<{ dx: number, dy: number, w: number, h: number }> = []
    const ctx: any = {
      drawImage(_img: unknown, dx: number, dy: number, w: number, h: number) {
        drawn.push({ dx, dy, w, h })
      },
    }
    return { ctx, drawn }
  }

  test('advances along the baseline, one blit per glyph', () => {
    const { ctx, drawn } = recorder()
    drawGlyphs(ctx, [glyph(1, { advance: 12 }), glyph(2, { advance: 12 })], 100, 50, {
      size: GLYPH_EM,
      color: '#ffffff',
    })

    expect(drawn.length).toBe(2)
    expect(drawn[1].dx - drawn[0].dx).toBe(12)
    expect(drawn[0].dy).toBe(drawn[1].dy)
  })

  test('the baked border is accounted for in both size and position', () => {
    const { ctx, drawn } = recorder()
    drawGlyphs(ctx, [glyph(1, { width: 10, height: 14, left: 1, top: 12 })], 0, 0, {
      size: GLYPH_EM,
      color: '#ffffff',
    })

    // The bitmap is the glyph plus a border on every side...
    expect(drawn[0].w).toBe(10 + GLYPH_BORDER * 2)
    expect(drawn[0].h).toBe(14 + GLYPH_BORDER * 2)
    // ...and `left`/`top` measure the glyph, not the padded box, so the border
    // has to be taken back off the destination.
    expect(drawn[0].dx).toBe(1 - GLYPH_BORDER)
    expect(drawn[0].dy).toBe(-(12 + GLYPH_BORDER))
  })

  test('a space advances without drawing', () => {
    const { ctx, drawn } = recorder()
    const space = glyph(32, { width: 0, height: 0, advance: 8, bitmap: undefined })
    drawGlyphs(ctx, [space, glyph(1)], 0, 0, { size: GLYPH_EM, color: '#fff' })
    expect(drawn.length).toBe(1)
    expect(drawn[0].dx).toBe(8 + 1 - GLYPH_BORDER)
  })
})

describe('GlyphProvider', () => {
  function fakeSource(loaded: Record<string, Glyph> = {}): any {
    const requests: Array<{ stack: string, codePoint: number }> = []
    return {
      requests,
      get: (stack: string, codePoint: number) => loaded[`${stack}/${codePoint}`],
      load: (stack: string, codePoint: number) => {
        requests.push({ stack, codePoint })
        return Promise.resolve(new Map())
      },
    }
  }

  test('a font the viewer has is not asked of the server', () => {
    const source = fakeSource()
    const provider = new GlyphProvider({
      source,
      isFontAvailable: () => true,
      onLoad: () => {},
    })
    expect(provider.needsServer(['Helvetica'])).toBe(false)
  })

  test('availability is checked once per stack', () => {
    let checks = 0
    const provider = new GlyphProvider({
      source: fakeSource(),
      isFontAvailable: () => {
        checks++
        return false
      },
      onLoad: () => {},
    })

    provider.needsServer(['Noto Sans Regular'])
    provider.needsServer(['Noto Sans Regular'])
    provider.needsServer(['Noto Sans Bold'])
    // A style has a handful of stacks and thousands of labels, and
    // `document.fonts.check` is not free.
    expect(checks).toBe(2)
  })

  test('missing glyphs are requested once and the run waits', async () => {
    const source = fakeSource()
    let loads = 0
    const provider = new GlyphProvider({
      source,
      isFontAvailable: () => false,
      onLoad: () => {
        loads++
      },
    })

    expect(provider.glyphs(['Noto Sans Regular'], 'ab')).toBeNull()
    expect(source.requests.length).toBe(1)

    // Both characters are in the same 256-point block, so one range covers
    // them; asking again must not re-request it every frame.
    expect(provider.glyphs(['Noto Sans Regular'], 'ab')).toBeNull()
    expect(source.requests.length).toBe(1)

    await Promise.resolve()
    await Promise.resolve()
    expect(loads).toBeGreaterThan(0)
  })

  test('a loaded range is handed straight back', () => {
    const source = fakeSource({ 'Noto Sans Regular/97': glyph(97) })
    const provider = new GlyphProvider({
      source,
      isFontAvailable: () => false,
      onLoad: () => {},
    })

    expect(provider.glyphs(['Noto Sans Regular'], 'a')?.length).toBe(1)
    expect(source.requests.length).toBe(0)
  })

  test('characters in different blocks each get a request', () => {
    const source = fakeSource()
    const provider = new GlyphProvider({
      source,
      isFontAvailable: () => false,
      onLoad: () => {},
    })

    provider.glyphs(['Noto Sans Regular'], 'a中')
    expect(source.requests.length).toBe(2)
  })

  test('invalidate forgets what it decided about fonts', () => {
    let available = false
    const provider = new GlyphProvider({
      source: fakeSource(),
      isFontAvailable: () => available,
      onLoad: () => {},
    })

    expect(provider.needsServer(['Later'])).toBe(true)
    available = true
    expect(provider.needsServer(['Later'])).toBe(true)
    provider.invalidate()
    expect(provider.needsServer(['Later'])).toBe(false)
  })
})

describe('stackKey', () => {
  test('joins a stack the way a glyph url names it', () => {
    expect(stackKey(['Noto Sans Regular', 'Arial Unicode MS Regular']))
      .toBe('Noto Sans Regular,Arial Unicode MS Regular')
    expect(stackKey('Noto Sans Regular')).toBe('Noto Sans Regular')
    expect(stackKey(undefined)).toBe('')
  })
})
