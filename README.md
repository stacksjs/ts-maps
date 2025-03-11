<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of this repo"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
<!-- [![npm downloads][npm-downloads-src]][npm-downloads-href] -->
<!-- [![Codecov][codecov-src]][codecov-href] -->

# ts-maps

> Beautiful Vector Maps Made Simple

A modern & lightweight TypeScript library for creating interactive vector maps. Perfect for data visualization, geographic analysis, and interactive mapping applications.

## Features

- 🗺️ **Vector Maps** - Create interactive vector maps with custom projections and SVG rendering
- 📊 **Data Visualization** - Powerful tools for visualizing geographical data with customizable legends and scales
- ⚛️ **Framework Support** - Seamless integration with React and Vue through dedicated bindings
- 🛡️ **Type Safety** - Built with TypeScript for robust type checking and excellent developer experience
- 🎯 **Event Handling** - Rich event system for interactive maps with full TypeScript support
- 🎨 **Customization** - Extensive styling options with CSS-in-TS and theme support
- 🚀 **Performance** - Optimized for smooth interactions and efficient rendering
- 📦 **Zero Dependencies** - Lightweight and self-contained

## Install

```bash
# Using npm
npm install @stacksjs/ts-maps

# Using yarn
yarn add @stacksjs/ts-maps

# Using pnpm
pnpm add @stacksjs/ts-maps

# Using bun
bun add @stacksjs/ts-maps
```

## Quick Start

```typescript
import { VectorMap } from '@stacksjs/ts-maps'

// Create a basic world map
const worldMap = new VectorMap({
  container: 'map-container',
  map: 'world',
  theme: 'light',
  style: {
    regions: {
      default: {
        fill: '#e8e8e8',
        stroke: '#fff',
      },
      hover: {
        fill: '#2ca25f',
      },
    },
  },
})

// Add interactivity
worldMap.on('regionClick', (event, region) => {
  console.log(`Clicked: ${region.properties.name}`)
})
```

## Data Visualization Example

```typescript
import { Series, VectorMap } from '@stacksjs/ts-maps'

// Create a choropleth map
const map = new VectorMap({
  container: 'map-container',
  map: 'world',
})

// Add data series
const series = new Series({
  name: 'Population Density',
  data: [
    { id: 'US', value: 36 },
    { id: 'CN', value: 153 },
    { id: 'IN', value: 464 },
    // ... more data
  ],
  scale: {
    type: 'logarithmic',
    colors: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'],
  },
})

map.addSeries(series)
```

## API Reference

### VectorMap

The main class for creating and managing vector maps.

```typescript
interface VectorMapOptions {
  container: string | HTMLElement;  // Container element or ID
  map: string;                     // Map type ('world', 'usa', etc.)
  theme?: 'light' | 'dark';        // Map theme
  backgroundColor?: string;        // Background color
  zoomOnScroll?: boolean;         // Enable zoom on scroll
  zoomMax?: number;               // Maximum zoom level
  zoomMin?: number;               // Minimum zoom level
  projection?: 'mercator' | 'miller'; // Map projection type
  style?: {                       // Map styling options
    regions?: {
      default?: RegionStyle;      // Default region style
      hover?: RegionStyle;        // Hover state style
      selected?: RegionStyle;     // Selected state style
    };
  };
}

interface RegionStyle {
  fill?: string;                  // Fill color
  stroke?: string;                // Stroke color
  strokeWidth?: number;           // Stroke width
  cursor?: string;                // Cursor style
}

// Methods
map.addMarkers(markers: Marker[]);              // Add markers to the map
map.removeMarkers();                            // Remove all markers
map.addSeries(series: Series);                  // Add data series
map.removeSeries();                             // Remove all series
map.addLines(lines: Line[]);                    // Add connection lines
map.removeLines();                              // Remove all lines
map.setZoom(scale: number);                     // Set zoom level
map.getSelectedRegions(): string[];             // Get selected region codes
map.clearSelectedRegions();                     // Clear region selection
map.destroy();                                  // Clean up resources
```

### Series

Class for creating data visualizations on the map.

```typescript
interface SeriesOptions {
  name: string // Series name
  data: Record<string, number> | Array<{ id: string, value: number }>
  scale?: {
    type: 'linear' | 'logarithmic'
    colors: string[] // Color scale
    min?: number // Minimum value
    max?: number // Maximum value
    steps?: number // Number of color steps
  }
  normalizeFunction?: 'linear' | 'polynomial'
  legend?: {
    title?: string
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  }
}
```

### Events

Available events that can be listened to:

```typescript
// Region events
map.on('regionClick', (event: MouseEvent, code: string) => void);
map.on('regionHover', (event: MouseEvent, code: string) => void);
map.on('regionSelected', (event: MouseEvent, code: string) => void);

// Marker events
map.on('markerClick', (event: MouseEvent, index: number) => void);
map.on('markerHover', (event: MouseEvent, index: number) => void);

// Map events
map.on('zoom', (scale: number) => void);
map.on('pan', (x: number, y: number) => void);
```

### Markers

Interface for adding markers to the map:

```typescript
interface Marker {
  coords: [number, number] // Latitude and longitude
  name?: string // Marker name
  style?: {
    fill?: string // Marker fill color
    stroke?: string // Marker stroke color
    strokeWidth?: number // Marker stroke width
    r?: number // Marker radius
  }
  hover?: {
    fill?: string // Hover fill color
    r?: number // Hover radius
  }
}
```

### Lines

Interface for adding connection lines:

```typescript
interface Line {
  from: [number, number] // Starting coordinates
  to: [number, number] // Ending coordinates
  style?: {
    stroke?: string // Line color
    strokeWidth?: number // Line width
    dashArray?: string // Dash pattern
    animation?: boolean // Enable animation
    animationSpeed?: number // Animation speed
  }
}
```

For more detailed documentation and examples, visit our [documentation site](https://ts-maps.netlify.sh/).

## Changelog

Please see our [releases](https://github.com/stackjs/ts-maps/releases) page for more information on what has changed recently.

## Contributing

Please see [CONTRIBUTING](.github/CONTRIBUTING.md) for details.

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/ts-maps/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://discord.gg/stacksjs)

## Postcardware

"Software that is free, but hopes for a postcard." We love receiving postcards from around the world showing where `ts-maps` is being used! We showcase them on our website too.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States 🌎

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## Credit

Many thanks for the libraries that laid the groundwork:

- **countries**: <https://github.com/rinvex/countries>

## License

The MIT License (MIT). Please see [LICENSE](LICENSE.md) for more information.

Made with 💙

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@stacksjs/ts-maps?style=flat-square
[npm-version-href]: https://npmjs.com/package/@stacksjs/ts-maps
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/ts-maps/ci.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/stacksjs/ts-maps/actions?query=workflow%3Aci

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/ts-maps/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/ts-maps -->
