# Getting started

This walks from an empty page to a styled vector map with a marker and a
popup, then moves the camera and puts data of your own on the map. Each step
adds to the one before; the whole file is at the end.

You need `ts-maps` installed and a bundler or dev server that handles
TypeScript and CSS imports (Vite, Bun, esbuild, webpack). For other setups,
including a plain HTML page from a CDN, see [Installation](../install.md).

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

## 1. A container

The map fills an element you give it, so the element needs a size. Height is
the one people forget: an empty `<div>` is 0px tall.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My map</title>
  <style>
    body { margin: 0; }
    #map { height: 100vh; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

## 2. The map

In `main.ts`, import the stylesheet and create a `TsMap` in the container:

```ts
import 'ts-maps/styles.css'
import { styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 14,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})
```

- `'map'` is the container's id. An `HTMLElement` works too.
- `center` is `[lat, lng]`, latitude first, as in Leaflet. Mapbox and GeoJSON
  write `[lng, lat]`; this API does not.
- `zoom` can be fractional: `14.5` is between 14 and 15.
- `style` is the built-in light basemap. `url` names
  [OpenFreeMap](https://openfreemap.org)'s TileJSON for its planet tiles, which
  are free and need no key. The map reads the TileJSON for the tile URLs and
  the attribution, and shows the attribution in the corner.

That's a working map. Drag to pan; scroll, pinch or double-click to zoom; the
arrow keys and `+` / `-` work once the map has focus. On a touch screen, twist
two fingers to rotate and drag two fingers up or down to tilt. The zoom
buttons are on by default; `zoomControl: false` removes them.

A few more options you can pass:

```ts
import { styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 14,
  minZoom: 3,
  maxZoom: 19,
  bearing: 30, // rotation in degrees, clockwise from north
  pitch: 45, // tilt in degrees, 0 looking straight down
  theme: 'auto', // controls and popups follow the page's light or dark mode
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})
```

[The map](../concepts/map.md) lists the rest.

## 3. A marker and a popup

```ts
import { Marker } from 'ts-maps'

const marker = new Marker([40.758, -73.9855], { title: 'Times Square', draggable: true })
  .addTo(map)
  .bindPopup('<b>Times Square</b><br>Drag me somewhere else.')
  .openPopup()

marker.on('dragend', () => {
  const { lat, lng } = marker.getLatLng()
  marker.setPopupContent(`Now at ${lat.toFixed(4)}, ${lng.toFixed(4)}`).openPopup()
})
```

`bindPopup` attaches the popup to the marker, so clicking the marker opens
it; `openPopup` opens it now. The default pin is built in, with nothing to
copy into your assets. For a pin of your own, pass an `icon`: an `Icon` from
an image, or a `DivIcon` from HTML you style with CSS, as the
[Basic map example](../examples/01-basic-map.md) does.

A popup doesn't need a marker. This one opens wherever the map is clicked:

```ts
import type { LatLng } from 'ts-maps'
import { popup } from 'ts-maps'

map.on('click', (e: { latlng: LatLng }) => {
  popup()
    .setLatLng(e.latlng)
    .setContent(`${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`)
    .openOn(map)
})
```

`map.on` doesn't type its events yet, so give the handler's argument the
fields you use. A mouse event has `latlng`, where on the map it happened, and
`containerPoint`, where in the container in pixels.

## 4. Moving the camera

The camera has four parts, center, zoom, bearing and pitch, and three ways to
move them.

```ts
// Arc out and back in, for a long hop. Center and zoom are arguments.
map.flyTo([51.5074, -0.1278], 13)

// Glide any of the four, together, over `duration` milliseconds.
map.easeTo({ bearing: 30, pitch: 50, duration: 900 })

// Set them at once, with no animation.
map.jumpTo({ center: [48.8566, 2.3522], zoom: 14, bearing: 0, pitch: 0 })

// Fit an area: south-west and north-east corners, with room round the edge.
map.fitBounds([[40.70, -74.02], [40.80, -73.93]], { padding: [40, 40] })

// Read it back.
const { center, zoom, bearing, pitch } = map.getCamera()
```

`flyTo` takes its center and zoom as arguments, as Leaflet's does, and the
rest as options: `map.flyTo([35.6762, 139.6503], 12, { pitch: 45, duration: 4000 })`.
When the reader has asked for reduced motion, `flyTo` and `easeTo` jump
instead of animating; pass `essential: true` for a move that has to animate.

The map fires `movestart`, `move` and `moveend` around every change, from
your code or the reader's hand:

```ts
map.on('moveend', () => {
  console.log(map.getCenter(), map.getZoom())
})
```

The [Camera example](../examples/02-camera.md) has buttons for each move.

## 5. Your own data

Markers suit a handful of points. For more, or for lines and areas, add the
data to the style: a GeoJSON source, and layers that draw it. They are drawn
and styled the same way the basemap is.

Add them on `style.load`, which fires once the style is in. With a TileJSON
`url` that is a moment after the map is created.

```ts
import type { LatLng } from 'ts-maps'
import { popup } from 'ts-maps'

const cafes = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Bryant Park Cafe' }, geometry: { type: 'Point', coordinates: [-73.9832, 40.7536] } },
    { type: 'Feature', properties: { name: 'Think Coffee' }, geometry: { type: 'Point', coordinates: [-73.9925, 40.7590] } },
    { type: 'Feature', properties: { name: 'Bluestone Lane' }, geometry: { type: 'Point', coordinates: [-73.9790, 40.7614] } },
  ],
}

map.on('style.load', () => {
  map.addSource('cafes', { type: 'geojson', data: cafes })
  map.addStyleLayer({
    id: 'cafes',
    type: 'circle',
    source: 'cafes',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 10],
      'circle-color': '#e11d48',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  })
})

interface CafeClick {
  latlng: LatLng
  features: Array<{ feature: { properties: { name: string } } }>
}

map.on('click', 'cafes', (e: CafeClick) => {
  const cafe = e.features[0].feature
  popup().setLatLng(e.latlng).setContent(cafe.properties.name).openOn(map)
})
```

Coordinates inside GeoJSON are `[lng, lat]`, as the GeoJSON spec says, unlike
the `[lat, lng]` the map's own API takes.

`map.on('click', 'cafes', fn)` calls `fn` only when the click lands on a
feature of the `cafes` layer. `e.features` holds what was hit; each entry's
`feature` has the GeoJSON `properties`. The `circle-radius` here is an
expression: 4px at zoom 12, growing to 10px at zoom 17.

`data` can also be a URL to a GeoJSON file. To change the data later, replace
it; the layers redraw:

```ts
map.setSourceData('cafes', { type: 'FeatureCollection', features: [] })
```

`style.load` fires each time a style finishes loading, so a later `setStyle`
(a dark basemap at night, say) runs the handler again and your layers come
back on the new style:

```ts
map.setStyle(styles.dark({ url: 'https://tiles.openfreemap.org/planet' }))
map.setTheme('dark') // controls and popups to match
```

The [Style spec example](../examples/04-style-spec.md) adds a polygon on
`style.load` and recolors it at runtime with `setPaintProperty`.

## All together

```ts
import type { LatLng } from 'ts-maps'
import 'ts-maps/styles.css'
import { Marker, popup, styles, TsMap } from 'ts-maps'

interface CafeClick {
  latlng: LatLng
  features: Array<{ feature: { properties: { name: string } } }>
}

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 14,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

new Marker([40.758, -73.9855], { title: 'Times Square' })
  .addTo(map)
  .bindPopup('<b>Times Square</b>')
  .openPopup()

const cafes = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Bryant Park Cafe' }, geometry: { type: 'Point', coordinates: [-73.9832, 40.7536] } },
    { type: 'Feature', properties: { name: 'Think Coffee' }, geometry: { type: 'Point', coordinates: [-73.9925, 40.7590] } },
    { type: 'Feature', properties: { name: 'Bluestone Lane' }, geometry: { type: 'Point', coordinates: [-73.9790, 40.7614] } },
  ],
}

map.on('style.load', () => {
  map.addSource('cafes', { type: 'geojson', data: cafes })
  map.addStyleLayer({
    id: 'cafes',
    type: 'circle',
    source: 'cafes',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 10],
      'circle-color': '#e11d48',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  })
})

map.on('click', 'cafes', (e: CafeClick) => {
  popup().setLatLng(e.latlng).setContent(e.features[0].feature.properties.name).openOn(map)
})

document.addEventListener('keydown', (e) => {
  if (e.key === 't')
    map.easeTo({ pitch: map.getPitch() ? 0 : 55, duration: 800 })
})
```

## Where next

- [Examples](../examples/index.md): small maps, each running on its page with
  an editor. Start with [Vector tiles](../examples/03-vector-tile.md),
  [Clusters](../examples/07-clusters.md) and [Globe](../examples/12-globe.md).
- [The map](../concepts/map.md): options, events and the camera in full.
- [Layers](../concepts/layers.md): which kind of layer suits which data.
- [Style spec](../concepts/style-spec.md): sources, layers and expressions.
- [Styles and theming](../concepts/styles-and-theming.md): the built-in
  basemaps and light and dark chrome.
- [Controls](../concepts/controls.md): search, navigation, scale, map type
  and more.
- [3D](../concepts/3d.md): buildings, terrain, fog, sky and the globe.
- [Services](../concepts/services.md), [Offline](../concepts/offline.md) and
  [Localization](../concepts/localization.md).
- Using a framework? [React](./react.md), [Vue](./vue.md),
  [Nuxt](./nuxt.md), [Svelte](./svelte.md), [Solid](./solid.md),
  [stx](./stx.md) and [React Native](./react-native.md).
- [Playground](/demos/): larger demos of whole features.
