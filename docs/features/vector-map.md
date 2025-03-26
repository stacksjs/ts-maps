# Vector Map

ts-maps provides powerful vector map capabilities with customizable styling and interactive features.

## Basic Configuration

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

## Advanced Configuration

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
  regionsSelectableOne: false,

  // General options
  backgroundColor: '#4a4a4a',
  draggable: true,
  bindTouchEvents: true,
})
```

## Region Styling

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
