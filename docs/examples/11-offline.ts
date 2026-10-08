/**
 * Example 11 — Offline maps.
 *
 * The Offline Maps button: pick an area, see how much it will take, and
 * download it. Its tiles, fonts, places and roads are then kept in the
 * browser, so the map, search and directions all work with no connection.
 */

import { control, Map, styles } from '../../packages/ts-maps/src/core-map'

const map = new Map('map', {
  center: [48.8566, 2.3522],
  zoom: 13,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

// `resources` are stored with each download, so the TileJSON is there to
// read with no connection too.
control.offlineMaps({ resources: ['https://tiles.openfreemap.org/planet'] }).addTo(map)

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
