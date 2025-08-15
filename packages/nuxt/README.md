<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of ts-maps"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

# ts-maps-nuxt

> Nuxt module for ts-maps - Interactive Vector Maps

## ✨ Features

- 🗺️ **Vector Maps**
  - High-quality SVG-based interactive maps
  - Multiple projection types (Mercator, Miller, Lambert, Albers)
  - Built-in world maps and custom regions

- 📊 **Data Visualization**
  - Choropleth maps with customizable scales
  - Heat maps and bubble charts
  - Interactive legends and tooltips

- 🎯 **Nuxt Integration**
  - Native Nuxt 3 module support
  - Auto-imported components
  - Global component registration
  - Runtime configuration

## 📦 Installation

```bash
# Using npm
npm install ts-maps-nuxt

# Using pnpm
pnpm add ts-maps-nuxt

# Using yarn
yarn add ts-maps-nuxt

# Using bun
bun add ts-maps-nuxt
```

## 🚀 Quick Start

### 1. Add to Nuxt Config

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    'ts-maps-nuxt'
  ],
  tsMaps: {
    defaultOptions: {
      backgroundColor: '#ffffff',
      zoomOnScroll: true,
      zoomButtons: true,
      regionsSelectable: true,
      markersSelectable: true,
    }
  }
})
```

### 2. Use Components in Templates

```vue
<script setup lang="ts">
import type { MapOptions } from 'ts-maps'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f8fafc',
  zoomOnScroll: true,
  regionsSelectable: true,
  visualizeData: {
    scale: ['#fee5d9', '#a50f15'],
    values: {
      US: 100,
      CN: 85,
      RU: 70,
      BR: 60,
    },
  },
}

const usOptions = {
  visualizeData: {
    scale: ['#e3f2fd', '#1976d2'],
    values: {
      CA: 100, // California
      TX: 85, // Texas
      NY: 80, // New York
    },
  },
}

const canadaOptions = {
  visualizeData: {
    scale: ['#fff3e0', '#f57c00'],
    values: {
      ON: 100, // Ontario
      QC: 85, // Quebec
      BC: 80, // British Columbia
    },
  },
}
</script>

<template>
  <div>
    <!-- World Map -->
    <VectorMap
      :options="mapOptions"
      map-name="world"
      height="500px"
      @region-click="handleRegionClick"
    />

    <!-- United States Map -->
    <UnitedStates
      :options="usOptions"
      height="600px"
      @region-click="handleStateClick"
    />

    <!-- Canada Map -->
    <Canada
      :options="canadaOptions"
      height="600px"
      @region-click="handleProvinceClick"
    />
  </div>
</template>
```

## 🗺️ Available Maps

### World Maps

- **`world`** - World map with Miller projection
- **`world-merc`** - World map with Mercator projection

### United States Maps

- **`us-merc`** - United States with Mercator projection
- **`us-mill`** - United States with Miller projection
- **`us-lcc`** - United States with Lambert Conformal Conic projection
- **`us-aea`** - United States with Albers Equal Area projection

### Country Maps

- **`spain`** - Spain with Mercator projection
- **`italy`** - Italy with Mercator projection
- **`canada`** - Canada with Mercator projection

## 📖 Component Props

### VectorMap Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `options` | `MapOptions` | ✅ | - | Map configuration options |
| `mapName` | `MapName` | ✅ | - | Name of the map to display |
| `width` | `string` | ❌ | `'100%'` | Map container width |
| `height` | `string` | ❌ | `'400px'` | Map container height |

### MapName Type

```typescript
type MapName =
  | 'world'
  | 'world-merc'
  | 'us-merc'
  | 'us-mill'
  | 'us-lcc'
  | 'us-aea'
  | 'spain'
  | 'italy'
  | 'canada'
```

## 🎯 Events

All components emit the following events:

- **`regionClick`** - Fired when a region is clicked
- **`regionSelected`** - Fired when a region is selected/deselected
- **`markerClick`** - Fired when a marker is clicked
- **`viewportChange`** - Fired when the map viewport changes
- **`loaded`** - Fired when the map is fully loaded

## ⚙️ Configuration

### Module Options

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['ts-maps-nuxt'],
  tsMaps: {
    defaultOptions: {
      backgroundColor: '#ffffff',
      zoomOnScroll: true,
      zoomButtons: true,
      regionsSelectable: true,
      markersSelectable: true,
      regionStyle: {
        initial: {
          fill: '#e4e4e4',
          stroke: '#ffffff',
          strokeWidth: 0.5,
        },
        hover: {
          fill: '#2ca25f',
        },
        selected: {
          fill: '#1a9850',
        },
      },
    },
  },
})
```

### Runtime Configuration

Access configuration in your components:

```vue
<script setup lang="ts">
const { $config } = useNuxtApp()
const defaultOptions = $config.public.tsMaps.defaultOptions
</script>
```

## 🔧 Development

1. Clone the repository:

```bash
git clone https://github.com/stacksjs/ts-maps.git
cd ts-maps
```

2. Install dependencies:

```bash
bun install
```

3. Build the Nuxt package:

```bash
cd packages/nuxt
bun run build
```

## 📚 Examples

Check out the [playground examples](../../playground/) for more usage examples and interactive demos.

## 🤝 Contributing

Please see [CONTRIBUTING](https://github.com/stacksjs/stacks/blob/main/.github/CONTRIBUTING.md) for details.

## 📄 License

The MIT License (MIT). Please see [LICENSE](../../LICENSE.md) for more information.

Made with 💙 by [Stacks.js](https://stacksjs.org)

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@stacksjs/clarity?style=flat-square
[npm-version-href]: https://npmjs.com/package/@stacksjs/clarity
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/clarity/ci.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/stacksjs/clarity/actions?query=workflow%3Aci

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/clarity/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/clarity -->
