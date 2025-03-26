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
- [Data Visualization](./features/data-visualization.md) - Visualize data with customizable color scales
- [Events](./features/events.md) - Rich set of events for map interactions

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
