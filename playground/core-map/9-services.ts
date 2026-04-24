/**
 * Phase 9 demo — Services (geocoding + directions).
 *
 * A Nominatim geocoder (keyless) feeds a search box; an OSRM directions
 * provider (also keyless) draws the driving route between two typed
 * addresses. The polyline is rendered as a `Polyline` overlay.
 */

import {
  Marker,
  Polyline,
  services,
  tileLayer,
  TsMap,
} from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  center: [51.5074, -0.1278],
  zoom: 12,
  minZoom: 2,
  maxZoom: 19,
})

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map)

const geocoder = services.defaultGeocoder()
const directions = services.defaultDirections()

// --- UI --------------------------------------------------------------------

const panel = document.createElement('div')
panel.style.cssText = `
  position:absolute;left:16px;top:16px;z-index:500;
  background:rgba(15,23,42,0.94);color:#e2e8f0;border-radius:10px;
  padding:14px 16px;font:500 13px -apple-system,sans-serif;min-width:280px;
  box-shadow:0 4px 12px rgba(0,0,0,0.35);
`
panel.innerHTML = `
  <div style="font-weight:600;margin-bottom:8px;">Geocode + directions</div>
  <label style="display:block;margin-bottom:6px;">From
    <input id="from" type="text" value="Tower Bridge, London" style="width:100%;padding:4px 6px;" />
  </label>
  <label style="display:block;margin-bottom:6px;">To
    <input id="to" type="text" value="Big Ben, London" style="width:100%;padding:4px 6px;" />
  </label>
  <button id="go" style="width:100%;padding:6px;">Route</button>
  <div id="status" style="margin-top:10px;font-size:12px;opacity:0.85;min-height:1.4em;">Enter two places and hit Route.</div>
`
map.getContainer().appendChild(panel)

const fromInput = panel.querySelector('#from') as HTMLInputElement
const toInput = panel.querySelector('#to') as HTMLInputElement
const goBtn = panel.querySelector('#go') as HTMLButtonElement
const status = panel.querySelector('#status') as HTMLElement

let fromMarker: Marker | null = null
let toMarker: Marker | null = null
let routeLine: Polyline | null = null

async function resolve(query: string): Promise<{ lat: number, lng: number } | null> {
  const hits = await geocoder.search(query, { limit: 1 })
  if (hits.length === 0)
    return null
  return hits[0]!.center
}

async function computeRoute(): Promise<void> {
  status.textContent = 'Geocoding…'
  try {
    const [from, to] = await Promise.all([resolve(fromInput.value), resolve(toInput.value)])
    if (!from || !to) {
      status.textContent = 'Geocoder returned no results for one of the inputs.'
      return
    }
    // Drop pins.
    if (fromMarker) map.removeLayer(fromMarker)
    if (toMarker) map.removeLayer(toMarker)
    fromMarker = new Marker([from.lat, from.lng]).addTo(map).bindPopup(fromInput.value)
    toMarker = new Marker([to.lat, to.lng]).addTo(map).bindPopup(toInput.value)

    status.textContent = 'Routing…'
    const routes = await directions.getDirections(
      [from, to],
      { profile: 'driving' },
    )
    if (routes.length === 0) {
      status.textContent = 'Router returned no routes.'
      return
    }
    const route = routes[0]!
    const latlngs = route.geometry.map(p => [p.lat, p.lng]) as [number, number][]
    if (routeLine) map.removeLayer(routeLine)
    routeLine = new Polyline(latlngs, { color: '#4f46e5', weight: 4 }).addTo(map)
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] })
    const km = (route.distance / 1000).toFixed(1)
    const min = (route.duration / 60).toFixed(0)
    status.textContent = `${km} km · ~${min} min`
  }
  catch (err) {
    status.textContent = `Failed: ${(err as Error).message}`
  }
}

goBtn.addEventListener('click', () => { computeRoute() })

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map, geocoder, directions, computeRoute }
