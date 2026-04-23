# Usage guide

`ts-maps` is an interactive, zero-dependency vector mapping library. This
guide covers the basic usage patterns.

## Quick start

```ts
import 'ts-maps/styles.css'
import { Marker, tileLayer, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 13,
  bearing: 0,
  pitch: 0,
})

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

new Marker([40.758, -73.9855]).addTo(map).bindPopup('Hi').openPopup()
```

## Concept guides

- [Map](./concepts/map.md) — `TsMap`, camera API, events.
- [Layers](./concepts/layers.md) — tile, vector, overlay.
- [Vector tiles](./concepts/vector-tiles.md) — MVT + style spec.
- [Style spec](./concepts/style-spec.md) — sources, layers, paint/layout.
- [3D](./concepts/3d.md) — fill-extrusion, fog, sky.
- [Terrain](./concepts/terrain.md) — DEM sources, `setTerrain`.
- [Services](./concepts/services.md) — geocoding, directions, matrix.
- [Offline](./concepts/offline.md) — tile caching, offline regions.

## Framework bindings

ts-maps ships first-class bindings for every major framework.

### React

```tsx
import { Map, Marker, Popup, TileLayer } from '@ts-maps/react'

export function App() {
  return (
    <Map center={[40.758, -73.9855]} zoom={13} style={{ height: 500 }}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[40.758, -73.9855]}>
        <Popup>Hello from ts-maps</Popup>
      </Marker>
    </Map>
  )
}
```

### Vue

```vue
<script setup lang="ts">
import { Map, Marker, Popup, TileLayer } from '@ts-maps/vue'
</script>

<template>
  <Map :center="[40.758, -73.9855]" :zoom="13" style="height: 500px">
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <Marker :position="[40.758, -73.9855]">
      <Popup>Hello from ts-maps</Popup>
    </Marker>
  </Map>
</template>
```

### Svelte, Solid, Nuxt

Matching component APIs ship as `@ts-maps/svelte`, `@ts-maps/solid`, and
the `ts-maps-nuxt` module.

## Map options

`TsMap` accepts the standard camera options plus anything you'd expect
from a slippy-map library:

```ts
interface TsMapOptions {
  center?: [lat: number, lng: number]
  zoom?: number
  minZoom?: number
  maxZoom?: number
  zoomSnap?: number // 0 = fractional
  bearing?: number
  pitch?: number
  maxBounds?: LatLngBoundsLike
  crs?: CRS
  attributionControl?: boolean
  zoomControl?: boolean
  scrollWheelZoom?: boolean
  doubleClickZoom?: boolean
  dragging?: boolean
  touchZoom?: boolean
  boxZoom?: boolean
  keyboard?: boolean
  tap?: boolean
  renderer?: 'canvas2d' | 'webgl' | 'svg'
}
```

For the full API, see the [API reference](./api/TsMap.md).
