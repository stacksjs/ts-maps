/**
 * Example 18 — Extruded choropleth.
 *
 * Polygons of your own stood up as prisms, with no basemap under them: a
 * GeoJSON source and a `fill-extrusion` layer whose height and colour come
 * from each feature's properties. The prism under the pointer is found by the
 * face it shows, hover is feature state, and the tallest carry a marker on
 * their roof.
 *
 * The data is made up on the spot — a grid of cells with a few "cities" — so
 * the example needs no file. It sits near the equator, where a height reads
 * the same across the map.
 */

import { divIcon, Map, marker } from '../../packages/ts-maps/src/core-map'

const SIDE = 20
const CELL = 0.5
// Metres of height per unit of value.
const METRES = 0.25

interface Cell { id: string, value: number, lean: number, centre: [number, number] }

const cities = [{ col: 5, row: 6, size: 900000 }, { col: 14, row: 12, size: 600000 }, { col: 9, row: 16, size: 350000 }]
const cells: Cell[] = []
const features: unknown[] = []
for (let row = 0; row < SIDE; row++) {
  for (let col = 0; col < SIDE; col++) {
    let value = 4000 + ((row * 37 + col * 61) % 23) * 900
    let lean = -0.35 + ((row * 13 + col * 7) % 11) / 40
    for (const city of cities) {
      const near = Math.exp(-(((col - city.col) ** 2 + (row - city.row) ** 2) / 3))
      value += city.size * near
      lean += near
    }
    const id = `${row}-${col}`
    const west = 2 + col * CELL
    const south = 2 + row * CELL
    cells.push({ id, value: Math.round(value), lean, centre: [south + CELL / 2, west + CELL / 2] })
    features.push({
      type: 'Feature',
      properties: { code: id, value: Math.round(value), lean: Math.max(-1, Math.min(1, lean)) },
      // Counter-clockwise, as GeoJSON winds an outer ring.
      geometry: { type: 'Polygon', coordinates: [[[west, south], [west + CELL, south], [west + CELL, south + CELL], [west, south + CELL], [west, south]]] },
    })
  }
}

const map = new Map('map', {
  center: [5.5, 7],
  zoom: 6,
  pitch: 58,
  bearing: -15,
  theme: 'dark',
  style: { version: 8, sources: {}, layers: [{ id: 'night', type: 'background', paint: { 'background-color': '#0b0f17' } }] } as any,
})

map.on('style.load', () => {
  map.addSource('cells', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
    // Feature state goes by id; this takes it from a property.
    promoteId: 'code',
    maxzoom: 5,
  } as any)
  map.addStyleLayer({
    id: 'prisms',
    type: 'fill-extrusion',
    source: 'cells',
    paint: {
      'fill-extrusion-height': ['*', METRES, ['get', 'value']],
      'fill-extrusion-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        '#ffffff',
        ['interpolate', ['linear'], ['get', 'lean'], -0.5, '#b91c1c', 0, '#f5d0d0', 0.5, '#1d4ed8'],
      ],
      // Roofs exactly the colour above, and no fading into the distance.
      'fill-extrusion-vertical-gradient': false,
      'fill-extrusion-fade-range': [0, 0],
    },
  } as any)

  // A marker on the roof of each city's tallest cell.
  for (const city of cities) {
    const cell = cells.find(c => c.id === `${city.row}-${city.col}`)!
    marker(cell.centre, {
      altitude: cell.value * METRES,
      interactive: false,
      icon: divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div style="transform:translate(-50%,-100%);white-space:nowrap;font:600 12px system-ui;color:#fff;text-shadow:0 1px 3px #000">${Math.round(cell.value / 1000)}K</div>`,
      }),
    }).addTo(map)
  }
})

const info = document.getElementById('info')
let hovered: string | undefined

map.on('pointermove', (e: any) => {
  // The prism the pointer is on: its wall or its roof, not the ground behind.
  const [hit] = map.queryRenderedFeatures(e.containerPoint, { layers: ['prisms'] })
  const id = hit?.feature.id as string | undefined
  if (id === hovered)
    return
  if (hovered !== undefined)
    map.setFeatureState({ source: 'cells', id: hovered }, { hover: false })
  hovered = id
  if (id !== undefined)
    map.setFeatureState({ source: 'cells', id }, { hover: true })
  if (info)
    info.textContent = hit ? `Cell ${id}: ${Number(hit.feature.properties.value).toLocaleString()}` : 'Point at a prism.'
})

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map, cells }
