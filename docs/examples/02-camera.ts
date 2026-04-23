/**
 * Example 02 — Camera.
 *
 * Fly between three cities, tween bearing and pitch, jump to a preset.
 */

import { LatLng, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 10,
  bearing: 0,
  pitch: 0,
  minZoom: 2,
  maxZoom: 18,
})

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

function button(id: string, cb: () => void): void {
  const el = document.getElementById(id)
  if (el)
    el.addEventListener('click', cb)
}

button('fly-ny', () => map.flyTo(new LatLng(40.7128, -74.0060), 11, { duration: 1200 }))
button('fly-london', () => map.flyTo(new LatLng(51.5074, -0.1278), 11, { duration: 1600 }))
button('fly-tokyo', () => map.flyTo(new LatLng(35.6762, 139.6503), 11, { duration: 1800 }))

button('ease-tilt', () => map.easeTo({ bearing: 30, pitch: 45, duration: 900 }))
button('ease-flat', () => map.easeTo({ bearing: 0, pitch: 0, duration: 900 }))
button('jump', () => map.jumpTo({ center: [48.8566, 2.3522], zoom: 12, bearing: 20, pitch: 30 }))

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
