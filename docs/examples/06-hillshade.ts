/**
 * Example 06 — Hillshade preview.
 *
 * Real DEM tiles (Mapbox Terrain-RGB, Terrarium) require an API key; this
 * demo renders a synthetic sinusoidal height field through the same
 * hillshade math used by RasterDEMLayer so you can feel the output.
 */

import { decodeMapboxRGB, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', { center: [46.8182, 8.2275], zoom: 7, maxZoom: 12 })

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  opacity: 0.55,
}).addTo(map)

// Make a 256x256 canvas, paint a synthetic height field, then hillshade it
// with the same Horn-algorithm gradient used inside RasterDEMLayer.
function renderShade(): HTMLCanvasElement {
  const N = 256
  const canvas = document.createElement('canvas')
  canvas.width = N
  canvas.height = N
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(N, N)

  const heights = new Float32Array(N * N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // smoothed ridge pattern
      const h = 1500 + 800 * Math.sin(x / 18) + 600 * Math.cos(y / 21) + 400 * Math.sin((x + y) / 30)
      heights[y * N + x] = h
    }
  }

  const sunAz = (315 * Math.PI) / 180
  const sunAlt = (45 * Math.PI) / 180

  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const dzdx = ((heights[y * N + x + 1] - heights[y * N + x - 1]) / 2)
      const dzdy = ((heights[(y + 1) * N + x] - heights[(y - 1) * N + x]) / 2)
      const slope = Math.atan(Math.hypot(dzdx, dzdy) / 30)
      const aspect = Math.atan2(dzdy, -dzdx)
      const shade = Math.max(0, Math.cos(sunAlt) * Math.cos(slope) + Math.sin(sunAlt) * Math.sin(slope) * Math.cos(sunAz - aspect))
      const v = Math.round(shade * 255)
      const idx = (y * N + x) * 4
      img.data[idx + 0] = v
      img.data[idx + 1] = v
      img.data[idx + 2] = v
      img.data[idx + 3] = 200
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

const canvas = renderShade()
const el = document.getElementById('shade-preview')!
el.appendChild(canvas)

// Sanity-check the RGB decoder used for real DEM tiles.
const sampleMeters = decodeMapboxRGB(121, 23, 42)
document.getElementById('decode-info')!.textContent
  = `decodeMapboxRGB(121,23,42) → ${sampleMeters.toFixed(2)} m`

// Keep TS happy about unused-ish bindings.
void map
