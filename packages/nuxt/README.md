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
<template>
  <ClientOnly>
    <TsMapsMap :center="[40.758, -73.9855]" :zoom="13" style="height: 500px">
      <TsMapsMarker :position="[40.758, -73.9855]">
        <TsMapsPopup>Hello from ts-maps</TsMapsPopup>
      </TsMapsMarker>
    </TsMapsMap>
  </ClientOnly>
</template>
```

Every component from `@ts-maps/vue` is available with the prefix: `<TsMapsMap>`, `<TsMapsTileLayer>`, `<TsMapsMarker>`, `<TsMapsPopup>`, `<TsMapsSource>`, `<TsMapsLayer>`, `<TsMapsSearch>`, `<TsMapsTurnByTurn>`, `<TsMapsOfflineMaps>` and the rest.

See the [Nuxt guide](https://ts-maps.stacksjs.com/guide/nuxt) for more.

## License

MIT
