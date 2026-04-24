/**
 * Phase 4 demo — Heatmap over a raster basemap.
 *
 * OpenStreetMap tile layer + a `HeatmapLayer` with ~800 random points
 * around Manhattan. Gaussian accumulation + a linear color ramp
 * produce the heatmap; the container-level canvas covers the full
 * viewport and repaints on every pan/zoom.
 */

import type { HeatmapPoint } from '../../packages/ts-maps/src/core-map'
import {
  HeatmapLayer,
  tileLayer,
  TsMap,
} from '../../packages/ts-maps/src/core-map'

const CENTER: [number, number] = [40.758, -73.9855]

const map = new TsMap('map', {
  center: CENTER,
  zoom: 12,
  minZoom: 2,
  maxZoom: 18,
})

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 18,
}).addTo(map)

// Concentrate points around a few attractor sites so the heatmap shows
// density peaks rather than uniform noise.
function densityPoints(count: number): HeatmapPoint[] {
  const attractors: [number, number, number][] = [
    [40.7580, -73.9855, 0.005], // Times Square
    [40.7484, -73.9857, 0.005], // Empire State
    [40.7527, -73.9772, 0.006], // Grand Central
    [40.7829, -73.9654, 0.010], // Central Park
    [40.7061, -74.0088, 0.006], // Financial District
  ]
  const out: HeatmapPoint[] = []
  for (let i = 0; i < count; i++) {
    const [lat, lng, sigma] = attractors[i % attractors.length]!
    const jitterLat = (Math.random() - 0.5) * sigma * 4
    const jitterLng = (Math.random() - 0.5) * sigma * 4
    out.push({
      lat: lat + jitterLat,
      lng: lng + jitterLng,
      weight: 0.5 + Math.random() * 0.5,
    })
  }
  return out
}

new HeatmapLayer({
  data: densityPoints(800),
  radius: 28,
  blur: 18,
  gradient: {
    0.15: '#0ea5e9',
    0.35: '#22d3ee',
    0.55: '#a3e635',
    0.75: '#f59e0b',
    1.0: '#dc2626',
  },
}).addTo(map)

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map }
