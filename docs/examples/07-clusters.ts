/**
 * Example 07 — Clustering.
 *
 * 5,000 random points fed into the zero-dep GeoJSONClusterSource. On every
 * viewport change we query the cluster tree and re-render as CircleMarkers.
 */

import type { ClusterPoint } from '../../packages/ts-maps/src/core-map/layer/GeoJSONClusterSource'
import { CircleMarker, GeoJSONClusterSource, LayerGroup, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

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

const source = new GeoJSONClusterSource({ radius: 50, maxZoom: 16, minZoom: 0, minPoints: 2 })
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
    const isCluster = (f.properties as any).cluster === true
    const count = (f.properties as any).point_count ?? 1
    const radius = isCluster ? 10 + Math.log2(count) * 3 : 4
    const color = isCluster ? '#f97316' : '#4f46e5'
    new CircleMarker([lat, lng], { radius, color, fillColor: color, fillOpacity: 0.7, weight: 1 })
      .bindTooltip(isCluster ? `${count} points` : '1 point')
      .addTo(layer)
  }
}

map.on('moveend', render)
map.on('zoomend', render)
map.whenReady(render)
