/**
 * Example 01 — Basic map.
 *
 * A vector basemap, a draggable marker and its popup: the least a map needs.
 * The basemap is OpenFreeMap's planet, keyless, drawn with the built-in light
 * style; `url` names its TileJSON, which the map reads for the tiles.
 */

import { DivIcon, Map, Marker, styles } from '../../packages/ts-maps/src/core-map'

const TIMES_SQUARE: [number, number] = [40.758, -73.9855]

const map = new Map('map', {
  center: TIMES_SQUARE,
  zoom: 14,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

const pin = new DivIcon({
  className: '',
  html: '<div class="pin"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -22],
})

new Marker(TIMES_SQUARE, { icon: pin, draggable: true, title: 'Times Square' })
  .addTo(map)
  .bindPopup('<b>Hello from ts-maps</b><br>Times Square, New York')
  .openPopup()

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
