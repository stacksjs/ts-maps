import { afterEach, describe, expect, test } from 'bun:test'
import {
  ValhallaDirections,
  ValhallaIsochrone,
  ValhallaMatrix,
} from '../../src/core-map/services/providers/Valhalla'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

interface FetchCall {
  url: string
  init?: FetchInit
  body?: unknown
}

const originalFetch = globalThis.fetch

function mockRouter(router: (url: string) => unknown): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    let parsed: unknown
    if (init?.body) {
      try {
        parsed = JSON.parse(String(init.body))
      }
      catch {
        parsed = init.body
      }
    }
    calls.push({ url, init, body: parsed })
    const body = router(url)
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
    } as Response
  }) as typeof fetch
  return { calls }
}

// Valhalla polyline precision 6: encode [[0,0],[0.00001,0.00001]] → '??CC'
// Instead of relying on hand-rolled encoding, supply a known small pair.
// "??AA" decodes at precision 6 to two points very close to (0, 0).

describe('ValhallaDirections', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('name is valhalla', () => {
    expect(new ValhallaDirections().name).toBe('valhalla')
  })

  test('decodes polyline precision-6 and composes route', async () => {
    mockRouter(() => ({
      trip: {
        summary: { length: 1.5, time: 120 }, // 1.5km, 2min
        legs: [
          {
            summary: { length: 1.5, time: 120 },
            // polyline for two points near origin
            shape: '??_ibE_ibE',
            maneuvers: [
              { length: 0.5, time: 60, instruction: 'Start', begin_shape_index: 0, end_shape_index: 0 },
              { length: 1.0, time: 60, instruction: 'Arrive', begin_shape_index: 0, end_shape_index: 1 },
            ],
          },
        ],
      },
    }))
    const v = new ValhallaDirections()
    const routes = await v.getDirections([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])
    expect(routes.length).toBe(1)
    expect(routes[0].distance).toBe(1500) // 1.5km → 1500m
    expect(routes[0].duration).toBe(120)
    expect(routes[0].steps.length).toBe(2)
    expect(routes[0].steps[0].instruction).toBe('Start')
    expect(routes[0].geometry.length).toBeGreaterThan(0)
  })

  test('posts JSON body with waypoints and costing', async () => {
    const { calls } = mockRouter(() => ({ trip: { legs: [], summary: { length: 0, time: 0 } } }))
    await new ValhallaDirections().getDirections(
      [{ lat: 10, lng: 20 }, { lat: 11, lng: 21 }],
      { profile: 'cycling', language: 'es' },
    )
    const body = calls[0].body as Record<string, unknown>
    expect(body.costing).toBe('bicycle')
    expect(body.locations).toEqual([{ lat: 10, lon: 20 }, { lat: 11, lon: 21 }])
    const opts = body.directions_options as { language?: string }
    expect(opts.language).toBe('es')
  })

  test('appends api_key when provided', async () => {
    const { calls } = mockRouter(() => ({ trip: { legs: [], summary: { length: 0, time: 0 } } }))
    await new ValhallaDirections({ apiKey: 'secret' }).getDirections(
      [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
    )
    expect(calls[0].url).toContain('api_key=secret')
  })

  test('includes alternates when requested', async () => {
    mockRouter(() => ({
      trip: { summary: { length: 1, time: 60 }, legs: [] },
      alternates: [{ trip: { summary: { length: 2, time: 90 }, legs: [] } }],
    }))
    const routes = await new ValhallaDirections().getDirections(
      [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
      { alternatives: true },
    )
    expect(routes.length).toBe(2)
    expect(routes[1].distance).toBe(2000)
  })
})

// Valhalla isochrone returns a FeatureCollection — this shape differs from
// OSRM/Mapbox endpoints that return flat coordinate arrays. The provider
// normalises it into our IsochronePolygon interface.
describe('ValhallaIsochrone', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('parses Polygon features into IsochronePolygon list', async () => {
    mockRouter(() => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { contour: 5, metric: 'time' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [[2.0, 48.0], [2.1, 48.0], [2.1, 48.1], [2.0, 48.1], [2.0, 48.0]],
              [[2.02, 48.02], [2.03, 48.02], [2.03, 48.03], [2.02, 48.02]],
            ],
          },
        },
      ],
    }))
    const iso = new ValhallaIsochrone()
    const polys = await iso.getIsochrones({ lat: 48.05, lng: 2.05 }, { contours: [5] })
    expect(polys.length).toBe(1)
    expect(polys[0].contour).toBe(5)
    expect(polys[0].geometry.length).toBe(5)
    expect(polys[0].geometry[0]).toEqual({ lat: 48.0, lng: 2.0 })
    expect(polys[0].holes?.length).toBe(1)
  })

  test('sends contours as time by default and distance on request', async () => {
    const { calls } = mockRouter(() => ({ type: 'FeatureCollection', features: [] }))
    const iso = new ValhallaIsochrone()
    await iso.getIsochrones({ lat: 0, lng: 0 }, { contours: [5, 10] })
    let body = calls[0].body as Record<string, unknown>
    expect(body.contours).toEqual([{ time: 5 }, { time: 10 }])
    expect(body.polygons).toBe(true)

    await iso.getIsochrones({ lat: 0, lng: 0 }, { contours: [1000], contourMetric: 'distance' })
    body = calls[1].body as Record<string, unknown>
    expect(body.contours).toEqual([{ distance: 1000 }])
  })

  test('handles MultiPolygon features', async () => {
    mockRouter(() => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { contour: 10 },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [[[0, 0], [1, 0], [1, 1], [0, 0]]],
              [[[2, 2], [3, 2], [3, 3], [2, 2]]],
            ],
          },
        },
      ],
    }))
    const polys = await new ValhallaIsochrone().getIsochrones({ lat: 0, lng: 0 }, { contours: [10] })
    expect(polys.length).toBe(2)
    expect(polys.every(p => p.contour === 10)).toBe(true)
  })

  test('forwards denoise and generalize', async () => {
    const { calls } = mockRouter(() => ({ type: 'FeatureCollection', features: [] }))
    await new ValhallaIsochrone().getIsochrones(
      { lat: 0, lng: 0 },
      { contours: [5], denoise: 0.5, generalize: 100 },
    )
    const body = calls[0].body as Record<string, unknown>
    expect(body.denoise).toBe(0.5)
    expect(body.generalize).toBe(100)
  })
})

describe('ValhallaMatrix', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('parses sources_to_targets into durations and distances', async () => {
    mockRouter(() => ({
      sources_to_targets: [
        [
          { time: 100, distance: 5 },
          { time: 200, distance: 10 },
        ],
        [
          { time: 150, distance: 7 },
          { time: 0, distance: 0 },
        ],
      ],
    }))
    const m = await new ValhallaMatrix().getMatrix(
      [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
      [{ lat: 2, lng: 2 }, { lat: 3, lng: 3 }],
    )
    expect(m.durations).toEqual([[100, 200], [150, 0]])
    // km → m
    expect(m.distances).toEqual([[5000, 10000], [7000, 0]])
  })

  test('posts sources and targets', async () => {
    const { calls } = mockRouter(() => ({ sources_to_targets: [] }))
    await new ValhallaMatrix().getMatrix(
      [{ lat: 10, lng: 20 }],
      [{ lat: 11, lng: 21 }],
      { profile: 'walking' },
    )
    const body = calls[0].body as Record<string, unknown>
    expect(body.sources).toEqual([{ lat: 10, lon: 20 }])
    expect(body.targets).toEqual([{ lat: 11, lon: 21 }])
    expect(body.costing).toBe('pedestrian')
  })
})
