import { describe, expect, test } from 'bun:test'
import type { LabelCandidate, LabelGroup, LineLabel, PointLabel } from '../src/core-map/symbols/LabelPlacer'
import { HYSTERESIS, LabelPlacer } from '../src/core-map/symbols/LabelPlacer'

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

  test('a label that changes key between zoom levels carries its fade on', () => {
    // The key holds a quantised position, and the same town from a z10 tile
    // and its z11 replacement can round into different cells.
    const placer = new LabelPlacer({ fadeDuration: 100 })
    let now = 0
    for (let i = 0; i < 10; i++)
      frame(placer, [point('town@10', 400, 300, { identity: 'places\u0000Town' })], now += 16)
    expect(placer._states.get('town@10')!.opacity).toBe(1)

    frame(placer, [point('town@11', 400.2, 299.9, { identity: 'places\u0000Town' })], now += 16)
    // Still fully shown: not dropped and faded back in from nothing.
    expect(placer._states.get('town@11')!.opacity).toBe(1)
    expect(placed(placer, 'town@11')).toBe(true)
  })

  test('the same label from two zoom levels, under two keys, is drawn once', () => {
    const placer = new LabelPlacer()
    const drawn: string[] = []
    const original = placer._drawPoint.bind(placer)
    placer._drawPoint = (ctx, label, x, y, ratio, snap) => {
      drawn.push(label.key)
      original(ctx, label, x, y, ratio, snap)
    }
    const identity = 'places\u0000Town'
    frame(placer, [point('town@10', 400, 300, { identity }), point('town@11', 400.1, 300, { identity, order: 1 })], 0)
    expect(drawn).toEqual(['town@10'])
    // Both keys share one fate, so whichever tile goes first, nothing blinks.
    expect(placer._states.get('town@11')).toBe(placer._states.get('town@10'))
  })

  test('two places with the same name far apart are two labels', () => {
    const placer = new LabelPlacer()
    const identity = 'places\u0000Springfield'
    frame(placer, [point('a', 100, 100, { identity }), point('b', 600, 500, { identity, order: 1 })], 0)
    expect(placed(placer, 'a')).toBe(true)
    expect(placed(placer, 'b')).toBe(true)
    expect(placer._states.get('a')).not.toBe(placer._states.get('b'))
  })

  test('a newcomer needs clear space; a label already showing keeps its slot at the edge', () => {
    // `city` spans x 360..440. `town`'s box starts `gap` pixels to its right.
    const at = (gap: number): number => 440 + gap + 40
    const city = point('city', 400, 300, { rank: 0 })

    const fresh = new LabelPlacer()
    frame(fresh, [city, point('town', at(1), 300, { rank: 1 })], 0)
    expect(placed(fresh, 'town')).toBe(false)
    frame(fresh, [city, point('town', at(HYSTERESIS + 1), 300, { rank: 1 })], 16)
    expect(placed(fresh, 'town')).toBe(true)

    // Showing already, it creeps to a pixel away — as a slow zoom out does —
    // and keeps its place rather than blinking.
    frame(fresh, [city, point('town', at(1), 300, { rank: 1 })], 32)
    expect(placed(fresh, 'town')).toBe(true)
    frame(fresh, [city, point('town', at(-1), 300, { rank: 1 })], 48)
    expect(placed(fresh, 'town')).toBe(false)
  })

  test('point labels land on whole device pixels while the camera moves', () => {
    const placer = new LabelPlacer()
    const ctx = context()
    const at: Array<[number, number]> = []
    const original = ctx.drawImage.bind(ctx)
    ctx.drawImage = ((image: any, x: number, y: number) => { at.push([x, y]); return (original as any)(image, x, y) }) as any
    const paint = (c: CanvasRenderingContext2D): void => { c.fillRect(0, 0, 1, 1) }

    // No `snap` passed, as for a frame mid-gesture.
    placer.drawFrame(ctx, [{ labels: [point('a', 400.37, 300.81, { paint })], project: identity }], { width: 800, height: 600, ratio: 2, now: 0 })
    expect(at.length).toBe(1)
    expect(Number.isInteger(at[0]![0])).toBe(true)
    expect(Number.isInteger(at[0]![1])).toBe(true)
  })
})
