# Vue

`@ts-maps/vue` ships first-class Vue 3 bindings for `TsMap`.

## Installation

::: code-group

```sh [npm]
npm install ts-maps @ts-maps/vue
```

```sh [pnpm]
pnpm add ts-maps @ts-maps/vue
```

```sh [bun]
bun add ts-maps @ts-maps/vue
```

:::

## Components

- `<Map>` — root map instance; forwards standard `TsMap` options.
- `<TileLayer>` — raster tile source.
- `<Source>` / `<Layer>` — style-spec sources and layers.
- `<Marker>` — marker with optional `<Popup>` child.
- `<Popup>` — standalone popup.

## Basic usage

```vue
<script setup lang="ts">
import { Map, Marker, Popup, TileLayer } from '@ts-maps/vue'
import 'ts-maps/styles.css'
</script>

<template>
  <Map :center="[40.758, -73.9855]" :zoom="13" style="height: 500px">
    <TileLayer
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution="&copy; OpenStreetMap contributors"
    />
    <Marker :position="[40.758, -73.9855]">
      <Popup>Hello from ts-maps</Popup>
    </Marker>
  </Map>
</template>
```

## Vector tiles

```vue
<script setup lang="ts">
import { Layer, Map, Source } from '@ts-maps/vue'
</script>

<template>
  <Map :center="[51.5, -0.12]" :zoom="6" style="height: 500px">
    <Source id="osm-tiles" type="vector" :tiles="['https://tiles.example.com/{z}/{x}/{y}.pbf']" />
    <Layer
      id="water"
      type="fill"
      source="osm-tiles"
      source-layer="water"
      :paint="{ 'fill-color': '#0ea5e9' }"
    />
    <Layer
      id="roads"
      type="line"
      source="osm-tiles"
      source-layer="transportation"
      :paint="{
        'line-color': '#6b7280',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 3],
      }"
    />
  </Map>
</template>
```

## Composables

```ts
import { useMap, useMapEvent } from '@ts-maps/vue'
```

- `useMap()` — returns the current `TsMap` instance from inside a child
  component.
- `useMapEvent(name, handler)` — subscribe to any `TsMap` event with
  automatic teardown on unmount.

```vue
<script setup lang="ts">
import { useMap, useMapEvent } from '@ts-maps/vue'

const map = useMap()

useMapEvent('moveend', () => {
  console.log('center', map.value?.getCenter())
})
</script>
```

## Accessing the map instance

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Map } from '@ts-maps/vue'
import type { TsMap } from 'ts-maps'

const mapRef = ref<{ map: TsMap } | null>(null)

onMounted(() => {
  const map = mapRef.value?.map
  map?.flyTo({ center: [51.5, -0.12], zoom: 10 })
})
</script>

<template>
  <Map ref="mapRef" :center="[40, 0]" :zoom="2" />
</template>
```

## Next steps

- [React](/guide/react)
- [Nuxt](/guide/nuxt)
