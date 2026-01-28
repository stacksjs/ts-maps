# Nuxt Module

ts-maps provides a dedicated Nuxt module for seamless integration with Nuxt 3 applications.

## Installation

::: code-group

```sh [npm]
npm install @ts-maps/nuxt
```

```sh [pnpm]
pnpm add @ts-maps/nuxt
```

```sh [bun]
bun add @ts-maps/nuxt
```

:::

## Configuration

Add the module to your `nuxt.config.ts`:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@ts-maps/nuxt'],

  // Optional: Configure the module
  tsMapsNuxt: {
    prefix: 'TsMaps', // Component prefix (default: 'TsMaps')
  },
})
```

## Auto-Imported Components

Once configured, the following components are auto-imported:

- `<TsMapsVectorMap>` - Base vector map
- `<TsMapsWorldMap>` - World map
- `<TsMapsUnitedStates>` - US map
- `<TsMapsCanada>` - Canada map
- `<TsMapsBrasil>` - Brazil map
- `<TsMapsItaly>` - Italy map
- `<TsMapsSpain>` - Spain map
- `<TsMapsRussia>` - Russia map
- `<TsMapsIraq>` - Iraq map

## Basic Usage

### World Map

```vue
<script setup lang="ts">
function handleRegionClick(event: MouseEvent, code: string) {
  console.log(`Clicked: ${code}`)
}
</script>

<template>
  <TsMapsWorldMap
    :draggable="true"
    :zoom-buttons="true"
    :region-style="{
      initial: { fill: '#e2e8f0' },
      hover: { fill: '#3b82f6' }
    }"
    @region-click="handleRegionClick"
  />
</template>
```

### Vector Map with Custom Configuration

```vue
<script setup lang="ts">
const mapOptions = {
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
  },
}
</script>

<template>
  <TsMapsVectorMap :options="mapOptions" />
</template>
```

## Country Maps

```vue
<template>
  <div class="grid grid-cols-2 gap-4">
    <TsMapsUnitedStates
      :regions-selectable="true"
      :region-style="{
        initial: { fill: '#f1f5f9' },
        selected: { fill: '#3b82f6' }
      }"
    />

    <TsMapsCanada
      :draggable="true"
      :region-style="{
        initial: { fill: '#f0fdf4' },
        hover: { fill: '#22c55e' }
      }"
    />

    <TsMapsBrasil
      :draggable="true"
      :region-style="{
        initial: { fill: '#fef3c7' },
        hover: { fill: '#f59e0b' }
      }"
    />

    <TsMapsItaly
      :draggable="true"
      :region-style="{
        initial: { fill: '#fee2e2' },
        hover: { fill: '#ef4444' }
      }"
    />
  </div>
</template>
```

## Adding Markers

```vue
<script setup lang="ts">
const markers = ref([
  { name: 'New York', coords: [40.7128, -74.0060] as [number, number] },
  { name: 'Los Angeles', coords: [34.0522, -118.2437] as [number, number] },
  { name: 'Chicago', coords: [41.8781, -87.6298] as [number, number] },
])

function handleMarkerClick(event: MouseEvent, index: string) {
  console.log(`Clicked: ${markers.value[parseInt(index)].name}`)
}
</script>

<template>
  <TsMapsUnitedStates
    :markers="markers"
    :marker-style="{
      initial: { fill: '#ef4444', r: 6 },
      hover: { fill: '#f97316', r: 8 }
    }"
    @marker-click="handleMarkerClick"
  />
</template>
```

## Data Visualization

```vue
<script setup lang="ts">
const gdpData = computed(() => ({
  scale: ['#dbeafe', '#1e40af'] as [string, string],
  values: {
    US: 25.5,
    CN: 18.3,
    JP: 4.2,
    DE: 4.1,
    IN: 3.5,
    GB: 3.1,
    FR: 2.8,
    BR: 1.9,
    IT: 2.0,
    CA: 2.1,
  },
}))
</script>

<template>
  <TsMapsWorldMap
    :visualize-data="gdpData"
    :show-tooltip="true"
  />
</template>
```

## Server-Side Rendering

The Nuxt module handles SSR automatically. Maps are rendered on the client side only:

```vue
<template>
  <ClientOnly>
    <TsMapsWorldMap :draggable="true" />
    <template #fallback>
      <div class="h-[400px] bg-gray-100 animate-pulse rounded-lg" />
    </template>
  </ClientOnly>
</template>
```

## Using with Composables

Create reusable composables for map functionality:

```typescript
// composables/useMapSelection.ts
export function useMapSelection() {
  const selectedRegions = useState<string[]>('mapSelectedRegions', () => [])

  function selectRegion(code: string) {
    if (!selectedRegions.value.includes(code)) {
      selectedRegions.value.push(code)
    }
  }

  function deselectRegion(code: string) {
    selectedRegions.value = selectedRegions.value.filter(r => r !== code)
  }

  function clearSelection() {
    selectedRegions.value = []
  }

  return {
    selectedRegions,
    selectRegion,
    deselectRegion,
    clearSelection,
  }
}
```

Use in components:

```vue
<script setup lang="ts">
const { selectedRegions, clearSelection } = useMapSelection()
</script>

<template>
  <div>
    <TsMapsWorldMap
      :selected-regions="selectedRegions"
      :regions-selectable="true"
      @region-selected="(e, code, selected, regions) => selectedRegions = regions"
    />

    <button @click="clearSelection">Clear Selection</button>
  </div>
</template>
```

## Custom Component Prefix

Change the component prefix in your config:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@ts-maps/nuxt'],

  tsMapsNuxt: {
    prefix: 'Map', // Components become <MapWorldMap>, <MapVectorMap>, etc.
  },
})
```

## TypeScript Support

The module provides full TypeScript support:

```typescript
// types/maps.d.ts
import type { MapOptions } from '@ts-maps/nuxt'

declare module '@ts-maps/nuxt' {
  interface ModuleOptions {
    prefix?: string
  }
}
```

## Module Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prefix` | `string` | `'TsMaps'` | Component name prefix |

## Events

All map components support the following events:

| Event | Payload | Description |
|-------|---------|-------------|
| `@loaded` | - | Map finished loading |
| `@viewport-change` | `(scale, transX, transY)` | Viewport changed |
| `@region-click` | `(event, code)` | Region clicked |
| `@region-selected` | `(event, code, isSelected, regions)` | Selection changed |
| `@marker-click` | `(event, index)` | Marker clicked |
| `@marker-selected` | `(event, index, isSelected, markers)` | Selection changed |

## Styling

Style maps using Tailwind CSS or custom styles:

```vue
<template>
  <div class="relative w-full aspect-video rounded-xl overflow-hidden shadow-2xl">
    <TsMapsWorldMap
      class="w-full h-full"
      :draggable="true"
      :zoom-buttons="true"
      :background-color="'#0f172a'"
      :region-style="{
        initial: {
          fill: '#1e293b',
          stroke: '#334155',
          strokeWidth: 0.5,
        },
        hover: {
          fill: '#3b82f6',
        },
      }"
    />
  </div>
</template>
```

## Next Steps

- [Getting Started](/guide/getting-started) - Core library usage
- [Vue Integration](/guide/vue) - Vue components reference
- [React Integration](/guide/react) - React components reference
