/**
 * Example 04 — Style spec.
 *
 * Build a minimal style document on the fly with a raster OSM source and a
 * single GeoJSON-backed fill layer. Flip the fill colour live via
 * map.setPaintProperty().
 */

import { GeoJSON, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', { center: [40.758, -73.9855], zoom: 12, maxZoom: 18 })

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

// A simple rectangle over midtown Manhattan as a GeoJSON layer.
const midtown = new GeoJSON({
  type: 'Feature',
  properties: { id: 'midtown' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-74.000, 40.745],
      [-73.970, 40.745],
      [-73.970, 40.770],
      [-74.000, 40.770],
      [-74.000, 40.745],
    ]],
  },
} as any, {
  style: () => ({ color: '#4f46e5', weight: 2, fillColor: '#4f46e5', fillOpacity: 0.25 }),
})
midtown.addTo(map)

function button(id: string, cb: () => void): void {
  const el = document.getElementById(id)
  if (el) el.addEventListener('click', cb)
}

button('tint-indigo', () => midtown.setStyle({ fillColor: '#4f46e5', color: '#4f46e5' }))
button('tint-rose',   () => midtown.setStyle({ fillColor: '#f43f5e', color: '#f43f5e' }))
button('tint-emerald',() => midtown.setStyle({ fillColor: '#10b981', color: '#10b981' }))
button('toggle-fill', () => {
  const hidden = (midtown as any)._hiddenFill
  midtown.setStyle({ fillOpacity: hidden ? 0.25 : 0 });
  (midtown as any)._hiddenFill = !hidden
})
