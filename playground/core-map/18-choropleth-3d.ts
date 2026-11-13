/**
 * 3D choropleth — a stress page for `fill-extrusion` over a geojson source.
 *
 * About 3,100 polygons, the size of a map of every US county, generated so
 * the page needs no data file: a jittered grid of quadrilaterals near the
 * equator, where Mercator's stretch is next to nothing and a height reads the
 * same everywhere. A few of them are made tall, like the cities on an
 * election map.
 *
 * What to look for is listed in docs/concepts/3d.md under "Your own data";
 * the readout in the panel is what a change of hover costs.
 */

import type { Marker } from '../../packages/ts-maps/src/core-map'
import { divIcon, Map, marker } from '../../packages/ts-maps/src/core-map'

const COLS = 62
const ROWS = 50
const WEST = 4
const SOUTH = 2
const CELL = 0.32
// Metres of height per unit of value: a million stands about a hundred and
// fifty pixels at this zoom.
const METRES = 0.4

/** A small seeded generator, so the page is the same on every load. */
function random(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Cell { id: string, name: string, value: number, margin: number, centre: [number, number] }

function generate(seed: number): { data: any, cells: Cell[] } {
  const rand = random(seed)
  // Grid corners, each nudged, so cells are irregular but still share edges.
  const corner = (col: number, row: number): [number, number] => {
    const r = random(col * 7919 + row * 104729 + 1)
    return [WEST + (col + (r() - 0.5) * 0.5) * CELL, SOUTH + (row + (r() - 0.5) * 0.5) * CELL]
  }
  const cities = Array.from({ length: 7 }, () => ({ col: rand() * COLS, row: rand() * ROWS, size: 250000 + rand() * 1100000, spread: 1.2 + rand() * 2 }))

  const cells: Cell[] = []
  const features: any[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      let value = 1500 + rand() * 22000
      let lean = (rand() - 0.5) * 0.5 - 0.25
      for (const city of cities) {
        const d = Math.hypot(col - city.col, row - city.row) / city.spread
        const pull = Math.exp(-d * d)
        value += city.size * pull
        lean += pull * 0.9
      }
      const margin = Math.max(-1, Math.min(1, lean))
      const id = `${String(row).padStart(2, '0')}${String(col).padStart(3, '0')}`
      const a = corner(col, row)
      const b = corner(col + 1, row)
      const c = corner(col + 1, row + 1)
      const d = corner(col, row + 1)
      cells.push({ id, name: `Cell ${row}·${col}`, value: Math.round(value), margin, centre: [(a[1] + c[1]) / 2, (a[0] + c[0]) / 2] })
      features.push({
        type: 'Feature',
        // Counter-clockwise, as RFC 7946 winds an outer ring.
        geometry: { type: 'Polygon', coordinates: [[a, b, c, d, a]] },
        properties: { code: id, value: Math.round(value), margin },
      })
    }
  }
  return { data: { type: 'FeatureCollection', features }, cells }
}

let seed = 2026
let { data, cells } = generate(seed)

const map = new Map('map', {
  center: [SOUTH + (ROWS * CELL) / 2 - 1.5, WEST + (COLS * CELL) / 2],
  zoom: 6,
  minZoom: 4,
  maxZoom: 10,
  pitch: 60,
  bearing: -12,
  maxPitch: 80,
  theme: 'dark',
  style: { version: 8, sources: {}, layers: [{ id: 'night', type: 'background', paint: { 'background-color': '#0b0f17' } }] } as any,
})

const hovered = ['boolean', ['feature-state', 'hover'], false]
const selected = ['boolean', ['feature-state', 'selected'], false]

map.on('style.load', () => {
  map.addSource('cells', {
    type: 'geojson',
    data,
    // Ids from a property, as county data carries its FIPS code.
    promoteId: 'code',
    // Indexed no deeper than this: zooming in cuts these tiles up rather
    // than meshing the same prisms again a level down.
    maxzoom: 5,
    buffer: 16,
  } as any)
  map.addStyleLayer({ id: 'cells-ground', type: 'fill', source: 'cells', paint: { 'fill-color': '#141a26', 'fill-outline-color': '#1f2937' } } as any)
  map.addStyleLayer({
    id: 'cells-3d',
    type: 'fill-extrusion',
    source: 'cells',
    paint: {
      'fill-extrusion-height': ['*', METRES, ['get', 'value']],
      'fill-extrusion-color': ['case', selected, '#facc15', hovered, '#ffffff', ['interpolate', ['linear'], ['get', 'margin'], -0.6, '#b91c1c', -0.05, '#fca5a5', 0.05, '#93c5fd', 0.6, '#1d4ed8']],
      // The legend's colours, exactly, and no fading with distance: these
      // prisms are the subject of the map.
      'fill-extrusion-vertical-gradient': false,
      'fill-extrusion-fade-range': [0, 0],
    },
  } as any)
  label()
})

// --- Roof labels -------------------------------------------------------------

let labels: Marker[] = []

function label(): void {
  for (const m of labels)
    m.remove()
  labels = [...cells].sort((a, b) => b.value - a.value)
    // One per city: skip a cell next to one already labelled.
    .reduce<Cell[]>((kept, cell) => kept.length < 6 && kept.every(k => Math.hypot(k.centre[0] - cell.centre[0], k.centre[1] - cell.centre[1]) > 1.2) ? [...kept, cell] : kept, [])
    .map(cell => marker(cell.centre, {
      altitude: cell.value * METRES,
      interactive: false,
      keyboard: false,
      icon: divIcon({ className: '', iconSize: [0, 0], html: `<div class="roof-label">${cell.name}<small>${Math.round(cell.value / 1000)}K</small></div>` }),
    }).addTo(map))
}

// --- Hover and click ---------------------------------------------------------

let hoverId: string | undefined
let selectedId: string | undefined
let lastCost = 0

function hover(id: string | undefined): void {
  if (id === hoverId)
    return
  const started = performance.now()
  if (hoverId !== undefined)
    map.setFeatureState({ source: 'cells', id: hoverId }, { hover: false })
  hoverId = id
  if (id !== undefined)
    map.setFeatureState({ source: 'cells', id }, { hover: true })
  lastCost = performance.now() - started
}

map.on('pointermove', (e: any) => {
  const [hit] = map.queryRenderedFeatures(e.containerPoint, { layers: ['cells-3d'] })
  hover(hit?.feature.id as string | undefined)
  map.getContainer().style.cursor = hit ? 'pointer' : ''
})
map.on('pointerout', () => hover(undefined))
map.on('click', 'cells-3d', (e: any) => {
  const id = e.features?.[0]?.feature.id as string | undefined
  if (selectedId !== undefined)
    map.setFeatureState({ source: 'cells', id: selectedId }, { selected: false })
  selectedId = id === selectedId ? undefined : id
  if (selectedId !== undefined)
    map.setFeatureState({ source: 'cells', id: selectedId }, { selected: true })
})

// --- Panel -------------------------------------------------------------------

const panel = document.createElement('div')
panel.className = 'demo-panel'
panel.innerHTML = `
  <div style="font-weight:600;margin-bottom:10px;">${COLS * ROWS} prisms</div>
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
    Pitch <input id="pitch" type="range" min="0" max="80" step="1" value="60" style="flex:1;" />
    <span id="pitch-read" style="min-width:28px;text-align:right;">60°</span>
  </label>
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
    Bearing <input id="bearing" type="range" min="-180" max="180" step="1" value="-12" style="flex:1;" />
    <span id="bearing-read" style="min-width:30px;text-align:right;">-12°</span>
  </label>
  <label style="display:block;margin-bottom:6px;"><input id="fade" type="checkbox" /> Fade with distance (the default)</label>
  <label style="display:block;margin-bottom:8px;"><input id="gradient" type="checkbox" /> Vertical gradient (the default)</label>
  <button id="shuffle" type="button">New data</button>
  <div id="readout"></div>
`
map.getContainer().appendChild(panel)
for (const type of ['pointerdown', 'pointermove', 'wheel', 'dblclick', 'click'])
  panel.addEventListener(type, e => e.stopPropagation())

const input = (id: string): HTMLInputElement => panel.querySelector(`#${id}`) as HTMLInputElement
const read = (id: string): HTMLElement => panel.querySelector(`#${id}`) as HTMLElement

input('pitch').addEventListener('input', () => {
  map.setPitch(Number(input('pitch').value))
  read('pitch-read').textContent = `${input('pitch').value}°`
})
input('bearing').addEventListener('input', () => {
  map.setBearing(Number(input('bearing').value))
  read('bearing-read').textContent = `${input('bearing').value}°`
})
input('fade').addEventListener('change', () => map.setPaintProperty('cells-3d', 'fill-extrusion-fade-range', input('fade').checked ? [3, 10] : [0, 0]))
input('gradient').addEventListener('change', () => map.setPaintProperty('cells-3d', 'fill-extrusion-vertical-gradient', input('gradient').checked))
read('shuffle').addEventListener('click', () => {
  const next = generate(++seed)
  data = next.data
  cells = next.cells
  hoverId = undefined
  selectedId = undefined
  map.setSourceData('cells', data)
  label()
})

// The layer drawing the prisms, for its counters.
const host = (): any => (map as any)._style?.sourceLayers.get('cells')

let frames = 0
let fps = 0
let since = performance.now()
function tick(): void {
  frames++
  const now = performance.now()
  if (now - since >= 500) {
    fps = Math.round((frames * 1000) / (now - since))
    frames = 0
    since = now
    const cell = cells.find(c => c.id === hoverId)
    read('readout').textContent = [
      `frames/s        ${fps}`,
      `hover change    ${lastCost.toFixed(3)} ms`,
      `tiles meshed    ${host()?._meshBuilds ?? 0}`,
      `under pointer   ${cell ? `${cell.name} · ${cell.value.toLocaleString()}` : 'nothing'}`,
      `selected        ${selectedId ?? 'nothing'}`,
    ].join('\n')
  }
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map, host, cells: () => cells, hover }
