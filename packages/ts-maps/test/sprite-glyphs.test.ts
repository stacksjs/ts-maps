import { describe, expect, test } from 'bun:test'
import { Pbf } from '../src/core-map/proto/Pbf'
import { IconAtlas } from '../src/core-map/symbols/IconAtlas'
import { decodeGlyphPbf, GlyphSource, glyphUrl, rangeStartFor } from '../src/core-map/symbols/loadGlyphs'
import { addSpriteToAtlas, loadSprite, spriteUrl } from '../src/core-map/symbols/loadSprite'
import { GlyphAtlas } from '../src/core-map/symbols/GlyphAtlas'
import { TsMap } from '../src/core-map'

/**
 * A style's `sprite` and `glyphs` URLs were validated and then ignored, so
 * `icon-image` drew nothing against any real style and a style's own typeface
 * could never be honoured.
 */

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------

const INDEX = {
  'marker': { x: 0, y: 0, width: 20, height: 20, pixelRatio: 1 },
  'fire-station': { x: 20, y: 0, width: 16, height: 16, pixelRatio: 1 },
}

/** A stand-in for a decoded PNG: the atlas only needs something drawable. */
function fakeSheet(width = 64, height = 64): any {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function stubFetch(routes: Record<string, unknown>): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = routes[url]
    if (body === undefined)
      return { ok: false, status: 404 } as Response
    return { ok: true, status: 200, json: async () => body } as Response
  }) as typeof globalThis.fetch
}

describe('spriteUrl', () => {
  test('derives the index and sheet urls', () => {
    expect(spriteUrl('https://x/sprites/basic', 'json', 1)).toBe('https://x/sprites/basic.json')
    expect(spriteUrl('https://x/sprites/basic', 'png', 1)).toBe('https://x/sprites/basic.png')
  })

  test('retina sheets take the @2x suffix', () => {
    expect(spriteUrl('https://x/basic', 'json', 2)).toBe('https://x/basic@2x.json')
    expect(spriteUrl('https://x/basic', 'png', 2)).toBe('https://x/basic@2x.png')
  })

  test('a query string stays after the extension', () => {
    // Keys ride in the query; putting `@2x.png` after it would break the url.
    expect(spriteUrl('https://x/basic?key=abc', 'png', 2)).toBe('https://x/basic@2x.png?key=abc')
  })
})

describe('loadSprite', () => {
  test('fetches the index and the sheet', async () => {
    const loaded = await loadSprite('https://x/basic', {
      fetch: stubFetch({ 'https://x/basic.json': INDEX }),
      loadImage: async () => fakeSheet(),
    })

    expect(Object.keys(loaded.index)).toEqual(['marker', 'fire-station'])
    expect(loaded.pixelRatio).toBe(1)
  })

  test('prefers the @2x sheet on a retina display', async () => {
    const asked: string[] = []
    const loaded = await loadSprite('https://x/basic', {
      pixelRatio: 2,
      fetch: stubFetch({ 'https://x/basic@2x.json': INDEX, 'https://x/basic.json': INDEX }),
      loadImage: async (url) => { asked.push(url); return fakeSheet(128, 128) },
    })

    expect(loaded.pixelRatio).toBe(2)
    expect(asked).toEqual(['https://x/basic@2x.png'])
  })

  test('falls back to 1x when no @2x sheet is published', async () => {
    // Plenty of styles ship only one density; soft icons beat no icons.
    const loaded = await loadSprite('https://x/basic', {
      pixelRatio: 2,
      fetch: stubFetch({ 'https://x/basic.json': INDEX }),
      loadImage: async () => fakeSheet(),
    })

    expect(loaded.pixelRatio).toBe(1)
  })

  test('a missing sprite rejects rather than resolving empty', async () => {
    await expect(loadSprite('https://x/nope', {
      fetch: stubFetch({}),
      loadImage: async () => fakeSheet(),
    })).rejects.toThrow(/404/)
  })
})

describe('addSpriteToAtlas', () => {
  test('every icon becomes retrievable by name', () => {
    const atlas = new IconAtlas()
    const added = addSpriteToAtlas(atlas, { index: INDEX, image: fakeSheet(), pixelRatio: 1 })

    expect(added).toBe(2)
    expect(atlas.get('marker')?.width).toBe(20)
    expect(atlas.get('fire-station')?.height).toBe(16)
  })

  test('the sheet density stands in when an entry omits its own', () => {
    // Otherwise a @2x sheet renders every icon at double size.
    const atlas = new IconAtlas()
    addSpriteToAtlas(atlas, {
      index: { pin: { x: 0, y: 0, width: 40, height: 40 } },
      image: fakeSheet(128, 128),
      pixelRatio: 2,
    })

    expect(atlas.get('pin')?.pixelRatio).toBe(2)
  })

  test('malformed entries are skipped, not fatal', () => {
    const atlas = new IconAtlas()
    const added = addSpriteToAtlas(atlas, {
      index: {
        good: { x: 0, y: 0, width: 10, height: 10 },
        zero: { x: 0, y: 0, width: 0, height: 10 },
        broken: { x: 0, y: 0 } as any,
      },
      image: fakeSheet(),
      pixelRatio: 1,
    })

    expect(added).toBe(1)
    expect(atlas.get('good')).toBeDefined()
    expect(atlas.get('zero')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Glyphs
// ---------------------------------------------------------------------------

/** Encode a `glyphs.proto` message, so the decoder is tested against real bytes. */
function encodeGlyphs(stack: string, range: string, glyphs: Array<{
  id: number
  bitmap?: Uint8Array
  width: number
  height: number
  left: number
  top: number
  advance: number
}>): Uint8Array {
  const pbf = new Pbf()
  pbf.writeMessage(1, (_: null, outer: Pbf) => {
    outer.writeStringField(1, stack)
    outer.writeStringField(2, range)
    for (const g of glyphs) {
      outer.writeMessage(3, (glyph: typeof g, p: Pbf) => {
        p.writeVarintField(1, glyph.id)
        if (glyph.bitmap)
          p.writeBytesField(2, glyph.bitmap)
        p.writeVarintField(3, glyph.width)
        p.writeVarintField(4, glyph.height)
        p.writeSVarintField(5, glyph.left)
        p.writeSVarintField(6, glyph.top)
        p.writeVarintField(7, glyph.advance)
      }, g)
    }
  }, null)
  return pbf.finish()
}

describe('glyph range urls', () => {
  test('fills the template', () => {
    expect(glyphUrl('https://x/fonts/{fontstack}/{range}.pbf', 'Noto Sans Regular', 0))
      .toBe('https://x/fonts/Noto%20Sans%20Regular/0-255.pbf')
  })

  test('a code point maps to its 256-block', () => {
    expect(rangeStartFor(65)).toBe(0)
    expect(rangeStartFor(256)).toBe(256)
    expect(rangeStartFor(0x4E2D)).toBe(0x4E00)
  })
})

describe('decodeGlyphPbf', () => {
  test('reads ids, metrics and bitmaps back out', () => {
    const bytes = encodeGlyphs('Noto Sans Regular', '0-255', [
      { id: 65, bitmap: new Uint8Array([1, 2, 3, 4]), width: 10, height: 12, left: 1, top: -9, advance: 11 },
      { id: 66, width: 8, height: 12, left: 0, top: -9, advance: 9 },
    ])

    const range = decodeGlyphPbf(bytes)

    expect(range.size).toBe(2)
    const a = range.get(65)!
    expect(a.width).toBe(10)
    expect(a.height).toBe(12)
    expect(a.advance).toBe(11)
    // Signed: `top` is negative for anything above the baseline.
    expect(a.top).toBe(-9)
    expect(a.left).toBe(1)
    expect([...a.bitmap!]).toEqual([1, 2, 3, 4])

    // A glyph with no ink still carries an advance — that is what a space is.
    expect(range.get(66)!.bitmap).toBeUndefined()
    expect(range.get(66)!.advance).toBe(9)
  })

  test('an empty message decodes to no glyphs', () => {
    expect(decodeGlyphPbf(new Uint8Array()).size).toBe(0)
  })
})

describe('GlyphSource', () => {
  function sourceWith(bytes: Uint8Array, onFetch?: (url: string) => void): GlyphSource {
    return new GlyphSource('https://x/fonts/{fontstack}/{range}.pbf', {
      fetch: (async (input: RequestInfo | URL) => {
        onFetch?.(String(input))
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer } as Response
      }) as typeof globalThis.fetch,
    })
  }

  const BYTES = encodeGlyphs('Noto Sans Regular', '0-255', [
    { id: 65, bitmap: new Uint8Array([9]), width: 10, height: 12, left: 1, top: -9, advance: 11 },
  ])

  test('loads a range and serves glyphs from it', async () => {
    const source = sourceWith(BYTES)

    expect(source.has('Noto Sans Regular', 65)).toBe(false)
    await source.load('Noto Sans Regular', 65)

    expect(source.has('Noto Sans Regular', 65)).toBe(true)
    expect(source.get('Noto Sans Regular', 65)?.advance).toBe(11)
  })

  test('a range is fetched once, however many callers want it', async () => {
    // Several tiles decoding at once all want the same block.
    const urls: string[] = []
    const source = sourceWith(BYTES, url => urls.push(url))

    await Promise.all([
      source.load('Noto Sans Regular', 65),
      source.load('Noto Sans Regular', 66),
      source.load('Noto Sans Regular', 90),
    ])

    expect(urls.length).toBe(1)
    expect(urls[0]).toContain('0-255')
  })

  test('a cached range is not re-fetched', async () => {
    const urls: string[] = []
    const source = sourceWith(BYTES, url => urls.push(url))

    await source.load('Noto Sans Regular', 65)
    await source.load('Noto Sans Regular', 65)

    expect(urls.length).toBe(1)
  })

  test('loadForText covers every block the text touches', async () => {
    const urls: string[] = []
    const source = sourceWith(BYTES, url => urls.push(url))

    // Latin and CJK live in different blocks.
    await source.loadForText('Noto Sans Regular', 'A中')

    expect(urls.length).toBe(2)
    expect(source.size).toBe(2)
  })

  test('a failed range can be retried rather than staying poisoned', async () => {
    let attempt = 0
    const source = new GlyphSource('https://x/fonts/{fontstack}/{range}.pbf', {
      fetch: (async () => {
        attempt += 1
        if (attempt === 1)
          return { ok: false, status: 500 } as Response
        return { ok: true, status: 200, arrayBuffer: async () => BYTES.buffer } as Response
      }) as unknown as typeof globalThis.fetch,
    })

    await expect(source.load('Noto Sans Regular', 65)).rejects.toThrow(/500/)
    // The rejection must not be cached, or the range is lost for the session.
    await source.load('Noto Sans Regular', 65)
    expect(source.get('Noto Sans Regular', 65)?.advance).toBe(11)
  })
})

// ---------------------------------------------------------------------------
// text-font
// ---------------------------------------------------------------------------

describe('resolveFont', () => {
  const atlas = new GlyphAtlas()

  test('splits weight and slant out of the style-spec font name', () => {
    // Style-spec names carry them because the SDK they were written for looks
    // fonts up in a glyph server; a browser wants them applied separately.
    expect(atlas.resolveFont(['Noto Sans Bold'])).toMatchObject({ bold: true, italic: false })
    expect(atlas.resolveFont(['Noto Sans Italic'])).toMatchObject({ bold: false, italic: true })
    expect(atlas.resolveFont(['Noto Sans Bold Italic'])).toMatchObject({ bold: true, italic: true })
  })

  test('quotes a multi-word family and keeps a fallback behind it', () => {
    const { family } = atlas.resolveFont(['Noto Sans Regular'])
    expect(family.startsWith('"Noto Sans"')).toBe(true)
    // A style naming a font the viewer lacks still renders in something.
    expect(family).toContain('system-ui')
  })

  test('honours the whole stack in order', () => {
    const { family } = atlas.resolveFont(['Noto Sans Regular', 'Arial Unicode MS Regular'])
    expect(family.indexOf('"Noto Sans"')).toBeLessThan(family.indexOf('"Arial Unicode MS"'))
  })

  test('no text-font falls back to the atlas default', () => {
    expect(atlas.resolveFont(undefined).family).toBe(atlas.resolveFont([]).family)
  })

  test('Semibold is not eaten by Bold', () => {
    expect(atlas.resolveFont(['Inter Semibold']).family).toContain('Inter')
  })
})

describe('style wiring', () => {
  function makeMap(style: any): TsMap {
    const container = document.createElement('div')
    container.style.width = '400px'
    container.style.height = '400px'
    document.body.appendChild(container)
    return new TsMap(container, { zoomAnimation: false, style })
  }

  const base: any = {
    version: 8,
    sources: { s: { type: 'vector', tiles: ['https://x/{z}/{x}/{y}.pbf'] } },
    layers: [],
  }

  test('a style with a glyphs url gets a glyph source', () => {
    const map = makeMap({ ...base, glyphs: 'https://x/fonts/{fontstack}/{range}.pbf' })
    expect(map.getGlyphSource()).toBeDefined()
  })

  test('a style without one does not, which is the common case', () => {
    expect(makeMap(base).getGlyphSource()).toBeUndefined()
  })

  test('swapping styles replaces the glyph source', () => {
    const map = makeMap({ ...base, glyphs: 'https://x/fonts/{fontstack}/{range}.pbf' })
    const first = map.getGlyphSource()

    map.setStyle({ ...base, glyphs: 'https://y/fonts/{fontstack}/{range}.pbf' })
    expect(map.getGlyphSource()).not.toBe(first)

    map.setStyle(base)
    expect(map.getGlyphSource()).toBeUndefined()
  })
})
