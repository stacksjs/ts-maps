# Installation

Installing `ts-maps` is straightforward. You can install it via your preferred package manager.

## Package Managers

Choose your preferred package manager:

::: code-group

```sh [npm]
# Install the package
npm install ts-maps

# Or install with TypeScript development dependencies
npm install ts-maps typescript @types/node --save-dev
```

```sh [pnpm]
# Install the package
pnpm add ts-maps

# Or install with TypeScript development dependencies
pnpm add ts-maps typescript @types/node -D
```

```sh [yarn]
# Install the package
yarn add ts-maps

# Or install with TypeScript development dependencies
yarn add ts-maps typescript @types/node --dev
```

```sh [bun]
# Install the package
bun add ts-maps

# Or install with TypeScript development dependencies
bun add -d ts-maps typescript @types/node
```

:::

## Subpath imports for tree-shaking

ts-maps exposes several subpath entries so you only pay for what you
use — a caller that just needs the geocoder ships ~8 KB gzipped instead
of the full 138 KB bundle.

```ts
import { defaultGeocoder } from 'ts-maps/services'        // ~8 KB gz
import { validateStyle } from 'ts-maps/style-spec'         // ~15 KB gz
import { TileCache, cachedFetch } from 'ts-maps/storage'   // ~4 KB gz
import { LatLng, LatLngBounds } from 'ts-maps/geo'         // ~8 KB gz
import { Point, Bounds } from 'ts-maps/geometry'           // ~10 KB gz
import { GlyphAtlas } from 'ts-maps/symbols'               // ~4 KB gz
```

Every built-in country map also lives on its own subpath
(`ts-maps/world`, `ts-maps/canada`, `ts-maps/us-merc-en`, …) so bundlers
only include the regions you import.

## Framework Bindings

### Nuxt Components

For Nuxt applications, install the official Nuxt module:

```bash
npm install ts-maps-nuxt
```

Add to your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: [
    'ts-maps-nuxt'
  ]
})
```

Then use the components directly in your Vue templates:

```vue
<template>
  <VectorMap
    :options="mapOptions"
    map-name="world"
    height="500px"
  />
</template>
```

See [Nuxt Components](/components/nuxt) for detailed documentation.

### React Components

For React applications:

```bash
npm install ts-maps ts-maps-react
```

### Vue Components

For Vue applications:

```bash
npm install ts-maps ts-maps-vue
```

## TypeScript Configuration

ts-maps is built with TypeScript and includes type definitions. For the best development experience, configure your `tsconfig.json`:

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

## Quick Start

After installation, you can import and use ts-maps in your project:

```typescript
import { VectorMap } from 'ts-maps'

// Initialize the map
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  backgroundColor: '#4a4a4a',
  zoomOnScroll: true,
})

// Add interactivity
map.params.onRegionClick = (event, code) => {
  console.log(`Clicked region: ${code}`)
}
```

### HTML Setup

Make sure you have a container element in your HTML:

```html
<!DOCTYPE html>
<html>
<head>
  <title>ts-maps Example</title>
</head>
<body>
  <!-- Map container -->
  <div id="map" style="width: 100%; height: 500px;"></div>

  <!-- Your script -->
  <script type="module">
    import { VectorMap } from 'ts-maps'
    // Your map initialization code here
  </script>
</body>
</html>
```

## Requirements

- Modern browser with ES Modules support
- TypeScript 5.0 or higher (for TypeScript users)
- Node.js 18.x or higher (for development)

## Next Steps

- Explore the [Basic Usage Guide](/intro#basic-usage) to learn core concepts
- Check out [Advanced Features](/intro#advanced-features) for more capabilities
- View the [API Reference](/api/) for detailed documentation

## Troubleshooting

If you encounter any issues during installation:

1. Make sure your package manager is up to date
2. Check that your TypeScript version is compatible
3. Verify your `tsconfig.json` settings
4. Clear your package manager's cache and node_modules

For additional help, visit our [GitHub Issues](https://github.com/stacksjs/ts-maps/issues) page.
