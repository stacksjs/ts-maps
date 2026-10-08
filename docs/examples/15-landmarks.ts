/**
 * Example 15 — Landmarks and trees.
 *
 * A glTF model stands in for its building, as Apple Maps shows famous ones:
 * lit, fogged and hidden behind like the extruded buildings around it, which
 * leave out the box it replaces. Trees are planted in the basemap's woods once
 * the map tilts: fly to the Presidio to see them.
 */

import { landmark, Map, styles, trees } from '../../packages/ts-maps/src/core-map'
import { transamerica } from './data/transamerica'

const PYRAMID: [number, number] = [37.7952, -122.4028]

const map = new Map('map', {
  center: [37.7959, -122.4034],
  zoom: 17.1,
  pitch: 52,
  bearing: -28,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

// A `.glb` URL works the same; this model is built in code (data/transamerica.ts).
landmark({ model: transamerica(), position: PYRAMID }).addTo(map)
trees().addTo(map)

const on = (id: string, fn: () => void): void => document.getElementById(id)?.addEventListener('click', fn)
on('pyramid', () => map.flyTo([37.7959, -122.4034], 17.1, { pitch: 52, bearing: -28 }))
on('presidio', () => map.flyTo([37.7925, -122.4572], 17.4, { pitch: 62, bearing: 20 }))

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
