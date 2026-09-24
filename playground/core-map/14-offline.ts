/**
 * Phase 14 demo — offline maps, after Apple Maps.
 *
 * The download button (top right) lists downloaded maps and picks new ones:
 * drag the frame's corners or move the map beneath it, check the estimated
 * size, and download. Then turn on "Only Use Offline Maps", or switch the
 * browser offline, and the downloaded area keeps drawing — and search and
 * directions keep working from the downloaded tiles.
 *
 * `?theme=dark`, `?select` to open the area picker straight away.
 */

import { control, offlineMaps, styles, TsMap } from '../../packages/ts-maps/src/core-map'

const params = new URLSearchParams(location.search)
const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
const theme = (params.get('theme') as 'light' | 'dark' | null) ?? (prefersDark ? 'dark' : 'light')

const map = new TsMap('map', { center: [37.7793, -122.4193], zoom: 13, theme, zoomControl: false })
control.navigation().addTo(map)
// The TileJSON is kept with each download, so the map can be rebuilt from it
// with no connection.
const TILEJSON = 'https://tiles.openfreemap.org/planet'
const offline = control.offlineMaps({ resources: [TILEJSON] }).addTo(map)

fetch(TILEJSON)
  .catch(() => offlineMaps().lookup(TILEJSON).then(hit => new Response(hit?.data as BodyInit | undefined)))
  .then(r => r.json())
  .then((tilejson) => {
    const build = theme === 'dark' ? styles.dark : styles.light
    map.setStyle(build({ tiles: tilejson.tiles[0], maxzoom: tilejson.maxzoom ?? 14, attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap' }))
    if (params.has('select'))
      setTimeout(() => offline.selectArea(), 1500)
  })

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map, offline, maps: offlineMaps() }
