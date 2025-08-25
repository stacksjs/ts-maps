# Analytics Heatmap

Create beautiful, interactive heatmaps to visualize data patterns and correlations across your analytics datasets. Heatmaps use color gradients to represent data values, making it easy to identify trends, correlations, and anomalies in your business metrics and user behavior data.

## What is an Analytics Heatmap?

An analytics heatmap is a data visualization technique that uses color intensity to represent metric values across different dimensions. High-performing metrics or strong correlations are displayed with warmer/darker colors, while lower values or weak correlations use cooler/lighter colors. This creates an intuitive visual representation of performance patterns, user engagement, and data relationships.

## Key Features

- **Color Gradients**: Smooth transitions between colors based on metric values and performance thresholds
- **Multiple Color Schemes**: Support for different color palettes (performance-based, correlation-focused, custom branding)
- **Interactive Cells**: Hover effects showing detailed metrics, drill-down capabilities, and contextual information
- **Customizable Scales**: Define your own performance ranges, percentile thresholds, and color mappings
- **Multiple Analytics Types**:
  - Performance matrices (KPIs across time periods or segments)
  - Correlation heatmaps (relationships between different metrics)
  - User behavior patterns (activity across pages, features, or time)
  - A/B test results visualization
  - Cohort analysis displays
- **Real-time Updates**: Dynamic data refresh for live analytics dashboards
- **Responsive Design**: Adapts to different screen sizes and dashboard layouts

## Basic Analytics Heatmap Implementation

### Global Visitor Analytics

```typescript
import { VectorMap } from 'ts-maps'

const visitorHeatmap = new VectorMap({
  selector: '#visitor-heatmap',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#f0f8e8', '#e1f2d3', '#c8e6b8', '#aed99d', '#94cd84', '#7ac06b', '#60b352', '#46a63a', '#2d9921'],
    values: {
      US: 87, // United States - High visitors (Dark green)
      GB: 73, // United Kingdom - Medium-high visitors (Medium-dark green)
      CA: 56, // Canada - Medium visitors (Light-medium green)
      DE: 91, // Germany - Very high visitors (Very dark green)
      FR: 68, // France - Medium-high visitors (Medium green)
      AU: 42, // Australia - Low-medium visitors (Light green)
      JP: 79, // Japan - High visitors (Medium-dark green)
      BR: 35, // Brazil - Low visitors (Very light green)
      IN: 84, // India - High visitors (Dark green)
      CN: 29, // China - Low visitors (Very light green)
      IT: 61, // Italy - Medium visitors (Light-medium green)
      ES: 54, // Spain - Medium visitors (Light-medium green)
      NL: 76, // Netherlands - High visitors (Medium-dark green)
      SE: 48, // Sweden - Low-medium visitors (Light green)
      NO: 39, // Norway - Low visitors (Light green)
    },
  },
  backgroundColor: '#f8fafc',
  zoomOnScroll: true,
  zoomButtons: true,
  regionsSelectable: true,
})
```

### Regional Visitor Breakdown (US States)

```typescript
const usVisitorHeatmap = new VectorMap({
  selector: '#us-visitor-heatmap',
  map: {
    name: 'us-merc',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#f0f8e8', '#e1f2d3', '#c8e6b8', '#aed99d', '#94cd84', '#7ac06b', '#60b352', '#46a63a', '#2d9921'],
    values: {
      CA: 89, // California - Very high visitors (Very dark green)
      TX: 76, // Texas - High visitors (Medium-dark green)
      NY: 94, // New York - Highest visitors (Very dark green)
      FL: 82, // Florida - High visitors (Dark green)
      WA: 58, // Washington - Medium visitors (Light-medium green)
      IL: 71, // Illinois - Medium-high visitors (Medium-dark green)
      PA: 63, // Pennsylvania - Medium visitors (Medium green)
      OH: 45, // Ohio - Low-medium visitors (Light green)
      GA: 67, // Georgia - Medium-high visitors (Medium green)
      NC: 52, // North Carolina - Medium visitors (Light-medium green)
      MI: 38, // Michigan - Low visitors (Very light green)
      VA: 59, // Virginia - Medium visitors (Light-medium green)
      CO: 73, // Colorado - Medium-high visitors (Medium-dark green)
      AZ: 49, // Arizona - Low-medium visitors (Light green)
      OR: 66, // Oregon - Medium visitors (Medium green)
    },
  },
  backgroundColor: '#f8fafc',
  zoomOnScroll: true,
  zoomButtons: true,
  regionsSelectable: true,
})
```

### Canadian Provinces Visitor Analytics

```typescript
const canadaVisitorHeatmap = new VectorMap({
  selector: '#canada-visitor-heatmap',
  map: {
    name: 'canada',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#f0f8e8', '#e1f2d3', '#c8e6b8', '#aed99d', '#94cd84', '#7ac06b', '#60b352', '#46a63a', '#2d9921'],
    values: {
      ON: 88, // Ontario - Very high visitors (Very dark green)
      QC: 74, // Quebec - High visitors (Medium-dark green)
      BC: 81, // British Columbia - High visitors (Dark green)
      AB: 69, // Alberta - Medium-high visitors (Medium green)
      MB: 43, // Manitoba - Low-medium visitors (Light green)
      SK: 37, // Saskatchewan - Low visitors (Very light green)
      NS: 51, // Nova Scotia - Medium visitors (Light-medium green)
      NB: 46, // New Brunswick - Low-medium visitors (Light green)
      NL: 33, // Newfoundland and Labrador - Low visitors (Very light green)
      PE: 28, // Prince Edward Island - Very low visitors (Very light green)
    },
  },
})
```

## Color Scale Configuration

### Understanding Color Scales

The `scale` array defines the color progression from lowest to highest values:

```typescript
scale: ['#ffffff', '#f0f8e8', '#e1f2d3', '#c8e6b8', '#aed99d', '#94cd84', '#7ac06b', '#60b352', '#46a63a', '#2d9921']
//        White    Very Light Green  Light Green  Medium Green  Dark Green  Very Dark Green
//        0-10%    10-20%            20-30%       30-40%        40-50%      50%+
```

### Custom Color Schemes for Analytics

#### Green Performance Scale (Default for Visitor Analytics)

```typescript
scale: ['#ffffff', '#f0f8e8', '#e1f2d3', '#c8e6b8', '#aed99d', '#94cd84', '#7ac06b', '#60b352', '#46a63a', '#2d9921']
```

#### Blue Performance Scale

```typescript
scale: ['#ffffff', '#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2', '#1565c0']
```

#### Orange Performance Scale

```typescript
scale: ['#ffffff', '#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#fb8c00', '#f57c00', '#ef6c00']
```

#### Red Performance Scale

```typescript
scale: ['#ffffff', '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828']
```

## Visitor Data Value Configuration

### Value Ranges for Analytics

Values should typically be between 0-100, representing visitor percentages or engagement scores:

```typescript
values: {
  // 90-100: Very High Visitors (Darkest green)
  NY: 94,
  DE: 91,

  // 80-89: High Visitors (Dark green)
  US: 87,
  IN: 84,

  // 70-79: Medium-High Visitors (Medium-dark green)
  TX: 76,
  GB: 73,

  // 60-69: Medium Visitors (Medium green)
  FR: 68,
  GA: 67,

  // 50-59: Medium-Low Visitors (Medium-light green)
  CA: 56,
  ES: 54,

  // 40-49: Low Visitors (Light green)
  AU: 42,
  SE: 48,

  // 30-39: Very Low Visitors (Very light green)
  BR: 35,
  NO: 39,

  // 0-29: Minimal Visitors (White/very light green)
  CN: 29,
  PE: 28,
}
```

### Data Normalization for Real Analytics

For real-world visitor data, you may need to normalize values:

```typescript
// Raw visitor data
const rawVisitorData = {
  US: 1500000, // 1.5M visitors
  DE: 1200000, // 1.2M visitors
  GB: 800000,  // 800K visitors
  // ... more countries
}

// Normalize to 0-100 scale
const maxVisitors = Math.max(...Object.values(rawVisitorData))
const normalizedVisitors = Object.fromEntries(
  Object.entries(rawVisitorData).map(([country, visitors]) => [
    country,
    Math.round((visitors / maxVisitors) * 100)
  ])
)

// Use normalized data in visitor heatmap
visualizeData: {
  scale: ['#ffffff', '#f0f8e8', '#e1f2d3', '#c8e6b8', '#aed99d', '#94cd84', '#7ac06b', '#60b352', '#46a63a', '#2d9921'],
  values: normalizedVisitors,
}
```

## Advanced Configuration

### Custom Region Styling for Analytics

```typescript
const visitorHeatmap = new VectorMap({
  selector: '#visitor-heatmap',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#f0f8e8', '#e1f2d3', '#c8e6b8', '#aed99d', '#94cd84', '#7ac06b', '#60b352', '#46a63a', '#2d9921'],
    values: visitorData,
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

### Interactive Analytics Features

```typescript
const visitorHeatmap = new VectorMap({
  selector: '#visitor-heatmap',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#f0f8e8', '#e1f2d3', '#c8e6b8', '#aed99d', '#94cd84', '#7ac06b', '#60b352', '#46a63a', '#2d9921'],
    values: visitorData,
  },
  // Interactive analytics features
  zoomOnScroll: true, // Enable mouse wheel zoom
  zoomButtons: true, // Show zoom in/out buttons
  regionsSelectable: true, // Allow region selection for drill-down
  regionsSelectableOne: false, // Allow multiple region comparisons
  panOnDrag: true, // Enable panning for exploration
  zoomMax: 8, // Maximum zoom level for detail view
  zoomMin: 1, // Minimum zoom level for overview
})
```

## Live Demo

Below is a live demo of the analytics heatmap functionality. Use the dropdown to switch between different maps and see how visitor data is visualized:

<AnalyticsDemo />

::: tip
**Interactive Analytics Features:**

- **Hover** over regions to see visitor counts and percentages
- **Click** to select regions for detailed analytics
- **Scroll** to zoom in/out for different detail levels
- **Drag** to pan around the map for exploration
- **Switch maps** to compare visitor patterns across regions
:::

## Analytics Use Cases

### Website & App Analytics

- **Global Traffic**: Visualize website visitors by country/region
- **User Engagement**: Show app usage intensity across geographic areas
- **Conversion Rates**: Map conversion performance by location

### E-commerce Analytics

- **Sales Performance**: Visualize revenue by geographic region
- **Customer Distribution**: Show customer density and activity patterns
- **Market Penetration**: Map market share across territories

### Marketing Analytics

- **Campaign Performance**: Track marketing campaign effectiveness by region
- **Social Media Reach**: Visualize social engagement by location
- **Brand Awareness**: Map brand recognition across different markets

### Business Intelligence

- **Performance Dashboards**: Create executive dashboards with regional KPIs
- **Competitive Analysis**: Compare performance against market benchmarks
- **Growth Opportunities**: Identify underperforming regions with potential

## Best Practices for Analytics Heatmaps

### 1. Color Choice for Data

- Use green scales for positive metrics (visitors, revenue, growth)
- Use red scales for negative metrics (bounce rate, churn, errors)
- Ensure sufficient contrast for data accessibility
- Consider colorblind-friendly palettes for inclusive analytics

### 2. Data Quality & Accuracy

- Normalize data appropriately for fair comparison
- Handle missing data gracefully with neutral colors
- Use consistent time periods for temporal comparisons
- Validate data sources and update frequencies

### 3. User Experience in Analytics

- Provide clear legends explaining data ranges
- Include tooltips with detailed metrics and context
- Enable drill-down capabilities for deeper analysis
- Use appropriate zoom levels for different analysis needs

### 4. Performance Optimization

- Limit the number of regions with data for faster rendering
- Use efficient color calculations for real-time updates
- Optimize for mobile analytics dashboards
- Implement data caching for frequently accessed metrics

## Troubleshooting Analytics Heatmaps

### Common Issues

**Visitor data not displaying correctly:**

- Ensure `visualizeData` configuration matches your data structure
- Check that country/region codes match your analytics data format
- Verify color scale array covers your data range appropriately

**Performance issues with large datasets:**

- Implement data pagination for large visitor datasets
- Use data aggregation for better performance
- Consider server-side data processing for complex analytics

**Inaccurate visitor representation:**

- Verify data normalization is appropriate for your use case
- Check for data quality issues (bots, invalid traffic)
- Ensure consistent data collection periods across regions

### Debug Mode for Analytics

Enable debug mode to troubleshoot analytics visualization issues:

```typescript
const visitorHeatmap = new VectorMap({
  selector: '#visitor-heatmap',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#ffffff', '#f0f8e8', '#e1f2d3', '#c8e6b8', '#aed99d', '#94cd84', '#7ac06b', '#60b352', '#46a63a', '#2d9921'],
    values: visitorData,
  },
  debug: true, // Enable debug mode for analytics troubleshooting
})
```

## Related Analytics Features

- **[Data Visualization](./../features/data-visualization.md)** - Core analytics visualization concepts
- **[Performance Dashboards](./../features/dashboards.md)** - Building comprehensive analytics dashboards
- **[Real-time Analytics](./../features/realtime.md)** - Live data visualization and updates
- **[Geographic Analytics](./../features/geo-analytics.md)** - Advanced geographic data analysis
