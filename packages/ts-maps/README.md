<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of ts-maps"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly][commitizen-friendly]][commitizen-href]

# ts-maps

> A zero-dependency, TypeScript-native, interactive mapping library.

## Features

- 🗺️ **`TsMap`** — modern interactive slippy map with fractional zoom,
  bearing, pitch, and unified camera animations (`flyTo`, `easeTo`,
  `jumpTo`).

- 🧱 **Vector tiles** — in-house MVT decoder + Mapbox GL Style Spec
  subset with a full expression engine (`interpolate`, `step`, `case`,
  `match`, `coalesce`, `feature-state`). `queryRenderedFeatures` and
  `querySourceFeatures` backed by a per-tile R-tree.

- 🏔️ **3D** — `fill-extrusion`, atmospheric `setFog`, `setSky`, and
  DEM-based `setTerrain` with auto-loaded tiles from a `raster-dem`
  source. `addCustomLayer()` lets apps render raw WebGL2 alongside.

- 🌍 **Globe** — seamless Mercator-to-globe transition around zoom 5.5
  with an atmosphere halo.

- 🧭 **Services** — geocoding / directions / isochrones / matrix
  adapters with keyless defaults (Nominatim, OSRM, Valhalla) and
  opt-in commercial providers (Mapbox, Google, Maptiler, Photon).

- 📴 **Offline** — IndexedDB-backed `TileCache`, `saveOfflineRegion`
  pre-fetcher, worker pool for off-main-thread tile decode.

- 🧩 **Layer-scoped events** — `map.on('click', 'layer-id', handler)`.

- 🎯 **Zero runtime deps.** Subpath exports (`ts-maps/services`,
  `ts-maps/style-spec`, …) let callers pull in just one slice.

- 🔒 **TypeScript-native** — strict types, `isolatedDeclarations`
  compliant, typed events, declaration files for every public module.

## Installation

```bash
bun add ts-maps       # or: npm install ts-maps  /  pnpm add ts-maps  /  yarn add ts-maps
```

### Framework Bindings

```bash
bun add @ts-maps/react         # React
bun add @ts-maps/vue           # Vue 3
bun add @ts-maps/svelte        # Svelte
bun add @ts-maps/solid         # SolidJS
bun add ts-maps-nuxt           # Nuxt module
bun add @ts-maps/react-native  # React Native (WebView-hosted)
```

### Subpath imports for tree-shaking

Pull in only the part you need:

```ts
import { defaultGeocoder } from 'ts-maps/services'
import { validateStyle } from 'ts-maps/style-spec'
import { TileCache } from 'ts-maps/storage'
import { LatLng, LatLngBounds } from 'ts-maps/geo'
```

Full list: `services`, `style-spec`, `storage`, `geo`, `geometry`,
`symbols`.

## Quick Start

```ts
import 'ts-maps/styles.css'
import { Marker, tileLayer, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 13,
})

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

new Marker([40.758, -73.9855])
  .addTo(map)
  .bindPopup('Hello from ts-maps')
  .openPopup()
```

### Vector tiles + style spec

```ts
import { vectorTileLayer } from 'ts-maps'

vectorTileLayer({
  url: 'https://tiles.example.com/{z}/{x}/{y}.pbf',
  layers: [
    { id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0ea5e9' } },
    { id: 'major-roads', type: 'line', sourceLayer: 'transportation',
      filter: ['match', ['get', 'class'], ['primary', 'trunk'], true, false],
      paint: { 'line-color': '#6b7280', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 3] } },
  ],
}).addTo(map)

// Layer-scoped events:
map.on('click', 'major-roads', (e) => {
  console.log('road clicked', e.features[0].properties)
})
```

### 3D — fog, sky, terrain, fill-extrusion, custom WebGL

```ts
map.setPitch(50)

map.addSource('terrain-dem', {
  type: 'raster-dem',
  tiles: ['https://tiles.example.com/terrain-rgb/{z}/{x}/{y}.png'],
  tileSize: 512,
  encoding: 'mapbox',
})
map.setTerrain({ source: 'terrain-dem', exaggeration: 1.4 })
map.setSky({ 'sky-color': '#87ceeb', 'horizon-color': '#ffffff' })
map.setFog({ color: 'rgb(245, 247, 250)', 'horizon-blend': 0.1 })

// Bilinear ground elevation lookup (uses the loaded DEM tile pyramid).
const metres = map.queryTerrainElevation({ lng: -74, lat: 40.7 })

// Custom WebGL layer — rendered every frame alongside the built-in layers:
map.addCustomLayer({
  id: 'my-layer',
  type: 'custom',
  render(gl, projectionMatrix) { /* …your GL draws here… */ },
})
```

### Services — geocoding, directions, isochrones, matrix

```ts
import { services } from 'ts-maps'

const geocoder = services.defaultGeocoder()       // Nominatim, keyless
const hits = await geocoder.search('Tower Bridge, London')

const directions = services.defaultDirections()   // OSRM, keyless
const routes = await directions.getDirections(
  [{ lat: 51.5055, lng: -0.0754 }, { lat: 51.5074, lng: -0.1278 }],
  { profile: 'driving' },
)

const matrix = services.defaultMatrix()           // OSRM /table
const m = await matrix.getMatrix(
  [{ lat: 51.5055, lng: -0.0754 }, { lat: 51.5074, lng: -0.1278 }, { lat: 51.5155, lng: -0.1408 }],
  { profile: 'driving' },
)
```

### Offline tiles

```ts
import { saveOfflineRegion, TileCache } from 'ts-maps'

const cache = new TileCache({ maxBytes: 200 * 1024 * 1024 })
await saveOfflineRegion({
  bounds: [-0.20, 51.50, -0.05, 51.53],
  zoomRange: [10, 14],
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  cache,
})
// Later, when tearing down: await cache.close()
```

### Static image export

```ts
const dataUrl = await map.toDataURL()
const blob = await map.toBlob('image/png')
```

See the [docs folder][docs] for the full concept guides, API reference,
and runnable examples.

[docs]: ../../docs

## Documentation

- [Introduction][introduction]
- [Installation][installation]
- [Usage Guide][usage-guide]
- [API Reference][api-reference]
- [Examples][examples]
- [Playground][playground]

## Development

1. Clone the repository:

```bash
git clone https://github.com/stacksjs/ts-maps.git
cd ts-maps
```

2. Install dependencies:

```bash
bun install
```

3. Start development:

```bash
bun run dev
```

## Changelog

Please see our [releases][releases] page for more information on what has changed recently.

## Contributing

Please see [CONTRIBUTING][contributing] for details.

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub][discussions-on-github]

For casual chit-chat with others using this package:

[Join the Stacks Discord Server][join-the-stacks-discord-server]

## Postcardware

"Software that is free, but hopes for a postcard." We love receiving postcards from around the world showing where `ts-maps` is being used! We showcase them on our website too.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States 🌎

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains][jetbrains]
- [The Solana Foundation][the-solana-foundation]

## Credits

- [Leaflet][leaflet] — the module layout and public API shape of the
  interactive map API follow its design.
- [Mapbox GL JS][mapbox-gl-js] — the style spec, expression engine, and
  vector-tile renderer are modeled after its design.
- [Chris Breuer][chris-breuer]
- [All Contributors][all-contributors]

## License

The MIT License (MIT). Please see [LICENSE][license] for more information.

Made with 💙

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/ts-maps?style=flat-square
[npm-version-href]: https://npmjs.com/package/ts-maps
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/ts-maps/ci.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/stacksjs/ts-maps/actions?query=workflow%3Aci
[commitizen-friendly]: https://img.shields.io/badge/commitizen-friendly-brightgreen.svg
[introduction]: https://ts-maps.dev/intro
[installation]: https://ts-maps.dev/install
[usage-guide]: https://ts-maps.dev/usage
[api-reference]: https://ts-maps.dev/api
[examples]: https://ts-maps.dev/examples
[playground]: https://ts-maps.dev/playground
[releases]: https://github.com/stacksjs/ts-maps/releases
[contributing]: https://github.com/stacksjs/stacks/blob/main/.github/CONTRIBUTING.md
[discussions-on-github]: https://github.com/stacksjs/ts-maps/discussions
[join-the-stacks-discord-server]: https://discord.gg/stacksjs
[jetbrains]: https://www.jetbrains.com/
[the-solana-foundation]: https://solana.com/
[leaflet]: https://leafletjs.com/
[mapbox-gl-js]: https://github.com/mapbox/mapbox-gl-js
[chris-breuer]: https://github.com/chrisbbreuer
[all-contributors]: https://github.com/stacksjs/ts-maps/contributors
[license]: https://github.com/stacksjs/ts-maps/blob/main/LICENSE.md
[commitizen-href]: http://commitizen.github.io/cz-cli/
