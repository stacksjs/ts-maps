# ts-maps

<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of ts-maps"></p>

<p align="center">
  <a href="https://npmjs.com/package/ts-maps"><img src="https://img.shields.io/npm/v/ts-maps?style=flat-square" alt="npm version"></a>
  <a href="https://github.com/stacksjs/ts-maps/actions?query=workflow%3Aci"><img src="https://img.shields.io/github/workflow/status/stacksjs/ts-maps/ci/main?style=flat-square" alt="GitHub Actions"></a>
  <a href="https://npmjs.com/package/ts-maps"><img src="https://img.shields.io/npm/dm/ts-maps?style=flat-square" alt="npm downloads"></a>
  <a href="http://commitizen.github.io/cz-cli/"><img src="https://img.shields.io/badge/commitizen-friendly-brightgreen.svg" alt="Commitizen friendly"></a>
  <a href="https://github.com/stacksjs/ts-maps/blob/main/LICENSE.md"><img src="https://img.shields.io/github/license/stacksjs/ts-maps.svg?style=flat-square" alt="License"></a>
</p>

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

## 🤝 Contributing

Please read our [Contributing Guide](./CONTRIBUTING.md) before submitting a Pull Request to the project.

## 💬 Community

- [GitHub Discussions](https://github.com/stacksjs/ts-maps/discussions)
- [Discord Server](https://discord.gg/stacksjs)
- [Twitter](https://twitter.com/stacksjs)

## 📄 License

[MIT License](./LICENSE.md) © 2024 [Stacks.js](https://github.com/stacksjs)

## 💝 Sponsors

<p align="center">
  <a href="https://jetbrains.com">
    <img src="https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.svg" alt="JetBrains" height="40">
  </a>
  <a href="https://solana.com">
    <img src="https://solana.com/_next/static/media/logotype.e4df684f.svg" alt="Solana" height="40">
  </a>
</p>

## 🙏 Credits

- [Rinvex Countries](https://github.com/rinvex/countries)
