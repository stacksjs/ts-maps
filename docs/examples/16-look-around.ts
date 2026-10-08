/**
 * Example 16 — Look Around.
 *
 * Street-level pictures you can turn in and walk through, from Panoramax, the
 * open street-level imagery project (no key). The binoculars show the streets
 * with pictures in blue; tap one to look from there. Drag to turn, tap ahead
 * or use the arrows to walk, Done to come back to the map.
 */

import { lookAround, Map, styles } from '../../packages/ts-maps/src/core-map'

const map = new Map('map', {
  center: [48.8606, 2.3376],
  zoom: 16,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

const look = lookAround().addTo(map)

// Start by the Louvre, on the Rue de Rivoli, looking along it.
void look.open([48.86145, 2.33458], { heading: 100 })

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map, look }
