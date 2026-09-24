import { describe, expect, test } from 'bun:test'
import type { LabelGroup, PointLabel } from '../src/core-map/symbols/LabelPlacer'
import type { Occluder } from '../src/core-map/symbols/BuildingOcclusion'
import { occluded, OccluderIndex, segmentEntry } from '../src/core-map/symbols/BuildingOcclusion'
import { LabelPlacer } from '../src/core-map/symbols/LabelPlacer'

function box(x: number, y: number, w: number, top: number, base = 0): Occluder {
  return {
    ring: new Float64Array([x, y, x + w, y, x + w, y + w, x, y + w]),
    minX: x,
    minY: y,
    maxX: x + w,
    maxY: y + w,
    top,
    base,
  }
}

// A camera due south of the label, in a tile where 1 px is 1 m.
const source = (buildings: Occluder[]) => [{ index: new OccluderIndex(buildings, 512), scale: 1, origin: [0, 0] as [number, number], pxPerMetre: 1 }]
const label = { x: 200, y: 100 }
const camera = { x: 200, y: 500 }

describe('segmentEntry', () => {
  test('finds where a line first enters a polygon', () => {
    const ring = box(100, 100, 100, 10).ring
    expect(segmentEntry(ring, 0, 150, 400, 150)).toBeCloseTo(0.25, 6)
  })

  test('is 0 from inside, and null for a line that misses', () => {
    const ring = box(100, 100, 100, 10).ring
    expect(segmentEntry(ring, 150, 150, 400, 150)).toBe(0)
    expect(segmentEntry(ring, 0, 0, 400, 0)).toBeNull()
  })
})

describe('building occlusion', () => {
  test('a tower between the label and the camera hides it', () => {
    // Sight line climbs 1 px per 2 px travelled (rise 200 over 400); the
    // tower's near face is 100 px out, where the line is 50 up.
    expect(occluded(source([box(180, 200, 40, 120)]), label, camera, 200)).toBe(true)
  })

  test('a building too low to reach the line of sight does not', () => {
    expect(occluded(source([box(180, 200, 40, 30)]), label, camera, 200)).toBe(false)
  })

  test('a building off to the side does not', () => {
    expect(occluded(source([box(400, 200, 40, 300)]), label, camera, 200)).toBe(false)
  })

  test('a building behind the label does not', () => {
    expect(occluded(source([box(180, 20, 40, 300)]), label, camera, 200)).toBe(false)
  })

  test('the label\'s own building does not', () => {
    expect(occluded(source([box(150, 50, 100, 300)]), label, camera, 200)).toBe(false)
  })

  test('a bridge the line passes under does not', () => {
    expect(occluded(source([box(180, 200, 40, 200, 80)]), label, camera, 200)).toBe(false)
  })
})

describe('labels behind buildings', () => {
  const point = (key: string, extra: Partial<PointLabel> = {}): PointLabel => ({
    kind: 'point',
    key,
    layer: 'l',
    rank: 0,
    sortKey: 0,
    order: 0,
    allowOverlap: false,
    ignorePlacement: false,
    padding: 0,
    x: 400,
    y: 300,
    box: { minX: -20, minY: -6, maxX: 20, maxY: 6 },
    bleed: 2,
    paint: () => {},
    signature: key,
    ...extra,
  })

  const frame = (placer: LabelPlacer, labels: PointLabel[], hidden: boolean): void => {
    const canvas = document.createElement('canvas')
    const group: LabelGroup = { labels, project: (x, y) => ({ x, y }) }
    placer.drawFrame(canvas.getContext('2d')!, [group], { width: 800, height: 600, ratio: 1, now: 0, snap: false, occluded: () => hidden })
  }

  test('an occluded label is not placed and leaves its space free', () => {
    const placer = new LabelPlacer()
    // The hidden street name would otherwise have beaten the second label.
    frame(placer, [point('street', { rank: 0 }), point('other', { rank: 1, occludable: false })], true)
    expect(placer._states.get('street')!.placed).toBe(false)
    expect(placer._states.get('other')!.placed).toBe(true)
  })

  test('an area name is not hidden', () => {
    const placer = new LabelPlacer()
    frame(placer, [point('district', { occludable: false })], true)
    expect(placer._states.get('district')!.placed).toBe(true)
  })
})
