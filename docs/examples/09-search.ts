/**
 * Example 09 — Search.
 *
 * Apple Maps' search box, in one line: suggestions as you type, Find Nearby,
 * a pin for every result and a card for the place you choose. Answers come
 * from the map's own tiles and from Photon, OpenStreetMap's geocoder.
 */

import { control, Map, styles } from '../../packages/ts-maps/src/core-map'

const map = new Map('map', {
  center: [51.5072, -0.1276],
  zoom: 14,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

control.search().addTo(map)

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
