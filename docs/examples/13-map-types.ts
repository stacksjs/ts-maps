/**
 * Example 13 — Map types.
 *
 * Apple's map types from one basemap: Explore, Driving (roads first, and only
 * the places a driver stops at), Transit (lines and stations) and Satellite
 * (Esri's imagery with the names over it). Choosing one keeps the camera, and
 * anything the page added to the map.
 */

import { control, Map, mapTypes, styles } from '../../packages/ts-maps/src/core-map'

const BASEMAP = 'https://tiles.openfreemap.org/planet'

const map = new Map('map', {
  center: [37.7793, -122.4193],
  zoom: 14,
  style: styles.light({ url: BASEMAP }),
})

const picker = control.mapType({ types: mapTypes({ url: BASEMAP }) }).addTo(map)
picker.open()

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map, picker }
