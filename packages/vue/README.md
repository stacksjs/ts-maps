# @ts-maps/vue

Vue 3 bindings for [ts-maps](https://github.com/stacksjs/ts-maps): a zero-dependency, TypeScript-native interactive mapping library with vector tiles, 3D, a globe, search, turn-by-turn and offline maps.

## Install

```sh
bun add @ts-maps/vue
```

`vue` (>= 3.4) is a peer dependency. `ts-maps` is a normal dependency. In Nuxt, use [`ts-maps-nuxt`](https://www.npmjs.com/package/ts-maps-nuxt).

## Usage

```vue
<script setup lang="ts">
import { Map, Marker, NavigationControl, Popup } from '@ts-maps/vue'
import { styles } from 'ts-maps'
import '@ts-maps/vue/styles.css'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })
</script>

<template>
  <Map
    :center="[40.758, -73.9855]"
    :zoom="13"
    :style="basemap"
    :container-style="{ height: '480px' }"
    @load-map="(map) => console.log('map ready', map)"
  >
    <NavigationControl position="topright" :options="{ showCompass: true }" />
    <Marker :position="[40.758, -73.9855]" />
    <Popup :position="[40.758, -73.9855]" :options="{ offset: [0, -27] }">
      Times Square
    </Popup>
  </Map>
</template>
```

`center` is `[lat, lng]`. `style` is the map's style (a style object or a URL), not CSS; `container-style` and `container-class` go on the container `<div>`.

## Components

- `<Map>` (also exported as `Map`): creates the `Map` on mount, provides it to its children, and removes it before unmount. Emits the map's events under their core names (`click`, `moveend`, `zoomend`, …), plus `load-map` with the map once it is built.
- `<Marker>`, `<Popup>`, `<TileLayer>`.
- `<Source>`, `<Layer>`: style-spec sources and layers.
- Controls: `<ZoomControl>`, `<NavigationControl>`, `<GeocoderControl>`, `<FullscreenControl>`, `<LocateControl>`, `<ScaleControl>`, `<AttributionControl>`. Their own options go in `options`.
- Apple Maps-style: `<Search>`, `<TurnByTurn>`, `<OfflineMaps>`, `<MapType>`, `<IndoorMap>`, `<LookAround>`, `<Landmark>`, `<Trees>`, with `v-model` where the component changes its own state.
- `<TerritoryLayer>`, `<RunTrailLayer>`.

## Composables

- `useMap()`: a `Ref<Map | null>`; throws outside a `<Map>`.
- `useMapOptional()`: the same, or `null` outside a map.
- `useMapEvent(event, handler)`: subscribe to a map event, by its core name (`'moveend'`, `'style.load'`), for the life of the component.

## Styles

```ts
import '@ts-maps/vue/styles.css'
```

It is the same file as `ts-maps/styles.css`.

## Authoring note

Components ship as `defineComponent` in `.ts` files rather than `.vue` SFCs, so they work with Bun's default loader without an SFC compiler in the toolchain.

See the [Vue guide](https://ts-maps.stacksjs.com/guide/vue) for every component, with examples.

## License

MIT
