# Vue Integration

ts-maps provides a dedicated Vue package with pre-built components for easy integration.

## Installation

::: code-group

```sh [npm]
npm install @ts-maps/vue
```

```sh [pnpm]
pnpm add @ts-maps/vue
```

```sh [bun]
bun add @ts-maps/vue
```

:::

## Plugin Registration

Register the plugin globally in your Vue app:

```typescript
// main.ts
import { createApp } from 'vue'
import TsMapsVue from '@ts-maps/vue'
import App from './App.vue'

const app = createApp(App)
app.use(TsMapsVue)
app.mount('#app')
```

This registers all map components globally:
- `VectorMap` - Base vector map component
- `GoogleMap` - Google Maps integration
- `WorldMap` - World map preset
- `UnitedStates` - US map preset
- `Canada` - Canada map preset
- `Brasil` - Brazil map preset
- `Italy` - Italy map preset
- `Spain` - Spain map preset
- `Russia` - Russia map preset
- `Iraq` - Iraq map preset

## Using Individual Components

Import components directly without the plugin:

```vue
<script setup lang="ts">
import { VectorMap, WorldMap, UnitedStates } from '@ts-maps/vue'
</script>

<template>
  <WorldMap :options="mapOptions" />
</template>
```

## VectorMap Component

The base `VectorMap` component accepts all standard map options:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { MapOptions } from '@ts-maps/vue'

const mapOptions = ref<MapOptions>({
  map: {
    name: 'world',
    projection: 'mercator',
  },
  backgroundColor: '#1e293b',
  draggable: true,
  zoomButtons: true,
  regionStyle: {
    initial: {
      fill: '#334155',
      stroke: '#1e293b',
      strokeWidth: 0.5,
    },
    hover: {
      fill: '#3b82f6',
    },
    selected: {
      fill: '#2563eb',
    },
  },
})

const selectedRegions = ref<string[]>([])

function handleRegionClick(event: MouseEvent, code: string) {
  console.log(`Clicked: ${code}`)
}

function handleRegionSelected(
  event: MouseEvent,
  code: string,
  isSelected: boolean,
  regions: string[]
) {
  selectedRegions.value = regions
}
</script>

<template>
  <VectorMap
    :options="mapOptions"
    @region-click="handleRegionClick"
    @region-selected="handleRegionSelected"
  />
</template>
```

## Pre-built Map Components

Use convenient pre-built map components:

### WorldMap

```vue
<script setup lang="ts">
import { WorldMap } from '@ts-maps/vue'
</script>

<template>
  <WorldMap
    :draggable="true"
    :zoom-buttons="true"
    :region-style="{
      initial: { fill: '#e2e8f0' },
      hover: { fill: '#3b82f6' }
    }"
    @region-click="handleClick"
  />
</template>
```

### UnitedStates

```vue
<script setup lang="ts">
import { UnitedStates } from '@ts-maps/vue'
</script>

<template>
  <UnitedStates
    :selected-regions="['CA', 'TX', 'NY']"
    :regions-selectable="true"
    :region-style="{
      initial: { fill: '#f1f5f9' },
      selected: { fill: '#3b82f6' }
    }"
  />
</template>
```

### Other Region Maps

```vue
<script setup lang="ts">
import { Canada, Brasil, Italy, Spain, Russia, Iraq } from '@ts-maps/vue'
</script>

<template>
  <div class="grid grid-cols-3 gap-4">
    <Canada :draggable="true" />
    <Brasil :draggable="true" />
    <Italy :draggable="true" />
    <Spain :draggable="true" />
    <Russia :draggable="true" />
    <Iraq :draggable="true" />
  </div>
</template>
```

## Adding Markers

```vue
<script setup lang="ts">
import { VectorMap } from '@ts-maps/vue'
import { ref } from 'vue'

const markers = ref([
  { name: 'New York', coords: [40.7128, -74.0060] as [number, number] },
  { name: 'Los Angeles', coords: [34.0522, -118.2437] as [number, number] },
  { name: 'Chicago', coords: [41.8781, -87.6298] as [number, number] },
])

function handleMarkerClick(event: MouseEvent, index: string) {
  console.log(`Clicked marker: ${markers.value[parseInt(index)].name}`)
}
</script>

<template>
  <VectorMap
    :options="{
      map: { name: 'us-aea-en', projection: 'mercator' },
      markers,
      markerStyle: {
        initial: { fill: '#ef4444', r: 6 },
        hover: { fill: '#f97316', r: 8 }
      }
    }"
    @marker-click="handleMarkerClick"
  />
</template>
```

## Data Visualization

```vue
<script setup lang="ts">
import { WorldMap } from '@ts-maps/vue'
import { computed } from 'vue'

const populationData = {
  US: 331,
  CN: 1412,
  IN: 1408,
  ID: 273,
  PK: 220,
  BR: 212,
  NG: 211,
}

const visualizeData = computed(() => ({
  scale: ['#dbeafe', '#1e40af'] as [string, string],
  values: populationData,
}))
</script>

<template>
  <WorldMap
    :visualize-data="visualizeData"
    :show-tooltip="true"
  />
</template>
```

## Reactive Updates

The Vue components are fully reactive:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { WorldMap } from '@ts-maps/vue'

const selectedRegions = ref<string[]>([])

// Watch for changes
watch(selectedRegions, (newRegions) => {
  console.log('Selected regions changed:', newRegions)
})
</script>

<template>
  <div>
    <WorldMap
      v-model:selected-regions="selectedRegions"
      :regions-selectable="true"
    />

    <div>
      Selected: {{ selectedRegions.join(', ') }}
    </div>

    <button @click="selectedRegions = []">
      Clear Selection
    </button>
  </div>
</template>
```

## Accessing the Map Instance

Access the underlying map instance via ref:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { VectorMap } from '@ts-maps/vue'

const mapRef = ref()

onMounted(() => {
  // Access the map instance
  const map = mapRef.value?.map

  // Use map methods
  map?.setFocus({
    region: 'US',
    scale: 3,
    animate: true
  })
})
</script>

<template>
  <VectorMap ref="mapRef" :options="{ /* ... */ }" />
</template>
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type { MapOptions } from '@ts-maps/vue'

const options: MapOptions = {
  map: {
    name: 'world',
    projection: 'mercator',
  },
  regionStyle: {
    initial: { fill: '#e2e8f0' },
  },
}
```

## Events

Available events on all map components:

| Event | Payload | Description |
|-------|---------|-------------|
| `@loaded` | `void` | Map finished loading |
| `@viewport-change` | `(scale, transX, transY)` | Map viewport changed |
| `@region-click` | `(event, code)` | Region clicked |
| `@region-selected` | `(event, code, isSelected, regions)` | Region selection changed |
| `@marker-click` | `(event, index)` | Marker clicked |
| `@marker-selected` | `(event, index, isSelected, markers)` | Marker selection changed |
| `@region-tooltip-show` | `(event, tooltip, code)` | Region tooltip shown |
| `@marker-tooltip-show` | `(event, tooltip, index)` | Marker tooltip shown |

## Styling with CSS

Style the map container:

```vue
<template>
  <VectorMap
    class="my-map"
    :options="mapOptions"
  />
</template>

<style scoped>
.my-map {
  width: 100%;
  height: 500px;
  border-radius: 8px;
  overflow: hidden;
}
</style>
```

## Next Steps

- [React Integration](/guide/react) - Using ts-maps with React
- [Nuxt Module](/guide/nuxt) - Using ts-maps as a Nuxt module
