/**
 * Example 05 — Heatmap.
 *
 * 500 random points around Manhattan. A gradient cycler animates the colour
 * ramp every two seconds to show how HeatmapLayer options are reactive.
 */

import { HeatmapLayer, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const CENTER: [number, number] = [40.758, -73.9855]
const map = new TsMap('map', { center: CENTER, zoom: 12, maxZoom: 17 })

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

function randomPoints(n: number): { lat: number, lng: number, weight: number }[] {
  const pts: { lat: number, lng: number, weight: number }[] = []
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2
    const r = Math.random() * 0.05
    pts.push({
      lat: CENTER[0] + Math.sin(angle) * r,
      lng: CENTER[1] + Math.cos(angle) * r,
      weight: 0.5 + Math.random() * 0.5,
    })
  }
  return pts
}

const heat = new HeatmapLayer({
  data: randomPoints(500),
  radius: 25,
  blur: 20,
  gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' },
})
heat.addTo(map)

const gradients: Record<number, string>[] = [
  { 0.4: '#312e81', 0.6: '#4f46e5', 0.8: '#ec4899', 1.0: '#fde047' },
  { 0.4: '#0c4a6e', 0.6: '#0ea5e9', 0.8: '#14b8a6', 1.0: '#bef264' },
  { 0.4: '#7f1d1d', 0.6: '#f97316', 0.8: '#fde047', 1.0: '#ffffff' },
]
let gi = 0
setInterval(() => {
  gi = (gi + 1) % gradients.length;
  (heat as any).options.gradient = gradients[gi]
  heat.redraw()
}, 2500)
