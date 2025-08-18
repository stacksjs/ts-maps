# Vue Components

ts-maps provides official Vue components that make it easy to integrate interactive vector maps into your Vue applications.

## Installation

Install the Vue package:

```bash
npm install ts-maps ts-maps-vue
```

## Usage

```vue
<script setup lang="ts">
import type { MapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps-vue'

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

function handleRegionClick(event: MouseEvent, code: string) {
  console.log(`Clicked: ${code}`)
}
</script>

<template>
  <VectorMap
    :options="mapOptions"
    map-name="world"
    height="500px"
    @region-click="handleRegionClick"
  />
</template>

## Documentation

For detailed Vue components documentation, please refer to the [ts-maps-vue package](https://github.com/ts-maps/ts-maps/tree/main/packages/vue).
