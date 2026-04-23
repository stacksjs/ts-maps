import { describe, expect, test } from 'bun:test'
import { RTree } from '../src/core-map/geometry/RTree'
import type { BBox } from '../src/core-map/geometry/RTree'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function randBBox(rng: () => number, maxCoord = 1000, maxSize = 50): BBox {
  const x = Math.floor(rng() * maxCoord)
  const y = Math.floor(rng() * maxCoord)
  const w = 1 + Math.floor(rng() * maxSize)
  const h = 1 + Math.floor(rng() * maxSize)
  return [x, y, x + w, y + h]
}

function intersects(a: BBox, b: BBox): boolean {
  return b[0] <= a[2] && b[1] <= a[3] && b[2] >= a[0] && b[3] >= a[1]
}

function containsPoint(b: BBox, x: number, y: number): boolean {
  return b[0] <= x && x <= b[2] && b[1] <= y && y <= b[3]
}

// Deterministic LCG so tests stay reproducible.
function seededRng(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RTree: empty tree', () => {
  test('search on an empty tree returns no hits', () => {
    const t = new RTree<number>()
    expect(t.size()).toBe(0)
    expect(t.search([0, 0, 10, 10])).toEqual([])
    expect(t.searchPoint(5, 5)).toEqual([])
    expect(t.all()).toEqual([])
  })

  test('remove on an empty tree is a no-op', () => {
    const t = new RTree<number>()
    t.remove([0, 0, 1, 1], 42)
    expect(t.size()).toBe(0)
  })
})

describe('RTree: single-entry tree', () => {
  test('insert then search finds exactly the one entry', () => {
    const t = new RTree<string>()
    t.insert([10, 10, 20, 20], 'a')
    expect(t.size()).toBe(1)

    expect(t.search([0, 0, 100, 100]).map(e => e.data)).toEqual(['a'])
    expect(t.search([5, 5, 12, 12]).map(e => e.data)).toEqual(['a'])
    expect(t.search([50, 50, 60, 60])).toEqual([])
    expect(t.searchPoint(15, 15).map(e => e.data)).toEqual(['a'])
    expect(t.searchPoint(100, 100)).toEqual([])
  })

  test('remove drops the only entry', () => {
    const t = new RTree<string>()
    t.insert([0, 0, 5, 5], 'only')
    t.remove([0, 0, 5, 5], 'only')
    expect(t.size()).toBe(0)
    expect(t.search([0, 0, 10, 10])).toEqual([])
  })
})

describe('RTree: exactly maxEntries entries', () => {
  test('stays a single-level tree', () => {
    const t = new RTree<number>({ maxEntries: 9 })
    for (let i = 0; i < 9; i++)
      t.insert([i * 10, 0, i * 10 + 5, 5], i)
    expect(t.size()).toBe(9)

    const hits = t.search([0, 0, 100, 100])
    expect(hits.map(h => h.data).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])

    // One more forces a split.
    t.insert([95, 0, 100, 5], 9)
    expect(t.size()).toBe(10)
    expect(t.search([0, 0, 100, 100]).length).toBe(10)
  })
})

describe('RTree: random search correctness', () => {
  test('search returns exactly the intersecting subset', () => {
    const rng = seededRng(42)
    const N = 200
    const items: Array<{ bbox: BBox, data: number }> = []
    for (let i = 0; i < N; i++)
      items.push({ bbox: randBBox(rng), data: i })

    const t = new RTree<number>()
    for (const it of items)
      t.insert(it.bbox, it.data)
    expect(t.size()).toBe(N)

    const query: BBox = [200, 200, 500, 500]
    const expected = new Set(items.filter(it => intersects(it.bbox, query)).map(it => it.data))
    const actual = new Set(t.search(query).map(h => h.data))
    expect(actual.size).toBe(expected.size)
    for (const id of expected)
      expect(actual.has(id)).toBe(true)
  })

  test('searchPoint returns entries whose bbox contains the point', () => {
    const rng = seededRng(7)
    const items: Array<{ bbox: BBox, data: number }> = []
    for (let i = 0; i < 150; i++)
      items.push({ bbox: randBBox(rng), data: i })

    const t = new RTree<number>()
    for (const it of items)
      t.insert(it.bbox, it.data)

    const px = 321
    const py = 456
    const expected = new Set(items.filter(it => containsPoint(it.bbox, px, py)).map(it => it.data))
    const actual = new Set(t.searchPoint(px, py).map(h => h.data))
    expect(actual.size).toBe(expected.size)
    for (const id of expected)
      expect(actual.has(id)).toBe(true)
  })
})

describe('RTree: bulk-load parity with incremental insert', () => {
  test('load() yields the same membership as sequential inserts', () => {
    const rng = seededRng(12345)
    const items: Array<{ bbox: BBox, data: number }> = []
    for (let i = 0; i < 300; i++)
      items.push({ bbox: randBBox(rng), data: i })

    const a = new RTree<number>()
    for (const it of items)
      a.insert(it.bbox, it.data)

    const b = new RTree<number>()
    b.load(items)

    expect(b.size()).toBe(a.size())

    const queries: BBox[] = [
      [0, 0, 100, 100],
      [100, 100, 300, 300],
      [500, 500, 900, 900],
      [0, 0, 1100, 1100],
    ]
    for (const q of queries) {
      const aIds = new Set(a.search(q).map(h => h.data))
      const bIds = new Set(b.search(q).map(h => h.data))
      expect(bIds.size).toBe(aIds.size)
      for (const id of aIds)
        expect(bIds.has(id)).toBe(true)
    }
  })
})

describe('RTree: remove preserves correctness', () => {
  test('100 random insert/remove ops leave the tree consistent', () => {
    const rng = seededRng(9001)
    const t = new RTree<number>()
    const live = new Map<number, BBox>()

    let nextId = 0
    for (let op = 0; op < 100; op++) {
      const doInsert = rng() < 0.6 || live.size === 0
      if (doInsert) {
        const bbox = randBBox(rng)
        const id = nextId++
        t.insert(bbox, id)
        live.set(id, bbox)
      }
      else {
        // Pick an arbitrary live id and drop it.
        const ids = Array.from(live.keys())
        const id = ids[Math.floor(rng() * ids.length)]
        const bbox = live.get(id)!
        t.remove(bbox, id)
        live.delete(id)
      }
    }

    expect(t.size()).toBe(live.size)

    // Verify the tree reports every live entry and nothing else.
    const all = new Set(t.all().map(e => e.data))
    expect(all.size).toBe(live.size)
    for (const id of live.keys())
      expect(all.has(id)).toBe(true)

    // A broad search should return the full live set.
    const broad = new Set(t.search([-1, -1, 2000, 2000]).map(e => e.data))
    expect(broad.size).toBe(live.size)
  })

  test('remove returns the tree unchanged when data is not present', () => {
    const t = new RTree<string>()
    t.insert([0, 0, 10, 10], 'x')
    t.remove([0, 0, 10, 10], 'not-there')
    expect(t.size()).toBe(1)
    expect(t.search([0, 0, 10, 10]).map(e => e.data)).toEqual(['x'])
  })

  test('custom equalsFn matches structural equality', () => {
    interface Item { id: number }
    const t = new RTree<Item>()
    const a: Item = { id: 1 }
    t.insert([0, 0, 10, 10], a)
    // Different object reference but same id — default `===` wouldn't match.
    t.remove([0, 0, 10, 10], { id: 1 }, (x, y) => x.id === y.id)
    expect(t.size()).toBe(0)
  })
})

describe('RTree: clear and all', () => {
  test('clear resets the tree', () => {
    const t = new RTree<number>()
    for (let i = 0; i < 50; i++)
      t.insert([i, i, i + 1, i + 1], i)
    t.clear()
    expect(t.size()).toBe(0)
    expect(t.all()).toEqual([])
  })

  test('all enumerates everything inserted', () => {
    const rng = seededRng(5)
    const items: Array<{ bbox: BBox, data: number }> = []
    for (let i = 0; i < 40; i++)
      items.push({ bbox: randBBox(rng), data: i })

    const t = new RTree<number>()
    for (const it of items)
      t.insert(it.bbox, it.data)

    const ids = new Set(t.all().map(e => e.data))
    expect(ids.size).toBe(items.length)
    for (const it of items)
      expect(ids.has(it.data)).toBe(true)
  })
})

describe('RTree: configurable branching factor', () => {
  test('works with maxEntries = 4', () => {
    const t = new RTree<number>({ maxEntries: 4 })
    for (let i = 0; i < 25; i++)
      t.insert([i, i, i + 1, i + 1], i)
    expect(t.size()).toBe(25)
    const hits = t.search([5, 5, 10, 10])
    const ids = new Set(hits.map(h => h.data))
    // Items i with [i, i, i+1, i+1] intersect [5,5,10,10] iff i ∈ [4, 10].
    for (const i of [4, 5, 6, 7, 8, 9, 10])
      expect(ids.has(i)).toBe(true)
  })
})
