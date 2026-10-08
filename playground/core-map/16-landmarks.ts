/**
 * Phase 16 demo — a landmark and trees, after Apple Maps.
 *
 * Wildloop's OpenMapTiles basemap tilted over San Francisco. The
 * Transamerica Pyramid is a glTF model (built here in code, so the demo
 * needs no file) standing in for the extruded box the tiles have, and the
 * Presidio's woods are planted with trees once the map tilts.
 *
 * `?lat=…&lng=…&zoom=…` override the starting view.
 */

import { control, landmark, Map, trees } from '../../packages/ts-maps/src/core-map'
import { transamerica } from '../../docs/examples/data/transamerica'
import { loadBasemap } from './basemap'

const PYRAMID: [number, number] = [37.79520, -122.40280]
const PRESIDIO: [number, number] = [37.79380, -122.45980]

const params = new URLSearchParams(location.search)
const map = new Map('map', {
  center: [Number(params.get('lat') ?? 37.79380), Number(params.get('lng') ?? -122.40180)],
  zoom: Number(params.get('zoom') ?? 16.4),
  pitch: 60,
  bearing: -28,
  maxZoom: 19,
  zoomControl: false,
})
control.navigation().addTo(map)
void loadBasemap(map, 'light')

landmark({ model: transamerica(), position: PYRAMID }).addTo(map)
trees().addTo(map)

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-place]')) {
  button.addEventListener('click', () => {
    const presidio = button.dataset.place === 'presidio'
    map.flyTo(presidio ? PRESIDIO : [37.79380, -122.40180], presidio ? 16.2 : 16.4, { pitch: 60, bearing: presidio ? 20 : -28 })
  })
}

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map }
