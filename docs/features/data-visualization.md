# Data Visualization

Visualize data on your maps with customizable color scales and values. ts-maps supports both world maps and regional maps like the United States with different projection types.

## Available Maps

### World Maps

- **`world`** - World map with Miller projection
- **`world-merc`** - World map with Mercator projection

### United States Maps

- **`us-merc`** - United States with Mercator projection
- **`us-mill`** - United States with Miller projection
- **`us-lcc`** - United States with Lambert Conformal Conic projection
- **`us-aea`** - United States with Albers Equal Area projection

### Country Maps

- **`spain`** - Spain with Mercator projection
- **`italy`** - Italy with Mercator projection
- **`canada`** - Canada with Mercator projection

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

## US States Data Visualization

For United States maps, you can visualize data at the state level:

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'us-merc',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#e3f2fd', '#1976d2'],
    values: {
      CA: 100, // California
      TX: 85, // Texas
      NY: 80, // New York
      FL: 75, // Florida
      IL: 70, // Illinois
      PA: 65, // Pennsylvania
      OH: 60, // Ohio
      GA: 55, // Georgia
      NC: 50, // North Carolina
      MI: 45, // Michigan
    },
  },
})
```

## Live Demo

Below is a live demo of the vector map with data visualization. Use the dropdown to switch between different maps and see how data is visualized on each:

<DataVisualizationDemo />

::: tip
Click and drag to pan the map, use the scroll wheel or zoom buttons to zoom in/out, and click on regions to select them. Hover over regions to see their data values. Switch between world and US maps to see different data visualizations.
:::

## Projection Types

Different projection types are optimized for different use cases:

- **Mercator**: Good for navigation and general purpose use
- **Miller**: Better for world maps, reduces distortion at poles
- **Lambert Conformal Conic**: Excellent for mid-latitude regions like the US
- **Albers Equal Area**: Preserves area relationships, great for statistical data
