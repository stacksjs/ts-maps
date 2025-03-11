# Usage Guide

ts-maps provides a powerful way to create interactive vector maps with data visualization capabilities. This guide covers the core features and usage patterns.

## Basic Usage

### Creating a Vector Map

```typescript
import { VectorMap } from '@stacksjs/ts-maps'

const map = new VectorMap({
  container: 'map-container', // ID of the container element
  map: 'world', // Built-in world map
  theme: 'light', // 'light' or 'dark' theme
})
```

### Map Configuration

```typescript
const map = new VectorMap({
  container: 'map-container',
  map: 'world',
  options: {
    zoom: {
      enabled: true,
      min: 1,
      max: 5,
      step: 0.5,
    },
    pan: {
      enabled: true,
    },
    responsive: true,
  },
})
```

## Data Visualization

### Choropleth Maps

```typescript
// Create a choropleth map with data
map.choropleth({
  data: [
    { id: 'US', value: 100 },
    { id: 'CA', value: 80 },
    { id: 'GB', value: 65 },
  ],
  scale: {
    type: 'linear',
    min: 0,
    max: 100,
    colors: ['#e5f5f9', '#2ca25f'],
  },
})
```

### Heat Maps

```typescript
// Create a heat map with point data
map.heatmap({
  data: [
    { lat: 40.7128, lng: -74.0060, value: 100 }, // New York
    { lat: 51.5074, lng: -0.1278, value: 80 }, // London
    { lat: 35.6762, lng: 139.6503, value: 90 }, // Tokyo
  ],
  options: {
    radius: 20,
    blur: 15,
    gradient: {
      0.4: 'blue',
      0.6: 'cyan',
      0.8: 'lime',
      0.9: 'yellow',
      1.0: 'red',
    },
  },
})
```

## Map Projections

```typescript
import { Projections } from '@stacksjs/ts-maps'

// Using different map projections
const map = new VectorMap({
  container: 'map-container',
  projection: Projections.mercator({
    center: [0, 40],
    scale: 200,
  }),
})

// Or use other available projections
const equalEarthMap = new VectorMap({
  container: 'map-container',
  projection: Projections.equalEarth(),
})
```

## Event Handling

```typescript
// Click events
map.on('regionClick', (event, region) => {
  console.log(`Clicked region: ${region.id}`)
  console.log(`Properties:`, region.properties)
})

// Hover events
map.on('regionHover', (event, region) => {
  console.log(`Hovering over: ${region.id}`)
})

// Zoom events
map.on('zoom', (event, level) => {
  console.log(`Current zoom level: ${level}`)
})

// Pan events
map.on('pan', (event, position) => {
  console.log(`Pan position:`, position)
})
```

## Styling and Customization

### Basic Styling

```typescript
const map = new VectorMap({
  container: 'map-container',
  style: {
    regions: {
      default: {
        fill: '#e4e4e4',
        stroke: '#ffffff',
        strokeWidth: 1,
      },
      hover: {
        fill: '#2ca25f',
        stroke: '#ffffff',
        strokeWidth: 2,
      },
      selected: {
        fill: '#2ca25f',
        stroke: '#ffffff',
        strokeWidth: 2,
      },
    },
  },
})
```

### Custom Legend

```typescript
map.setLegend({
  title: 'Population Density',
  position: 'bottom-right',
  scale: {
    type: 'linear',
    min: 0,
    max: 100,
    steps: 5,
    colors: ['#e5f5f9', '#2ca25f'],
  },
  labels: {
    format: value => `${value}M`,
  },
})
```

## Series and Data Management

```typescript
import { Series } from '@stacksjs/ts-maps'

// Create a data series
const populationSeries = new Series({
  name: 'Population',
  data: [
    { id: 'US', value: 331002651 },
    { id: 'CN', value: 1439323776 },
    { id: 'IN', value: 1380004385 },
  ],
  scale: {
    type: 'logarithmic',
    colors: ['#fee5d9', '#a50f15'],
  },
})

// Apply the series to the map
map.addSeries(populationSeries)
```

## API Reference

### VectorMap Options

```typescript
interface VectorMapOptions {
  container: string | HTMLElement
  map: string | MapData
  theme?: 'light' | 'dark' | ThemeOptions
  projection?: ProjectionOptions
  style?: StyleOptions
  interactive?: boolean
  zoom?: ZoomOptions
  pan?: PanOptions
  legend?: LegendOptions
  series?: Series[]
}
```

### Event Types

```typescript
type MapEventType =
  | 'regionClick'
  | 'regionHover'
  | 'regionMouseEnter'
  | 'regionMouseLeave'
  | 'zoom'
  | 'pan'
  | 'load'
  | 'error'
```

For more detailed information about specific features and advanced usage, check out our [API Reference](/api).
