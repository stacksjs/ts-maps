/**
 * Example 01 — Basic map.
 *
 * OSM basemap, a single marker, and a bound popup. This is the minimum
 * viable ts-maps setup.
 */

import { DivIcon, Marker, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const TIMES_SQUARE: [number, number] = [40.758, -73.9855]

const map = new TsMap('map', {
  center: TIMES_SQUARE,
  zoom: 13,
  minZoom: 2,
  maxZoom: 19,
  worldCopyJump: true,
})

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map)

const pinIcon = new DivIcon({
  className: '',
  html: '<div class="pin"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -22],
})

const marker = new Marker(TIMES_SQUARE, {
  icon: pinIcon,
  draggable: true,
  title: 'Times Square',
  alt: 'Times Square marker',
})
marker.addTo(map)
marker.bindPopup('<b>Hello from ts-maps</b><br>Times Square, NYC')
marker.openPopup()

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map, marker }
