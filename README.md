<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of ts-maps"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

<p align="center">
  <a href="https://npmjs.com/package/ts-maps"><img src="https://img.shields.io/npm/v/ts-maps?style=flat-square" alt="npm version"></a>
  <a href="https://github.com/stacksjs/ts-maps/actions?query=workflow%3Aci"><img src="https://img.shields.io/github/workflow/status/stacksjs/ts-maps/ci/main?style=flat-square" alt="GitHub Actions"></a>
  <a href="https://npmjs.com/package/ts-maps"><img src="https://img.shields.io/npm/dm/ts-maps?style=flat-square" alt="npm downloads"></a>
  <a href="http://commitizen.github.io/cz-cli/"><img src="https://img.shields.io/badge/commitizen-friendly-brightgreen.svg" alt="Commitizen friendly"></a>
  <a href="https://github.com/stacksjs/ts-maps/blob/main/LICENSE.md"><img src="https://img.shields.io/github/license/stacksjs/ts-maps.svg?style=flat-square" alt="License"></a>
</p>

# ts-maps

> Modern TypeScript library for creating stunning vector maps

## ✨ Features

- 🗺️ **Vector Maps**
  - High-quality SVG-based interactive maps
  - Multiple projection types (Mercator, Equal Earth)
  - Built-in world maps and custom regions

- 📊 **Data Visualization**
  - Choropleth maps with customizable scales
  - Heat maps and bubble charts
  - Interactive legends and tooltips

- 🎯 **Framework Agnostic**
  - Zero dependencies
  - Works with any framework
  - Official React and Vue bindings

- 🔒 **Type Safety**
  - Full TypeScript support
  - Strict types for better DX
  - Comprehensive type definitions

## 📦 Installation

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
```

## 🚀 Quick Start

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

## 📖 Documentation

- [Introduction](https://ts-maps.dev/intro)
- [Installation](https://ts-maps.dev/install)
- [Usage Guide](https://ts-maps.dev/usage)
- [API Reference](https://ts-maps.dev/api)
- [Examples](https://ts-maps.dev/examples)
- [Playground](https://ts-maps.dev/playground)

## 🧪 Development

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

Please see our [releases](https://github.com/stacksjs/clarity/releases) page for more information on what has changed recently.

## Contributing

Please see [CONTRIBUTING](https://github.com/stacksjs/stacks/blob/main/.github/CONTRIBUTING.md) for details.

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/clarity/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://discord.gg/stacksjs)

## Postcardware

“Software that is free, but hopes for a postcard.” We love receiving postcards from around the world showing where `clarity` is being used! We showcase them on our website too.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States 🌎

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## Credits

- [debug](https://github.com/debug-js/debug)
- [@open-draft/logger](https://github.com/open-draft/logger)
- [Chris Breuer](https://github.com/chrisbbreuer)
- [All Contributors](https://github.com/stacksjs/ts-maps/contributors)

## License

The MIT License (MIT). Please see [LICENSE](https://github.com/stacksjs/clarity/blob/main/LICENSE.md) for more information.

Made with 💙

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@stacksjs/clarity?style=flat-square
[npm-version-href]: https://npmjs.com/package/@stacksjs/clarity
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/clarity/ci.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/stacksjs/clarity/actions?query=workflow%3Aci

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/clarity/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/clarity -->
