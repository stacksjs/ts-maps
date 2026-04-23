# Nuxt

`ts-maps-nuxt` is a Nuxt 3 module that auto-imports the Vue bindings and
injects the required CSS.

## Installation

::: code-group

```sh [npm]
npm install ts-maps-nuxt
```

```sh [pnpm]
pnpm add ts-maps-nuxt
```

```sh [bun]
bun add ts-maps-nuxt
```

:::

## Configuration

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['ts-maps-nuxt'],

  tsMaps: {
    prefix: 'TsMaps', // default
  },
})
```

## Auto-imported components

- `<TsMapsMap>` — root map.
- `<TsMapsTileLayer>`
- `<TsMapsMarker>`, `<TsMapsPopup>`
- `<TsMapsSource>`, `<TsMapsLayer>`

## Basic usage

```vue
<template>
  <ClientOnly>
    <TsMapsMap :center="[40.758, -73.9855]" :zoom="13" style="height: 500px">
      <TsMapsTileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <TsMapsMarker :position="[40.758, -73.9855]">
        <TsMapsPopup>Hello from ts-maps</TsMapsPopup>
      </TsMapsMarker>
    </TsMapsMap>
    <template #fallback>
      <div class="h-[500px] rounded-lg bg-gray-100 animate-pulse" />
    </template>
  </ClientOnly>
</template>
```

## Vector tiles

```vue
<template>
  <ClientOnly>
    <TsMapsMap :center="[51.5, -0.12]" :zoom="6" style="height: 500px">
      <TsMapsSource
        id="osm-tiles"
        type="vector"
        :tiles="['https://tiles.example.com/{z}/{x}/{y}.pbf']"
      />
      <TsMapsLayer
        id="water"
        type="fill"
        source="osm-tiles"
        source-layer="water"
        :paint="{ 'fill-color': '#0ea5e9' }"
      />
    </TsMapsMap>
  </ClientOnly>
</template>
```

## Module options

| Option   | Type     | Default    | Description                      |
| -------- | -------- | ---------- | -------------------------------- |
| `prefix` | `string` | `'TsMaps'` | Component-name prefix.           |
| `css`    | `boolean`| `true`     | Auto-inject the ts-maps.css file.|

## Next steps

- [Vue bindings](/guide/vue)
- [Getting started](/guide/getting-started)
