<p align="center"><img src="https://github.com/stacksjs/mail-server/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of this repo"></p>

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
npm install @stacksjs/ts-maps
# or
yarn add @stacksjs/ts-maps
# or
pnpm add @stacksjs/ts-maps
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

## Documentation

For detailed documentation, visit our [documentation site](https://ts-maps.dev/).

- [Getting Started](https://ts-maps.dev/intro)
- [Installation](https://ts-maps.dev/install)
- [Basic Usage](https://ts-maps.dev/usage)
- [API Reference](https://ts-maps.dev/api)
- [Examples](https://ts-maps.dev/demo)

## Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/stacksjs/ts-maps/blob/main/CONTRIBUTING.md) for details.

## Community

- [Discussions](https://github.com/stacksjs/ts-maps/discussions)
- [Discord Server](https://discord.gg/stacksjs)

## License

[MIT](./LICENSE.md) License © 2024 [Stacks.js](https://github.com/stacksjs)

## Sponsors

<p align="center">
  <a href="https://github.com/sponsors/stacksjs">
    <img src="https://raw.githubusercontent.com/stacksjs/branding/main/assets/sponsors.svg">
  </a>
</p>

## Credits

- [Chris Breuer](https://github.com/chrisbbreuer)
- [All Contributors](../../contributors)

Made with 💙

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@stacksjs/ts-maps?style=flat-square
[npm-version-href]: https://npmjs.com/package/@stacksjs/ts-maps
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/ts-maps/ci.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/stacksjs/ts-maps/actions?query=workflow%3Aci

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/ts-maps/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/ts-maps -->
