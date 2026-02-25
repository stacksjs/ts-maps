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
```

## Setting Map Focus

You can programmatically focus on specific regions of the map using the `setFocus` method:

```typescript
// Focus on a specific region with custom scale
map.setFocus({
  region: 'JP', // Country code
  scale: 2, // Zoom level
})
```

The `setFocus` method accepts an object with the following properties:

- `region`: The region code to focus on (e.g., 'US', 'JP', 'GB')
- `scale`: The zoom level to apply (must be within your configured `zoomMin` and `zoomMax`)

## Customizing Zoom Buttons

You can customize the appearance of the zoom buttons using CSS. Here's how to style them with a modern, clean look:

```css
/* Zoom buttons styling */
# map .jvm-zoom-btn {
  position: absolute;
  right: 10px;
  z-index: 10;
  background-color: white;
  border: 1px solid #e2e8f0;
  color: #4f46e5;
  width: 30px;
  height: 30px;
  border-radius: 4px;
  line-height: 30px;
  text-align: center;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* Position zoom in button */
# map .jvm-zoomin {
  top: 10px;
}

/* Position zoom out button */
# map .jvm-zoomout {
  top: 50px;
}

/* Hover effect */
# map .jvm-zoom-btn:hover {
  background-color: #f8fafc;
}
```

This CSS will give your zoom buttons:

- Clean white background with a subtle border
- Consistent sizing and spacing
- Hover effects for better interactivity
- Proper z-index to stay above the map
- Shadow for depth

## Live Demo

Below is a live demo of the vector map with the configuration shown above:

<VectorMapDemo />

::: tip
Click and drag to pan the map, use the scroll wheel or zoom buttons to zoom in/out, and click on regions to select them.
:::
