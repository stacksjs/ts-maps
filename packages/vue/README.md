<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of ts-maps"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

# ts-maps-vue

> Vue components for ts-maps - Interactive Vector Maps

## ✨ Features

- 🗺️ **Vector Maps**
  - High-quality SVG-based interactive maps
  - Multiple projection types (Mercator, Miller, Lambert, Albers)
  - Built-in world maps and custom regions

- 📊 **Data Visualization**
  - Choropleth maps with customizable scales
  - Heat maps and bubble charts
  - Interactive legends and tooltips

- 🎯 **Vue Integration**
  - Native Vue 3 Composition API support
  - TypeScript support
  - Event handling and reactive props

## 📦 Installation

```bash
# Using npm
npm install ts-maps ts-maps-vue

# Using pnpm
pnpm add ts-maps ts-maps-vue

# Using yarn
yarn add ts-maps ts-maps-vue

# Using bun
bun add ts-maps ts-maps-vue
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

## 🚀 Quick Start

```vue
<script setup lang="ts">
import type { MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps-vue'

const options: Omit<MapOptions, 'selector'> = {
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
}
</script>

<template>
  <VectorMap
    :options="options"
    map-name="world"
    height="500px"
    @region-click="handleRegionClick"
    @marker-click="handleMarkerClick"
    @loaded="handleLoaded"
  >
    <template #loading>
      <div>Loading your beautiful map...</div>
    </template>
  </VectorMap>
</template>
```

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

The VectorMap component emits the following events:

- **`regionClick`** - Fired when a region is clicked
- **`regionSelected`** - Fired when a region is selected/deselected
- **`markerClick`** - Fired when a marker is clicked
- **`viewportChange`** - Fired when the map viewport changes
- **`loaded`** - Fired when the map is fully loaded
- **`update:options`** - Fired when options are updated

## 📊 Data Visualization

```vue
<script setup lang="ts">
const options = reactive({
  // ... other options
  visualizeData: {
    scale: ['#C8EEFF', '#0071A4'],
    values: {
      US: 100,
      GB: 75,
      FR: 80,
      DE: 85,
      IT: 60,
      ES: 65,
    },
  },
})
</script>
```

## 🎨 Customization

### Styling Regions

```typescript
const options = {
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
}
```

### Adding Markers

```typescript
const options = {
  markers: [
    {
      name: 'Sample Marker',
      coords: [40.7128, -74.0060], // [latitude, longitude]
      style: {
        fill: '#ff0000',
        stroke: '#ffffff',
        r: 5,
      },
    },
  ],
}
```

## 🔧 Advanced Usage

### Dynamic Map Switching

```vue
<script setup lang="ts">
import { ref } from 'vue'

const currentMap = ref<'world' | 'us-merc'>('world')

function switchToUSMap() {
  currentMap.value = 'us-merc'
}
</script>

<template>
  <div>
    <button @click="switchToUSMap">
      Switch to US Map
    </button>
    <VectorMap
      :options="options"
      :map-name="currentMap"
      height="500px"
    />
  </div>
</template>
```

### Reactive Options

```vue
<script setup lang="ts">
import { reactive, watch } from 'vue'

const options = reactive({
  backgroundColor: '#ffffff',
  // ... other options
})

// Watch for changes and update the map
watch(() => options.backgroundColor, (newColor) => {
  console.log('Background color changed to:', newColor)
})
</script>
```

## 🧪 Development

1. Clone the repository:

```bash
git clone https://github.com/stacksjs/ts-maps.git
cd ts-maps
```

2. Install dependencies:

```bash
bun install
```

3. Build the Vue package:

```bash
cd packages/vue
bun run build
```

## 📚 Examples

Check out the [playground examples](../../playground/vue-samples/) for more usage examples and interactive demos.

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
