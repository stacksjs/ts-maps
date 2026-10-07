/**
 * Phase 12 demo — a full-bleed, real-world basemap.
 *
 * The page to hold next to Apple Maps or Google Maps: keyless OpenMapTiles
 * vector tiles from Wildloop's planet (OpenFreeMap as a fallback), the built-in light/dark style, and nothing else on
 * the page. Scroll, pinch, drag and double-click here and there and the two
 * should feel the same — labels included.
 *
 * `?theme=dark`, `?lat=…&lng=…&zoom=…` override the starting view.
 */

import { control, styles, TsMap } from '../../packages/ts-maps/src/core-map'
import { loadBasemap } from './basemap'

const params = new URLSearchParams(location.search)
const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
const theme = (params.get('theme') as 'light' | 'dark' | null) ?? (prefersDark ? 'dark' : 'light')

const map = new TsMap('map', {
  center: [Number(params.get('lat') ?? 37.7793), Number(params.get('lng') ?? -122.4193)],
  zoom: Number(params.get('zoom') ?? 13),
  minZoom: 2,
  maxZoom: 19,
  theme,
  // The navigation control below carries zoom and the compass together, on
  // the right where Apple Maps keeps them.
  zoomControl: false,
})

control.navigation().addTo(map)
control.scale({ transient: true }).addTo(map)

// Tile URLs carry the build they come from; the current one is in the TileJSON.
void loadBasemap(map, theme)

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map, styles }
