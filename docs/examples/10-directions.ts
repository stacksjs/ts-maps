/**
 * Example 10 — Directions.
 *
 * Click two points to request an OSRM driving route. The response geometry
 * is rendered as a Polyline; distance and duration show in the info panel.
 */

import type { LatLngLike, Route } from '../../packages/ts-maps/src/core-map/services/types'
import { Marker, Polyline, services, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', { center: [51.5074, -0.1278], zoom: 12 })

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

const directions = services.defaultDirections() // OSRMDirections — keyless demo server

const info = document.getElementById('info') as HTMLDivElement
const reset = document.getElementById('reset') as HTMLButtonElement

let startMarker: Marker | null = null
let endMarker: Marker | null = null
let routeLine: Polyline | null = null
let pending = false

function clear(): void {
  startMarker?.remove()
  startMarker = null
  endMarker?.remove()
  endMarker = null
  routeLine?.remove()
  routeLine = null
  pending = false
  info.textContent = 'Click the map to set the start.'
}

reset.addEventListener('click', clear)
clear()

map.on('click', async (e: any) => {
  const ll: LatLngLike = { lat: e.latlng.lat, lng: e.latlng.lng }
  if (!startMarker) {
    startMarker = new Marker([ll.lat, ll.lng]).addTo(map).bindPopup('Start').openPopup()
    info.textContent = 'Click again to set the destination.'
    return
  }
  if (!endMarker && !pending) {
    pending = true
    const em = new Marker([ll.lat, ll.lng]).addTo(map).bindPopup('End').openPopup()
    endMarker = em
    info.textContent = 'Routing…'
    try {
      const routes: Route[] = await directions.getDirections(
        [startMarker.getLatLng(), em.getLatLng()],
        { profile: 'driving' },
      )
      pending = false
      if (routes.length === 0) {
        info.textContent = 'No route found.'
        return
      }
      const r = routes[0]
      routeLine?.remove()
      routeLine = new Polyline(r.geometry.map(p => [p.lat, p.lng]), { color: '#4f46e5', weight: 4 })
      routeLine.addTo(map)
      info.textContent = `Distance: ${(r.distance / 1000).toFixed(1)} km  ·  Duration: ${Math.round(r.duration / 60)} min`
    }
    catch (err) {
      pending = false
      info.textContent = `Routing error: ${(err as Error).message}`
    }
  }
})
