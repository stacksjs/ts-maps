/**
 * Example 02 — Camera.
 *
 * Three ways to move the camera: `flyTo` arcs out and back in for a long hop,
 * `easeTo` glides any of centre, zoom, bearing and pitch, and `jumpTo` sets
 * them at once.
 */

import { styles, TsMap } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 12,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

const on = (id: string, fn: () => void): void => document.getElementById(id)?.addEventListener('click', fn)

on('fly-ny', () => map.flyTo([40.758, -73.9855], 13))
on('fly-london', () => map.flyTo([51.5074, -0.1278], 13))
on('fly-tokyo', () => map.flyTo([35.6762, 139.6503], 13))
on('ease-tilt', () => map.easeTo({ bearing: 30, pitch: 50, duration: 900 }))
on('ease-flat', () => map.easeTo({ bearing: 0, pitch: 0, duration: 900 }))
on('jump', () => map.jumpTo({ center: [48.8566, 2.3522], zoom: 14, bearing: 20, pitch: 40 }))

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map }
