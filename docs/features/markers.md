# Markers

Add interactive markers to your maps with customizable styling and events.

## Basic Usage

```typescript
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
  markersSelectable: true,
  markersSelectableOne: true, // Single selection for markers
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

## Adding Labels to Markers

You can add labels to your markers

```typescript
const map = new VectorMap({
  selector: '#map',
  // ... other options ...
  labels: {
    markers: {
      render: (marker: MarkerConfig) => marker.name,
      offsets: () => [3, -30], // Returns [x, y] offset array
    },
  },
})
```

You can customize how marker labels are rendered and positioned:

- `render`: A function that returns the text to display for each marker
- `offsets`: A function that returns an array of [x, y] coordinates for label positioning
  - Positive x moves the label right
  - Negative y moves the label up

## Event Handling

```typescript
const map = new VectorMap({
  selector: '#map',
  // Marker events
  onMarkerTooltipShow: (event) => {
    console.log('marker tooltip show', event)
  },
  onMarkerClick: (event, index) => {
    console.log('marker click', event, index)
  },
  onMarkerSelected: (event, index, isSelected, selectedMarkers) => {
    console.log('marker selected', event, index, isSelected, selectedMarkers)
  },
})
```

Available marker events:

- `onMarkerTooltipShow`: Triggered when a marker's tooltip is shown
- `onMarkerClick`: Triggered when a marker is clicked, provides the event and marker index
- `onMarkerSelected`: Triggered when a marker's selection state changes
  - `event`: The triggering DOM event
  - `index`: Index of the marker
  - `isSelected`: Boolean indicating if the marker is now selected
  - `selectedMarkers`: Array of currently selected marker indices

## Series

You can create marker series to visualize data with different styles:

```typescript
const map = new VectorMap({
  selector: '#map',
  series: {
    markers: [{
      attribute: 'fill', // The attribute to modify (e.g., 'fill', 'r')
      scale: ['#FFC107', '#FF5722'], // Color scale for the values
      values: {
        marker1: 75, // Values for each marker
        marker2: 45,
      },
      legend: {
        vertical: true,
        title: 'Marker Values',
        cssClass: 'my-legend'
      }
    }]
  }
})
```

Series configuration options:

- `attribute`: The marker attribute to modify (e.g., 'fill', 'r')
- `scale`: Array of values or colors for the scale
- `values`: Object mapping marker names to their values
- `legend`: Legend configuration
  - `vertical`: Display legend vertically
  - `title`: Legend title
  - `cssClass`: Custom CSS class for styling

## Lines

You can draw lines between markers to show connections or paths:

```typescript
const map = new VectorMap({
  selector: '#map',
  lines: {
    elements: [
      {
        from: 'New York', // Starting marker name
        to: 'London', // Ending marker name
        style: {
          stroke: '#4f46e5',
          strokeWidth: 1,
          animation: true // Enable line animation
        }
      }
    ],
    style: { // Default style for all lines
      stroke: '#4f46e5',
      strokeWidth: 1,
    },
    curvature: 0.5 // Line curvature (0 = straight, 1 = very curved)
  }
})
```

### Advanced Line Styling

You can create multiple lines with different styles and animations:

```typescript
const lines = [
  {
    from: 'US',
    to: 'GB',
    style: {
      stroke: '#4f46e5', // Indigo color
      strokeWidth: 2,
      animation: true
    }
  },
  {
    from: 'JP',
    to: 'AU',
    style: {
      stroke: '#10b981', // Green color
      strokeWidth: 3,
      strokeDasharray: '5,5', // Dashed line
      animation: true
    }
  },
  {
    from: 'BR',
    to: 'ZA',
    style: {
      stroke: '#f59e0b', // Amber color
      strokeWidth: 2,
      animation: true
    }
  }
]

// Add all lines with animations
map.addLines(lines)
```

### Line Configuration Options

Line styling supports:

- `stroke`: Line color
- `strokeWidth`: Line width
- `strokeDasharray`: Pattern for dashed lines (e.g., '5,5')
- `animation`: Set to `true` to enable line animation
- `strokeLinecap`: Line end style ('butt', 'round', or 'square')

When animation is enabled, lines will use a CSS-based animation that creates a flowing effect. The animation is defined in the library's CSS:

```css
.jvm-line[animation="true"] {
  -webkit-animation: jvm-line-animation 10s linear forwards infinite;
  animation: jvm-line-animation 10s linear forwards infinite;
}
```

## Live Demo

Below is a live demo of the vector map with the configuration shown above:

<MarkersMapDemo />

::: tip
Click and drag to pan the map, use the scroll wheel or zoom buttons to zoom in/out, and click on regions to select them. Hover over markers to see their labels.
:::
