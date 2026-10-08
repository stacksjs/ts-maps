import { describe, expect, test } from 'bun:test'
import { poleOfInaccessibility, polygonLabelPoints } from '../src/core-map/symbols/polylabel'

const square = (x: number, y: number, size: number): Array<{ x: number, y: number }> => [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }, { x, y }]

describe('polygon labels', () => {
  test('a square is labelled in its middle', () => {
    const p = poleOfInaccessibility([square(0, 0, 100)])
    expect(p.x).toBeCloseTo(50, 0)
    expect(p.y).toBeCloseTo(50, 0)
  })

  test('an L is labelled inside it, where its centroid is not', () => {
    // The corner of an L: its centroid falls in the missing square.
    const l = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]
    const p = poleOfInaccessibility([l])
    const inside = (p.x <= 100 && p.y <= 30) || (p.x <= 30 && p.y <= 100)
    expect(inside).toBe(true)
  })

  test('a hole is kept clear', () => {
    const outer = square(0, 0, 100)
    const hole = [...square(30, 30, 40)].reverse()
    const p = poleOfInaccessibility([outer, hole])
    expect(p.x > 30 && p.x < 70 && p.y > 30 && p.y < 70).toBe(false)
  })

  test('one point per polygon, holes going with the ring before them', () => {
    const points = polygonLabelPoints([square(0, 0, 100), [...square(40, 40, 20)].reverse(), square(200, 0, 50)])
    expect(points.length).toBe(2)
    expect(points[1]!.x).toBeCloseTo(225, 0)
  })
})
