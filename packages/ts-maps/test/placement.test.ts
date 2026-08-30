import { describe, expect, test } from 'bun:test'
import { CollisionIndex } from '../src/core-map/symbols/CollisionIndex'
import {
  anchorOffset,
  lineLength,
  offsetPixels,
  placeGlyphsAlongLine,
  pointAtDistance,
  repeatDistances,
  rotatedBounds,
} from '../src/core-map/symbols/placement'

const DEG = Math.PI / 180

describe('anchorOffset', () => {
  test('centre puts the box middle on the anchor', () => {
    expect(anchorOffset('center', 100, 20)).toEqual({ x: -50, y: -10 })
  })

  test('an edge anchor puts that edge on the point, so text runs away from it', () => {
    // 'left' means the label's left edge touches the anchor.
    expect(anchorOffset('left', 100, 20)).toEqual({ x: 0, y: -10 })
    expect(anchorOffset('right', 100, 20)).toEqual({ x: -100, y: -10 })
    expect(anchorOffset('top', 100, 20)).toEqual({ x: -50, y: 0 })
    expect(anchorOffset('bottom', 100, 20)).toEqual({ x: -50, y: -20 })
  })

  test('corner anchors combine both axes', () => {
    expect(anchorOffset('top-left', 100, 20)).toEqual({ x: 0, y: 0 })
    expect(anchorOffset('bottom-right', 100, 20)).toEqual({ x: -100, y: -20 })
  })
})

describe('offsetPixels', () => {
  test('converts ems to pixels at the text size', () => {
    expect(offsetPixels([1, -2], 16)).toEqual({ x: 16, y: -32 })
  })

  test('anything unusable is no offset at all', () => {
    expect(offsetPixels(undefined, 16)).toEqual({ x: 0, y: 0 })
    expect(offsetPixels([1], 16)).toEqual({ x: 0, y: 0 })
    expect(offsetPixels(['a', 'b'], 16)).toEqual({ x: 0, y: 0 })
  })
})

describe('rotatedBounds', () => {
  test('an unrotated box is its own bounds', () => {
    const b = rotatedBounds(10, 20, 100, 30, 0)
    expect(b).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 50 })
  })

  test('a rotated box reserves the space its ink actually covers', () => {
    const flat = rotatedBounds(0, -10, 100, 20, 0, 0, 0)
    const tilted = rotatedBounds(0, -10, 100, 20, 45 * DEG, 0, 0)

    // The whole point: at 45° the box is taller than the unrotated one, so
    // collision stops treating a diagonal label as a thin horizontal strip.
    expect(tilted.maxY - tilted.minY).toBeGreaterThan(flat.maxY - flat.minY)
  })

  test('a quarter turn swaps the extents', () => {
    const b = rotatedBounds(0, 0, 100, 20, 90 * DEG, 0, 0)
    expect(b.maxX - b.minX).toBeCloseTo(20, 6)
    expect(b.maxY - b.minY).toBeCloseTo(100, 6)
  })
})

describe('line geometry', () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]

  test('lineLength sums the segments', () => {
    expect(lineLength(line)).toBe(200)
  })

  test('pointAtDistance walks across segment boundaries', () => {
    expect(pointAtDistance(line, 50)).toEqual({ x: 50, y: 0, angle: 0 })

    const past = pointAtDistance(line, 150)!
    expect(past.x).toBe(100)
    expect(past.y).toBe(50)
    expect(past.angle).toBeCloseTo(90 * DEG, 6)
  })

  test('past the end is null, not a clamped point', () => {
    expect(pointAtDistance(line, 250)).toBeNull()
    expect(pointAtDistance(line, -1)).toBeNull()
  })

  test('zero-length segments are stepped over', () => {
    const withDupe = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }]
    expect(pointAtDistance(withDupe, 50)).toEqual({ x: 50, y: 0, angle: 0 })
  })
})

describe('placeGlyphsAlongLine', () => {
  const straight = [{ x: 0, y: 0 }, { x: 200, y: 0 }]
  const advances = [10, 10, 10]

  test('lays glyphs end to end along a straight line', () => {
    const placed = placeGlyphsAlongLine(straight, { advances, start: 0 })!
    expect(placed.map(g => g.x)).toEqual([0, 10, 20])
    expect(placed.every(g => g.angle === 0)).toBe(true)
  })

  test('follows a turn, rotating each glyph to the local tangent', () => {
    const corner = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 100 }]
    const placed = placeGlyphsAlongLine(corner, { advances: [10, 10, 10, 10], start: 0, maxAngle: 180 })!

    expect(placed[0]!.angle).toBeCloseTo(0, 6)
    // Past the corner the glyphs turn to follow the second segment.
    expect(placed[3]!.angle).toBeCloseTo(90 * DEG, 6)
  })

  test('a label that does not fit is refused rather than squeezed', () => {
    const short = [{ x: 0, y: 0 }, { x: 15, y: 0 }]
    expect(placeGlyphsAlongLine(short, { advances, start: 0 })).toBeNull()
    // Fits in total but not from this start point.
    expect(placeGlyphsAlongLine(straight, { advances, start: 190 })).toBeNull()
  })

  test('a label bending past maxAngle is dropped', () => {
    const hairpin = [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 0, y: 5 }]
    expect(placeGlyphsAlongLine(hairpin, { advances, start: 0, maxAngle: 45 })).toBeNull()
    // The same geometry is fine when the caller tolerates the bend.
    expect(placeGlyphsAlongLine(hairpin, { advances, start: 0, maxAngle: 180 })).not.toBeNull()
  })

  test('a right-to-left line is flipped so text is never upside-down', () => {
    const backwards = [{ x: 200, y: 0 }, { x: 0, y: 0 }]
    const placed = placeGlyphsAlongLine(backwards, { advances, start: 0 })!

    // Upright means angle 0 — the glyphs face right and read left to right,
    // even though the geometry was digitised the other way.
    for (const glyph of placed)
      expect(Math.abs(glyph.angle % (Math.PI * 2))).toBeLessThan(1e-6)

    // ...and they march left to right across the screen.
    for (let i = 1; i < placed.length; i++)
      expect(placed[i]!.x).toBeGreaterThan(placed[i - 1]!.x)

    // Without the flip they face back along the line: mirror-written text.
    const raw = placeGlyphsAlongLine(backwards, { advances, start: 0, keepUpright: false })!
    expect(Math.abs(raw[0]!.angle)).toBeCloseTo(Math.PI, 6)
  })

  test('an empty label places nothing', () => {
    expect(placeGlyphsAlongLine(straight, { advances: [], start: 0 })).toBeNull()
    expect(placeGlyphsAlongLine([{ x: 0, y: 0 }], { advances, start: 0 })).toBeNull()
  })
})

describe('repeatDistances', () => {
  test('repeats a label down a long line', () => {
    const spots = repeatDistances(1000, 100, 250)
    expect(spots.length).toBeGreaterThan(2)
    expect(spots[1]! - spots[0]!).toBe(250)
    // Every placement leaves room for the whole label.
    for (const d of spots)
      expect(d + 100).toBeLessThanOrEqual(1000)
  })

  test('a short line gets one centred placement', () => {
    expect(repeatDistances(300, 100, 250)).toEqual([100])
  })

  test('a line too short for the label gets nothing', () => {
    expect(repeatDistances(50, 100, 250)).toEqual([])
  })
})

describe('CollisionIndex', () => {
  test('rejects an overlapping box', () => {
    const index = new CollisionIndex()
    expect(index.tryInsert({ minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(true)
    expect(index.tryInsert({ minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(false)
    expect(index.tryInsert({ minX: 20, minY: 20, maxX: 30, maxY: 30 })).toBe(true)
  })

  test('a higher-priority symbol displaces a lower-priority one', () => {
    const index = new CollisionIndex()
    index.tryInsert({ minX: 0, minY: 0, maxX: 10, maxY: 10, priority: 1 })
    expect(index.tryInsert({ minX: 5, minY: 5, maxX: 15, maxY: 15, priority: 0 })).toBe(false)
    expect(index.tryInsert({ minX: 5, minY: 5, maxX: 15, maxY: 15, priority: 2 })).toBe(true)
  })

  test('spans coordinates far outside any single tile, in both directions', () => {
    // The old fixed grid clamped everything outside its bounds into the edge
    // cell, so distant labels collided with each other for no reason.
    const index = new CollisionIndex()
    expect(index.tryInsert({ minX: -50000, minY: -50000, maxX: -49990, maxY: -49990 })).toBe(true)
    expect(index.tryInsert({ minX: 50000, minY: 50000, maxX: 50010, maxY: 50010 })).toBe(true)
    expect(index.size).toBe(2)
  })

  test('catches a collision across a tile seam', () => {
    // Two tiles, 512px each, both placing a label that straddles the boundary.
    const index = new CollisionIndex()
    const fromLeftTile = { minX: 500, minY: 100, maxX: 540, maxY: 120, owner: '0/0/0' }
    const fromRightTile = { minX: 520, minY: 100, maxX: 560, maxY: 120, owner: '0/1/0' }

    expect(index.tryInsert(fromLeftTile)).toBe(true)
    expect(index.tryInsert(fromRightTile)).toBe(false)
  })

  test('removeOwner lets a tile redraw without fighting its own ghosts', () => {
    const index = new CollisionIndex()
    const box = { minX: 0, minY: 0, maxX: 10, maxY: 10, owner: '0/0/0' }

    expect(index.tryInsert(box)).toBe(true)
    // Redrawing the same tile: without eviction this second insert fails and
    // the tile loses its label.
    expect(index.tryInsert({ ...box })).toBe(false)

    index.removeOwner('0/0/0')
    expect(index.size).toBe(0)
    expect(index.tryInsert({ ...box })).toBe(true)
  })

  test('removeOwner leaves other owners alone', () => {
    const index = new CollisionIndex()
    index.tryInsert({ minX: 0, minY: 0, maxX: 10, maxY: 10, owner: 'a' })
    index.tryInsert({ minX: 100, minY: 0, maxX: 110, maxY: 10, owner: 'b' })

    index.removeOwner('a')

    expect(index.size).toBe(1)
    expect(index.tryInsert({ minX: 100, minY: 0, maxX: 110, maxY: 10 })).toBe(false)
  })

  test('clear empties everything', () => {
    const index = new CollisionIndex()
    index.tryInsert({ minX: 0, minY: 0, maxX: 10, maxY: 10, owner: 'a' })
    index.clear()
    expect(index.size).toBe(0)
    expect(index.tryInsert({ minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(true)
  })
})
