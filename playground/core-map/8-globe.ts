/**
 * Phase 8 demo — the globe.
 *
 * Enables the globe projection, sets the vector basemap, and wires a
 * zoom slider so the viewer can cross the Mercator transition window
 * (zoom 5.5 to 6) and watch the globe fade into the flat map.
 */

import { TsMap } from '../../packages/ts-maps/src/core-map'
import { loadBasemap } from './basemap'

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

// The vector basemap the real-world demos share (see basemap.ts).
void loadBasemap(map, 'light')

map.setSky({
  'sky-color': '#87ceeb',
  'horizon-color': '#ffffff',
})

// --- Readout + zoom slider ------------------------------------------------

const panel = document.createElement('div')
// The playground's own controls card (shared.css), top right.
panel.className = 'demo-panel'
panel.innerHTML = `
  <div style="font-weight:600;margin-bottom:8px;">Globe</div>
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
    Zoom <input id="zoom" type="range" min="1" max="8" step="0.1" value="2" style="flex:1;" />
    <span id="z-read" style="min-width:30px;text-align:right;">2.0</span>
  </label>
  <div id="mix" style="margin-top:6px;font-size:12px;opacity:0.8;">globe: 100%</div>
`
map.getContainer().appendChild(panel)

const zoomInput = panel.querySelector('#zoom') as HTMLInputElement
const zRead = panel.querySelector('#z-read') as HTMLElement
const mixRead = panel.querySelector('#mix') as HTMLElement

function updateReadout(): void {
  zRead.textContent = map.getZoom().toFixed(1)
  mixRead.textContent = `globe: ${Math.round(map._globeAtmosphereMix() * 100)}%`
}

zoomInput.addEventListener('input', () => {
  map.setZoom(Number.parseFloat(zoomInput.value))
})

map.on('zoomend', updateReadout)
map.on('zoom', updateReadout)
updateReadout()

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map }
