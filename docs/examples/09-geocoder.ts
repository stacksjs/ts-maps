/**
 * Example 09 — Geocoder.
 *
 * A search input wired to the default NominatimGeocoder. Results render as
 * a dropdown; clicking a result flies the camera to its center.
 */

import { Marker, services, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', { center: [51.5074, -0.1278], zoom: 10 })

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

const geocoder = services.defaultGeocoder()
let selected: Marker | null = null

const input = document.getElementById('q') as HTMLInputElement
const results = document.getElementById('results') as HTMLUListElement

async function run(): Promise<void> {
  const q = input.value.trim()
  if (!q) {
    results.innerHTML = ''
    return
  }
  results.innerHTML = '<li class="muted">Searching…</li>'
  try {
    const rs = await geocoder.search(q, { limit: 6 })
    if (rs.length === 0) {
      results.innerHTML = '<li class="muted">No matches.</li>'
      return
    }
    results.innerHTML = ''
    for (const r of rs) {
      const li = document.createElement('li')
      li.textContent = r.text
      li.addEventListener('click', () => {
        map.flyTo([r.center.lat, r.center.lng], 13, { duration: 900 })
        if (selected) selected.remove()
        selected = new Marker([r.center.lat, r.center.lng]).addTo(map).bindPopup(r.text).openPopup()
      })
      results.appendChild(li)
    }
  }
  catch (err) {
    results.innerHTML = `<li class="muted">Error: ${(err as Error).message}</li>`
  }
}

let debounce: number | undefined
input.addEventListener('input', () => {
  clearTimeout(debounce)
  debounce = window.setTimeout(run, 350)
})

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') run()
})
