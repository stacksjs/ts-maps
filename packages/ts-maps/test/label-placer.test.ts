import { describe, expect, test } from 'bun:test'
import type { LabelCandidate, LabelGroup, LineLabel, PointLabel } from '../src/core-map/symbols/LabelPlacer'
import { LabelPlacer } from '../src/core-map/symbols/LabelPlacer'

// Tile pixels are screen pixels here, so boxes can be reasoned about directly.
const identity: LabelGroup['project'] = (x, y) => ({ x, y })

function point(key: string, x: number, y: number, extra: Partial<PointLabel> = {}): PointLabel {
  return {
    kind: 'point',
    key,
    layer: 'places',
    rank: 0,
    sortKey: 0,
    order: 0,
    allowOverlap: false,
    ignorePlacement: false,
    padding: 0,
    x,
    y,
    box: { minX: -40, minY: -8, maxX: 40, maxY: 8 },
    bleed: 2,
    paint: () => {},
    signature: key,
    ...extra,
  }
}

function street(key: string, y: number, extra: Partial<LineLabel> = {}): LineLabel {
  const advances = [8, 8, 8, 8, 8]
  return {
    kind: 'line',
    key,
    layer: 'roads',
    rank: 0,
    sortKey: 0,
    order: 0,
    allowOverlap: false,
    ignorePlacement: false,
    padding: 0,
    line: [{ x: 0, y }, { x: 800, y }],
    anchor: 400,
    text: 'Main',
    repeatDistance: 0,
    chars: ['M', 'a', 'i', 'n', '!'],
    advances,
    width: 40,
    height: 12,
    maxAngle: 45,
    bleed: 2,
    paintGlyph: () => {},
    signature: 'roads',
    ...extra,
  }
}

function context(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600
  return canvas.getContext('2d') as CanvasRenderingContext2D
}

function frame(placer: LabelPlacer, labels: LabelCandidate[], now: number): boolean {
  return placer.drawFrame(context(), [{ labels, project: identity }], { width: 800, height: 600, ratio: 1, now, snap: false })
}

function placed(placer: LabelPlacer, key: string): boolean {
  return placer._states.get(key)?.placed ?? false
}

describe('LabelPlacer', () => {
  test('a more important layer takes the space from a less important one', () => {
    const placer = new LabelPlacer()
    frame(placer, [
      point('street', 400, 300, { rank: 1 }),
      point('city', 405, 300, { rank: 0 }),
    ], 0)
    expect(placed(placer, 'city')).toBe(true)
    expect(placed(placer, 'street')).toBe(false)
  })

  test('a lower symbol-sort-key wins within a layer', () => {
    const placer = new LabelPlacer()
    frame(placer, [
      point('village', 400, 300, { sortKey: 8 }),
      point('town', 405, 300, { sortKey: 2 }),
    ], 0)
    expect(placed(placer, 'town')).toBe(true)
    expect(placed(placer, 'village')).toBe(false)
  })

  test('a label already showing keeps its slot against an equal', () => {
    const placer = new LabelPlacer()
    frame(placer, [point('a', 400, 300, { order: 0 }), point('b', 405, 300, { order: 1 })], 0)
    expect(placed(placer, 'a')).toBe(true)

    // Next frame the tie-breaker would favour `b`; `a` was there first.
    frame(placer, [point('a', 401, 300, { order: 1 }), point('b', 406, 300, { order: 0 })], 16)
    expect(placed(placer, 'a')).toBe(true)
    expect(placed(placer, 'b')).toBe(false)
  })

  test('labels fade in over the fade duration, then stop asking for frames', () => {
    const placer = new LabelPlacer({ fadeDuration: 100 })
    const labels = [point('a', 400, 300)]
    expect(frame(placer, labels, 1000)).toBe(true)
    const first = placer._states.get('a')!.opacity
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(1)

    let now = 1000
    let fading = true
    while (fading && now < 2000) {
      now += 16
      fading = frame(placer, labels, now)
    }
    expect(placer._states.get('a')!.opacity).toBe(1)
    expect(fading).toBe(false)
  })

  test('a label that loses its slot fades out rather than vanishing', () => {
    const placer = new LabelPlacer({ fadeDuration: 100 })
    let now = 0
    for (let i = 0; i < 10; i++)
      frame(placer, [point('street', 400, 300, { rank: 1 })], now += 16)
    expect(placer._states.get('street')!.opacity).toBe(1)

    frame(placer, [point('street', 400, 300, { rank: 1 }), point('city', 400, 300, { rank: 0 })], now += 16)
    const state = placer._states.get('street')!
    expect(state.placed).toBe(false)
    expect(state.opacity).toBeGreaterThan(0)
    expect(state.opacity).toBeLessThan(1)
  })

  test('the same label from two tiles is placed once', () => {
    const placer = new LabelPlacer()
    const ctx = context()
    let blits = 0
    const original = ctx.drawImage.bind(ctx)
    ctx.drawImage = ((...args: any[]) => { blits++; return (original as any)(...args) }) as any
    const paint = (c: CanvasRenderingContext2D): void => { c.fillRect(0, 0, 1, 1) }

    placer.drawFrame(ctx, [
      { labels: [point('same', 400, 300, { paint })], project: identity },
      { labels: [point('same', 400, 300, { paint })], project: identity },
    ], { width: 800, height: 600, ratio: 1, now: 0, snap: false })
    expect(blits).toBeLessThanOrEqual(1)
    expect(placer._states.size).toBe(1)
  })

  test('labels well off screen are not placed at all', () => {
    const placer = new LabelPlacer()
    frame(placer, [point('far', 5000, 300)], 0)
    expect(placer._states.has('far')).toBe(false)
  })

  test('a street name is not repeated within its repeat distance', () => {
    const placer = new LabelPlacer()
    frame(placer, [
      street('main-1', 100, { repeatDistance: 200 }),
      street('main-2', 150, { repeatDistance: 200, order: 1 }),
      street('main-3', 500, { repeatDistance: 200, order: 2 }),
    ], 0)
    expect(placed(placer, 'main-1')).toBe(true)
    expect(placed(placer, 'main-2')).toBe(false)
    expect(placed(placer, 'main-3')).toBe(true)
  })
})
