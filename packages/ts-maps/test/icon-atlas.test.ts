import { describe, expect, test } from 'bun:test'
import { IconAtlas } from '../src/core-map/symbols/IconAtlas'

describe('IconAtlas', () => {
  test('addSprite registers the entry and get retrieves it', () => {
    const atlas = new IconAtlas()
    const src = document.createElement('canvas')
    src.width = 16
    src.height = 16
    atlas.addSprite({ id: 'pin', x: 0, y: 0, width: 16, height: 16 }, src)

    const got = atlas.get('pin')
    expect(got).toBeDefined()
    expect(got!.width).toBe(16)
    expect(got!.height).toBe(16)
    expect(atlas.get('missing')).toBeUndefined()
  })

  test('drawIcon calls drawImage on the target context', () => {
    const atlas = new IconAtlas()
    const src = document.createElement('canvas')
    src.width = 8
    src.height = 8
    atlas.addSprite({ id: 'dot', x: 0, y: 0, width: 8, height: 8 }, src)

    const target = document.createElement('canvas')
    target.width = 100
    target.height = 100
    const ctx = target.getContext('2d') as any
    let drawCalls = 0
    const orig = ctx.drawImage
    ctx.drawImage = function spied(...args: any[]): any {
      drawCalls++
      return orig.apply(ctx, args)
    }

    expect(() => atlas.drawIcon(ctx, 'dot', 50, 50)).not.toThrow()
    expect(drawCalls).toBeGreaterThanOrEqual(1)

    // Unknown id → no-op, no throw.
    expect(() => atlas.drawIcon(ctx, 'nope', 10, 10)).not.toThrow()
  })

  test('drawIcon honours a rotation option without throwing', () => {
    const atlas = new IconAtlas()
    const src = document.createElement('canvas')
    src.width = 8
    src.height = 8
    atlas.addSprite({ id: 'arrow', x: 0, y: 0, width: 8, height: 8 }, src)

    const target = document.createElement('canvas')
    const ctx = target.getContext('2d') as CanvasRenderingContext2D
    expect(() => atlas.drawIcon(ctx, 'arrow', 10, 10, { rotation: Math.PI / 4 })).not.toThrow()
  })
})
