# @ts-maps/vue

Vue 3 bindings for [ts-maps](https://github.com/stacksjs/ts-maps) — a zero-dependency TypeScript library for interactive SVG-based vector maps.

## Install

```sh
bun add @ts-maps/vue ts-maps vue
```

`vue` (>= 3.4) is a peer dependency. `ts-maps` is a normal dependency.

## Usage

```vue
<script setup lang="ts">
import { Map, Marker, Popup, TileLayer } from '@ts-maps/vue'
import '@ts-maps/vue/styles.css'
</script>

<template>
  <Map
    :container-style="{ width: '100%', height: '480px' }"
    :center="[51.505, -0.09]"
    :zoom="13"
    @load-map="(map) => console.log('map ready', map)"
  >
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <Marker :position="[51.505, -0.09]" />
    <Popup :position="[51.505, -0.09]" content="Hello!" />
  </Map>
</template>
```

## Components

- `<Map>` / `<TsMap>` — root component. Creates the `TsMap` on `onMounted`, provides it via `inject`, and cleans up on `onUnmounted`. Emits core events (`click`, `move`, `style-load`, …) plus `load-map` with the map instance when it is created.
- `<Marker>`, `<Popup>`, `<TileLayer>` — register legacy layers.
- `<Source>`, `<Layer>` — register style-spec sources and layers (Mapbox-style).

## Composables

- `useMap()` — returns a `Ref<TsMap | null>`; throws outside of `<Map>`.
- `useMapOptional()` — same, but returns `null` outside a map.
- `useMapEvent(event, handler)` — subscribe to a `TsMap` event for the lifetime of the caller.

## Styles

```ts
import '@ts-maps/vue/styles.css'
```

Or directly from `ts-maps`:

```ts
import 'ts-maps/styles.css'
```

## Authoring note

Components ship as `defineComponent` in `.ts` files rather than `.vue` SFCs so they work with Bun's default loader without an SFC compiler in the toolchain. The public API and behavior are unchanged.

## License

MIT
