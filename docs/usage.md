# Usage Guide

ts-maps provides a powerful way to create interactive vector maps with data visualization capabilities. This guide covers the core features and usage patterns.

## Basic Usage

### Creating a Vector Map

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

### Map Configuration

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  // Zoom configuration
  zoomOnScroll: true,
  zoomOnScrollSpeed: 1.5,
  zoomMax: 8,
  zoomMin: 1,
  zoomStep: 1.5,
  zoomAnimate: true,

  // Region selection
  regionsSelectable: true,
  regionsSelectableOne: false, // Allow multiple selection

  // Marker options
  markersSelectable: true,
  markersSelectableOne: true, // Single selection for markers

  // General options
  backgroundColor: '#4a4a4a',
  draggable: true,
  bindTouchEvents: true,
})
```

## Styling and Customization

### Region Styling

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  regionStyle: {
    initial: {
      fill: '#e4e4e4',
      stroke: '#ffffff',
      strokeWidth: 0.5,
    },
    hover: {
      fill: '#ccc',
    },
    selected: {
      fill: '#2ca25f',
    },
    selectedHover: {
      fill: '#1a9850',
    },
  },
})
```

### Marker Styling

```typescript
// Define marker styles
const map = new VectorMap({
  selector: '#map',
  markerStyle: {
    initial: {
      fill: '#ff0000',
      stroke: '#ffffff',
      r: 5,
    },
    hover: {
      fill: '#ff5555',
      r: 7,
    },
    selected: {
      fill: '#ff9999',
    },
  },
})

// Add markers
map.addMarkers([
  {
    name: 'New York',
    coords: [40.7128, -74.0060],
    style: {
      fill: '#ff0000',
      stroke: '#ffffff',
      r: 5,
    },
  },
  {
    name: 'London',
    coords: [51.5074, -0.1278],
    style: {
      fill: '#00ff00',
      stroke: '#ffffff',
      r: 5,
    },
  },
])
```

## Data Visualization

### Basic Data Visualization

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
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
```

### Custom Visualization Options

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#fee5d9', '#a50f15'],
    values: {
      US: 100,
      CN: 85,
      RU: 70,
      BR: 60,
    },
    scaleColors: ['#fee5d9', '#a50f15'],
    normalizeFunction: 'linear', // or 'polynomial'
  },
})
```

## Event Handling

```typescript
// Region click events
map.params.onRegionClick = (event, code) => {
  console.log(`Clicked region: ${code}`)
}

// Region selection events
map.params.onRegionSelected = (event, code, isSelected, selectedRegions) => {
  console.log(`Region ${code} selection state: ${isSelected}`)
  console.log('Currently selected regions:', selectedRegions)
}

// Marker events
map.params.onMarkerClick = (event, index) => {
  console.log(`Clicked marker: ${index}`)
}

// Viewport events
map.params.onViewportChange = (scale, transX, transY) => {
  console.log(`Map viewport changed: scale=${scale}, x=${transX}, y=${transY}`)
}

// Load event
map.params.onLoaded = () => {
  console.log('Map has finished loading')
}
```

## API Reference

### VectorMap Options

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

### Event Types

```typescript
interface MapEvents {
  onRegionClick?: (event: MouseEvent, code: string) => void
  onRegionSelected?: (event: MouseEvent, code: string, isSelected: boolean, selectedRegions: string[]) => void
  onMarkerClick?: (event: MouseEvent, index: number) => void
  onViewportChange?: (scale: number, transX: number, transY: number) => void
  onLoaded?: () => void
}
```

For more detailed information about specific features and advanced usage, check out our [API Reference](/api).
