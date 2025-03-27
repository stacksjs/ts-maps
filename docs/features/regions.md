# Regions

ts-maps provides comprehensive features for working with map regions, including styling, selection, events, and focus control.

## Region Configuration

```typescript
const map = new VectorMap({
  selector: '#map',
  // Region selection options
  regionsSelectable: true,      // Enable region selection
  regionsSelectableOne: false,  // Allow multiple region selection
})
```

## Region Styling

You can customize the appearance of regions using different states:

```typescript
const map = new VectorMap({
  selector: '#map',
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

The `regionStyle` configuration supports four states:

- `initial`: Default appearance of regions
- `hover`: Style applied when hovering over a region
- `selected`: Style applied to selected regions
- `selectedHover`: Style applied when hovering over a selected region

## Region Events

```typescript
const map = new VectorMap({
  selector: '#map',
  // Region click event
  onRegionClick: (event, code) => {
    console.log(`Clicked region: ${code}`)
  },

  // Region selection event
  onRegionSelected: (event, code, isSelected, selectedRegions) => {
    console.log(`Region ${code} selection state: ${isSelected}`)
    console.log('Currently selected regions:', selectedRegions)
  },

})
```

Available region events:

- `onRegionClick`: Triggered when a region is clicked
  - `event`: The mouse event
  - `code`: The region code (e.g., 'US', 'JP')

- `onRegionSelected`: Triggered when a region's selection state changes
  - `event`: The mouse event
  - `code`: The region code
  - `isSelected`: Boolean indicating if the region is now selected
  - `selectedRegions`: Array of currently selected region codes

## Setting Region Focus

You can programmatically focus on specific regions using the `setFocus` method:

```typescript
// Focus on a specific region with custom scale
map.setFocus({
  region: 'JP', // Country code
  scale: 2,     // Zoom level
})
```

The `setFocus` method accepts:

- `region`: The region code to focus on (e.g., 'US', 'JP', 'GB')
- `scale`: The zoom level to apply (must be within your configured `zoomMin` and `zoomMax`)

## Live Demo

Below is a live demo showcasing region interaction and styling:

<RegionMapDemo />

::: tip
Click on regions to select them. Hold Ctrl/Cmd to select multiple regions if `regionsSelectableOne` is false.
:::
