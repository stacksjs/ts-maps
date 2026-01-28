# Getting Started

ts-maps is a modern vector map library for TypeScript that provides interactive, SVG-based maps with support for markers, lines, data visualization, and more.

## Installation

::: code-group

```sh [npm]
npm install ts-maps
```

```sh [pnpm]
pnpm add ts-maps
```

```sh [bun]
bun add ts-maps
```

```sh [yarn]
yarn add ts-maps
```

:::

## Basic Usage

### Creating a Map

First, create a container element in your HTML:

```html
<div id="map" style="width: 800px; height: 500px;"></div>
```

Then initialize the map:

```typescript
import { VectorMap } from 'ts-maps'
import 'ts-maps/dist/maps/world'

const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator',
  },
})
```

### Map Options

The `VectorMap` constructor accepts a comprehensive configuration object:

```typescript
interface MapOptions {
  // Required
  selector: string                    // CSS selector for container

  // Map configuration
  map: {
    name: string                      // Map name (e.g., 'world', 'us-aea-en')
    projection: 'mercator' | 'miller' // Map projection type
  }

  // Appearance
  backgroundColor?: string            // Background color

  // Interaction
  draggable?: boolean                 // Enable map dragging
  zoomButtons?: boolean               // Show zoom controls
  zoomOnScroll?: boolean              // Enable scroll wheel zoom
  zoomOnScrollSpeed?: number          // Scroll zoom speed
  zoomMax?: number                    // Maximum zoom level
  zoomMin?: number                    // Minimum zoom level
  zoomStep?: number                   // Zoom increment
  zoomAnimate?: boolean               // Animate zoom transitions
  bindTouchEvents?: boolean           // Enable touch events

  // Focus
  focusOn?: {
    region?: string                   // Focus on specific region
    regions?: string[]                // Focus on multiple regions
    coords?: [number, number]         // Focus on coordinates
    scale?: number                    // Initial zoom scale
    animate?: boolean                 // Animate focus transition
  }

  // Markers
  markers?: Array<{
    name: string
    coords: [number, number]          // [latitude, longitude]
    style?: object
  }>

  // Lines
  lines?: {
    elements?: Array<{
      from: string
      to: string
      style?: object
    }>
    style?: object
    curvature?: number
  }

  // Selection
  regions?: string[]                  // Initial regions
  selectedRegions?: string[]          // Pre-selected regions
  selectedMarkers?: string[]          // Pre-selected markers
  regionsSelectable?: boolean         // Enable region selection
  regionsSelectableOne?: boolean      // Single region selection
  markersSelectable?: boolean         // Enable marker selection
  markersSelectableOne?: boolean      // Single marker selection

  // Styling
  regionStyle?: RegionStyle
  regionLabelStyle?: RegionLabelStyle
  markerStyle?: MarkerStyle
  markerLabelStyle?: MarkerLabelStyle

  // Data visualization
  visualizeData?: {
    scale: [string, string]           // Color gradient [min, max]
    values: Record<string, number>    // Region values
  }

  // Events
  onLoaded?: () => void
  onViewportChange?: (scale: number, transX: number, transY: number) => void
  onRegionClick?: (event: MouseEvent, code: string) => void
  onRegionSelected?: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => void
  onMarkerClick?: (event: MouseEvent, index: string) => void
  onMarkerSelected?: (event: MouseEvent, index: string, isSelected: boolean, selectedMarkers: string[]) => void
  onRegionTooltipShow?: (event: MouseEvent, tooltip: HTMLElement, code: string) => void
  onMarkerTooltipShow?: (event: MouseEvent, tooltip: HTMLElement, code: string) => void
}
```

### Styling Regions

Customize region appearance with states:

```typescript
const map = new VectorMap({
  selector: '#map',
  map: { name: 'world', projection: 'mercator' },
  regionStyle: {
    initial: {
      fill: '#e2e8f0',
      stroke: '#cbd5e1',
      strokeWidth: 0.5,
    },
    hover: {
      fill: '#93c5fd',
    },
    selected: {
      fill: '#3b82f6',
    },
    selectedHover: {
      fill: '#2563eb',
    },
  },
})
```

### Adding Markers

Add interactive markers to the map:

```typescript
const map = new VectorMap({
  selector: '#map',
  map: { name: 'world', projection: 'mercator' },
  markers: [
    { name: 'New York', coords: [40.7128, -74.0060] },
    { name: 'London', coords: [51.5074, -0.1278] },
    { name: 'Tokyo', coords: [35.6762, 139.6503] },
    { name: 'Sydney', coords: [-33.8688, 151.2093] },
  ],
  markerStyle: {
    initial: {
      fill: '#ef4444',
      stroke: '#ffffff',
      strokeWidth: 2,
      r: 6,
    },
    hover: {
      fill: '#f97316',
      r: 8,
    },
  },
})
```

### Drawing Lines

Connect markers with curved lines:

```typescript
const map = new VectorMap({
  selector: '#map',
  map: { name: 'world', projection: 'mercator' },
  markers: [
    { name: 'Source', coords: [40.7128, -74.0060] },
    { name: 'Target', coords: [51.5074, -0.1278] },
  ],
  lines: {
    elements: [
      { from: 'Source', to: 'Target' },
    ],
    style: {
      stroke: '#3b82f6',
      strokeWidth: 2,
      strokeLinecap: 'round',
    },
    curvature: 0.5,
  },
})
```

### Data Visualization

Visualize data with color gradients:

```typescript
const map = new VectorMap({
  selector: '#map',
  map: { name: 'world', projection: 'mercator' },
  visualizeData: {
    scale: ['#dbeafe', '#1e40af'], // Light blue to dark blue
    values: {
      US: 331,
      CN: 1412,
      IN: 1408,
      ID: 273,
      PK: 220,
      BR: 212,
      NG: 211,
    },
  },
})
```

## Map Methods

Access map methods through the instance:

```typescript
const map = new VectorMap({ /* options */ })

// Get/set selected regions
const selected = map.getSelectedRegions()
map.setSelectedRegions(['US', 'CA'])
map.clearSelectedRegions()

// Get/set selected markers
const markers = map.getSelectedMarkers()
map.setSelectedMarkers(['0', '1'])
map.clearSelectedMarkers()

// Add/remove markers dynamically
map.addMarkers([
  { name: 'Paris', coords: [48.8566, 2.3522] }
])
map.removeMarkers(['Paris'])

// Add/remove lines
map.addLine('New York', 'Paris', { stroke: '#3b82f6' })
map.removeLine('New York', 'Paris')

// Focus and zoom
map.setFocus({
  region: 'US',
  scale: 3,
  animate: true
})

// Reset map
map.reset()

// Update size (after container resize)
map.updateSize()

// Coordinate conversion
const point = map.coordsToPoint(40.7128, -74.0060)
console.log(point) // { x: 123, y: 456 }
```

## Static Methods

Register custom maps:

```typescript
import { VectorMap } from 'ts-maps'

// Add a custom map
VectorMap.addMap('custom', {
  width: 900,
  height: 600,
  paths: {
    'REGION-1': {
      path: 'M 100 100 L 200 200...',
      name: 'Region One'
    },
    // ... more regions
  }
})

// Use the custom map
const map = new VectorMap({
  selector: '#map',
  map: { name: 'custom', projection: 'mercator' }
})
```

## Next Steps

- [Vue Integration](/guide/vue) - Use ts-maps with Vue components
- [React Integration](/guide/react) - Use ts-maps with React components
- [Nuxt Module](/guide/nuxt) - Use ts-maps as a Nuxt module
