/**
 * Phase 7 demo — 3D camera with fog + sky.
 *
 * OpenStreetMap raster basemap + bearing/pitch sliders + setSky/setFog
 * controls. Atmospheric overlay renders as pitch increases, driven by
 * the same Map._updateAtmosphereOverlay pipeline that powers the
 * globe-halo demo.
 */

import { tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 13,
  minZoom: 2,
  maxZoom: 19,
  pitch: 40,
  bearing: 20,
})

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map)

map.setSky({
  'sky-color': '#87ceeb',
  'horizon-color': '#ffd580',
})
map.setFog({
  color: '#f5f7fa',
  'horizon-blend': 0.15,
})

const panel = document.createElement('div')
panel.style.cssText = `
  position:absolute;left:16px;top:16px;z-index:500;
  background:rgba(15,23,42,0.92);color:#e2e8f0;border-radius:10px;
  padding:14px 16px;font:500 13px -apple-system,sans-serif;min-width:240px;
  box-shadow:0 4px 12px rgba(0,0,0,0.35);
`
panel.innerHTML = `
  <div style="font-weight:600;margin-bottom:10px;">3D camera</div>
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
    Pitch <input id="pitch" type="range" min="0" max="60" step="1" value="40" style="flex:1;" />
    <span id="pitch-read" style="min-width:28px;text-align:right;">40°</span>
  </label>
  <label style="display:flex;align-items:center;gap:8px;">
    Bearing <input id="bearing" type="range" min="-180" max="180" step="1" value="20" style="flex:1;" />
    <span id="bearing-read" style="min-width:30px;text-align:right;">20°</span>
  </label>
  <div style="margin-top:10px;font-weight:600;">Sky</div>
  <label style="display:block;margin-top:4px;">Sky color
    <input id="sky" type="color" value="#87ceeb" />
  </label>
  <label style="display:block;">Horizon
    <input id="horizon" type="color" value="#ffd580" />
  </label>
  <div style="margin-top:10px;font-weight:600;">Fog</div>
  <label style="display:block;">Color <input id="fog" type="color" value="#f5f7fa" /></label>
`
map.getContainer().appendChild(panel)

const pitchInput = panel.querySelector('#pitch') as HTMLInputElement
const bearingInput = panel.querySelector('#bearing') as HTMLInputElement
const skyInput = panel.querySelector('#sky') as HTMLInputElement
const horizonInput = panel.querySelector('#horizon') as HTMLInputElement
const fogInput = panel.querySelector('#fog') as HTMLInputElement
const pitchRead = panel.querySelector('#pitch-read') as HTMLElement
const bearingRead = panel.querySelector('#bearing-read') as HTMLElement

pitchInput.addEventListener('input', () => {
  const v = Number.parseFloat(pitchInput.value)
  map.setPitch(v)
  pitchRead.textContent = `${v.toFixed(0)}°`
})
bearingInput.addEventListener('input', () => {
  const v = Number.parseFloat(bearingInput.value)
  map.setBearing(v)
  bearingRead.textContent = `${v.toFixed(0)}°`
})
function updateSky(): void {
  map.setSky({ 'sky-color': skyInput.value, 'horizon-color': horizonInput.value })
}
skyInput.addEventListener('input', updateSky)
horizonInput.addEventListener('input', updateSky)
fogInput.addEventListener('input', () => {
  map.setFog({ color: fogInput.value, 'horizon-blend': 0.15 })
})

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map }
