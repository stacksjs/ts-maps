import { describe, expect, test } from 'bun:test'
import { OSRMMatrix } from '../../src/core-map/services/providers/OSRM'

function installFetchStub(handler: (url: string) => Promise<Response>): () => void {
  const original = globalThis.fetch
  globalThis.fetch = ((url: any) => handler(String(url))) as typeof fetch
  return () => { globalThis.fetch = original }
}

describe('OSRMMatrix', () => {
  test('builds a /table URL with origin/destination indices', async () => {
    let capturedUrl = ''
    const restore = installFetchStub(async (url) => {
      capturedUrl = url
      return new Response(JSON.stringify({
        code: 'Ok',
        durations: [[0, 120, 250]],
      }))
    })

    try {
      const matrix = new OSRMMatrix({ baseUrl: 'https://osrm.example.com' })
      await matrix.getMatrix(
        [{ lat: 40.0, lng: -74.0 }],
        [
          { lat: 40.1, lng: -74.1 },
          { lat: 40.2, lng: -74.2 },
          { lat: 40.3, lng: -74.3 },
        ],
      )
    }
    finally {
      restore()
    }

    expect(capturedUrl).toContain('https://osrm.example.com/table/v1/driving/')
    expect(capturedUrl).toContain('sources=0')
    expect(capturedUrl).toContain('destinations=1%3B2%3B3')
    expect(capturedUrl).toContain('annotations=duration')
  })

  test('returns parsed durations matrix', async () => {
    const restore = installFetchStub(async () =>
      new Response(JSON.stringify({
        code: 'Ok',
        durations: [[0, 120], [120, 0]],
      })),
    )

    try {
      const matrix = new OSRMMatrix()
      const result = await matrix.getMatrix(
        [{ lat: 40.0, lng: -74.0 }, { lat: 40.1, lng: -74.1 }],
        [{ lat: 40.0, lng: -74.0 }, { lat: 40.1, lng: -74.1 }],
      )
      expect(result.durations).toEqual([[0, 120], [120, 0]])
    }
    finally {
      restore()
    }
  })

  test('replaces null cells with Infinity', async () => {
    const restore = installFetchStub(async () =>
      new Response(JSON.stringify({
        code: 'Ok',
        durations: [[0, null]],
      })),
    )

    try {
      const matrix = new OSRMMatrix()
      const result = await matrix.getMatrix(
        [{ lat: 40.0, lng: -74.0 }],
        [{ lat: 40.0, lng: -74.0 }, { lat: 40.1, lng: -74.1 }],
      )
      expect(result.durations?.[0]?.[1]).toBe(Number.POSITIVE_INFINITY)
    }
    finally {
      restore()
    }
  })

  test('metric: "distance" flips the annotations param', async () => {
    let capturedUrl = ''
    const restore = installFetchStub(async (url) => {
      capturedUrl = url
      return new Response(JSON.stringify({ code: 'Ok', distances: [[0, 10_000]] }))
    })

    try {
      const matrix = new OSRMMatrix()
      await matrix.getMatrix(
        [{ lat: 40.0, lng: -74.0 }],
        [{ lat: 40.0, lng: -74.0 }, { lat: 40.1, lng: -74.1 }],
        { metric: 'distance' },
      )
    }
    finally {
      restore()
    }
    expect(capturedUrl).toContain('annotations=distance')
  })

  test('walking profile is mapped to `foot`', async () => {
    let capturedUrl = ''
    const restore = installFetchStub(async (url) => {
      capturedUrl = url
      return new Response(JSON.stringify({ code: 'Ok', durations: [[0]] }))
    })

    try {
      const matrix = new OSRMMatrix()
      await matrix.getMatrix(
        [{ lat: 40.0, lng: -74.0 }],
        [{ lat: 40.0, lng: -74.0 }],
        { profile: 'walking' },
      )
    }
    finally {
      restore()
    }
    expect(capturedUrl).toContain('/table/v1/foot/')
  })

  test('throws when OSRM code is not "Ok"', async () => {
    const restore = installFetchStub(async () =>
      new Response(JSON.stringify({ code: 'NoRoute', message: 'no route' })),
    )

    try {
      const matrix = new OSRMMatrix()
      await expect(matrix.getMatrix(
        [{ lat: 0, lng: 0 }],
        [{ lat: 1, lng: 1 }],
      )).rejects.toThrow(/NoRoute/)
    }
    finally {
      restore()
    }
  })

  test('throws when origins or destinations are empty', async () => {
    const matrix = new OSRMMatrix()
    await expect(matrix.getMatrix([], [{ lat: 0, lng: 0 }])).rejects.toThrow(/at least one/)
    await expect(matrix.getMatrix([{ lat: 0, lng: 0 }], [])).rejects.toThrow(/at least one/)
  })
})
