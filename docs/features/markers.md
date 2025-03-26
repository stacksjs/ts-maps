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

## Event Handling

```typescript
// Marker click events
map.params.onMarkerClick = (event, index) => {
  console.log(`Clicked marker: ${index}`)
}
```
