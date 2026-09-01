import { describe, expect, test } from 'bun:test'
import { GlyphAtlas } from '../src/core-map/symbols/GlyphAtlas'

/**
 * `text-letter-spacing` was in the style spec's schema and types and was read
 * by nothing: a style could ask for tracking and the map drew the label
 * unchanged. These cover the half that matters most - the measurement.
 *
 * Tracking that draws but does not measure is worse than no tracking at all.
 * The measured width is the collision box, so a label that reports itself
 * narrower than its ink lets the placer sit a neighbour on top of it, and the
 * wider the tracking the worse the overlap.
 */
describe('text-letter-spacing', () => {
  test('a tracked run measures wider than an untracked one', () => {
    const atlas = new GlyphAtlas({ fontSize: 24 })

    const plain = atlas.measureText('BRENTWOOD', 12)
    const tracked = atlas.measureText('BRENTWOOD', 12, { letterSpacing: 2 })

    expect(tracked.width).toBeGreaterThan(plain.width)
  })

  test('the extra width is proportional to the tracking', () => {
    const atlas = new GlyphAtlas({ fontSize: 24 })

    const plain = atlas.measureText('SAWTELLE', 12).width
    const one = atlas.measureText('SAWTELLE', 12, { letterSpacing: 1 }).width
    const two = atlas.measureText('SAWTELLE', 12, { letterSpacing: 2 }).width

    // Whether the canvas applies the property itself or the width is added
    // back by hand, doubling the tracking has to double what it added.
    expect(two - plain).toBeCloseTo((one - plain) * 2, 1)
  })

  test('no tracking measures exactly as before', () => {
    const atlas = new GlyphAtlas({ fontSize: 24 })

    expect(atlas.measureText('OCEAN PARK', 12, { letterSpacing: 0 }).width)
      .toBe(atlas.measureText('OCEAN PARK', 12).width)
  })

  test('advances step by the tracked width, so line labels do not bunch', () => {
    const atlas = new GlyphAtlas({ fontSize: 24 })

    const plain = atlas.advances('ABC', 12)
    const tracked = atlas.advances('ABC', 12, { letterSpacing: 3 })

    expect(tracked).toHaveLength(plain.length)

    for (let i = 0; i < plain.length; i++)
      expect(tracked[i]!.advance).toBeCloseTo(plain[i]!.advance + 3, 5)
  })

  test('drawText accepts tracking without throwing on a plain context', () => {
    const atlas = new GlyphAtlas({ fontSize: 24 })
    const target = document.createElement('canvas')
    target.width = 300
    target.height = 80

    const ctx = target.getContext('2d') as CanvasRenderingContext2D

    expect(() => atlas.drawText(ctx, 'MAR VISTA', 10, 40, { color: '#fff', size: 12, letterSpacing: 2 })).not.toThrow()
  })
})
