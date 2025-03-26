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

## Advanced Options

```typescript
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  visualizeData: {
    scale: ['#fee5d9', '#a50f15'],
    values: {
      US: 100,
      CN: 85,
      RU: 70,
      BR: 60,
    },
    scaleColors: ['#fee5d9', '#a50f15'],
    normalizeFunction: 'linear', // or 'polynomial'
  },
})
```
