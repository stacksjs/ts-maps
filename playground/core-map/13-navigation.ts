/**
 * Phase 13 demo — turn-by-turn navigation, after Apple Maps.
 *
 * Previews the routes between two places in San Francisco, then drives the
 * chosen one with a simulated GPS when you press Go: banner, spoken prompts,
 * the follow camera, the road behind greyed out, and arrival.
 *
 * `?theme=dark`, `?units=metric`, `?speed=20` (m/s), `?go` to start straight
 * away, and `?from=lat,lng&to=lat,lng` change the trip.
 */

import { control, styles, TsMap, turnByTurn } from '../../packages/ts-maps/src/core-map'

const params = new URLSearchParams(location.search)
const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
const theme = (params.get('theme') as 'light' | 'dark' | null) ?? (prefersDark ? 'dark' : 'light')
const point = (value: string | null, fallback: [number, number]): { lat: number, lng: number } => {
  const [lat, lng] = value ? value.split(',').map(Number) : fallback
  return { lat: lat!, lng: lng! }
}

const map = new TsMap('map', { center: [37.7793, -122.4193], zoom: 13, theme, zoomControl: false })
control.navigation().addTo(map)

fetch('https://tiles.openfreemap.org/planet')
  .then(r => r.json())
  .then((tilejson) => {
    const build = theme === 'dark' ? styles.dark : styles.light
    map.setStyle(build({ tiles: tilejson.tiles[0], maxzoom: tilejson.maxzoom ?? 14, attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap' }))
  })

const nav = turnByTurn(map, {
  units: (params.get('units') as 'metric' | 'imperial' | null) ?? undefined,
  simulate: { speed: Number(params.get('speed') ?? 13), timeScale: Number(params.get('timeScale') ?? 1) },
  voice: !params.has('mute'),
  destinationName: params.get('name') ?? 'Palace of Fine Arts',
})

// Ferry Building to the Palace of Fine Arts.
const from = point(params.get('from'), [37.7955, -122.3937])
const to = point(params.get('to'), [37.8029, -122.4484])

nav.preview(from, to).then(() => {
  if (params.has('go'))
    setTimeout(() => nav.start(), 1500)
})

const scope = globalThis as unknown as { demo: unknown }
scope.demo = { map, nav }
