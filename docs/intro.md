<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of this repo"></p>

# Introduction to ts-maps

> A powerful TypeScript library for creating beautiful, interactive vector maps with advanced data visualization capabilities.

## Key Features

- **Advanced Vector Mapping**
  - Interactive SVG-based maps with smooth rendering
  - Multiple projection support (Mercator & Miller)
  - Responsive and scalable design
  - Built-in map collections
  - Custom region styling and interactions

- **Rich Data Visualization**
  - Comprehensive visualization options
  - Dynamic data binding
  - Custom scales and legends
  - Multiple series support
  - Marker and region-based visualizations

- **Interactive Features**
  - Smooth zooming and panning
  - Region and marker selection
  - Custom tooltips
  - Event-driven architecture
  - Touch device support

- **Developer Experience**
  - Framework-agnostic core library
  - TypeScript-first development
  - Comprehensive documentation
  - Flexible configuration

## Basic Usage

```typescript
import { VectorMap } from 'ts-maps'

// Initialize the map
const map = new VectorMap({
  selector: '#map',
  map: {
    name: 'world',
    projection: 'mercator'
  },
  backgroundColor: '#4a4a4a',
  zoomOnScroll: true,
  zoomButtons: true,
  // Customize region appearance
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
  },
})

// Add data visualization
map.params.visualizeData = {
  scale: ['#C8EEFF', '#0071A4'],
  values: {
    US: 100,
    GB: 75,
    FR: 80,
    DE: 85,
    IT: 60,
    ES: 65,
  },
}

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
])

// Handle interactions
map.params.onRegionClick = (event, code) => {
  console.log(`Clicked region: ${code}`)
}
```

## Advanced Features

### Custom Styling

```typescript
// Apply custom styles to regions
map.params.regionStyle = {
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
}

// Style markers
map.params.markerStyle = {
  initial: {
    fill: '#ff0000',
    stroke: '#ffffff',
    r: 5,
  },
  hover: {
    fill: '#ff5555',
    r: 7,
  },
}
```

### Event Handling

```typescript
// Region events
map.params.onRegionClick = (event, code) => {
  console.log(`Clicked region: ${code}`)
}

map.params.onRegionSelected = (event, code, isSelected, selectedRegions) => {
  console.log(`Region ${code} selection state: ${isSelected}`)
  console.log('Currently selected regions:', selectedRegions)
}

// Marker events
map.params.onMarkerClick = (event, index) => {
  console.log(`Clicked marker: ${index}`)
}

// Viewport events
map.params.onViewportChange = (scale, transX, transY) => {
  console.log(`Map viewport changed: scale=${scale}, x=${transX}, y=${transY}`)
}
```

## Next Steps

- Check out the [Installation Guide](/install) for setup instructions
- Explore the [API Reference](/api/) for detailed documentation

## Community

Join our community to get help, share your work, and connect with other developers:

- [GitHub Discussions](https://github.com/stacksjs/ts-maps/discussions)
- [Discord Community](https://discord.gg/stacksjs)

## License

ts-maps is released under the MIT License. See the [LICENSE](https://github.com/stacksjs/ts-maps/blob/main/LICENSE.md) file for more details.

Made with 💙

<!-- Badges -->

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/mail-server/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/mail-server -->
