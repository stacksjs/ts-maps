/**
 * Example 04 — Style spec.
 *
 * Data of your own on the basemap, through the style: a GeoJSON source, a
 * fill and a line layer over it, and their paint changed at runtime with
 * `setPaintProperty`. The layers are added once the basemap's style has
 * loaded (`style.load`), since setting a style replaces whatever was there.
 */

import { styles, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  center: [40.7616, -73.9776],
  zoom: 13.5,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

map.on('style.load', () => {
  map.addSource('midtown', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: { name: 'Midtown' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-73.9935, 40.7505], [-73.9726, 40.7505], [-73.9621, 40.7648], [-73.9819, 40.7733], [-73.9935, 40.7505]]],
      },
    },
  } as any)
  map.addStyleLayer({ id: 'midtown-fill', type: 'fill', source: 'midtown', paint: { 'fill-color': '#4f46e5', 'fill-opacity': 0.2 } } as any)
  map.addStyleLayer({ id: 'midtown-line', type: 'line', source: 'midtown', paint: { 'line-color': '#4f46e5', 'line-width': 3 } } as any)
})

function tint(color: string): void {
  map.setPaintProperty('midtown-fill', 'fill-color', color)
  map.setPaintProperty('midtown-line', 'line-color', color)
}

const on = (id: string, fn: () => void): void => document.getElementById(id)?.addEventListener('click', fn)
on('tint-indigo', () => tint('#4f46e5'))
on('tint-rose', () => tint('#e11d48'))
on('tint-emerald', () => tint('#059669'))
let filled = true
on('toggle-fill', () => {
  filled = !filled
  map.setPaintProperty('midtown-fill', 'fill-opacity', filled ? 0.2 : 0)
})

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
