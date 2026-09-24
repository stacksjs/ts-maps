/**
 * Phase 12 demo — a full-bleed, real-world basemap.
 *
 * The page to hold next to Apple Maps or Google Maps: OpenFreeMap's keyless
 * OpenMapTiles vector tiles, the built-in light/dark style, and nothing else on
 * the page. Scroll, pinch, drag and double-click here and there and the two
 * should feel the same — labels included.
 *
 * `?theme=dark`, `?lat=…&lng=…&zoom=…` override the starting view.
 */

import { control, styles, TsMap } from '../../packages/ts-maps/src/core-map'

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

// OpenFreeMap versions its tile URLs; the current one is in its TileJSON.
fetch('https://tiles.openfreemap.org/planet')
  .then(r => r.json())
  .then((tilejson) => {
    const build = theme === 'dark' ? styles.dark : styles.light
    map.setStyle(build({
      tiles: tilejson.tiles[0],
      maxzoom: tilejson.maxzoom ?? 14,
      attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap',
    }))
  })

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map, styles }
