import { describe, expect, test } from 'bun:test'
import { deviation, earcut, flatten } from '../src/core-map/geometry/earcut'

describe('earcut', () => {
  test('triangulates a unit triangle into a single triangle', () => {
    const indices = earcut([0, 0, 1, 0, 0, 1])
    expect(indices.length).toBe(3)
    const unique = new Set(indices)
    expect(unique.size).toBe(3)
    // Indices reference vertex slots 0/1/2 only.
    for (const i of indices)
      expect(i).toBeLessThan(3)
  })

  test('triangulates a CCW square into 2 triangles (6 indices)', () => {
    // Square (0,0)-(1,0)-(1,1)-(0,1)
    const verts = [0, 0, 1, 0, 1, 1, 0, 1]
    const indices = earcut(verts)
    expect(indices.length).toBe(6)
    const unique = new Set(indices)
    expect(unique.size).toBe(4)
    for (const i of indices)
      expect(i).toBeLessThan(4)
  })

  test('triangulates a CW square by tolerating signed area direction', () => {
    const verts = [0, 0, 0, 1, 1, 1, 1, 0]
    const indices = earcut(verts)
    expect(indices.length).toBe(6)
    // Area should be close to 1 (square); deviation should be negligible.
    const dev = deviation(verts, undefined, 2, indices)
    expect(dev).toBeLessThan(1e-6)
  })

  test('square deviation is near zero (well-formed fill)', () => {
    const verts = [0, 0, 10, 0, 10, 10, 0, 10]
    const indices = earcut(verts)
    const dev = deviation(verts, undefined, 2, indices)
    expect(dev).toBeLessThan(1e-6)
  })

  test('triangulates a square with a square hole into 8 triangles', () => {
    // Outer ring (0..10 square) + inner hole (3..7 square).
    const verts = [
      0, 0, 10, 0, 10, 10, 0, 10,
      3, 3, 7, 3, 7, 7, 3, 7,
    ]
    const holes = [4] // hole starts at vertex index 4
    const indices = earcut(verts, holes)
    expect(indices.length).toBe(8 * 3) // 8 triangles
    const dev = deviation(verts, holes, 2, indices)
    expect(dev).toBeLessThan(1e-10)
  })

  test('empty / degenerate input returns an empty index buffer', () => {
    expect(earcut([])).toEqual([])
    expect(earcut([0, 0])).toEqual([])
    // Two coincident points — no triangle possible.
    expect(earcut([1, 1, 1, 1])).toEqual([])
  })

  test('flatten(Point[][]) returns expected vertices + hole offsets', () => {
    const rings = [
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }],
    ]
    const out = flatten(rings)
    expect(out.dimensions).toBe(2)
    expect(out.vertices.length).toBe(16)
    expect(out.holes).toEqual([4])
    // First vertex is (0, 0); first hole vertex is (0.25, 0.25) at index 4.
    expect(out.vertices[0]).toBe(0)
    expect(out.vertices[1]).toBe(0)
    expect(out.vertices[8]).toBe(0.25)
    expect(out.vertices[9]).toBe(0.25)
  })

  test('flatten accepts the legacy [x, y][][] encoding', () => {
    const rings = [
      [[0, 0], [1, 0], [1, 1], [0, 1]],
    ]
    const out = flatten(rings as number[][][])
    expect(out.vertices).toEqual([0, 0, 1, 0, 1, 1, 0, 1])
    expect(out.holes).toEqual([])
  })

  test('flatten + earcut chain produces a valid triangulation of a hole polygon', () => {
    const rings = [
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }],
    ]
    const { vertices, holes } = flatten(rings)
    const indices = earcut(vertices, holes, 2)
    expect(indices.length).toBe(24)
    expect(deviation(vertices, holes, 2, indices)).toBeLessThan(1e-10)
  })

  test('deviation reports zero on an exact fill', () => {
    const verts = [0, 0, 2, 0, 2, 2, 0, 2]
    const indices = earcut(verts)
    expect(deviation(verts, undefined, 2, indices)).toBe(0)
  })

  test('earcut handles a concave polygon (L shape)', () => {
    // L-shape: outer boundary with a concave notch at the top-right.
    const verts = [
      0, 0,
      4, 0,
      4, 2,
      2, 2,
      2, 4,
      0, 4,
    ]
    const indices = earcut(verts)
    // 6 vertices → 4 triangles (12 indices).
    expect(indices.length).toBe(12)
    const dev = deviation(verts, undefined, 2, indices)
    expect(dev).toBeLessThan(1e-10)
  })

  test('earcut handles a larger polygon (exercises z-order path)', () => {
    // Generate a 200-vertex circle.
    const verts: number[] = []
    const n = 200
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2
      verts.push(Math.cos(t), Math.sin(t))
    }
    const indices = earcut(verts)
    // Triangle count for a simple polygon is exactly (n - 2).
    expect(indices.length).toBe((n - 2) * 3)
    const dev = deviation(verts, undefined, 2, indices)
    expect(dev).toBeLessThan(1e-6)
  })
})
