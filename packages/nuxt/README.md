# ts-maps-nuxt

A Nuxt 3 module for [ts-maps](https://github.com/stacksjs/ts-maps): it auto-imports the [Vue bindings](https://www.npmjs.com/package/@ts-maps/vue) and adds the stylesheet.

## Install

```sh
bun add ts-maps-nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['ts-maps-nuxt'],

  tsMaps: {
    prefix: 'TsMaps', // default
  },
})
```

## Usage

```vue
<script setup lang="ts">
import { styles } from 'ts-maps'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })
</script>

<template>
  <ClientOnly>
    <TsMapsMap :center="[40.758, -73.9855]" :zoom="13" :style="basemap" :container-style="{ height: '480px' }">
      <TsMapsMarker :position="[40.758, -73.9855]" />
      <TsMapsPopup :position="[40.758, -73.9855]" :options="{ offset: [0, -27] }">
        Times Square
      </TsMapsPopup>
    </TsMapsMap>
  </ClientOnly>
</template>
```

`style` is the map's style, not CSS; size the container with `container-style`.

Every component from `@ts-maps/vue` is available with the prefix: `<TsMapsMap>`, `<TsMapsTileLayer>`, `<TsMapsMarker>`, `<TsMapsPopup>`, `<TsMapsSource>`, `<TsMapsLayer>`, the controls (`<TsMapsNavigationControl>` and the rest), `<TsMapsSearch>`, `<TsMapsTurnByTurn>`, `<TsMapsOfflineMaps>`, `<TsMapsMapType>`, `<TsMapsIndoorMap>`, `<TsMapsLookAround>`, `<TsMapsLandmark>`, `<TsMapsTrees>`, `<TsMapsTerritoryLayer>` and `<TsMapsRunTrailLayer>`. `useMap()` and `useMapEvent()` are auto-imported.

Set `tsMaps: { css: false }` to add the stylesheet yourself.

See the [Nuxt guide](https://ts-maps.stacksjs.com/guide/nuxt) for more.

## License

MIT
