import { describe, expect, test } from 'bun:test'
import { decodeMapboxRGB, decodeTerrariumRGB, RasterDEMLayer } from '../src/core-map/layer/tile/RasterDEMLayer'

describe('decodeMapboxRGB', () => {
  test('decodes the encoding-reference value', () => {
    // Per the spec: `height = -10000 + (R*65536 + G*256 + B) * 0.1`.
    // A pixel of (0, 0, 0) encodes -10000 m.
    expect(decodeMapboxRGB(0, 0, 0)).toBeCloseTo(-10000, 5)
  })

  test('decodes a mid-range elevation', () => {
    // pick (R=1, G=134, B=160) → height = -10000 + (1*65536 + 134*256 + 160) * 0.1
    const h = decodeMapboxRGB(1, 134, 160)
    expect(h).toBeGreaterThan(-10000)
    expect(h).toBeLessThan(10000)
  })
})

describe('decodeTerrariumRGB', () => {
  test('decodes sea level (128, 0, 0) correctly', () => {
    // Terrarium: height = (R*256 + G + B/256) - 32768; (128, 0, 0) = 32768 - 32768 = 0
    expect(decodeTerrariumRGB(128, 0, 0)).toBeCloseTo(0, 5)
  })

  test('decodes a negative elevation (0, 0, 0) → -32768', () => {
    expect(decodeTerrariumRGB(0, 0, 0)).toBeCloseTo(-32768, 5)
  })
})

describe('RasterDEMLayer', () => {
  test('constructs with mapbox encoding by default', () => {
    const layer = new RasterDEMLayer('https://example.com/{z}/{x}/{y}.png')
    expect((layer as any)._encoding).toBe('mapbox')
  })

  test('honors explicit encoding option', () => {
    const layer = new RasterDEMLayer('https://example.com/{z}/{x}/{y}.png', {
      encoding: 'terrarium',
    })
    expect((layer as any)._encoding).toBe('terrarium')
  })

  test('options carry over from TileLayer (tileSize default)', () => {
    const layer = new RasterDEMLayer('https://example.com/{z}/{x}/{y}.png')
    expect(layer.options!.tileSize).toBe(512)
  })
})
