/**
 * Camera demo — bearing (map rotation), pitch (camera tilt), and smooth
 * animated moves via `flyTo` / `easeTo`.
 *
 * A TsMap with an OSM tile layer and a marker. Range sliders drive
 * `map.setBearing(...)` and `map.setPitch(...)`. Buttons showcase the
 * unified camera animation engine: `flyTo` for zoom-out/zoom-in long hops,
 * `easeTo` for a tween of any `{center, zoom, bearing, pitch}` combination.
 * Markers stay visually upright because the marker / popup / tooltip panes
 * counter-rotate and counter-pitch (see `TsMap._applyCameraTransform`).
 */

import { DivIcon, LatLng, Marker, tileLayer, TsMap } from '../../packages/ts-maps/src/core-map'

const TIMES_SQUARE: [number, number] = [40.758, -73.9855]
const INITIAL_ZOOM = 13
const INITIAL_BEARING = 0
const INITIAL_PITCH = 0

const map = new TsMap('map', {
  center: TIMES_SQUARE,
  zoom: INITIAL_ZOOM,
  minZoom: 2,
  maxZoom: 19,
  bearing: INITIAL_BEARING,
  pitch: INITIAL_PITCH,
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
  title: 'Times Square',
  alt: 'Times Square marker',
})
marker.addTo(map)
marker.bindPopup('<b>Hello from ts-maps</b><br>Times Square, NYC')

// Wire the sliders.
const bearingSlider = document.getElementById('bearing') as HTMLInputElement
const bearingLabel = document.getElementById('bearing-value') as HTMLSpanElement
const pitchSlider = document.getElementById('pitch') as HTMLInputElement
const pitchLabel = document.getElementById('pitch-value') as HTMLSpanElement
const resetBtn = document.getElementById('reset-camera') as HTMLButtonElement
const flyNycBtn = document.getElementById('fly-nyc') as HTMLButtonElement
const easeTokyoBtn = document.getElementById('ease-tokyo') as HTMLButtonElement

function updateBearingLabel(bearing: number): void {
  bearingLabel.textContent = `${Math.round(bearing)}°`
}

function updatePitchLabel(pitch: number): void {
  pitchLabel.textContent = `${Math.round(pitch)}°`
}

bearingSlider.addEventListener('input', () => {
  const bearing = Number(bearingSlider.value)
  map.setBearing(bearing)
  updateBearingLabel(bearing)
})

pitchSlider.addEventListener('input', () => {
  const pitch = Number(pitchSlider.value)
  map.setPitch(pitch)
  updatePitchLabel(pitch)
})

flyNycBtn.addEventListener('click', () => {
  map.flyTo(new LatLng(40.7128, -74.0060), 11, { duration: 1200 })
})

easeTokyoBtn.addEventListener('click', () => {
  map.easeTo({
    center: new LatLng(35.6762, 139.6503),
    zoom: 11,
    bearing: 0,
    pitch: 0,
    duration: 1000,
  })
})

resetBtn.addEventListener('click', () => {
  bearingSlider.value = String(INITIAL_BEARING)
  pitchSlider.value = String(INITIAL_PITCH)
  map.setBearing(INITIAL_BEARING)
  map.setPitch(INITIAL_PITCH)
  map.setZoom(INITIAL_ZOOM)
  updateBearingLabel(INITIAL_BEARING)
  updatePitchLabel(INITIAL_PITCH)
})

// Keep the UI in sync if something else drives the camera.
map.on('rotate', (e: { bearing: number }) => {
  bearingSlider.value = String(Math.round(e.bearing))
  updateBearingLabel(e.bearing)
})

map.on('pitch', (e: { pitch: number }) => {
  pitchSlider.value = String(Math.round(e.pitch))
  updatePitchLabel(e.pitch)
})

updateBearingLabel(map.getBearing())
updatePitchLabel(map.getPitch())

// Expose for easy poking in the devtools console.
const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map, marker }
