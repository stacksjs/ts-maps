# Data Visualization

Visualize data on your maps with customizable color scales and values.

## Basic Usage

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

## Live Demo

Below is a live demo of the vector map with the configuration shown above:

<DataVisualizationDemo />

::: tip
Click and drag to pan the map, use the scroll wheel or zoom buttons to zoom in/out, and click on regions to select them. Hover over markers to see their labels.
:::
