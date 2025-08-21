# Heatmap

Create beautiful, interactive heatmaps with ts-maps to visualize data intensity across geographic regions. Heatmaps use color gradients to represent data values, making it easy to identify patterns, hotspots, and trends in your data.

## What is a Heatmap?

A heatmap is a data visualization technique that uses color intensity to represent data values. In geographic contexts, regions with higher values are colored with warmer/darker colors, while regions with lower values use cooler/lighter colors. This creates an intuitive visual representation of data distribution across geographic areas.

## Key Features

- **Color Gradients**: Smooth transitions between colors based on data values
- **Multiple Color Schemes**: Support for different color palettes (red, blue, orange)
- **Interactive Regions**: Hover effects and click interactions
- **Customizable Scales**: Define your own color ranges and thresholds
- **Multiple Map Types**: World, country, and regional heatmaps
- **Responsive Design**: Adapts to different screen sizes

## Basic Heatmap Implementation

### World Heatmap

```typescript
import { VectorMap } from 'ts-maps'

const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828'],
    values: {
      US: 95, // High activity - Dark red
      CN: 88, // High activity - Dark red
      RU: 72, // Medium-high - Medium red
      BR: 65, // Medium - Light red
      IN: 58, // Medium - Light red
      DE: 82, // High activity - Dark red
      FR: 78, // High activity - Medium-dark red
      GB: 85, // High activity - Dark red
      JP: 68, // Medium - Medium red
      CA: 75, // Medium-high - Medium red
    },
  },
  backgroundColor: '#f8fafc',
  zoomOnScroll: true,
  zoomButtons: true,
  regionsSelectable: true,
})
```

### US States Heatmap

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'us-merc',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2', '#1565c0'],
    values: {
      CA: 95, // California - Very high (Dark blue)
      TX: 88, // Texas - Very high (Dark blue)
      NY: 92, // New York - Very high (Dark blue)
      FL: 85, // Florida - High (Medium-dark blue)
      IL: 78, // Illinois - High (Medium-dark blue)
      PA: 72, // Pennsylvania - Medium-high (Medium blue)
      OH: 68, // Ohio - Medium-high (Medium blue)
      GA: 75, // Georgia - High (Medium-dark blue)
      NC: 70, // North Carolina - Medium-high (Medium blue)
      MI: 65, // Michigan - Medium (Medium-light blue)
    },
  },
})
```

### Canadian Provinces Heatmap

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'canada',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#fb8c00', '#f57c00', '#ef6c00'],
    values: {
      ON: 92, // Ontario - Very high (Dark orange)
      QC: 88, // Quebec - Very high (Dark orange)
      BC: 85, // British Columbia - High (Medium-dark orange)
      AB: 82, // Alberta - High (Medium-dark orange)
      MB: 65, // Manitoba - Medium (Medium orange)
      SK: 58, // Saskatchewan - Medium-low (Light orange)
      NS: 62, // Nova Scotia - Medium (Medium-light orange)
      NB: 55, // New Brunswick - Medium-low (Light orange)
      NL: 48, // Newfoundland and Labrador - Low-medium (Very light orange)
      PE: 42, // Prince Edward Island - Low-medium (Very light orange)
    },
  },
})
```

## Color Scale Configuration

### Understanding Color Scales

The `scale` array defines the color progression from lowest to highest values:

```typescript
scale: ['#ffffff', '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828']
//        White    Very Light Red  Light Red  Medium Red  Dark Red  Very Dark Red
//        0-10%    10-20%          20-30%     30-40%      40-50%    50%+
```

### Custom Color Schemes

#### Red Heatmap (Default)

```typescript
scale: ['#ffffff', '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828']
```

#### Blue Heatmap

```typescript
scale: ['#ffffff', '#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2', '#1565c0']
```

#### Orange Heatmap

```typescript
scale: ['#ffffff', '#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#fb8c00', '#f57c00', '#ef6c00']
```

#### Green Heatmap

```typescript
scale: ['#ffffff', '#e8f5e8', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50', '#43a047', '#388e3c', '#2e7d32']
```

## Data Value Configuration

### Value Ranges

Values should typically be between 0-100, representing percentages or normalized scores:

```typescript
values: {
  // 90-100: Very High (Darkest color)
  US: 95,
  CN: 92,

  // 80-89: High (Dark color)
  DE: 85,
  GB: 82,

  // 70-79: Medium-High (Medium-dark color)
  FR: 78,
  CA: 75,

  // 60-69: Medium (Medium color)
  JP: 68,
  BR: 65,

  // 50-59: Medium-Low (Medium-light color)
  IN: 58,
  MX: 55,

  // 40-49: Low (Light color)
  AU: 45,
  SE: 42,

  // 30-39: Very Low (Very light color)
  NO: 35,
  FI: 32,

  // 0-29: Minimal (White/transparent)
  IS: 15,
  MT: 8,
}
```

### Data Normalization

For real-world data, you may need to normalize values:

```typescript
// Raw data
const rawData = {
  US: 1500000,
  CN: 1200000,
  DE: 800000,
  // ... more countries
}

// Normalize to 0-100 scale
const maxValue = Math.max(...Object.values(rawData))
const normalizedData = Object.fromEntries(
  Object.entries(rawData).map(([country, value]) => [
    country,
    Math.round((value / maxValue) * 100)
  ])
)

// Use normalized data in heatmap
visualizeData: {
  scale: ['#ffffff', '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828'],
  values: normalizedData,
}
```

## Advanced Configuration

### Custom Region Styling

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828'],
    values: worldData,
  },
  backgroundColor: '#f8fafc',
  zoomOnScroll: true,
  zoomButtons: true,
  regionsSelectable: true,
  regionStyle: {
    initial: {
      'fill': '#e2e8f0',
      'stroke': '#ffffff',
      'stroke-width': 0.5,
      'stroke-opacity': 1,
    },
    hover: {
      'fill': '#cbd5e1',
      'fill-opacity': 0.8,
      'cursor': 'pointer',
    },
    selected: {
      'fill': '#3b82f6',
      'fill-opacity': 0.8,
    },
  },
})
```

### Interactive Features

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828'],
    values: worldData,
  },
  // Interactive features
  zoomOnScroll: true, // Enable mouse wheel zoom
  zoomButtons: true, // Show zoom in/out buttons
  regionsSelectable: true, // Allow region selection
  regionsSelectableOne: false, // Allow multiple selections
  panOnDrag: true, // Enable panning
  zoomMax: 8, // Maximum zoom level
  zoomMin: 1, // Minimum zoom level
})
```

## Live Demo

Below is a live demo of the heatmap functionality. Use the dropdown to switch between different maps and see how heatmap data is visualized:

<HeatmapDemo />

::: tip
**Interactive Features:**

- **Hover** over regions to see data values
- **Click** to select regions
- **Scroll** to zoom in/out
- **Drag** to pan around the map
- **Switch maps** to see different heatmap visualizations
:::

## Use Cases

### Business Intelligence

- **Sales Performance**: Visualize sales data by region
- **Market Penetration**: Show market share across territories
- **Customer Distribution**: Map customer density and activity

### Healthcare & Research

- **Disease Outbreaks**: Track infection rates by location
- **Healthcare Access**: Visualize healthcare facility distribution
- **Research Studies**: Map research participation rates

### Environmental Monitoring

- **Air Quality**: Show pollution levels by region
- **Temperature Changes**: Visualize climate data
- **Natural Disasters**: Map disaster impact areas

### Social Sciences

- **Population Density**: Visualize demographic data
- **Economic Indicators**: Map GDP, unemployment, etc.
- **Education Metrics**: Show literacy rates, school performance

## Best Practices

### 1. Color Choice

- Use intuitive color schemes (red for hot/high, blue for cool/low)
- Ensure sufficient contrast for accessibility
- Consider colorblind-friendly palettes

### 2. Data Quality

- Normalize data appropriately
- Handle missing data gracefully
- Use consistent value ranges

### 3. User Experience

- Provide clear legends and tooltips
- Enable interactive features for exploration
- Use appropriate zoom levels for detail

### 4. Performance

- Limit the number of regions with data
- Use efficient color calculations
- Optimize for mobile devices

## Troubleshooting

### Common Issues

**Colors not showing correctly:**

- Ensure `visualizeData` is properly configured
- Check that region codes match map data
- Verify color scale array has sufficient colors

**Performance issues:**

- Reduce the number of regions with data
- Use simpler color scales
- Optimize data values

**Map not rendering:**

- Check that the map data is properly loaded
- Verify the selector element exists
- Ensure all dependencies are loaded

### Debug Mode

Enable debug mode to troubleshoot issues:

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828'],
    values: worldData,
  },
  debug: true, // Enable debug mode
})
```

## Related Features

- **[Data Visualization](./../features/data-visualization.md)** - Basic data visualization concepts
- **[Vector Maps](./../features/vector-map.md)** - Core vector map functionality
- **[Markers](./../features/markers.md)** - Adding point markers to maps
- **[Regions](./../features/regions.md)** - Working with geographic regions
