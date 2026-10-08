/**
 * Example 12 — Globe.
 *
 * The whole world on a sphere, drawn from the same basemap tiles as the flat
 * map. Drag to turn it; zoom in past 5.5 and it fades into the flat map.
 */

import { Map, styles } from '../../packages/ts-maps/src/core-map'

const map = new Map('map', {
  center: [30, 10],
  zoom: 2.5,
  projection: 'globe',
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

// The halo round it, and the space behind.
map.setFog({ 'color': '#ffffff', 'space-color': '#dfe7f0' })

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
