import { afterEach, describe, expect, test } from 'bun:test'
import { OSRMDirections } from '../../src/core-map/services/providers/OSRM'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

interface FetchCall {
  url: string
  init?: FetchInit
}

const originalFetch = globalThis.fetch

function mockFetch(handler: (req: FetchCall) => unknown, opts?: { ok?: boolean, status?: number }): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    const call: FetchCall = { url, init }
    calls.push(call)
    const body = handler(call)
    return {
      ok: opts?.ok ?? true,
      status: opts?.status ?? 200,
      statusText: 'OK',
      json: async () => body,
    } as Response
  }) as typeof fetch
  return { calls }
}

const osrmResponse = {
  code: 'Ok',
  routes: [
    {
      distance: 1000,
      duration: 60,
      geometry: {
        type: 'LineString',
        coordinates: [[2.35, 48.85], [2.36, 48.86], [2.37, 48.87]],
      },
      legs: [
        {
          distance: 1000,
          duration: 60,
          steps: [
            {
              distance: 500,
              duration: 30,
              geometry: { type: 'LineString', coordinates: [[2.35, 48.85], [2.36, 48.86]] },
              name: 'Rue de Rivoli',
              maneuver: { type: 'depart', instruction: 'Head east on Rue de Rivoli' },
            },
            {
              distance: 500,
              duration: 30,
              geometry: { type: 'LineString', coordinates: [[2.36, 48.86], [2.37, 48.87]] },
              name: 'Boulevard Haussmann',
              maneuver: { type: 'turn', modifier: 'left' },
            },
          ],
        },
      ],
    },
  ],
}

describe('OSRMDirections', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('name is osrm', () => {
    expect(new OSRMDirections().name).toBe('osrm')
  })

  test('throws when fewer than two waypoints', async () => {
    const osrm = new OSRMDirections()
    await expect(osrm.getDirections([{ lat: 0, lng: 0 }])).rejects.toThrow(/two waypoints/)
  })

  test('parses route shape into Route[]', async () => {
    mockFetch(() => osrmResponse)
    const osrm = new OSRMDirections()
    const routes = await osrm.getDirections([
      { lat: 48.85, lng: 2.35 },
      { lat: 48.87, lng: 2.37 },
    ])
    expect(routes.length).toBe(1)
    const route = routes[0]
    expect(route.distance).toBe(1000)
    expect(route.duration).toBe(60)
    expect(route.geometry).toEqual([
      { lat: 48.85, lng: 2.35 },
      { lat: 48.86, lng: 2.36 },
      { lat: 48.87, lng: 2.37 },
    ])
    expect(route.steps.length).toBe(2)
    expect(route.steps[0].instruction).toBe('Head east on Rue de Rivoli')
    expect(route.steps[1].maneuver).toBe('turn-left')
  })

  test('builds request URL with profile, coords, and flags', async () => {
    const { calls } = mockFetch(() => osrmResponse)
    const osrm = new OSRMDirections()
    await osrm.getDirections(
      [{ lat: 10, lng: 20 }, { lat: 11, lng: 21 }],
      { profile: 'walking', alternatives: true },
    )
    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/route/v1/foot/20,10;21,11')
    expect(url.searchParams.get('overview')).toBe('full')
    expect(url.searchParams.get('geometries')).toBe('geojson')
    expect(url.searchParams.get('steps')).toBe('true')
    expect(url.searchParams.get('alternatives')).toBe('true')
  })

  test('maps cycling profile to bike', async () => {
    const { calls } = mockFetch(() => osrmResponse)
    await new OSRMDirections().getDirections(
      [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
      { profile: 'cycling' },
    )
    expect(calls[0].url).toContain('/route/v1/bike/')
  })

  test('honours custom baseUrl', async () => {
    const { calls } = mockFetch(() => osrmResponse)
    const osrm = new OSRMDirections({ baseUrl: 'https://osrm.example.com/' })
    await osrm.getDirections([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])
    expect(calls[0].url.startsWith('https://osrm.example.com/route/v1/')).toBe(true)
  })

  test('rejects on OSRM error code', async () => {
    mockFetch(() => ({ code: 'NoRoute', message: 'no route found' }))
    await expect(
      new OSRMDirections().getDirections([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]),
    ).rejects.toThrow(/NoRoute/)
  })

  test('rejects on HTTP failure', async () => {
    mockFetch(() => ({}), { ok: false, status: 503 })
    await expect(
      new OSRMDirections().getDirections([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]),
    ).rejects.toThrow(/503/)
  })

  test('forwards AbortSignal', async () => {
    globalThis.fetch = (async (_input: FetchInput, init?: FetchInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }) as typeof fetch
    const osrm = new OSRMDirections()
    const c = new AbortController()
    const p = osrm.getDirections([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], { signal: c.signal })
    c.abort()
    await expect(p).rejects.toThrow(/aborted/)
  })

  test('includes legs mirroring the route shape', async () => {
    mockFetch(() => osrmResponse)
    const routes = await new OSRMDirections().getDirections([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
    ])
    expect(routes[0].legs?.length).toBe(1)
    expect(routes[0].legs?.[0].distance).toBe(1000)
  })
})
