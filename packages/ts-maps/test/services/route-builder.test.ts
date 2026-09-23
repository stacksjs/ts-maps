import type { LatLngLike, SegmentRouter } from '../../src/core-map/services'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  climb,
  directionsRouter,
  distanceMeters,
  pathLengthMeters,
  resamplePath,
  RouteBuilder,
  straightRouter,
  ValhallaElevation,
} from '../../src/core-map/services'

const a = { lat: 32.9209, lng: -117.2528 }
const b = { lat: 32.9265, lng: -117.2555 }
const c = { lat: 32.9300, lng: -117.2500 }

/** A router that bends each segment through a midpoint, so routed differs from straight. */
const bendingRouter: SegmentRouter = async (from, to) => [
  from,
  { lat: (from.lat + to.lat) / 2 + 0.001, lng: (from.lng + to.lng) / 2 },
  to,
]

describe('RouteBuilder', () => {
  test('first tap is the start; each next tap routes a segment from the last', async () => {
    const builder = new RouteBuilder({ router: bendingRouter })
    await builder.add(a)
    expect(builder.path).toEqual([a])
    expect(builder.distanceMeters).toBe(0)
    await builder.add(b)
    await builder.add(c)
    expect(builder.waypoints).toEqual([a, b, c])
    expect(builder.segments).toHaveLength(2)
    // Shared ends are not repeated in the joined path.
    expect(builder.path).toHaveLength(5)
    expect(builder.distanceMeters).toBeGreaterThan(pathLengthMeters([a, b, c]))
  })

  test('taps made while routing is slow still draw in order', async () => {
    const slow: SegmentRouter = (from, to) => new Promise(resolve => setTimeout(() => resolve([from, to]), 15))
    const builder = new RouteBuilder({ router: slow })
    const seen: number[] = []
    builder.onChange(x => seen.push(x.pending))
    void builder.add(a)
    void builder.add(b)
    const last = builder.add(c)
    expect(builder.pending).toBe(3)
    await last
    expect(builder.pending).toBe(0)
    expect(builder.waypoints).toEqual([a, b, c])
    expect(seen).toContain(3)
  })

  test('a failed segment falls back to a straight line and says why', async () => {
    const failing: SegmentRouter = async () => {
      throw new Error('rate limited')
    }
    const builder = new RouteBuilder({ router: failing })
    await builder.add(a)
    await builder.add(b)
    expect(builder.segments).toEqual([[a, b]])
    expect(builder.lastError).toBe('rate limited')
  })

  test('without the fallback a failed segment is refused, and later taps still work', async () => {
    let fail = true
    const flaky: SegmentRouter = async (from, to) => {
      if (fail)
        throw new Error('no route')
      return [from, to]
    }
    const builder = new RouteBuilder({ router: flaky, fallbackToStraight: false })
    await builder.add(a)
    await expect(builder.add(b)).rejects.toThrow('no route')
    expect(builder.waypoints).toEqual([a])
    fail = false
    await builder.add(c)
    expect(builder.waypoints).toEqual([a, c])
  })

  test('undo steps back through taps, a loop and an out-and-back', async () => {
    const builder = new RouteBuilder()
    await builder.add(a)
    await builder.add(b)
    await builder.add(c)
    await builder.closeLoop()
    expect(builder.isLoop).toBe(true)
    expect(builder.waypoints).toEqual([a, b, c, a])
    await builder.undo()
    expect(builder.isLoop).toBe(false)
    await builder.undo()
    expect(builder.waypoints).toEqual([a, b])
    await builder.outAndBack()
    expect(builder.waypoints).toEqual([a, b, a])
    expect(builder.distanceMeters).toBeCloseTo(2 * distanceMeters(a, b), 3)
    expect(builder.isLoop).toBe(true)
    await builder.undo()
    expect(builder.waypoints).toEqual([a, b])
  })

  test('closing a loop that is already closed, or too short to be one, does nothing', async () => {
    const builder = new RouteBuilder()
    await builder.add(a)
    await builder.closeLoop()
    expect(builder.waypoints).toEqual([a])
    await builder.add(b)
    await builder.add({ lat: a.lat + 0.0001, lng: a.lng }) // ~11 m from the start
    expect(builder.isLoop).toBe(true)
    await builder.closeLoop()
    expect(builder.waypoints).toHaveLength(3)
  })

  test('clear, then undo the clear', async () => {
    const builder = new RouteBuilder()
    await builder.add(a)
    await builder.add(b)
    await builder.clear()
    expect(builder.path).toEqual([])
    expect(builder.canUndo).toBe(true)
    await builder.undo()
    expect(builder.waypoints).toEqual([a, b])
  })

  test('a closed line loaded from a saved route is a loop; a short scribble is not', async () => {
    const builder = new RouteBuilder()
    await builder.load([a, b, c, a])
    expect(builder.waypoints).toEqual([a, a])
    expect(builder.isLoop).toBe(true)
    await builder.closeLoop()
    expect(builder.path).toHaveLength(4)
    const tiny = new RouteBuilder()
    await tiny.load([a, { lat: a.lat + 0.00005, lng: a.lng }, a])
    expect(tiny.isLoop).toBe(false)
  })

  test('starts from an existing line and extends it', async () => {
    const builder = new RouteBuilder()
    await builder.load([a, b, c])
    expect(builder.path).toEqual([a, b, c])
    expect(builder.waypoints).toEqual([a, c])
    await builder.add(a, { router: straightRouter })
    expect(builder.path).toEqual([a, b, c, a])
    expect(builder.toJSON()).toMatchObject({ loop: true })
  })

  test('directionsRouter routes through a provider on the walking profile', async () => {
    const calls: unknown[] = []
    const provider = {
      name: 'fake',
      getDirections: async (points: LatLngLike[], opts?: { profile?: string }) => {
        calls.push(opts?.profile)
        return [{ distance: 1, duration: 1, geometry: [points[0], { lat: 1, lng: 1 }, points[1]], steps: [] }]
      },
    }
    const route = directionsRouter(provider)
    expect(await route(a, b)).toEqual([a, { lat: 1, lng: 1 }, b])
    expect(calls).toEqual(['walking'])
    const empty = directionsRouter({ name: 'none', getDirections: async () => [] })
    await expect(empty(a, b)).rejects.toThrow(/No route/)
  })
})

describe('paths', () => {
  test('distance and length', () => {
    expect(distanceMeters(a, a)).toBe(0)
    // ~660 m between the two Torrey Pines points.
    expect(distanceMeters(a, b)).toBeGreaterThan(600)
    expect(distanceMeters(a, b)).toBeLessThan(720)
    expect(pathLengthMeters([a, b, a])).toBeCloseTo(2 * distanceMeters(a, b), 6)
  })

  test('resamplePath keeps the ends and spaces points evenly', () => {
    const line = Array.from({ length: 1000 }, (_, i) => ({ lat: 32.9 + i * 0.00001, lng: -117.25 }))
    const thin = resamplePath(line, 50)
    expect(thin).toHaveLength(50)
    expect(thin[0]).toEqual(line[0])
    expect(thin[49]).toEqual(line[999])
    const gaps = thin.slice(1).map((p, i) => distanceMeters(thin[i], p))
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.5)
    expect(resamplePath([a, b], 50)).toEqual([a, b])
  })

  test('climb ignores DEM wobble and missing heights', () => {
    expect(climb([10, 11, 10, 11, 10, 11])).toEqual({ gain: 0, loss: 0 })
    expect(climb([100, 105, null, 120, 90, 95])).toEqual({ gain: 25, loss: 30 })
    expect(climb([100, 101, 102, 103, 104])).toEqual({ gain: 3, loss: 0 })
    expect(climb([])).toEqual({ gain: 0, loss: 0 })
  })
})

describe('ValhallaElevation', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('posts the shape to /height and maps no-data to null', async () => {
    let body: any
    let url = ''
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      url = String(input)
      body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ height: [105, -32768, 19] }))
    }) as typeof fetch
    const elevation = new ValhallaElevation({ baseUrl: 'https://valhalla.test/' })
    expect(await elevation.getElevations([a, b, c])).toEqual([105, null, 19])
    expect(url).toBe('https://valhalla.test/height')
    expect(body).toEqual({ shape: [{ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng }, { lat: c.lat, lon: c.lng }], range: false })
    expect(await elevation.getElevations([])).toEqual([])
  })
})
