# Installation

Install `ts-maps` with your preferred package manager.

## Package managers

::: code-group

```sh [npm]
npm install ts-maps
```

```sh [pnpm]
pnpm add ts-maps
```

```sh [yarn]
yarn add ts-maps
```

```sh [bun]
bun add ts-maps
```

:::

## Subpath imports for tree-shaking

`ts-maps` exposes several subpath entries so you only pay for what you
use:

```ts
import { defaultGeocoder } from 'ts-maps/services'
import { validateStyle } from 'ts-maps/style-spec'
import { TileCache, cachedFetch } from 'ts-maps/storage'
import { LatLng, LatLngBounds } from 'ts-maps/geo'
import { Bounds, Point } from 'ts-maps/geometry'
import { GlyphAtlas } from 'ts-maps/symbols'
```

Available subpaths: `services`, `style-spec`, `storage`, `geo`,
`geometry`, `symbols`.

## Framework bindings

### React

```sh
npm install ts-maps @ts-maps/react
```

### Vue

```sh
npm install ts-maps @ts-maps/vue
```

### Svelte

```sh
npm install ts-maps @ts-maps/svelte
```

### Solid

```sh
npm install ts-maps @ts-maps/solid
```

### Nuxt

```sh
npm install ts-maps-nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['ts-maps-nuxt'],
})
```

### React Native

```sh
npm install ts-maps @ts-maps/react-native
```

A `<MapView>` component hosted inside a WebView, bridged to the full
`TsMap` API.

## TypeScript configuration

`ts-maps` is built with TypeScript and ships declarations. For the best
experience:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## HTML setup

```html
<!DOCTYPE html>
<html>
<head>
  <title>ts-maps</title>
  <link rel="stylesheet" href="https://unpkg.com/ts-maps/dist/ts-maps.css" />
  <style>#map { width: 100%; height: 500px; }</style>
</head>
<body>
  <div id="map"></div>
  <script type="module">
    import { TsMap, tileLayer } from 'ts-maps'

    const map = new TsMap('map', { center: [40.758, -73.9855], zoom: 13 })
    tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
  </script>
</body>
</html>
```

## Requirements

- Modern browser with ES Modules support
- TypeScript 5.0 or higher (for TypeScript users)
- Node.js 18.x or higher (for development)

## Next steps

- [Getting started](/getting-started) — a walkthrough from a blank page.
- [API reference](/api/TsMap)
