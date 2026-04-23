import { describe, expect, test } from 'bun:test'
import { CollisionIndex } from '../src/core-map/symbols/CollisionIndex'

describe('CollisionIndex', () => {
  test('non-overlapping boxes both insert', () => {
    const idx = new CollisionIndex({ width: 256, height: 256 })
    expect(idx.tryInsert({ minX: 0, minY: 0, maxX: 20, maxY: 20 })).toBe(true)
    expect(idx.tryInsert({ minX: 100, minY: 100, maxX: 120, maxY: 120 })).toBe(true)
  })

  test('overlapping second box is rejected via tryInsert', () => {
    const idx = new CollisionIndex({ width: 256, height: 256 })
    expect(idx.tryInsert({ minX: 10, minY: 10, maxX: 60, maxY: 60 })).toBe(true)
    // Overlap with the first box; undefined priorities → conservative reject.
    expect(idx.tryInsert({ minX: 40, minY: 40, maxX: 90, maxY: 90 })).toBe(false)
  })

  test('higher-priority box displaces a lower-priority existing neighbour', () => {
    const idx = new CollisionIndex({ width: 256, height: 256 })
    expect(idx.tryInsert({ minX: 10, minY: 10, maxX: 60, maxY: 60, priority: 1 })).toBe(true)
    // New box has higher priority → should succeed (existing priority 1 < 5).
    expect(idx.tryInsert({ minX: 40, minY: 40, maxX: 90, maxY: 90, priority: 5 })).toBe(true)
  })

  test('equal or lower priority rejects on collision', () => {
    const idx = new CollisionIndex({ width: 256, height: 256 })
    expect(idx.tryInsert({ minX: 10, minY: 10, maxX: 60, maxY: 60, priority: 5 })).toBe(true)
    expect(idx.tryInsert({ minX: 40, minY: 40, maxX: 90, maxY: 90, priority: 5 })).toBe(false)
    expect(idx.tryInsert({ minX: 40, minY: 40, maxX: 90, maxY: 90, priority: 1 })).toBe(false)
  })

  test('clear resets the index so a previously rejecting box now fits', () => {
    const idx = new CollisionIndex({ width: 256, height: 256 })
    idx.insert({ minX: 10, minY: 10, maxX: 60, maxY: 60 })
    expect(idx.tryInsert({ minX: 30, minY: 30, maxX: 80, maxY: 80 })).toBe(false)

    idx.clear()
    expect(idx.tryInsert({ minX: 30, minY: 30, maxX: 80, maxY: 80 })).toBe(true)
  })

  test('cellSize default of 64 buckets boxes into overlapping cells', () => {
    const idx = new CollisionIndex({ width: 256, height: 256 })
    // Box straddling cells (63-65) across the cell boundary at x=64.
    expect(idx.tryInsert({ minX: 63, minY: 10, maxX: 65, maxY: 12 })).toBe(true)
    // Another box entirely in the right-adjacent cell but overlapping the first.
    expect(idx.tryInsert({ minX: 64, minY: 11, maxX: 66, maxY: 13 })).toBe(false)
  })
})
