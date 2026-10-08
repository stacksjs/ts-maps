# Installation

ts-maps is one package, `ts-maps`, with no runtime dependencies. It ships ES
modules, TypeScript declarations and a stylesheet the map needs.

## Package managers

::: code-group

```sh [bun]
bun add ts-maps
```

```sh [npm]
npm install ts-maps
```

```sh [pnpm]
pnpm add ts-maps
```

```sh [yarn]
yarn add ts-maps
```

:::

## The stylesheet

The map is built from positioned elements: panes, tiles, markers, popups and
controls. The stylesheet lays them out, so import it once, before the first
map is created:

```ts
import 'ts-maps/styles.css'
```

`ts-maps/css` is the same file under a shorter name. If your build doesn't
take CSS imports, link the file instead. In the installed package it is
`node_modules/ts-maps/src/core-map/ts-maps.css`.

Without it the map's parts are not positioned: tiles, markers and controls
fall into the page one after another instead of stacking inside the
container.

## A first map

Give the map a container with a height:

```html
<div id="map" style="height: 480px"></div>
```

and create the map in it:

```ts
import 'ts-maps/styles.css'
import { Map, styles } from 'ts-maps'

const map = new Map('map', {
  center: [51.5074, -0.1278], // [lat, lng]
  zoom: 12,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})
```

[Getting started](./guide/getting-started.md) goes on from here.

## Subpath imports

Everything the map needs comes from `ts-maps`. The subpaths below are
separate entry points, each its own bundle, for code that wants one part
without the map: a server, a Worker, a build script, or a page that only
geocodes.

| Import | What it is for | For example |
| --- | --- | --- |
| `ts-maps/services` | Geocoding, directions, isochrones and matrices, keyless by default | `defaultGeocoder`, `OSRMDirections` |
| `ts-maps/gazetteer` | A place-search index of your own, built from GeoNames. Bun only (`bun:sqlite`) | `Gazetteer`, `createGazetteerHandler` |
| `ts-maps/style-spec` | Validate, diff and evaluate styles and expressions | `validateStyle`, `diffStyles` |
| `ts-maps/storage` | Tile cache in IndexedDB, and pre-fetching an area into it | `TileCache`, `saveOfflineRegion` |
| `ts-maps/geo` | Coordinates, bounds, projections and distances | `LatLng`, `LatLngBounds` |
| `ts-maps/geometry` | Screen-space points and bounds, and an R-tree | `Point`, `Bounds`, `RTree` |
| `ts-maps/symbols` | Glyphs, sprites and label collision | `GlyphAtlas`, `CollisionIndex` |
| `ts-maps/static` | A map drawn once as SVG, from the same tiles and style | `renderStaticMap`, `staticMapSvg` |
| `ts-maps/pmtiles` | Read and write PMTiles archives | `PMTiles` |
| `ts-maps/server` | A vector tile server for a PMTiles archive. Bun only | `createTileServer` |
| `ts-maps/worker` | The same tile server on Cloudflare Workers, from R2 | `createTileWorker` |
| `ts-maps/offline-sw` | A service worker that keeps an offline-capable app loading | `offlineServiceWorker` |
| `ts-maps/styles.css`, `ts-maps/css` | The map's stylesheet | |

```ts
import { defaultGeocoder } from 'ts-maps/services'
import { validateStyle } from 'ts-maps/style-spec'
import { TileCache, saveOfflineRegion } from 'ts-maps/storage'
import { LatLng, LatLngBounds } from 'ts-maps/geo'
import { Bounds, Point } from 'ts-maps/geometry'
import { renderStaticMap, staticMapSvg } from 'ts-maps/static'
import { PMTiles } from 'ts-maps/pmtiles'
```

Several of these are also exported from `ts-maps` itself: `LatLng`, `Point`,
`TileCache`, `renderStaticMap`, and the services as a `services` namespace
(`services.defaultGeocoder()`). In a page that already shows a map, import
them from there.

The server-side entries are covered in
[Self-hosted tiles](./concepts/tile-server.md), services in
[Services](./concepts/services.md), and offline storage in
[Offline](./concepts/offline.md).

## Framework bindings

Each binding wraps the same `Map`. The web bindings share component names
and props: `Map`, `Marker`, `Popup`, `Source`, `Layer` and the controls. React
Native has one `MapView` that runs the map in a WebView. All are versioned
with `ts-maps` and depend on it.

| Framework | Package | Guide |
| --- | --- | --- |
| React | `@ts-maps/react` | [React](./guide/react.md) |
| Vue | `@ts-maps/vue` | [Vue](./guide/vue.md) |
| Nuxt | `ts-maps-nuxt` | [Nuxt](./guide/nuxt.md) |
| Svelte | `@ts-maps/svelte` | [Svelte](./guide/svelte.md) |
| Solid | `@ts-maps/solid` | [Solid](./guide/solid.md) |
| stx | `@ts-maps/stx` | [stx](./guide/stx.md) |
| React Native | `@ts-maps/react-native` | [React Native](./guide/react-native.md) |

::: code-group

```sh [React]
bun add ts-maps @ts-maps/react
```

```sh [Vue]
bun add ts-maps @ts-maps/vue
```

```sh [Nuxt]
bun add ts-maps-nuxt
```

```sh [Svelte]
bun add ts-maps @ts-maps/svelte
```

```sh [Solid]
bun add ts-maps @ts-maps/solid
```

```sh [stx]
bun add ts-maps @ts-maps/stx
```

```sh [React Native]
bun add ts-maps @ts-maps/react-native react-native-webview
```

:::

The Nuxt module is registered in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['ts-maps-nuxt'],
})
```

React Native needs `react-native-webview` alongside it.
[Framework bindings](./guide/framework-bindings.md) compares them all.

## Without a bundler

`dist/index.js` is a single ES module with no imports of its own, so a page
can load it straight from a CDN:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ts-maps</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ts-maps@0.4/src/core-map/ts-maps.css">
  <style>
    #map { height: 100vh; }
    body { margin: 0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script type="module">
    import { Marker, styles, Map } from 'https://cdn.jsdelivr.net/npm/ts-maps@0.4/dist/index.js'

    const map = new Map('map', {
      center: [48.8584, 2.2945],
      zoom: 15,
      style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
    })

    new Marker([48.8584, 2.2945]).addTo(map).bindPopup('Eiffel Tower').openPopup()
  </script>
</body>
</html>
```

`@0.4` follows the latest 0.4 release. Pin the full version (`ts-maps@0.4.0`)
for a page that should never change under you.

A browser does not know what a bare `'ts-maps'` is. To write
`import ... from 'ts-maps'` in a page anyway, as the docs do, map the name
first:

```html
<script type="importmap">
  {
    "imports": {
      "ts-maps": "https://cdn.jsdelivr.net/npm/ts-maps@0.4/dist/index.js"
    }
  }
</script>
<script type="module">
  import { Map, styles } from 'ts-maps'
</script>
```

## TypeScript

The package ships its declarations, so there is nothing to install for types.
The subpaths are declared through the package's `exports`, which TypeScript
only reads with `"moduleResolution": "bundler"`, `"node16"` or `"nodenext"`.
The map runs in the browser, so include the DOM types:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true
  }
}
```

With `noUncheckedSideEffectImports` on (it is the default from TypeScript
6), `import 'ts-maps/styles.css'` needs a declaration for CSS files. Most
bundlers' client types provide one (`vite/client` does). Otherwise add it to
a `.d.ts` file in your project:

```ts
declare module '*.css'
```

Positions are `[lat, lng]` tuples or `LatLng` objects everywhere in the
`Map` API. GeoJSON, as always, is `[lng, lat]`.

## Requirements

- A current browser with ES modules: Chrome, Edge, Firefox or Safari.
- WebGL2 for the globe, terrain, 3D buildings and custom layers. Without it
  the flat map still draws.
- Bun for `ts-maps/gazetteer` and `ts-maps/server`. `ts-maps/worker` runs on
  Cloudflare Workers.

## Next steps

- [Getting started](./guide/getting-started.md): a walkthrough from an empty
  page to a styled map with markers, camera moves and data of your own.
- [Examples](./examples/index.md): small maps to copy from.
- [API reference](./api/index.md)
