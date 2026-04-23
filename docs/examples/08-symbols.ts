/**
 * Example 08 — Symbols with collision.
 *
 * A set of POI labels draped over an OSM basemap. We lay them out with the
 * library's CollisionIndex: higher-priority labels are placed first and
 * veto overlapping lower-priority neighbours.
 */

import { DivIcon, Marker, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'
import { CollisionIndex } from '../../packages/ts-maps/src/core-map/symbols'

const map = new TsMap('map', { center: [40.7580, -73.9855], zoom: 14 })

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

interface POI {
  name: string
  lat: number
  lng: number
  priority: number
}

const pois: POI[] = [
  { name: 'Times Square',   lat: 40.7580, lng: -73.9855, priority: 10 },
  { name: 'Bryant Park',    lat: 40.7536, lng: -73.9832, priority: 7 },
  { name: 'Empire State',   lat: 40.7484, lng: -73.9857, priority: 10 },
  { name: 'Herald Square',  lat: 40.7506, lng: -73.9878, priority: 5 },
  { name: 'Penn Station',   lat: 40.7506, lng: -73.9935, priority: 6 },
  { name: 'Grand Central',  lat: 40.7527, lng: -73.9772, priority: 9 },
  { name: 'Rockefeller',    lat: 40.7587, lng: -73.9787, priority: 8 },
  { name: 'Chrysler',       lat: 40.7516, lng: -73.9755, priority: 7 },
  { name: 'Columbus Circle', lat: 40.7680, lng: -73.9819, priority: 6 },
  { name: 'Central Park',   lat: 40.7714, lng: -73.9740, priority: 8 },
]

let markers: Marker[] = []

function layout(): void {
  for (const m of markers) m.remove()
  markers = []

  const size = map.getSize()
  const index = new CollisionIndex({ width: size.x, height: size.y, cellSize: 64 })
  // Highest priority first.
  const sorted = [...pois].sort((a, b) => b.priority - a.priority)

  for (const poi of sorted) {
    const pt = map.latLngToContainerPoint([poi.lat, poi.lng])
    // approx label box
    const w = 8 + poi.name.length * 6
    const h = 22
    const box = { minX: pt.x - w / 2, maxX: pt.x + w / 2, minY: pt.y - h / 2, maxY: pt.y + h / 2, priority: poi.priority }
    if (!index.tryInsert(box))
      continue

    const icon = new DivIcon({
      className: '',
      html: `<div style="background: var(--surface, #111827); color: var(--text, #e5e7eb); padding: 2px 8px; border: 1px solid #334155; border-radius: 6px; white-space: nowrap; font-size: 12px;">${poi.name}</div>`,
      iconSize: [w, h],
      iconAnchor: [w / 2, h / 2],
    })
    const m = new Marker([poi.lat, poi.lng], { icon, interactive: false })
    m.addTo(map)
    markers.push(m)
  }
  const info = document.getElementById('info')
  if (info) info.textContent = `${markers.length} / ${pois.length} labels placed`
}

map.on('zoomend', layout)
map.on('moveend', layout)
map.whenReady(layout)
