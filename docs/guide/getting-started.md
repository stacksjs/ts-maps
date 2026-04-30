# Getting started

`ts-maps` is an interactive, zero-dependency vector mapping library for
TypeScript. This guide walks through a first map, styled vector tiles,
and common options.

## Installation

::: code-group

```sh [npm]
npm install ts-maps
```

```sh [pnpm]
pnpm add ts-maps
```

```sh [bun]
bun add ts-maps
```

```sh [yarn]
yarn add ts-maps
```

:::

## Your first map

Create a container in your HTML:

```html
<div id="map" style="width: 800px; height: 500px;"></div>
```

Then initialise the map:

```ts
import 'ts-maps/styles.css'
import { Marker, tileLayer, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 13,
})

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map)

new Marker([40.758, -73.9855])
  .addTo(map)
  .bindPopup('Hello from ts-maps')
  .openPopup()
```

## Map options

```ts
interface TsMapOptions {
  center?: [lat: number, lng: number]
  zoom?: number
  minZoom?: number
  maxZoom?: number
  zoomSnap?: number // 0 = fractional zoom
  bearing?: number
  pitch?: number
  maxBounds?: LatLngBoundsLike
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

## Camera API

`TsMap` implements a Mapbox-style camera:

```ts
map.jumpTo({ center: [51.5, -0.12], zoom: 10, bearing: 30, pitch: 40 })
map.easeTo({ zoom: 14, duration: 800 })
map.flyTo({ center: [35.67, 139.65], zoom: 9 })

map.getCamera() // { center, zoom, bearing, pitch, padding }
```

## Vector tiles & the style spec

```ts
import { vectorTileLayer } from 'ts-maps'

vectorTileLayer({
  url: 'https://tiles.example.com/{z}/{x}/{y}.pbf',
  layers: [
    { id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0ea5e9' } },
    { id: 'roads', type: 'line', sourceLayer: 'transportation',
      filter: ['match', ['get', 'class'], ['primary', 'trunk'], true, false],
      paint: {
        'line-color': '#6b7280',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 3],
      } },
  ],
}).addTo(map)

// Layer-scoped events:
map.on('click', 'roads', (e) => {
  console.log(e.features[0].properties)
})
```

## Adding your own data

```ts
import { GeoJSON, Marker, Polyline } from 'ts-maps'

new Marker([48.8566, 2.3522]).addTo(map).bindPopup('Paris')

new Polyline([
  [40.7128, -74.0060],
  [51.5074, -0.1278],
], { color: '#3b82f6', weight: 2 }).addTo(map)

new GeoJSON(featureCollection, {
  style: (f) => ({ color: '#2563eb', weight: 1, fillOpacity: 0.3 }),
}).addTo(map)
```

## Next steps

- [Vue integration](/guide/vue)
- [React integration](/guide/react)
- [Nuxt module](/guide/nuxt)
- [Concepts: map](/concepts/map), [style spec](/concepts/style-spec),

  [3D](/concepts/3d), [offline](/concepts/offline).
