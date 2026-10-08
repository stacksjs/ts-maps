/**
 * Example 10 — Turn-by-turn.
 *
 * Directions from the Ferry Building to the Palace of Fine Arts: the routes
 * to choose from, then Go for the banner, the lanes, the voice and a camera
 * that follows. `simulate` drives the route, so it can be watched from a
 * desk; without it, the device's position does.
 */

import { styles, TsMap, turnByTurn } from '../../packages/ts-maps/src/core-map'

const map = new TsMap('map', {
  center: [37.7993, -122.4219],
  zoom: 13,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

const nav = turnByTurn(map, {
  destinationName: 'Palace of Fine Arts',
  simulate: { speed: 14 },
})

void nav.preview({ lat: 37.7955, lng: -122.3937 }, { lat: 37.8029, lng: -122.4484 })

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map, nav }
