# Interactive Playground

Welcome to the ts-maps playground! Here you can explore various examples and learn how to use different features of the library. Each example comes with live code that you can modify and experiment with.

## Basic Examples

### Simple World Map

The most basic implementation of ts-maps showing a world map with default settings.

```typescript
import { VectorMap } from '@stacksjs/ts-maps'

const map = new VectorMap({
  container: 'map',
  map: 'world'
})
```

::: details View Full Example

```html
<!-- basic.html -->
<div id="map" style="width: 800px; height: 500px;"></div>
<script type="module">
  import { VectorMap } from '@stacksjs/ts-maps'

  new VectorMap({
    container: 'map',
    map: 'world',
    backgroundColor: '#fff',
    zoomOnScroll: true
  })
</script>
```

:::

### Pretty Styling

Example of a beautifully styled map with custom colors and hover effects.

```typescript
const map = new VectorMap({
  container: 'map',
  map: 'world',
  style: {
    regions: {
      initial: {
        fill: '#e4e6ef',
        stroke: '#ffffff',
        strokeWidth: 1
      },
      hover: {
        fill: '#3699ff',
        cursor: 'pointer'
      }
    }
  }
})
```

## Interactive Features

### Event Handling

Demonstration of various map events and how to handle them.

```typescript
const map = new VectorMap({
  container: 'map',
  map: 'world'
})

map.on('regionClick', (event, code) => {
  console.log(`Clicked region: ${code}`)
})

map.on('regionHover', (event, code) => {
  // Custom tooltip content
})

map.on('zoom', (scale) => {
  console.log(`Map zoomed to scale: ${scale}`)
})
```

### Markers

Adding interactive markers to your map.

```typescript
const map = new VectorMap({
  container: 'map',
  map: 'world'
})

map.addMarkers([
  {
    coords: [40.7128, -74.0060],
    name: 'New York',
    style: {
      fill: '#ff5733',
      stroke: '#ffffff',
      strokeWidth: 2
    }
  },
  {
    coords: [51.5074, -0.1278],
    name: 'London',
    style: {
      fill: '#33ff57'
    }
  }
])
```

## Data Visualization

### Series Data

Example of adding data series for choropleth maps.

```typescript
const map = new VectorMap({
  container: 'map',
  map: 'world'
})

const series = new Series({
  data: {
    US: 100,
    GB: 75,
    FR: 80,
    DE: 85,
    IT: 70
  },
  scale: ['#C8EEFF', '#0071A4'],
  normalizeFunction: 'polynomial'
})

map.addSeries(series)
```

### Lines and Connections

Drawing lines between points on the map.

```typescript
map.addLines([
  {
    from: [40.7128, -74.0060], // New York
    to: [51.5074, -0.1278], // London
    style: {
      stroke: '#3699ff',
      strokeWidth: 2,
      dashArray: '5,5'
    }
  }
])
```

## Advanced Usage

### Custom Projections

Example of using different map projections.

```typescript
const map = new VectorMap({
  container: 'map',
  map: 'world',
  projection: 'mercator', // or 'miller'
  backgroundColor: '#4444'
})
```

### Advanced Markers

Complex marker implementation with custom styling and events.

```typescript
const markers = {
  cities: [
    { latLng: [40.7128, -74.0060], name: 'New York' },
    { latLng: [51.5074, -0.1278], name: 'London' },
    { latLng: [35.6762, 139.6503], name: 'Tokyo' }
  ],
  style: {
    initial: {
      fill: '#ff5733',
      stroke: '#ffffff',
      r: 5
    },
    hover: {
      fill: '#33ff57',
      r: 8
    }
  },
  onMarkerClick(event, index) {
    console.log(`Clicked marker: ${this.cities[index].name}`)
  }
}

map.addMarkers(markers)
```

## Running the Playground

To run these examples locally:

1. Clone the repository:

```bash
git clone https://github.com/stacksjs/ts-maps.git
cd ts-maps
```

2. Install dependencies:

```bash
npm install
```

3. Start the playground server:

```bash
npm run playground
```

4. Open your browser and navigate to `http://localhost:5173`

## Playground Structure

The playground includes several example files:

- `basic.html` - Basic map implementation
- `pretty.html` - Styled map example
- `events.html` - Event handling demonstrations
- `markers.html` - Marker usage examples
- `series.html` - Data visualization with series
- `lines.html` - Line drawing examples
- `advanced.html` - Advanced usage scenarios
- `addmarkers.html` - Dynamic marker manipulation

Each example file is self-contained and includes all necessary code to run the demonstration. Feel free to modify these examples and experiment with different configurations!
