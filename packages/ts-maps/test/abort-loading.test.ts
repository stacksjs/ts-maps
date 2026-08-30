import { describe, expect, test } from 'bun:test'
import { VectorTileMapLayer } from '../src/core-map/layer/tile/VectorTileMapLayer'

// GridLayer calls `_abortLoading` on every zoom change. What it has to get
// right is the distinction between a request nothing wants any more and one a
// tile on screen is still waiting for — cancelling the second would leave a
// permanent hole in the map.

function pending(abort = new AbortController()): any {
  return { promise: Promise.resolve(), refs: 1, abort }
}

describe('_abortLoading', () => {
  test('cancels requests for tiles the map has moved past', () => {
    const layer = new VectorTileMapLayer({ url: 'https://example.com/{z}/{x}/{y}.pbf' })
    const stale = new AbortController()
    layer._sourcePending.set('4/1/2', pending(stale))
    layer._tiles = {}

    layer._abortLoading()

    expect(stale.signal.aborted).toBe(true)
    expect(layer._sourcePending.size).toBe(0)
  })

  test('leaves alone a request a current tile is waiting on', () => {
    const layer = new VectorTileMapLayer({ url: 'https://example.com/{z}/{x}/{y}.pbf' })
    const wanted = new AbortController()
    const stale = new AbortController()
    const coords = { x: 1, y: 2, z: 4 }
    layer._sourcePending.set(layer._sourceKey(coords as any), pending(wanted))
    layer._sourcePending.set('9/9/9', pending(stale))
    layer._tiles = {
      '1:2:4': { current: true, coords } as any,
    }

    layer._abortLoading()

    expect(wanted.signal.aborted).toBe(false)
    expect(stale.signal.aborted).toBe(true)
    expect([...layer._sourcePending.keys()]).toEqual([layer._sourceKey(coords as any)])
  })

  test('a tile marked stale does not protect its request', () => {
    const layer = new VectorTileMapLayer({ url: 'https://example.com/{z}/{x}/{y}.pbf' })
    const abort = new AbortController()
    const coords = { x: 3, y: 4, z: 5 }
    layer._sourcePending.set(layer._sourceKey(coords as any), pending(abort))
    layer._tiles = { '3:4:5': { current: false, coords } as any }

    layer._abortLoading()

    expect(abort.signal.aborted).toBe(true)
  })

  test('is safe before any tile has been created', () => {
    const layer = new VectorTileMapLayer({ url: 'https://example.com/{z}/{x}/{y}.pbf' })
    expect(() => layer._abortLoading()).not.toThrow()
  })
})
