<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of ts-maps"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly][commitizen-friendly]][commitizen-href]

# ts-maps

> Modern TypeScript library for creating stunning vector maps

## Features

- 🗺️ **Interactive slippy maps** — `TsMap`, a modern TypeScript port of

  Leaflet with fractional zoom, bearing (rotation), pitch (tilt), and
  unified `flyTo` / `easeTo` / `jumpTo` camera animations.

- 🧱 **Vector tiles + style spec** — in-house MVT (`.pbf`) decoder, full

  subset of the Mapbox GL Style Specification, and an expression engine
  that understands `interpolate` / `step` / `case` / `match` / `coalesce`
  and friends. `setStyle`, `addSource`, `addStyleLayer`, `setPaintProperty`,
  `setFilter` — the works.

- 🏔️ **3D** — `fill-extrusion`, atmospheric `setFog`, a sky layer via

  `setSky`, and DEM-based terrain via `setTerrain` (auto-loads tiles from
  a `raster-dem` source). A `CustomLayerInterface` lets apps render raw
  WebGL2 alongside the built-in layers.

- 🧭 **Services** — geocoding (Nominatim, Photon, Mapbox, Maptiler,

  Google), directions (OSRM, Valhalla, Mapbox, Google), isochrones, and
  matrix adapters behind a common interface. Defaults are keyless.

- 📴 **Offline** — IndexedDB-backed `TileCache`, `saveOfflineRegion` for

  pre-fetching bboxes, and a worker pool for off-main-thread tile decode.

- 🗺️ **Legacy `VectorMap`** — choropleth + bubble + heatmap API for the

  classic "static country map with data overlay" use case.

- 🎯 **Zero runtime dependencies, 138 KB gzipped.** Subpath exports

  (`ts-maps/services`, `ts-maps/style-spec`, …) let you import just the
  slice you need.

- 🧩 **Framework bindings** — `@ts-maps/react`, `@ts-maps/vue`,

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

### Framework Bindings

```bash
# React
npm install ts-maps ts-maps-react

# Vue
npm install ts-maps ts-maps-vue

# Nuxt
npm install ts-maps-nuxt
```

## Quick Start — modern `TsMap`

The modern API is an interactive slippy map with fractional zoom, bearing,
pitch, and layer-based rendering.

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

### Services — geocoding, directions

```ts
import { services } from 'ts-maps'

const geocoder = services.defaultGeocoder() // Nominatim, keyless
const hits = await geocoder.search('Tower Bridge, London')

const directions = services.defaultDirections() // OSRM, keyless
const routes = await directions.getDirections(
  [{ lat: 51.5055, lng: -0.0754 }, { lat: 51.5074, lng: -0.1278 }],
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

### Tree-shaking with subpath imports

Only need the services layer? Import from the subpath — about 8 KB
gzipped instead of pulling the full 138 KB bundle:

```ts
import { defaultGeocoder } from 'ts-maps/services'
import { validateStyle } from 'ts-maps/style-spec'
import { TileCache } from 'ts-maps/storage'
import { LatLng, LatLngBounds } from 'ts-maps/geo'
```

Available subpaths: `services`, `style-spec`, `storage`, `geo`,
`geometry`, `symbols`, `analytics`, plus each built-in country map
(`ts-maps/world`, `ts-maps/canada`, …).

## Legacy `VectorMap` (static choropleth maps)

```typescript
import type { VectorMapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps'

// Create a map instance
const map = new VectorMap({
  container: 'map',
  map: 'world',
  theme: 'light',
  style: {
    regions: {
      fill: '#e4e4e4',
      stroke: '#ffffff',
      strokeWidth: 1,
    },
    hover: {
      fill: '#2ca25f',
    },
  },
})

// Add interactivity
map.on('regionClick', (event, region) => {
  console.log(`Clicked: ${region.id}`)
})
```

### Data Visualization

```typescript
import type { DataVisualizationOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps'

const map = new VectorMap({
  container: 'map',
  map: 'world',
})

// Add data visualization
const options: DataVisualizationOptions = {
  scale: ['#e5f5f9', '#2ca25f'], // Color gradient from light blue to green
  values: {
    US: 100,
    CA: 80,
    GB: 65,
  },
}

map.visualizeData(options)
```

### React Component

```tsx
import type { VectorMapProps } from 'ts-maps-react'
import { useVectorMap } from 'ts-maps-react'

function WorldMap() {
  const { map, isLoading } = useVectorMap({
    map: 'world',
    theme: 'light',
  })

  return (
    <div className="map-container">
      {isLoading
        ? (
            <div>Loading...</div>
          )
        : (
            <div id="map" />
          )}
    </div>
  )
}
```

### Vue Component

```vue
<script setup lang="ts">
import type { VectorMapOptions } from 'ts-maps'
import { useVectorMap } from 'ts-maps-vue'

const { map, isLoading } = useVectorMap({
  map: 'world',
  theme: 'light',
})
</script>

<template>
  <div class="map-container">
    <div v-if="isLoading">
      Loading...
    </div>
    <div v-else id="map" />
  </div>
</template>
```

### Nuxt Component

For Nuxt applications, first add the module to your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: [
    'ts-maps-nuxt'
  ]
})
```

Then use the components directly in your Vue templates:

```vue
<script setup lang="ts">
import type { MapOptions } from 'ts-maps'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f0f0f0',
  zoomOnScroll: true,
  style: {
    regions: {
      fill: '#e4e4e4',
      stroke: '#ffffff',
      strokeWidth: 1,
    },
  },
}
</script>

<template>
  <VectorMap
    :options="mapOptions"
    map-name="world"
    height="500px"
  />
</template>
```

Available components include:

- `VectorMap` - Generic map component
- `WorldMap` - World map
- `UnitedStates` - United States map
- `Canada` - Canada map
- `Brasil` - Brazil map
- `Spain` - Spain map
- `Italy` - Italy map
- `Russia` - Russia map
- `Iraq` - Iraq map

See [Nuxt Components Documentation][nuxt-components-documentation] for detailed usage.

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
pnpm install
```

3. Start development:

```bash
pnpm dev
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

“Software that is free, but hopes for a postcard.” We love receiving postcards from around the world showing where `ts-maps` is being used! We showcase them on our website too.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States 🌎

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains][jetbrains]
- [The Solana Foundation][the-solana-foundation]

## Credits

- [jsvectormap][jsvectormap]
- [Chris Breuer][chris-breuer]
- [All Contributors][all-contributors]

## License

The MIT License (MIT). Please see [LICENSE][license] for more information.

Made with 💙

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@stacksjs/clarity?style=flat-square
[npm-version-href]: https://npmjs.com/package/@stacksjs/clarity
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/clarity/ci.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/stacksjs/clarity/actions?query=workflow%3Aci

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/clarity/main?style=flat-square -->
[commitizen-friendly]: https://img.shields.io/badge/commitizen-friendly-brightgreen.svg
[nuxt-components-documentation]: https://ts-maps.com/components/nuxt
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
[jsvectormap]: https://github.com/themustafaomar/jsvectormap
[chris-breuer]: https://github.com/chrisbbreuer
[all-contributors]: https://github.com/stacksjs/ts-maps/contributors
[license]: https://github.com/stacksjs/clarity/blob/main/LICENSE.md
[commitizen-href]: http://commitizen.github.io/cz-cli/
