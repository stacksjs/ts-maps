import { describe, expect, test } from 'bun:test'
import { parseColor, renderSdfPixels, smoothstep } from '../src/core-map/symbols/sdf'

/** A field along one row: alpha rising through the 0.5 edge. */
function ramp(values: number[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(values.length * 4)
  values.forEach((v, i) => {
    out[i * 4 + 3] = Math.round(v * 255)
  })
  return out
}

function pixel(data: Uint8ClampedArray, i: number): [number, number, number, number] {
  return [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]]
}

describe('renderSdfPixels', () => {
  test('fills where the field says inside and clears where it says outside', () => {
    const field = ramp([0, 0.2, 0.45, 0.55, 0.8, 1])
    const out = renderSdfPixels(field, 6, 1, { color: '#ff0000' })

    // Well outside: nothing at all.
    expect(pixel(out, 0)[3]).toBe(0)
    expect(pixel(out, 1)[3]).toBe(0)
    // Well inside: opaque, in the requested colour.
    expect(pixel(out, 5)).toEqual([255, 0, 0, 255])
    expect(pixel(out, 4)).toEqual([255, 0, 0, 255])
    // Either side of the edge, partially covered — this is the antialiasing.
    expect(pixel(out, 2)[3]).toBeLessThan(128)
    expect(pixel(out, 3)[3]).toBeGreaterThan(128)
  })

  test('the same field renders in any colour asked for', () => {
    const field = ramp([1, 1])
    expect(pixel(renderSdfPixels(field, 2, 1, { color: '#ff0000' }), 0)).toEqual([255, 0, 0, 255])
    expect(pixel(renderSdfPixels(field, 2, 1, { color: '#0000ff' }), 0)).toEqual([0, 0, 255, 255])
    expect(pixel(renderSdfPixels(field, 2, 1, { color: 'rgb(1, 2, 3)' }), 0)).toEqual([1, 2, 3, 255])
  })

  test('the edge stays in the same place whatever the colour', () => {
    const field = ramp([0.3, 0.5, 0.7])
    const red = renderSdfPixels(field, 3, 1, { color: '#ff0000' })
    const blue = renderSdfPixels(field, 3, 1, { color: '#0000ff' })
    for (let i = 0; i < 3; i++)
      expect(pixel(red, i)[3]).toBe(pixel(blue, i)[3])
  })

  test('a halo extends coverage outward from the shape', () => {
    // 0.35 is outside the shape but inside a wide enough halo.
    const field = ramp([0.35, 1])
    const plain = renderSdfPixels(field, 2, 1, { color: '#ffffff' })
    const haloed = renderSdfPixels(field, 2, 1, { color: '#ffffff', haloColor: '#000000', haloWidth: 4 })

    expect(pixel(plain, 0)[3]).toBe(0)
    expect(pixel(haloed, 0)[3]).toBeGreaterThan(200)
    // In halo territory the colour is the halo's, not the fill's.
    expect(pixel(haloed, 0).slice(0, 3)).toEqual([0, 0, 0])
    // The shape itself keeps its fill.
    expect(pixel(haloed, 1)).toEqual([255, 255, 255, 255])
  })

  test('a halo colour with no width draws nothing extra', () => {
    // The style spec's default is transparent black at width 0. Honouring the
    // colour alone would ring every icon in the style.
    const field = ramp([0.35, 1])
    const plain = renderSdfPixels(field, 2, 1, { color: '#ffffff' })
    const defaulted = renderSdfPixels(field, 2, 1, { color: '#ffffff', haloColor: '#000000' })
    expect(Array.from(defaulted)).toEqual(Array.from(plain))
  })

  test('a wider halo reaches further out', () => {
    const field = ramp([0.2, 0.35, 1])
    const narrow = renderSdfPixels(field, 3, 1, { color: '#fff', haloColor: '#000', haloWidth: 2 })
    const wide = renderSdfPixels(field, 3, 1, { color: '#fff', haloColor: '#000', haloWidth: 6 })
    expect(pixel(wide, 0)[3]).toBeGreaterThan(pixel(narrow, 0)[3])
  })

  test('an empty field produces nothing', () => {
    const out = renderSdfPixels(ramp([0, 0, 0]), 3, 1, { color: '#ff0000' })
    expect(Array.from(out)).toEqual(Array.from(new Uint8ClampedArray(12)))
  })
})

describe('parseColor', () => {
  test('reads the hex forms styles actually use', () => {
    expect(parseColor('#ff0000')).toEqual([255, 0, 0])
    expect(parseColor('#f00')).toEqual([255, 0, 0])
    // Alpha is carried by the caller, not the colour: an icon's opacity comes
    // from `icon-opacity` and the field's own coverage.
    expect(parseColor('#ff0000ff')).toEqual([255, 0, 0])
    expect(parseColor('#F00A')).toEqual([255, 0, 0])
    expect(parseColor('  #00ff00  ')).toEqual([0, 255, 0])
  })

  test('reads rgb and rgba, including the slash and percentage forms', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30])
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30])
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual([10, 20, 30])
    expect(parseColor('rgb(100%, 0%, 50%)')).toEqual([255, 0, 128])
  })

  test('falls back to black rather than throwing on nonsense', () => {
    expect(parseColor('not-a-colour')).toEqual([0, 0, 0])
    expect(parseColor('#12')).toEqual([0, 0, 0])
  })
})

describe('smoothstep', () => {
  test('clamps outside the band and eases within it', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBe(0.5)
    expect(smoothstep(0, 1, 0.25)).toBeLessThan(0.25)
  })

  test('a zero-width band is a hard step', () => {
    expect(smoothstep(0.5, 0.5, 0.4)).toBe(0)
    expect(smoothstep(0.5, 0.5, 0.6)).toBe(1)
  })
})
