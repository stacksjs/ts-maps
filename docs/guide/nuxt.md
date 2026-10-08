# Nuxt

`ts-maps-nuxt` is a Nuxt module. It registers the [Vue bindings](./vue.md)'
components under a prefix, auto-imports `useMap` and `useMapEvent`, and adds
the stylesheet. Everything on the Vue page applies here; only the names
change.

## Install

::: code-group

```sh [bun]
bun add ts-maps-nuxt
```

```sh [npm]
npm install ts-maps-nuxt
```

```sh [pnpm]
pnpm add ts-maps-nuxt
```

:::

`@ts-maps/vue` and `ts-maps` come with it. It needs Nuxt 3.12 or later.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['ts-maps-nuxt'],
})
```

## Module options

```ts
export default defineNuxtConfig({
  modules: ['ts-maps-nuxt'],
  tsMaps: {
    prefix: 'TsMaps',
    css: true,
  },
})
```

| Option | Default | What it does |
|---|---|---|
| `prefix` | `'TsMaps'` | Put in front of every component name: `<TsMapsMap>`, `<TsMapsMarker>` |
| `css` | `true` | Add the ts-maps stylesheet to the app's CSS |

With `css: false`, import `ts-maps/styles.css` yourself.

## A first map

```vue
<script setup lang="ts">
import { styles } from 'ts-maps'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })
</script>

<template>
  <ClientOnly>
    <TsMapsMap
      :center="[40.758, -73.9855]"
      :zoom="13"
      :style="basemap"
      :container-style="{ height: '480px' }"
    >
      <TsMapsMarker :position="[40.758, -73.9855]" />
      <TsMapsPopup :position="[40.758, -73.9855]" :options="{ offset: [0, -27] }">
        Times Square
      </TsMapsPopup>
    </TsMapsMap>
    <template #fallback>
      <div style="height: 480px" />
    </template>
  </ClientOnly>
</template>
```

`styles` is not auto-imported; import it from `ts-maps`. `center` is
`[lat, lng]`. `style` is the map's style, and `container-style` styles the
container; see [Vue](./vue.md#a-first-map).

## Components

Every component of `@ts-maps/vue`, with the prefix:

| Group | Components |
|---|---|
| The map | `TsMapsMap` |
| Markers and data | `TsMapsMarker`, `TsMapsPopup`, `TsMapsTileLayer`, `TsMapsSource`, `TsMapsLayer` |
| Controls | `TsMapsZoomControl`, `TsMapsNavigationControl`, `TsMapsGeocoderControl`, `TsMapsFullscreenControl`, `TsMapsLocateControl`, `TsMapsScaleControl`, `TsMapsAttributionControl` |
| Apple Maps-style | `TsMapsSearch`, `TsMapsTurnByTurn`, `TsMapsOfflineMaps`, `TsMapsMapType`, `TsMapsIndoorMap`, `TsMapsLookAround`, `TsMapsLandmark`, `TsMapsTrees` |
| Territories | `TsMapsTerritoryLayer`, `TsMapsRunTrailLayer` |

Props, events and `v-model` are the Vue components' own. For example:

```vue
<script setup lang="ts">
import type { TurnByTurn } from 'ts-maps'
import { styles } from 'ts-maps'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })
const nav = shallowRef<TurnByTurn>()
const showOffline = ref(false)
</script>

<template>
  <ClientOnly>
    <TsMapsMap :center="[37.7955, -122.3937]" :zoom="15" :style="basemap" :container-style="{ height: '600px' }">
      <TsMapsNavigationControl position="topright" :options="{ showCompass: true }" />
      <TsMapsTurnByTurn @ready="nav = $event" />
      <TsMapsSearch :turn-by-turn="nav" @select="({ place }) => console.log(place.name)" />
      <TsMapsOfflineMaps v-model:open="showOffline" />
    </TsMapsMap>
  </ClientOnly>
</template>
```

`ref` and `shallowRef` are Nuxt's own auto-imports.

## Your own data

Sources and layers go straight inside the map, as on the
[Vue page](./vue.md#your-own-data). With `basemap` and `stations` as there:

```vue
<template>
  <ClientOnly>
    <TsMapsMap :center="[40.754, -73.982]" :zoom="14" :style="basemap" :container-style="{ height: '480px' }">
      <TsMapsSource id="stations" :source="{ type: 'geojson', data: stations }" />
      <TsMapsLayer :layer="{ id: 'stations', type: 'circle', source: 'stations', paint: { 'circle-radius': 7 } }" />
    </TsMapsMap>
  </ClientOnly>
</template>
```

## Composables

`useMap()` and `useMapEvent()` are auto-imported. Call them in a component
inside `<TsMapsMap>`:

```vue
<!-- components/CameraLog.vue -->
<script setup lang="ts">
const map = useMap()
useMapEvent('moveend', () => console.log(map.value?.getCenter()))
</script>

<template>
  <span />
</template>
```

`useMapOptional` and `mapKey` are not auto-imported; import them from
`@ts-maps/vue`. A template ref on `<TsMapsMap>` exposes `map`, and
`@load-map` hands it over, as in [Vue](./vue.md#reaching-the-map).

## Server rendering

The map is built in `onMounted`, so the server renders an empty container and
none of the map's children. `<ClientOnly>` keeps the whole map out of the
server render, and its `#fallback` slot holds the space while the page
hydrates. Give the fallback the map's height, so the page does not jump.
