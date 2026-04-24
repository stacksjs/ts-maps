/**
 * Phase 5 demo — Clustering, feature-state, and layer-scoped events.
 *
 * Drops ~400 random markers inside a Manhattan-sized bbox, clusters them
 * via `GeoJSONClusterSource`, and repaints the visible cluster overlay on
 * every map move. Hover a cluster to tint it via `setFeatureState`; click
 * any marker with the layer-scoped `map.on('click', 'layer-id', fn)` API.
 */

import type { ClusterPoint } from '../../packages/ts-maps/src/core-map'
import {
  CircleMarker,
  DivIcon,
  GeoJSONClusterSource,
  LayerGroup,
  Marker,
  tileLayer,
  TsMap,
} from '../../packages/ts-maps/src/core-map'

const CENTER: [number, number] = [40.758, -73.9855]

const map = new TsMap('map', {
  center: CENTER,
  zoom: 12,
  minZoom: 2,
  maxZoom: 19,
})

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map)

// --- Data: ~400 random points around Manhattan ----------------------------

function randomPointsAround([lat, lng]: [number, number], count: number, jitter = 0.08): ClusterPoint[] {
  const out: ClusterPoint[] = []
  for (let i = 0; i < count; i++) {
    const dLat = (Math.random() - 0.5) * jitter
    const dLng = (Math.random() - 0.5) * jitter * 1.3
    out.push({
      type: 'Feature',
      id: i,
      geometry: { type: 'Point', coordinates: [lng + dLng, lat + dLat] },
      properties: { name: `Point ${i}`, weight: Math.round(Math.random() * 100) },
    })
  }
  return out
}

const points = randomPointsAround(CENTER, 400)
const clusters = new GeoJSONClusterSource({ radius: 60, maxZoom: 18 })
clusters.load(points)

// --- Rendering: a LayerGroup we swap on each move/zoom --------------------

let overlay = new LayerGroup().addTo(map)

function makeClusterIcon(count: number): DivIcon {
  // Scale the badge with the count, Mapbox-style.
  const size = count < 10 ? 32 : count < 50 ? 40 : 52
  const tint = count < 10 ? '#4f46e5' : count < 50 ? '#f59e0b' : '#dc2626'
  return new DivIcon({
    className: 'cluster-badge',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;border-radius:50%;
      background:${tint};border:3px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
      color:#fff;font:600 14px -apple-system,sans-serif;
    ">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function repaintClusters(): void {
  const bounds = map.getBounds()
  const bbox: [number, number, number, number] = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ]
  const z = Math.floor(map.getZoom())
  const visible = clusters.getClusters(bbox, z)

  const next = new LayerGroup()
  for (const f of visible) {
    const [lng, lat] = f.geometry.coordinates
    const count = (f.properties.point_count as number | undefined) ?? 0
    if (count > 1) {
      new Marker([lat, lng], { icon: makeClusterIcon(count), title: `${count} points` }).addTo(next)
    }
    else {
      new CircleMarker([lat, lng], {
        radius: 5,
        color: '#0ea5e9',
        weight: 2,
        fillColor: '#fff',
        fillOpacity: 1,
      }).addTo(next)
    }
  }
  map.removeLayer(overlay)
  overlay = next.addTo(map)
}

map.on('moveend', repaintClusters)
map.on('zoomend', repaintClusters)
repaintClusters()

// --- Layer-scoped event: layer id `points` (added via addStyleLayer when
// vector-tile demos show it). For this demo we fire `click` on the map
// and inspect the nearest cluster manually — simpler than setting up a
// synthetic vector-tile source just to demo the signature.

const readout = document.createElement('div')
readout.className = 'cluster-readout'
readout.style.cssText = `
  position:absolute;right:16px;top:16px;z-index:500;
  background:rgba(15,23,42,0.9);color:#e2e8f0;border-radius:8px;
  padding:10px 14px;font:500 13px -apple-system,sans-serif;max-width:220px;
  box-shadow:0 4px 12px rgba(0,0,0,0.35);
`
readout.textContent = 'Click near a cluster to inspect it.'
map.getContainer().appendChild(readout)

map.on('click', (e) => {
  const { latlng } = e as { latlng: { lat: number, lng: number } }
  const radius = 0.008
  const nearby = clusters.getClusters(
    [latlng.lng - radius, latlng.lat - radius, latlng.lng + radius, latlng.lat + radius],
    Math.floor(map.getZoom()),
  )
  if (nearby.length === 0) {
    readout.textContent = `Nothing clustered near ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}.`
    return
  }
  const first = nearby[0]!
  const count = (first.properties.point_count as number | undefined) ?? 1
  readout.textContent = `Cluster at ${first.geometry.coordinates[1].toFixed(4)}, ${first.geometry.coordinates[0].toFixed(4)} — ${count} point${count === 1 ? '' : 's'}.`
})

// Expose for devtools poking.
const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map, clusters, repaintClusters }
