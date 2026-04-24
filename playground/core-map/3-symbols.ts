/**
 * Phase 3 demo — Symbols (text labels + icons + collision).
 *
 * A synthetic MVT tile with a `place` source-layer carrying 20 named
 * points across a grid. A single `symbol` style layer evaluates
 * `text-field`, `text-size`, and `text-color` from properties, runs
 * collision detection via the in-house `CollisionIndex`, and draws the
 * surviving labels with halos.
 */

import type { VectorTileStyleLayer } from '../../packages/ts-maps/src/core-map'
import { TsMap, vectorTileLayer } from '../../packages/ts-maps/src/core-map'
import { Pbf } from '../../packages/ts-maps/src/core-map/proto/Pbf'

function zz(n: number): number { return (n << 1) ^ (n >> 31) }
function cmd(id: number, count: number): number { return (id & 0x7) | (count << 3) }
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

// 20 named place labels, spread on a 5x4 grid. Some pairs are close
// together so the collision engine has something to do.
function makeTile(): ArrayBuffer {
  const names = [
    'Harbor', 'Market', 'Pier', 'Museum', 'Tower',
    'Library', 'Theatre', 'Stadium', 'Plaza', 'Temple',
    'Park', 'Ferry', 'Rail', 'Bridge', 'Lighthouse',
    'Observatory', 'Cathedral', 'Garden', 'Fountain', 'Arch',
  ]
  const features: { tags: number[], type: 1 | 2 | 3, geometry: number[] }[] = []
  for (let i = 0; i < names.length; i++) {
    const col = i % 5
    const row = Math.floor(i / 5)
    const x = 500 + col * 750
    const y = 500 + row * 1000
    features.push({ type: 1, tags: [0, i], geometry: pointGeom(x, y) })
  }
  const pbf = new Pbf()
  pbf.writeMessage(3, (_, p) => { writeLayer(p, 'place', ['name'], names, features) }, null)
  const out = pbf.finish()
  const ab = new ArrayBuffer(out.byteLength)
  new Uint8Array(ab).set(out)
  return ab
}

const SYNTHETIC_TILE: ArrayBuffer = makeTile()
const PREFIX = 'symbols-demo-tiles/'
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
  {
    id: 'place-dots',
    type: 'circle',
    sourceLayer: 'place',
    paint: {
      'circle-color': '#4f46e5',
      'circle-radius': 6,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  },
  {
    id: 'place-labels',
    type: 'symbol',
    sourceLayer: 'place',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 22,
      'text-font': ['sans-serif'],
      'text-offset': [0, 1.4],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#1e293b',
      'text-halo-width': 3,
    },
  },
]

vectorTileLayer({
  url: `${PREFIX}{z}/{x}/{y}.pbf`,
  tileSize: 512,
  layers: styleLayers,
  attribution: 'Synthetic label demo — collision-aware symbol rendering',
}).addTo(map)

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map }
