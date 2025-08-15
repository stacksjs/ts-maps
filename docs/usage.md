# Usage Guide

ts-maps provides a powerful way to create interactive vector maps with data visualization capabilities. This guide covers the basic usage patterns.

## Quick Start

```typescript
import { VectorMap } from 'ts-maps'

const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  backgroundColor: '#4a4a4a',
  zoomOnScroll: true,
  zoomButtons: true,
})
```

## Features

ts-maps comes with a rich set of features for creating interactive maps:

- [Vector Maps](./features/vector-map.md) - Create and customize vector maps with different projections
- [Markers](./features/markers.md) - Add interactive markers to your maps
- [Regions](./features/regions.md) - Add interactive regions to your maps
- [Data Visualization](./features/data-visualization.md) - Visualize data with customizable color scales

## Vue Components

ts-maps provides Vue 3 components for easy integration:

### VectorMap Component

The main component for displaying any supported map:

```vue
<script setup lang="ts">
import { VectorMap } from 'ts-maps-vue'

const options = {
  backgroundColor: '#ffffff',
  zoomOnScroll: true,
  regionsSelectable: true,
}
</script>

<template>
  <VectorMap
    :options="options"
    map-name="world"
    height="500px"
    @region-click="handleRegionClick"
  />
</template>
```

### UnitedStates Component

Specialized component for United States maps with different projections:

```vue
<script setup lang="ts">
import { UnitedStates } from 'ts-maps-vue'

const options = {
  visualizeData: {
    scale: ['#e3f2fd', '#1976d2'],
    values: {
      CA: 100, // California
      TX: 85, // Texas
      NY: 80, // New York
    },
  },
}
</script>

<template>
  <UnitedStates
    :options="options"
    height="600px"
    @region-click="handleStateClick"
  />
</template>
```

### Canada Component

Specialized component for Canadian provinces and territories:

```vue
<script setup lang="ts">
import { Canada } from 'ts-maps-vue'

const options = {
  visualizeData: {
    scale: ['#fff3e0', '#f57c00'],
    values: {
      ON: 100, // Ontario
      QC: 85, // Quebec
      BC: 80, // British Columbia
      AB: 75, // Alberta
    },
  },
}
</script>

<template>
  <Canada
    :options="options"
    height="600px"
    @region-click="handleProvinceClick"
  />
</template>
```

## Configuration Options

```typescript
interface MapOptions {
  selector: string
  map: {
    name: string
    projection: 'mercator' | 'miller'
  }
  backgroundColor?: string
  draggable?: boolean
  zoomButtons?: boolean
  zoomOnScroll?: boolean
  zoomOnScrollSpeed?: number
  zoomMax?: number
  zoomMin?: number
  zoomAnimate?: boolean
  showTooltip?: boolean
  zoomStep?: number
  bindTouchEvents?: boolean
  regionsSelectable?: boolean
  regionsSelectableOne?: boolean
  markersSelectable?: boolean
  markersSelectableOne?: boolean
  regionStyle?: RegionStyle
  markerStyle?: MarkerStyle
  visualizeData?: DataVisualizationOptions
}
```

For detailed documentation on each feature, please refer to the feature-specific guides linked above.
