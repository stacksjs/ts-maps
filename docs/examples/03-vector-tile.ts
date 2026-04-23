/**
 * Example 03 — Vector tiles.
 *
 * Renders a single synthetic MVT tile through VectorTileMapLayer. The tile
 * is fabricated in-browser via the in-house `Pbf` writer so the demo needs
 * no external services. Three style layers — a water fill, road lines,
 * circle POIs — share the source.
 */

import type { VectorTileStyleLayer } from '../../packages/ts-maps/src/core-map'
import { TsMap, vectorTileLayer } from '../../packages/ts-maps/src/core-map'
import { Pbf } from '../../packages/ts-maps/src/core-map/proto/Pbf'

function zz(n: number): number { return (n << 1) ^ (n >> 31) }
function cmd(id: number, count: number): number { return (id & 0x7) | (count << 3) }

function ring(path: { x: number, y: number }[]): number[] {
  if (path.length === 0) return []
  const out: number[] = [cmd(1, 1), zz(path[0].x), zz(path[0].y)]
  if (path.length > 1) {
    out.push(cmd(2, path.length - 1))
    for (let i = 1; i < path.length; i++) {
      out.push(zz(path[i].x - path[i - 1].x))
      out.push(zz(path[i].y - path[i - 1].y))
    }
  }
  return out
}
function closedRing(path: { x: number, y: number }[]): number[] { return [...ring(path), cmd(7, 1)] }
function pointGeom(x: number, y: number): number[] { return [cmd(1, 1), zz(x), zz(y)] }

function writeLayer(
  pbf: Pbf,
  name: string,
  keys: string[],
  values: string[],
  features: { tags: number[], type: 1 | 2 | 3, geometry: number[] }[],
  extent = 4096,
): void {
  pbf.writeVarintField(15, 2)
  pbf.writeStringField(1, name)
  for (const f of features) {
    pbf.writeMessage(2, (feat, p) => {
      if (feat.tags.length > 0) p.writePackedVarint(2, feat.tags)
      p.writeVarintField(3, feat.type)
      if (feat.geometry.length > 0) p.writePackedVarint(4, feat.geometry)
    }, f)
  }
  for (const k of keys) pbf.writeStringField(3, k)
  for (const v of values) pbf.writeMessage(4, (val, p) => { p.writeStringField(1, val) }, v)
  pbf.writeVarintField(5, extent)
}

function makeSyntheticTile(): ArrayBuffer {
  const pbf = new Pbf()
  pbf.writeMessage(3, (_, p) => {
    writeLayer(p, 'water', ['name'], ['Ocean'], [{
      type: 3, tags: [0, 0],
      geometry: closedRing([{ x: 200, y: 200 }, { x: 3800, y: 200 }, { x: 3800, y: 3800 }, { x: 200, y: 3800 }]),
    }])
  }, null)
  pbf.writeMessage(3, (_, p) => {
    writeLayer(p, 'roads', ['name'], ['Main St', 'Oak Ave'], [
      { type: 2, tags: [0, 0], geometry: ring([{ x: 400, y: 400 }, { x: 3600, y: 3600 }]) },
      { type: 2, tags: [0, 1], geometry: ring([{ x: 400, y: 3600 }, { x: 3600, y: 400 }]) },
    ])
  }, null)
  pbf.writeMessage(3, (_, p) => {
    writeLayer(p, 'place', ['name'], ['Harbor', 'Market', 'Pier'], [
      { type: 1, tags: [0, 0], geometry: pointGeom(1000, 1000) },
      { type: 1, tags: [0, 1], geometry: pointGeom(2000, 2000) },
      { type: 1, tags: [0, 2], geometry: pointGeom(3000, 3000) },
    ])
  }, null)
  const out = pbf.finish()
  const ab = new ArrayBuffer(out.byteLength)
  new Uint8Array(ab).set(out)
  return ab
}

const SYNTHETIC_TILE = makeSyntheticTile()
const SYNTHETIC_PREFIX = 'demo-tiles/'

const original = window.fetch.bind(window)
window.fetch = function patched(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
  if (url.includes(SYNTHETIC_PREFIX)) {
    return Promise.resolve(new Response(SYNTHETIC_TILE.slice(0), {
      status: 200, headers: { 'Content-Type': 'application/x-protobuf' },
    }))
  }
  return original(input, init)
} as typeof fetch

const map = new TsMap('map', { center: [51.5074, -0.1278], zoom: 6, minZoom: 1, maxZoom: 18 })

const styleLayers: VectorTileStyleLayer[] = [
  { id: 'water',  type: 'fill',   sourceLayer: 'water', paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.45, 'fill-outline-color': '#0c4a6e' } },
  { id: 'roads',  type: 'line',   sourceLayer: 'roads', paint: { 'line-color': '#6b7280', 'line-width': 2 } },
  { id: 'places', type: 'circle', sourceLayer: 'place', paint: { 'circle-color': '#f59e0b', 'circle-radius': 5, 'circle-stroke-color': '#78350f', 'circle-stroke-width': 1 } },
]

const layer = vectorTileLayer({
  url: `${SYNTHETIC_PREFIX}{z}/{x}/{y}.pbf`,
  tileSize: 512,
  layers: styleLayers,
  attribution: 'Synthetic MVT (client-side fabrication)',
})
layer.addTo(map)

const info = document.getElementById('info') as HTMLDivElement
map.on('click', (e: any) => {
  const point = e.containerPoint ?? e.layerPoint
  if (!point) return
  const hits = layer.queryRenderedFeatures(point)
  if (hits.length === 0) {
    info.textContent = `0 features at (${Math.round(point.x)}, ${Math.round(point.y)})`
    return
  }
  const first = hits[0]
  info.textContent = `${hits.length} hit(s)  —  ${first.layer.id} (${first.layer.type})  —  ${JSON.stringify(first.feature.properties)}`
})
