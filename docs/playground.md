# Interactive Playground

Welcome to the ts-maps interactive playground! Here you can experiment with different map configurations and features in real-time.

## Basic Examples

### Simple World Map

```typescript
import { VectorMap } from 'ts-maps'

const map = new VectorMap({
  container: 'map',
  map: 'world',
  theme: 'light',
})
```

### Styled Map

```typescript
import type { VectorMapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps'

const options: VectorMapOptions = {
  container: 'map',
  map: 'world',
  theme: 'dark',
  style: {
    regions: {
      fill: '#2a4858',
      stroke: '#ffffff',
      strokeWidth: 0.5,
    },
    background: '#1a1a1a',
  },
}

const map = new VectorMap(options)
```

## Data Visualization

### Choropleth Map

```typescript
import type { DataVisualizationOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps'

const map = new VectorMap({
  container: 'map',
  map: 'world',
})

const visualization: DataVisualizationOptions = {
  scale: ['#FFE5E5', '#FF0000'],
  values: {
    US: 100,
    CA: 75,
    MX: 50,
  }
}

map.visualizeData(visualization)
```

### Heat Map

```typescript
import type { GeoPoint, HeatmapOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps'

const map = new VectorMap({
  container: 'map',
  map: 'world',
})

const points: GeoPoint[] = [
  { lat: 40.7128, lng: -74.0060, value: 100 }, // New York
  { lat: 51.5074, lng: -0.1278, value: 80 }, // London
  { lat: 35.6762, lng: 139.6503, value: 90 }, // Tokyo
]

const options: HeatmapOptions = {
  data: points,
  radius: 20,
  blur: 15,
  gradient: {
    0.4: 'blue',
    0.6: 'cyan',
    0.8: 'lime',
    0.9: 'yellow',
    1.0: 'red',
  },
}

map.heatmap(options)
```

## Interactive Features

### Event Handling

```typescript
import type { Region } from 'ts-maps'
import { VectorMap } from 'ts-maps'

const map = new VectorMap({
  container: 'map',
  map: 'world',
})

// Region click events
map.on('regionClick', (event, region: Region) => {
  console.log(`Clicked region: ${region.id}`)
})

// Region hover events
map.on('regionHover', (event, region: Region) => {
  region.style.fill = '#ff0000'
})

// Zoom events
map.on('zoom', (scale: number) => {
  console.log(`Current zoom scale: ${scale}`)
})
```

### Markers and Lines

```typescript
import type { LineOptions, MarkerOptions } from 'ts-maps'
import { VectorMap } from 'ts-maps'

const map = new VectorMap({
  container: 'map',
  map: 'world',
})

// Add markers
const markerOptions: MarkerOptions[] = [
  {
    coordinates: [40.7128, -74.0060],
    name: 'New York',
    style: {
      fill: '#ff0000',
      stroke: '#ffffff',
      strokeWidth: 2,
      radius: 5,
    },
  },
  {
    coordinates: [51.5074, -0.1278],
    name: 'London',
    style: {
      fill: '#00ff00',
      stroke: '#ffffff',
      strokeWidth: 2,
      radius: 5,
    },
  },
]

map.addMarkers(markerOptions)

// Add connection line
const lineOptions: LineOptions = {
  from: [40.7128, -74.0060],
  to: [51.5074, -0.1278],
  style: {
    stroke: '#3699ff',
    strokeWidth: 2,
    dashArray: '5,5',
  },
  animate: true,
  duration: 1000,
}

map.drawLine(lineOptions)
```

## Framework Integration

### React Component

```tsx
import type { VectorMapProps } from 'ts-maps-react'
import { useVectorMap } from 'ts-maps-react'

interface Props {
  onRegionClick?: (regionId: string) => void
}

function WorldMap({ onRegionClick }: Props) {
  const { map, isLoading } = useVectorMap({
    map: 'world',
    theme: 'light',
    onReady: (mapInstance) => {
      console.log('Map is ready')
    },
  })

  return (
    <div className="map-container">
      {isLoading
        ? (
            <div>Loading...</div>
          )
        : (
            <div id="map" className="map" />
          )}
    </div>
  )
}

export default WorldMap
```

### Vue Component

```vue
<script setup lang="ts">
import type { VectorMapOptions } from 'ts-maps'
import { useVectorMap } from 'ts-maps-vue'

interface Props {
  theme?: 'light' | 'dark'
}

const props = defineProps<Props>()

const options: VectorMapOptions = {
  map: 'world',
  theme: props.theme ?? 'light',
  onReady: (mapInstance) => {
    console.log('Map is ready')
  },
}

const { map, isLoading } = useVectorMap(options)
</script>

<template>
  <div class="map-container">
    <div v-if="isLoading">
      Loading...
    </div>
    <div v-else id="map" class="map" />
  </div>
</template>

<style scoped>
.map-container {
  width: 100%;
  height: 400px;
}

.map {
  width: 100%;
  height: 100%;
}
</style>
```

## Running the Playground

1. Clone the repository:

```bash
git clone https://github.com/stacksjs/ts-maps.git
cd ts-maps
```

2. Install dependencies:

```bash
pnpm install
```

3. Start the playground:

```bash
pnpm run playground
```

4. Open your browser to `http://localhost:3000`

## Examples Structure

The playground includes several example files:

- `basic/`: Basic map implementations
  - `world.ts`: Simple world map
  - `styled.ts`: Custom styled maps

- `visualization/`: Data visualization examples
  - `choropleth.ts`: Choropleth maps
  - `heatmap.ts`: Heat maps
  - `bubble.ts`: Bubble charts

- `interactive/`: Interactive features
  - `events.ts`: Event handling
  - `markers.ts`: Marker management
  - `lines.ts`: Connection lines

- `frameworks/`: Framework integrations
  - `react/`: React examples
  - `vue/`: Vue examples

Each example is self-contained and includes TypeScript types for better development experience.
