/**
 * Phase 15 demo — search, after Apple Maps.
 *
 * "Search Maps" at the top left: focus it for Find Nearby and Recents, type
 * for suggestions from the map, offline maps and Photon together, pick a
 * category to drop pins, move the map for "Search This Area", and open a
 * place for its card and Directions.
 *
 * `?theme=dark`, `?q=coffee` to search straight away, `?units=metric`.
 */

import { control, offlineMaps, styles, TsMap, turnByTurn } from '../../packages/ts-maps/src/core-map'

const params = new URLSearchParams(location.search)
const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
const theme = (params.get('theme') as 'light' | 'dark' | null) ?? (prefersDark ? 'dark' : 'light')

const map = new TsMap('map', { center: [37.7925, -122.4065], zoom: 15, theme, zoomControl: false })
control.navigation().addTo(map)
control.offlineMaps().addTo(map)

const nav = turnByTurn(map, { voice: !params.has('mute'), simulate: true })
const search = control.search({
  turnByTurn: nav,
  units: (params.get('units') as 'metric' | 'imperial' | null) ?? undefined,
  // A desk has no GPS worth asking: start from where the map was opened.
  origin: () => ({ lat: 37.7925, lng: -122.4065 }),
}).addTo(map)

const TILEJSON = 'https://tiles.openfreemap.org/planet'
fetch(TILEJSON)
  .catch(() => offlineMaps().lookup(TILEJSON).then(hit => new Response(hit?.data as BodyInit | undefined)))
  .then(r => r.json())
  .then((tilejson) => {
    const build = theme === 'dark' ? styles.dark : styles.light
    map.setStyle(build({ tiles: tilejson.tiles[0], maxzoom: tilejson.maxzoom ?? 14, attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap' }))
    const q = params.get('q')
    if (q)
      setTimeout(() => search.search(q), 2500)
  })

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map, search, nav }
