/**
 * Phase 10 demo — street labels, themed chrome, and the built-in styles.
 *
 * Exercises the things point-placed symbols could never do:
 *   - `symbol-placement: 'line'` — names that follow and bend with a road
 *   - `text-rotate` / `text-anchor` / `text-offset` on point labels
 *   - one collision index across every tile, so labels never double up
 *     across a tile seam
 *   - `styles.dark()` / `styles.light()` and `map.setTheme()`, flipped
 *     together by the toggle
 *
 * The tiles are synthesised in-page, so this runs with no network and no
 * API key.
 */

import type { VectorTileStyleLayer } from '../../packages/ts-maps/src/core-map'
import { control, styles, TsMap, vectorTileLayer } from '../../packages/ts-maps/src/core-map'
import { Pbf } from '../../packages/ts-maps/src/core-map/proto/Pbf'

// --- MVT writing helpers (same shape as the other vector-tile demos) --------

function zz(n: number): number { return (n << 1) ^ (n >> 31) }
function cmd(id: number, count: number): number { return (id & 0x7) | (count << 3) }

function pointGeom(x: number, y: number): number[] {
  return [cmd(1, 1), zz(x), zz(y)]
}

function lineGeom(points: Array<[number, number]>): number[] {
  const out: number[] = [cmd(1, 1), zz(points[0][0]), zz(points[0][1]), cmd(2, points.length - 1)]
  for (let i = 1; i < points.length; i++) {
    out.push(zz(points[i][0] - points[i - 1][0]), zz(points[i][1] - points[i - 1][1]))
  }
  return out
}

interface Feature { tags: number[], type: 1 | 2 | 3, geometry: number[] }

function writeLayer(pbf: Pbf, name: string, keys: string[], values: string[], features: Feature[], extent = 4096): void {
  pbf.writeVarintField(15, 2)
  pbf.writeStringField(1, name)
  for (const f of features) {
    pbf.writeMessage(2, (feat: Feature, p: Pbf) => {
      if (feat.tags.length > 0)
        p.writePackedVarint(2, feat.tags)
      p.writeVarintField(3, feat.type)
      if (feat.geometry.length > 0)
        p.writePackedVarint(4, feat.geometry)
    }, f)
  }
  for (const k of keys) pbf.writeStringField(3, k)
  for (const v of values) pbf.writeMessage(4, (_: null, p: Pbf) => { p.writeStringField(1, v) }, null)
  pbf.writeVarintField(5, extent)
}

// --- The synthetic city ----------------------------------------------------

const ROAD_NAMES = [
  'Ocean Boulevard',
  'Pico Avenue',
  'Nebraska Way',
  'Franklin Street',
  'Harbor Drive',
  'Pier Crescent',
]

/** A gentle S-curve, so the labels have something to bend around. */
function curve(y: number, amplitude: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    points.push([Math.round(t * 4096), Math.round(y + Math.sin(t * Math.PI * 2) * amplitude)])
  }
  return points
}

function diagonal(offset: number): Array<[number, number]> {
  return [[0, offset], [4096, offset - 2600]]
}

function makeTile(): ArrayBuffer {
  const roads: Feature[] = [
    { type: 2, tags: [0, 0], geometry: lineGeom(curve(600, 260)) },
    { type: 2, tags: [0, 1], geometry: lineGeom(curve(1500, 180)) },
    { type: 2, tags: [0, 2], geometry: lineGeom(curve(2400, 320)) },
    { type: 2, tags: [0, 3], geometry: lineGeom(curve(3300, 200)) },
    { type: 2, tags: [0, 4], geometry: lineGeom(diagonal(3900)) },
    { type: 2, tags: [0, 5], geometry: lineGeom(diagonal(3000)) },
  ]

  const placeNames = ['Santa Monica', 'Ocean Park', 'Venice', 'Mar Vista']
  const places: Feature[] = placeNames.map((_, i) => ({
    type: 1 as const,
    tags: [0, i],
    geometry: pointGeom(700 + (i % 2) * 2400, 900 + Math.floor(i / 2) * 1900),
  }))

  const pbf = new Pbf()
  pbf.writeMessage(3, (_: null, p: Pbf) => { writeLayer(p, 'road', ['name'], ROAD_NAMES, roads) }, null)
  pbf.writeMessage(3, (_: null, p: Pbf) => { writeLayer(p, 'place', ['name'], placeNames, places) }, null)

  const out = pbf.finish()
  const ab = new ArrayBuffer(out.byteLength)
  new Uint8Array(ab).set(out)
  return ab
}

// Serve the synthetic tile for every z/x/y so panning shows the seam behaviour.
const SYNTHETIC_TILE: ArrayBuffer = makeTile()
const PREFIX = 'labels-demo-tiles/'
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

// --- Map -------------------------------------------------------------------

type Theme = 'dark' | 'light'
let theme: Theme = 'dark'

const PALETTES = {
  dark: { road: '#3a3f4b', casing: '#0f1116', label: '#c8ccd4', halo: '#0d0f13', place: '#ffffff', ground: '#12141a' },
  light: { road: '#ffffff', casing: '#d9d6d0', label: '#5f6368', halo: '#ffffff', place: '#202124', ground: '#f3f2ee' },
}

const map = new TsMap('map', {
  center: [0, 0],
  zoom: 4,
  minZoom: 2,
  maxZoom: 14,
  theme,
})

control.navigation().addTo(map)
control.fullscreen().addTo(map)
control.geocoder({ placeholder: 'Search Location…' }).addTo(map)

function styleLayers(mode: Theme): VectorTileStyleLayer[] {
  const c = PALETTES[mode]
  return [
    {
      id: 'road-casing',
      type: 'line',
      sourceLayer: 'road',
      paint: { 'line-color': c.casing, 'line-width': 14 },
    },
    {
      id: 'road-fill',
      type: 'line',
      sourceLayer: 'road',
      paint: { 'line-color': c.road, 'line-width': 9 },
    },
    {
      // The headline feature: names that follow the road they belong to.
      id: 'road-label',
      type: 'symbol',
      sourceLayer: 'road',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 15,
        'symbol-placement': 'line',
        'symbol-spacing': 420,
        'text-max-angle': 45,
      },
      paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 2 },
    },
    {
      id: 'place-dot',
      type: 'circle',
      sourceLayer: 'place',
      paint: { 'circle-color': '#ea4335', 'circle-radius': 5, 'circle-stroke-color': c.halo, 'circle-stroke-width': 2 },
    },
    {
      // Point placement, exercising anchor + offset so the name clears its dot.
      id: 'place-label',
      type: 'symbol',
      sourceLayer: 'place',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 19,
        'text-anchor': 'top',
        'text-offset': [0, 0.6],
        // Places outrank street names when the two compete for the same space.
        'symbol-sort-key': 10,
      },
      paint: { 'text-color': c.place, 'text-halo-color': c.halo, 'text-halo-width': 3 },
    },
  ]
}

let layer = vectorTileLayer({
  url: `${PREFIX}{z}/{x}/{y}.pbf`,
  tileSize: 512,
  layers: styleLayers(theme),
  attribution: 'Synthetic tiles — line-placed labels, one collision index across every tile',
}).addTo(map)

function applyTheme(next: Theme): void {
  theme = next
  // Three things flip together: the map style, the chrome, and the page.
  map.setTheme(next)
  document.body.dataset.theme = next
  map.getContainer().style.background = PALETTES[next].ground

  map.removeLayer(layer)
  layer = vectorTileLayer({
    url: `${PREFIX}{z}/{x}/{y}.pbf`,
    tileSize: 512,
    layers: styleLayers(next),
    attribution: 'Synthetic tiles — line-placed labels, one collision index across every tile',
  }).addTo(map)

  const button = document.getElementById('theme-toggle')
  if (button)
    button.textContent = next === 'dark' ? '☀︎ Light mode' : '☾ Dark mode'
}

applyTheme('dark')

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark')
})

const scope = globalThis as unknown as { demo: unknown }
// `styles` is exposed so the console can swap in a real basemap:
//   demo.map.setStyle(demo.styles.dark({ tiles: '…/{z}/{x}/{y}.pbf' }))
scope.demo = { map, styles, applyTheme }
