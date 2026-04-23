# Getting started

Install ts-maps, render an OpenStreetMap basemap, and drop a marker with a popup.

## Install

ts-maps ships as a single ESM module with a small required stylesheet. There are no runtime dependencies.

::: code-group

```sh [bun]
bun add ts-maps
```

```sh [npm]
npm install ts-maps
```

```sh [pnpm]
pnpm add ts-maps
```

```sh [yarn]
yarn add ts-maps
```

:::

## Set up the container

Every map needs a sized `<div>` host and the ts-maps base stylesheet.

```html
<link rel="stylesheet" href="/node_modules/ts-maps/dist/ts-maps.css">

<div id="map" style="width: 100%; height: 560px;"></div>
```

## Create the map

`TsMap` is the root class. Give it a container id or element and a camera spec (center, zoom, optionally bearing and pitch).

```ts
import { TsMap, tileLayer, Marker } from 'ts-maps'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 13,
  minZoom: 2,
  maxZoom: 19,
})
```

## Add a basemap

The `tileLayer` factory returns a `TileLayer` that fetches standard XYZ raster tiles. This example uses OpenStreetMap tiles (please follow their [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) in production).

```ts
tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map)
```

## Add a marker and popup

```ts
const marker = new Marker([40.758, -73.9855], { draggable: true })
  .addTo(map)
  .bindPopup('<b>Times Square</b><br>Hello from ts-maps')
marker.openPopup()
```

## Try it

The [Basic map example](./examples/01-basic-map.md) wires this walkthrough end-to-end. Copy the source out of that page to adapt for your project.

## Next steps

- [TsMap class](./concepts/map.md) — camera model, events, lifecycle.
- [Layer taxonomy](./concepts/layers.md) — which layer to pick for which job.
- [Style spec](./concepts/style-spec.md) — data-driven layer styling with expressions.
- [Examples gallery](./examples/index.md) — 12 runnable demos.
