/**
 * Example 07 — Clustering.
 *
 * 5,000 random points fed into the zero-dep GeoJSONClusterSource. On every
 * viewport change we query the cluster tree and draw each cluster as a
 * bubble with its count, and each lone point as a dot.
 */

import type { ClusterPoint } from '../../packages/ts-maps/src/core-map/layer/GeoJSONClusterSource'
import { CircleMarker, DivIcon, GeoJSONClusterSource, LayerGroup, Marker, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const CENTER: [number, number] = [40.758, -73.9855]
const map = new TsMap('map', { center: CENTER, zoom: 11, maxZoom: 18 })

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

function randomFeatures(n: number): ClusterPoint[] {
  const out: ClusterPoint[] = []
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2
    const r = Math.random() * Math.random() * 0.3
    out.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          CENTER[1] + Math.cos(angle) * r,
          CENTER[0] + Math.sin(angle) * r,
        ],
      },
      properties: { id: i },
    })
  }
  return out
}

// `radius` is in pixels of a tile `extent` wide. This map's tiles are 256 px,
// so with `extent: 256` the radius is on-screen pixels.
const source = new GeoJSONClusterSource({ radius: 60, extent: 256, maxZoom: 16, minZoom: 0, minPoints: 2 })
source.load(randomFeatures(5000))

const layer = new LayerGroup()
layer.addTo(map)

function render(): void {
  layer.clearLayers()
  const b = map.getBounds()
  const bbox: [number, number, number, number] = [
    b.getWest(), b.getSouth(), b.getEast(), b.getNorth(),
  ]
  const items = source.getClusters(bbox, Math.floor(map.getZoom()))
  for (const f of items) {
    const [lng, lat] = f.geometry.coordinates
    const count = (f.properties as any).cluster === true ? (f.properties as any).point_count as number : 1
    if (count === 1) {
      new CircleMarker([lat, lng], { radius: 5, color: '#ffffff', weight: 1.5, fillColor: '#4f46e5', fillOpacity: 1 })
        .bindTooltip('1 point')
        .addTo(layer)
      continue
    }
    // A bubble that grows with its count, labelled with it.
    const size = Math.round(26 + Math.log2(count) * 4)
    const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#f97316;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);color:#fff;font:700 ${size > 40 ? 13 : 11}px/${size - 4}px system-ui,sans-serif;text-align:center;box-sizing:border-box">${count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}</div>`
    new Marker([lat, lng], { icon: new DivIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }) })
      .bindTooltip(`${count} points`)
      .addTo(layer)
  }
}

map.on('moveend', render)
map.on('zoomend', render)
map.whenReady(render)
