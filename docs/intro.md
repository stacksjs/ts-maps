<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of this repo"></p>

# Introduction to ts-maps

> A zero-dependency, TypeScript-native, interactive mapping library — Mapbox-class features with a Leaflet-style API.

## Key features

- **Interactive slippy maps** — fractional zoom, bearing (rotation), pitch (tilt), unified `flyTo` / `easeTo` / `jumpTo` camera animations.
- **Vector tiles + style spec** — in-house MVT decoder, a subset of the Mapbox GL Style Specification, and an expression engine (`interpolate` / `step` / `case` / `match` / `coalesce` / `feature-state`).
- **3D** — `fill-extrusion`, `setFog`, `setSky`, and DEM-based `setTerrain` with auto-loaded tiles from a `raster-dem` source. `addCustomLayer()` for raw WebGL2.
- **Globe** — seamless transition between Mercator and a spherical projection around zoom 5.5, with an atmosphere halo.
- **Services** — geocoding, directions, isochrones, and a distance matrix behind a common interface. Keyless defaults (Nominatim, OSRM, Valhalla), opt-in commercial providers (Mapbox, Google, Maptiler, Photon).
- **Offline** — IndexedDB-backed `TileCache`, `saveOfflineRegion` pre-fetcher, worker pool for off-main-thread tile decode.
- **Layer-scoped events** — `map.on('click', 'layer-id', handler)`.
- **Zero runtime dependencies.** Subpath exports let you import just the slice you need.
- **Framework bindings** — React, Vue, Svelte, Solid, Nuxt, React Native.

## Basic usage

```ts
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

## Next steps

- [Installation](/install) — package-manager snippets and framework bindings.
- [Getting started](/getting-started) — a guided walkthrough from a blank page to a styled vector map.
- [Concepts](/concepts/map) — camera, style spec, 3D, terrain, offline, services.
- [API reference](/api/TsMap) — every public class and function.
- [Examples](/examples/) — runnable demos for each major feature.

## Community

- [GitHub Discussions](https://github.com/stacksjs/ts-maps/discussions)
- [Discord](https://discord.gg/stacksjs)

## License

ts-maps is released under the MIT License. See [LICENSE](https://github.com/stacksjs/ts-maps/blob/main/LICENSE.md).

Made with 💙
