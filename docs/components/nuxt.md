# Nuxt Components

ts-maps provides official Nuxt components that make it easy to integrate interactive vector maps into your Nuxt applications.

## Installation

Install the Nuxt module:

```bash
npm install ts-maps-nuxt
```

## Setup

Add the module to your `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: [
    'ts-maps-nuxt'
  ]
})
```

## Available Components

### VectorMap

The main component for displaying any supported map:

```vue
<script setup lang="ts">
import type { MapOptions } from 'ts-maps'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f0f0f0',
  zoomOnScroll: true,
  regionsSelectable: true,
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
}

function handleRegionClick(event: MouseEvent, code: string) {
  console.log(`Clicked region: ${code}`)
}

function handleMapLoaded() {
  console.log('Map loaded successfully')
}
</script>

<template>
  <VectorMap
    :options="mapOptions"
    map-name="world"
    height="500px"
    @region-click="handleRegionClick"
    @loaded="handleMapLoaded"
  />
</template>
```

### Specific Map Components

For convenience, you can use dedicated components for specific maps:

#### World Map

```vue
<template>
  <WorldMap :options="mapOptions" />
</template>
```

#### United States Map

```vue
<template>
  <UnitedStates :options="mapOptions" />
</template>
```

#### Canada Map

```vue
<template>
  <Canada :options="mapOptions" />
</template>
```

#### Brazil Map

```vue
<template>
  <Brasil :options="mapOptions" />
</template>
```

#### Spain Map

```vue
<template>
  <Spain :options="mapOptions" />
</template>
```

#### Italy Map

```vue
<template>
  <Italy :options="mapOptions" />
</template>
```

#### Russia Map

```vue
<template>
  <Russia :options="mapOptions" />
</template>
```

#### Iraq Map

```vue
<template>
  <Iraq :options="mapOptions" />
</template>
```

## Component Props

### VectorMap Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `options` | `Omit<MapOptions, 'selector'>` | ✅ | - | Map configuration options |
| `mapName` | `MapName` | ✅ | - | Name of the map to display |
| `width` | `string` | ❌ | `'100%'` | Width of the map container |
| `height` | `string` | ❌ | `'400px'` | Height of the map container |

### MapName Type

```ts
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
  | 'brasil'
  | 'russia'
```

## Events

All components emit the following events:

| Event | Payload | Description |
|-------|---------|-------------|
| `regionClick` | `(event: MouseEvent, code: string)` | Fired when a region is clicked |
| `regionSelected` | `(event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[])` | Fired when a region is selected/deselected |
| `markerClick` | `(event: MouseEvent, index: string)` | Fired when a marker is clicked |
| `viewportChange` | `(scale: number, transX: number, transY: number)` | Fired when the map viewport changes |
| `loaded` | `()` | Fired when the map is fully loaded |

## Data Visualization

Add data visualization to your maps:

```vue
<script setup lang="ts">
import type { DataVisualizationOptions, MapOptions } from 'ts-maps'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f0f0f0',
  zoomOnScroll: true,
}

function handleMapLoaded() {
  // Add data visualization after map loads
  const dataOptions: DataVisualizationOptions = {
    scale: ['#e5f5f9', '#2ca25f'],
    values: {
      US: 100,
      CA: 80,
      GB: 65,
      DE: 45,
      FR: 40,
    },
  }

  // Access the map instance and visualize data
  // This would typically be done through a ref or event
}
</script>

<template>
  <VectorMap
    :options="mapOptions"
    map-name="world"
    @loaded="handleMapLoaded"
  />
</template>
```

## Styling

Customize the appearance of your maps:

```vue
<script setup lang="ts">
import type { MapOptions } from 'ts-maps'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#1a1a1a',
  zoomOnScroll: true,
  style: {
    regions: {
      fill: '#2d2d2d',
      stroke: '#404040',
      strokeWidth: 1,
    },
    hover: {
      fill: '#4a9eff',
    },
    selected: {
      fill: '#ff6b6b',
    },
  },
}
</script>

<template>
  <VectorMap
    :options="mapOptions"
    map-name="world"
    height="600px"
  />
</template>
```

## Advanced Usage

### Custom Map Data

You can add custom map data:

```vue
<script setup lang="ts">
import { VectorMap } from 'ts-maps'
import customMapData from './custom-map-data'

// Add custom map data
VectorMap.addMap('custom', customMapData)
</script>

<template>
  <VectorMap
    :options="mapOptions"
    map-name="custom"
  />
</template>
```

### Interactive Features

Enable interactive features:

```vue
<script setup lang="ts">
import type { MapOptions } from 'ts-maps'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f0f0f0',
  zoomOnScroll: true,
  regionsSelectable: true,
  markersSelectable: true,
  zoomButtons: true,
  panOnDrag: true,
  style: {
    regions: {
      fill: '#e4e4e4',
      stroke: '#ffffff',
      strokeWidth: 1,
    },
    hover: {
      fill: '#2ca25f',
    },
    selected: {
      fill: '#ff6b6b',
    },
  },
}
</script>
```

## Examples

### Basic World Map

```vue
<script setup lang="ts">
import type { MapOptions } from 'ts-maps'

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#f8f9fa',
  zoomOnScroll: true,
  regionsSelectable: true,
  style: {
    regions: {
      fill: '#e9ecef',
      stroke: '#dee2e6',
      strokeWidth: 1,
    },
    hover: {
      fill: '#007bff',
    },
    selected: {
      fill: '#28a745',
    },
  },
}

function handleRegionClick(event: MouseEvent, code: string) {
  console.log(`Clicked: ${code}`)
}
</script>

<template>
  <div class="map-container">
    <h2>World Population Density</h2>
    <VectorMap
      :options="mapOptions"
      map-name="world"
      height="500px"
      @region-click="handleRegionClick"
    />
  </div>
</template>

<style scoped>
.map-container {
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

h2 {
  margin-bottom: 20px;
  color: #333;
}
</style>
```

### Interactive United States Map

```vue
<script setup lang="ts">
import type { MapOptions } from 'ts-maps'
import { ref } from 'vue'

const selectedStates = ref<string[]>([])

const mapOptions: Omit<MapOptions, 'selector'> = {
  backgroundColor: '#ffffff',
  zoomOnScroll: true,
  regionsSelectable: true,
  style: {
    regions: {
      fill: '#f8f9fa',
      stroke: '#dee2e6',
      strokeWidth: 1,
    },
    hover: {
      fill: '#007bff',
    },
    selected: {
      fill: '#28a745',
    },
  },
}

function handleStateClick(event: MouseEvent, code: string) {
  console.log(`Clicked state: ${code}`)
}

function handleStateSelection(event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) {
  selectedStates.value = selectedRegions
}
</script>

<template>
  <div class="us-map-container">
    <h2>United States Interactive Map</h2>
    <UnitedStates
      :options="mapOptions"
      height="600px"
      @region-click="handleStateClick"
      @region-selected="handleStateSelection"
    />
    <div v-if="selectedStates.length" class="selected-info">
      <h3>Selected States:</h3>
      <ul>
        <li v-for="state in selectedStates" :key="state">
          {{ state }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.us-map-container {
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

h2 {
  margin-bottom: 20px;
  color: #333;
}

.selected-info {
  margin-top: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 4px;
}

.selected-info h3 {
  margin-bottom: 10px;
  color: #495057;
}

.selected-info ul {
  list-style: none;
  padding: 0;
}

.selected-info li {
  padding: 5px 0;
  border-bottom: 1px solid #dee2e6;
}
</style>
```

## Troubleshooting

### Common Issues

1. **Map not displaying**: Ensure the container has proper dimensions
2. **Events not firing**: Check that event handlers are properly bound
3. **Styling not applied**: Verify the style object structure matches the expected format

### Performance Tips

- Use `mapKey` prop to force re-renders when options change significantly
- Avoid unnecessary re-renders by memoizing options objects
- Use specific map components when possible for better tree-shaking

## Next Steps

- Explore the [API Reference](/api/) for detailed configuration options
- Check out [Data Visualization](/features/data-visualization) for advanced features
- View [Examples](/showcase) for more use cases
