<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of this repo"></p>

# Introduction to ts-maps

> Modern & lightweight Typescript library. Easily create pretty & interactive vector maps.

## Features

- **Vector Maps**
  - Interactive SVG-based maps
  - Custom projections support
  - Responsive and scalable design
  - Built-in map collections

- **Data Visualization**
  - Choropleth maps
  - Heat maps
  - Data markers and bubbles
  - Custom legends and scales

- **Framework Integration**
  - React components and hooks
  - Vue components and composables
  - Framework-agnostic core library

- **Developer Experience**
  - Full TypeScript support
  - Type-safe APIs
  - Comprehensive documentation
  - Zero dependencies

## Quick Example

```typescript
import { VectorMap } from '@stacksjs/ts-maps'

// Create a new map instance
const map = new VectorMap({
  container: 'map',
  map: 'world',
  theme: 'light',
})

// Add data visualization
map.choropleth({
  data: [
    { id: 'US', value: 100 },
    { id: 'CA', value: 80 },
    // ... more data
  ],
  scale: {
    min: 0,
    max: 100,
    colors: ['#e5f5f9', '#2ca25f'],
  },
})

// Add interactivity
map.on('regionClick', (event, region) => {
  console.log(`Clicked region: ${region.id}`)
})
```

## Framework Examples

### React

```tsx
import { useVectorMap } from '@stacksjs/ts-maps-react'

function WorldMap() {
  const { map, isLoading } = useVectorMap({
    map: 'world',
    theme: 'light',
  })

  return (
    <div>
      {isLoading
        ? (
            <div>Loading map...</div>
          )
        : (
            <div id="map" style={{ width: '100%', height: '400px' }} />
          )}
    </div>
  )
}
```

### Vue

```vue
<script setup lang="ts">
import { useVectorMap } from '@stacksjs/ts-maps-vue'

const { map, isLoading } = useVectorMap({
  map: 'world',
  theme: 'light',
})
</script>

<template>
  <div>
    <div v-if="isLoading">
      Loading map...
    </div>
    <div v-else id="map" style="width: 100%; height: 400px;" />
  </div>
</template>
```

## Next Steps

- Check out the [Installation Guide](/install) to get started
- Explore the [Usage Guide](/usage) for more examples
- View the [API Reference](/api) for detailed documentation

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/ts-maps/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://discord.gg/stacksjs)

## License

The MIT License (MIT). Please see [LICENSE](https://github.com/stacksjs/ts-maps/blob/main/LICENSE.md) for more information.

Made with 💙

<!-- Badges -->

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/mail-server/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/mail-server -->
