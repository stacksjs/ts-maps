// Helpers for reading elevation out of RGB-encoded DEM tiles. Shared
// between the hillshade-producing `RasterDEMLayer` and the 3D terrain
// pipeline, which samples per-vertex heights to warp a ground mesh.
//
// Two encodings are supported out of the box:
//   - 'mapbox'    — Mapbox Terrain-RGB / Maxar (elevation = -10000 + (r*65536 + g*256 + b) * 0.1)
//   - 'terrarium' — Mapzen / AWS Terrarium (elevation = (r*256 + g + b/256) - 32768)

export type DEMEncoding = 'mapbox' | 'terrarium'

export function decodeMapboxRGB(r: number, g: number, b: number): number {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1
}

export function decodeTerrariumRGB(r: number, g: number, b: number): number {
  return (r * 256 + g + b / 256) - 32768
}

export function getElevationDecoder(encoding: DEMEncoding): (r: number, g: number, b: number) => number {
  return encoding === 'terrarium' ? decodeTerrariumRGB : decodeMapboxRGB
}

/**
 * Decode an entire RGBA pixel buffer into a flat `Float32Array` of elevation
 * samples in metres. The caller controls the encoding.
 */
export function decodeElevationGrid(pixels: Uint8Array | Uint8ClampedArray, encoding: DEMEncoding = 'mapbox'): Float32Array {
  const n = (pixels.length / 4) | 0
  const elev = new Float32Array(n)
  const decode = getElevationDecoder(encoding)
  for (let i = 0, p = 0; i < n; i++, p += 4)
    elev[i] = decode(pixels[p]!, pixels[p + 1]!, pixels[p + 2]!)
  return elev
}

/**
 * Bilinearly sample a square elevation grid at the fractional pixel
 * coordinate `(u, v)`, where `(0, 0)` is the top-left pixel centre and
 * `(size - 1, size - 1)` is the bottom-right. Out-of-range inputs clamp
 * to the border (no extrapolation).
 */
export function sampleElevationBilinear(elev: Float32Array, size: number, u: number, v: number): number {
  const cu = clamp(u, 0, size - 1)
  const cv = clamp(v, 0, size - 1)
  const x0 = Math.floor(cu)
  const y0 = Math.floor(cv)
  const x1 = Math.min(size - 1, x0 + 1)
  const y1 = Math.min(size - 1, y0 + 1)
  const fx = cu - x0
  const fy = cv - y0
  const e00 = elev[y0 * size + x0]!
  const e10 = elev[y0 * size + x1]!
  const e01 = elev[y1 * size + x0]!
  const e11 = elev[y1 * size + x1]!
  const a = e00 * (1 - fx) + e10 * fx
  const b = e01 * (1 - fx) + e11 * fx
  return a * (1 - fy) + b * fy
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
