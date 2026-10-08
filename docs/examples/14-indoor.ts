/**
 * Example 14 — Indoor maps.
 *
 * An airport terminal's floor plan, drawn over the basemap one level at a
 * time once you are close enough to see inside, with a level picker beside
 * the map. Connected to search, its gates and shops are found by name, and
 * choosing one goes to its level.
 */

import { control, indoorMap, styles, TsMap } from '../../packages/ts-maps/src/core-map'
import { TERMINAL_CENTER, terminal } from './data/terminal'

const map = new TsMap('map', {
  center: TERMINAL_CENTER,
  zoom: 18.8,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

const search = control.search().addTo(map)

// The venue is IMDF: here its files, parsed; or a `.zip` URL.
const indoor = indoorMap({ venue: terminal(), level: 1 }).addTo(map)
indoor.connect(search) // Try searching for "Gate A4" or "coffee".

const globalScope = globalThis as unknown as { demo: unknown }
globalScope.demo = { map, indoor }
