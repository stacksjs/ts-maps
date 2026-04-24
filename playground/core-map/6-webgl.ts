/**
 * Phase 6 demo — WebGL tile renderer.
 *
 * Two `VectorTileMapLayer`s over the same synthetic source — one
 * Canvas2D, one WebGL — with a toggle to switch between them at
 * runtime. Useful for eyeballing rendering parity.
 */

import type { VectorTileStyleLayer } from '../../packages/ts-maps/src/core-map'
import { TsMap, vectorTileLayer } from '../../packages/ts-maps/src/core-map'
import { Pbf } from '../../packages/ts-maps/src/core-map/proto/Pbf'

function zz(n: number): number { return (n << 1) ^ (n >> 31) }
function cmd(id: number, count: number): number { return (id & 0x7) | (count << 3) }
function ring(path: { x: number, y: number }[]): number[] {
  const out: number[] = [cmd(1, 1), zz(path[0]!.x), zz(path[0]!.y)]
  if (path.length > 1) {
    out.push(cmd(2, path.length - 1))
    for (let i = 1; i < path.length; i++) {
      out.push(zz(path[i]!.x - path[i - 1]!.x))
      out.push(zz(path[i]!.y - path[i - 1]!.y))
    }
  }
  return out
}
function closedRing(path: { x: number, y: number }[]): number[] {
  return [...ring(path), cmd(7, 1)]
}
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
      if (feat.tags.length > 0)
        p.writePackedVarint(2, feat.tags)
      p.writeVarintField(3, feat.type)
      if (feat.geometry.length > 0)
        p.writePackedVarint(4, feat.geometry)
    }, f)
  }
  for (const k of keys) pbf.writeStringField(3, k)
  for (const v of values) pbf.writeMessage(4, (_, p) => { p.writeStringField(1, v) }, null)
  pbf.writeVarintField(5, extent)
}

function makeTile(): ArrayBuffer {
  const pbf = new Pbf()
  // water: full-tile polygon with a triangle island.
  pbf.writeMessage(3, (_, p) => {
    writeLayer(p, 'water', ['name'], ['Ocean'], [
      {
        type: 3,
        tags: [0, 0],
        geometry: closedRing([
          { x: 100, y: 100 },
          { x: 3900, y: 100 },
          { x: 3900, y: 3900 },
          { x: 100, y: 3900 },
        ]),
      },
    ])
  }, null)
  // roads: an X + a ring.
  pbf.writeMessage(3, (_, p) => {
    writeLayer(p, 'roads', ['cls'], ['main', 'secondary'], [
      { type: 2, tags: [0, 0], geometry: ring([{ x: 400, y: 400 }, { x: 3600, y: 3600 }]) },
      { type: 2, tags: [0, 0], geometry: ring([{ x: 400, y: 3600 }, { x: 3600, y: 400 }]) },
      { type: 2, tags: [0, 1], geometry: ring([
        { x: 1500, y: 1000 }, { x: 2500, y: 1000 }, { x: 2500, y: 3000 }, { x: 1500, y: 3000 }, { x: 1500, y: 1000 },
      ]) },
    ])
  }, null)
  // places
  pbf.writeMessage(3, (_, p) => {
    writeLayer(p, 'place', ['name'], ['A', 'B', 'C'], [
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

const SYNTHETIC_TILE: ArrayBuffer = makeTile()
const PREFIX = 'webgl-demo-tiles/'
const original = window.fetch.bind(window)
window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
  if (url.includes(PREFIX)) {
    return Promise.resolve(new Response(SYNTHETIC_TILE.slice(0), {
      status: 200,
      headers: { 'Content-Type': 'application/x-protobuf' },
    }))
  }
  return original(input, init)
} as typeof fetch

const map = new TsMap('map', {
  center: [0, 0],
  zoom: 4,
  minZoom: 1,
  maxZoom: 14,
})

const styleLayers: VectorTileStyleLayer[] = [
  { id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.55 } },
  { id: 'roads', type: 'line', sourceLayer: 'roads', paint: { 'line-color': '#f59e0b', 'line-width': 3 } },
  { id: 'places', type: 'circle', sourceLayer: 'place', paint: { 'circle-color': '#dc2626', 'circle-radius': 6, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
]

let currentLayer = vectorTileLayer({
  url: `${PREFIX}{z}/{x}/{y}.pbf`,
  tileSize: 512,
  layers: styleLayers,
  renderer: 'webgl',
  attribution: 'Synthetic tiles — WebGL backend',
}).addTo(map)

const panel = document.createElement('div')
panel.style.cssText = `
  position:absolute;left:16px;top:16px;z-index:500;
  background:rgba(15,23,42,0.92);color:#e2e8f0;border-radius:10px;
  padding:12px 14px;font:500 13px -apple-system,sans-serif;
  box-shadow:0 4px 12px rgba(0,0,0,0.35);
`
panel.innerHTML = `
  <div style="font-weight:600;margin-bottom:8px;">Renderer</div>
  <button id="use-webgl" style="margin-right:6px;">WebGL</button>
  <button id="use-canvas">Canvas2D</button>
  <div id="active" style="margin-top:6px;font-size:12px;opacity:0.8;">active: webgl</div>
`
map.getContainer().appendChild(panel)

function swap(renderer: 'webgl' | 'canvas2d'): void {
  map.removeLayer(currentLayer)
  currentLayer = vectorTileLayer({
    url: `${PREFIX}{z}/{x}/{y}.pbf`,
    tileSize: 512,
    layers: styleLayers,
    renderer,
    attribution: `Synthetic tiles — ${renderer} backend`,
  }).addTo(map)
  const el = panel.querySelector('#active') as HTMLElement
  el.textContent = `active: ${renderer}`
}

panel.querySelector('#use-webgl')!.addEventListener('click', () => swap('webgl'))
panel.querySelector('#use-canvas')!.addEventListener('click', () => swap('canvas2d'))

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map, swap }
