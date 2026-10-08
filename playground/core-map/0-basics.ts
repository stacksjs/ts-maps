/**
 * Phase 0.3 demo — Basics.
 *
 * Creates a TsMap, sets the shared vector basemap, places a Marker at
 * Times Square, and binds a Popup. Uses the new core-map API.
 */

import { DivIcon, Marker, TsMap } from '../../packages/ts-maps/src/core-map'
import { loadBasemap } from './basemap'

const TIMES_SQUARE: [number, number] = [40.758, -73.9855]

const map = new TsMap('map', {
  center: TIMES_SQUARE,
  zoom: 13,
  minZoom: 2,
  maxZoom: 19,
  worldCopyJump: true,
})

// The vector basemap the real-world demos share (see basemap.ts).
void loadBasemap(map, 'light')

// We use a DivIcon so the demo works without any external marker-icon assets.
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

// Small interactive niceties: log drag end location.
marker.on('dragend', () => {
  const { lat, lng } = marker.getLatLng()
  // eslint-disable-next-line no-console
  console.log(`marker moved to ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
})

// Expose for easy poking in the devtools console.
const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map, marker }
