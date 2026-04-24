/**
 * Phase 8 demo — Globe view with atmosphere halo.
 *
 * Enables the globe projection, drops an OSM tile layer, and wires a
 * zoom slider so the viewer can cross the Mercator transition window
 * (zoom ≈ 5.5) and watch the atmosphere halo cross-fade.
 */

import { tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  center: [30, 0],
  zoom: 2,
  minZoom: 1,
  maxZoom: 12,
  // Triggers the globe atmosphere overlay; the projection flag is read
  // by `_isGlobeProjection` in Map.ts.
  projection: 'globe',
  // A little sky so the halo has a color to work with.
  // (setSky is called below too, demonstrating both paths.)
} as unknown as Record<string, unknown>)

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 12,
}).addTo(map)

map.setSky({
  'sky-color': '#87ceeb',
  'horizon-color': '#ffffff',
})

// --- Readout + zoom slider ------------------------------------------------

const panel = document.createElement('div')
panel.className = 'globe-panel'
panel.style.cssText = `
  position:absolute;left:16px;top:16px;z-index:500;
  background:rgba(15,23,42,0.92);color:#e2e8f0;border-radius:10px;
  padding:14px 16px;font:500 13px -apple-system,sans-serif;min-width:230px;
  box-shadow:0 4px 12px rgba(0,0,0,0.35);
`
panel.innerHTML = `
  <div style="font-weight:600;margin-bottom:8px;">Globe atmosphere</div>
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
    Zoom <input id="zoom" type="range" min="1" max="8" step="0.1" value="2" style="flex:1;" />
    <span id="z-read" style="min-width:30px;text-align:right;">2.0</span>
  </label>
  <div id="mix" style="margin-top:6px;font-size:12px;opacity:0.8;">halo mix: 1.00</div>
`
map.getContainer().appendChild(panel)

const zoomInput = panel.querySelector('#zoom') as HTMLInputElement
const zRead = panel.querySelector('#z-read') as HTMLElement
const mixRead = panel.querySelector('#mix') as HTMLElement

function updateReadout(): void {
  zRead.textContent = map.getZoom().toFixed(1)
  mixRead.textContent = `halo mix: ${map._globeAtmosphereMix().toFixed(2)}`
}

zoomInput.addEventListener('input', () => {
  map.setZoom(Number.parseFloat(zoomInput.value))
})

map.on('zoomend', updateReadout)
map.on('zoom', updateReadout)
updateReadout()

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map }
