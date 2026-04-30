<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of ts-maps"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly][commitizen-friendly]][commitizen-href]

# ts-maps

> A zero-dependency, TypeScript-native, interactive mapping library — Mapbox-class features with a Leaflet-style API.

## Features

- 🗺️ **Interactive slippy maps** — `TsMap` gives you fractional zoom, bearing

  (rotation), pitch (tilt), and unified `flyTo` / `easeTo` / `jumpTo` camera
  animations.

- 🧱 **Vector tiles + style spec** — in-house MVT (`.pbf`) decoder, full

  subset of the Mapbox GL Style Specification, and an expression engine
  that understands `interpolate` / `step` / `case` / `match` / `coalesce`
  and friends. `setStyle`, `addSource`, `addLayer`, `setPaintProperty`,
  `setFilter`, `queryRenderedFeatures`, `querySourceFeatures` — the works.

- 🏔️ **3D** — `fill-extrusion`, atmospheric `setFog`, a sky layer via

  `setSky`, and DEM-based terrain via `setTerrain` (auto-loads tiles from
  a `raster-dem` source). A `CustomLayerInterface` lets apps render raw
  WebGL2 alongside the built-in layers.

- 🌍 **Globe** — seamless transition between Mercator and globe projection

  around zoom 5.5, with an atmosphere halo.

- 🧭 **Services** — geocoding (Nominatim, Photon, Mapbox, Maptiler,

  Google), directions (OSRM, Valhalla, Mapbox, Google), isochrones,
  and distance matrix adapters behind a common interface. Defaults are
  keyless.

- 📴 **Offline** — IndexedDB-backed `TileCache`, `saveOfflineRegion` for

  pre-fetching bboxes, and a worker pool for off-main-thread tile decode.

- 🧩 **Layer-scoped events** — `map.on('click', 'layer-id', handler)`,

  Mapbox-style: handler only fires when a feature on the named style
  layer is hit.

- 🎯 **Zero runtime dependencies.** Subpath exports (`ts-maps/services`,

  `ts-maps/style-spec`, …) let you import just the slice you need.

- 🧩 **Framework bindings** — `@ts-maps/react`, `@ts-maps/vue`,

  `@ts-maps/svelte`, `@ts-maps/solid`, `@ts-maps/nuxt`,
  `@ts-maps/react-native` (WebView-hosted).

- 🔒 **TypeScript-native** — full `isolatedDeclarations` compliance,

  strict types, and declaration files for every public module.

## Installation

```bash
# Using npm
npm install ts-maps

# Using pnpm
pnpm add ts-maps

# Using yarn
yarn add ts-maps

# Using bun
bun add ts-maps
```

### Framework bindings

```bash
npm install ts-maps ts-maps-react    # React
npm install ts-maps ts-maps-vue      # Vue
npm install ts-maps ts-maps-svelte   # Svelte
npm install ts-maps ts-maps-solid    # SolidJS
npm install ts-maps-nuxt             # Nuxt module
```

## Quick start

```typescript
import 'ts-maps/styles.css'
import { Marker, tileLayer, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 13,
  bearing: 0,
  pitch: 0,
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
import { TsMap, vectorTileLayer } from 'ts-maps'

const map = new TsMap('map', { center: [51.5, -0.12], zoom: 6 })

vectorTileLayer({
  url: 'https://tiles.example.com/{z}/{x}/{y}.pbf',
  layers: [
    { id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0ea5e9' } },
    // Full style-spec expressions are accepted in `filter` and paint/layout:
    { id: 'primary-roads', type: 'line', sourceLayer: 'transportation',
      filter: ['match', ['get', 'class'], ['primary', 'trunk'], true, false],
      paint: { 'line-color': '#6b7280', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 3] } },
  ],
}).addTo(map)

// Layer-scoped events (Mapbox-style):
map.on('click', 'primary-roads', (e) => {
  console.log('road clicked', e.features[0].properties)
})
```

### 3D — terrain, sky, fog, fill-extrusion

```ts
map.setPitch(50)
map.setBearing(30)

map.addSource('terrain-dem', {
  type: 'raster-dem',
  tiles: ['https://tiles.example.com/terrain-rgb/{z}/{x}/{y}.png'],
  tileSize: 512,
  encoding: 'mapbox',
})
map.setTerrain({ source: 'terrain-dem', exaggeration: 1.4 })
map.setSky({ 'sky-color': '#87ceeb', 'horizon-color': '#ffffff' })
map.setFog({ color: 'rgb(245, 247, 250)', 'horizon-blend': 0.1 })

// Query ground elevation anywhere:
const m = map.queryTerrainElevation({ lng: -74, lat: 40.7 })
```

### Services — geocoding, directions, matrix

```ts
import { services } from 'ts-maps'

const geocoder = services.defaultGeocoder() // Nominatim, keyless
const hits = await geocoder.search('Tower Bridge, London')

const directions = services.defaultDirections() // OSRM, keyless
const routes = await directions.getDirections(
  [{ lat: 51.5055, lng: -0.0754 }, { lat: 51.5074, lng: -0.1278 }],
  { profile: 'driving' },
)

const matrix = services.defaultMatrix() // OSRM /table endpoint
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
// Later: await cache.close() when the map is torn down.
```

### Static image export

```ts
const dataUrl = await map.toDataURL()      // PNG data URL of the current view
const blob = await map.toBlob('image/png') // or a Blob
```

### Tree-shaking with subpath imports

Only need the services layer? Import from the subpath — a small slice
instead of the full bundle:

```ts
import { defaultGeocoder } from 'ts-maps/services'
import { validateStyle } from 'ts-maps/style-spec'
import { TileCache } from 'ts-maps/storage'
import { LatLng, LatLngBounds } from 'ts-maps/geo'
```

Available subpaths: `services`, `style-spec`, `storage`, `geo`,
`geometry`, `symbols`.

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
