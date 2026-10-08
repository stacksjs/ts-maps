<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of ts-maps"></p>

[![npm version](https://img.shields.io/npm/v/ts-maps?style=flat-square)](https://npmjs.com/package/ts-maps)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/stacksjs/ts-maps/ci.yml?style=flat-square&branch=main)](https://github.com/stacksjs/ts-maps/actions?query=workflow%3Aci)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

# ts-maps

ts-maps is an interactive map library written in TypeScript, with no runtime
dependencies. It draws vector tiles styled with the Mapbox GL Style Spec,
tilts and rotates the camera, puts the world on a globe, raises terrain and
3D buildings. You build a map the way Leaflet does it: a map, layers
you `addTo` it, markers with popups.

It needs no API key. Every example here draws
[OpenFreeMap](https://openfreemap.org)'s free vector tiles.

[Documentation](https://ts-maps.stacksjs.com/intro) ·
[Examples](https://ts-maps.stacksjs.com/examples/) ·
[Playground](https://ts-maps.stacksjs.com/demos/) ·
[API reference](https://ts-maps.stacksjs.com/api/TsMap)

## What it does

- **Camera.** Fractional zoom, rotation (`bearing`) and tilt (`pitch`, up to
  85°). `flyTo`, `easeTo` and `jumpTo` move them together.
- **Vector tiles and styles.** Vector tiles (MVT) and PMTiles archives are
  decoded in the library. Styles follow the Mapbox GL Style Spec, with `background`,
  `fill`, `line`, `circle`, `symbol`, `raster`, `hillshade`, `heatmap` and
  `fill-extrusion` layers and expressions. The built-in basemaps are
  `styles.light`, `styles.dark`, `styles.transit`, `styles.satellite` and
  `styles.hybrid`.
- **Labels.** Text and icons are placed along lines and at points, and labels
  that would overlap are dropped.
- **3D.** Extruded buildings, glTF landmark models, trees, sky and fog, and
  custom WebGL2 layers.
- **Globe.** With `projection: 'globe'`, the map zoomed out is a sphere drawn
  from the same tiles.
- **Terrain.** The ground raised in 3D from a `raster-dem` source, with
  labels and markers standing on it, plus hillshading and ground heights.
- **Your own data.** GeoJSON sources with clustering and heatmaps, styled like
  the basemap. Leaflet-style `Marker`, `Popup`, `Polyline`, `Polygon`,
  `Circle` and `GeoJSON` layers on top.
- **Search and navigation.** A search box like Apple Maps', turn-by-turn
  guidance with a voice and lane hints, and geocoding, directions, isochrone
  and matrix services. The defaults need no key.
- **Offline.** Download an area, and the map, search and directions keep
  working there with no connection.
- **Controls.** Zoom, compass, scale, locate, fullscreen, map type, offline
  maps, indoor floor plans and street-level pictures. They follow a light or
  dark theme and speak the reader's language: English and German are built
  in, and `addMessages` adds another.
- **Server side.** Static SVG maps, a PMTiles tile server for Bun or
  Cloudflare Workers, and a place-search index of your own.
- **Framework bindings.** React, Vue, Nuxt, Svelte, Solid, stx and React
  Native.

## Install

```bash
bun add ts-maps
# or
npm install ts-maps
pnpm add ts-maps
yarn add ts-maps
```

Import the stylesheet once, before the first map is created:

```ts
import 'ts-maps/styles.css'
```

Without it, the map's tiles, markers and controls are not positioned and fall
down the page one after another. To load ts-maps from a CDN with no bundler,
see [Installation](https://ts-maps.stacksjs.com/install).

## A first map

Give the map a container with a height:

```html
<div id="map" style="height: 480px"></div>
```

Then create the map in it:

```ts
import 'ts-maps/styles.css'
import { Marker, styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [40.758, -73.9855], // [lat, lng]
  zoom: 14,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

new Marker([40.758, -73.9855])
  .addTo(map)
  .bindPopup('<b>Hello from ts-maps</b><br>Times Square, New York')
  .openPopup()
```

- `'map'` is the container's id. An `HTMLElement` works too.
- `center` is `[lat, lng]`, latitude first, as in Leaflet. GeoJSON keeps its
  `[lng, lat]` order.
- `style` is the built-in light basemap. `url` is OpenFreeMap's TileJSON: the
  map reads it for the tile URLs and the attribution.

Drag to pan, and scroll, pinch or double-click to zoom. On a touch screen,
twist two fingers to rotate and drag two fingers up or down to tilt.
[Getting started](https://ts-maps.stacksjs.com/guide/getting-started) walks
through this step by step.

## A tour

The snippets below add to the `map` above. One that makes its own map
stands in place of it.

### Moving the camera

Each line here is a move of its own:

```ts
// Arc out and back in. Center and zoom are arguments, as in Leaflet.
map.flyTo([51.5074, -0.1278], 13)
map.flyTo([35.6762, 139.6503], 12, { pitch: 45, bearing: 20, duration: 4000 }) // ms

// Glide any part of the camera, or set it at once.
map.easeTo({ bearing: 30, pitch: 50, duration: 900 })
map.jumpTo({ center: [48.8566, 2.3522], zoom: 14, bearing: 0, pitch: 0 })

// Fit an area: south-west and north-east corners.
map.fitBounds([[40.70, -74.02], [40.80, -73.93]], { padding: [40, 40] })

map.on('moveend', () => console.log(map.getCenter(), map.getZoom()))
```

When the reader has asked for reduced motion, `flyTo` and `easeTo` jump
instead of animating. See [The map](https://ts-maps.stacksjs.com/concepts/map).

### Your own data

Put data on the map as a source, and draw it with style layers, the same way
the basemap is drawn. Add them on `style.load`:

```ts
import { popup } from 'ts-maps'

const cafes = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Bryant Park Cafe' }, geometry: { type: 'Point', coordinates: [-73.9832, 40.7536] } },
    { type: 'Feature', properties: { name: 'Think Coffee' }, geometry: { type: 'Point', coordinates: [-73.9925, 40.7590] } },
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

// Fires only when the click lands on a feature of the 'cafes' layer.
map.on('click', 'cafes', (e) => {
  const { feature } = e.features[0]
  popup().setLatLng(e.latlng).setContent(feature.properties.name).openOn(map)
})
```

- `style.load` fires once the style is in, and again after every `setStyle`,
  so your layers come back on a new style. It fires after the constructor
  returns, so a listener added on the next line hears it.
- Style layers go in with `addStyleLayer`. `addLayer` is for layer objects:
  a `Marker`, a `Polyline`, a tile layer.
- `e.features` holds what was hit, each as `{ feature, layer, tile }`. The
  GeoJSON properties are on `feature.properties`.
- Pointer events have the Pointer Events names: `pointermove`,
  `pointerdown`, `pointerup`, `pointerover` and `pointerout`, plus `click`,
  `dblclick` and `contextmenu`.
- `map.setSourceData('cafes', next)` replaces the data in place. A GeoJSON
  source with `cluster: true` groups nearby points, and a `heatmap` layer
  draws their density.

See [Style spec](https://ts-maps.stacksjs.com/concepts/style-spec) and
[Layers](https://ts-maps.stacksjs.com/concepts/layers).

### A style of your own

A style is a plain object: sources, and layers that draw them. This one draws
OpenFreeMap's tiles from scratch, with expressions for colour and width:

```ts
import { TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [51.5072, -0.1276],
  zoom: 15,
  style: {
    version: 8,
    sources: {
      planet: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { 'id': 'land', 'type': 'background', 'paint': { 'background-color': '#f4f1ea' } },
      { 'id': 'water', 'type': 'fill', 'source': 'planet', 'source-layer': 'water', 'paint': { 'fill-color': '#9cc3e6' } },
      {
        'id': 'roads',
        'type': 'line',
        'source': 'planet',
        'source-layer': 'transportation',
        'paint': {
          'line-color': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], '#f2a33a', '#b9b2a6'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 18, 6],
        },
      },
    ],
  },
})

map.on('click', (e) => {
  const [hit] = map.queryRenderedFeatures(e.containerPoint, { layers: ['roads'] })
  if (hit)
    console.log(hit.layer.id, hit.feature.properties)
})

// Restyle a layer once the style is in.
map.on('style.load', () => {
  map.setPaintProperty('water', 'fill-color', '#0ea5e9')
  map.setFilter('roads', ['==', ['get', 'class'], 'primary'])
})
```

`queryRenderedFeatures` returns `{ feature, layer, tile }` for each feature
under the point. `setStyle` also takes the URL of a style document. See
[Vector tiles](https://ts-maps.stacksjs.com/concepts/vector-tiles) and the
[expression reference](https://ts-maps.stacksjs.com/api/expressions).

### Basemaps and dark mode

```ts
const url = 'https://tiles.openfreemap.org/planet'

map.setStyle(styles.dark({ url }))
map.setTheme('dark') // the controls and popups, to match

styles.light({ url, emphasis: 'driving' }) // roads first, as in Apple's Driving map
styles.transit({ url })                    // rail and tram lines in colour
styles.hybrid({ url })                     // Esri imagery, with roads and names over it
styles.satellite()                         // imagery alone
```

The theme colours the controls, popups and attribution, not the basemap.
`theme: 'auto'` follows the page's light or dark mode. See
[Styles & theming](https://ts-maps.stacksjs.com/concepts/styles-and-theming).

### 3D buildings, landmarks and trees

The built-in light and dark styles already raise buildings to their mapped
height from zoom 14. Tilt the map to see them:

```ts
import { landmark, styles, trees, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [37.7959, -122.4034], // San Francisco
  zoom: 17,
  pitch: 52,
  bearing: -28,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

// A glTF model stands in place of the extruded building under it.
landmark({ model: '/models/transamerica.glb', position: [37.7952, -122.4028] }).addTo(map)

// Trees in the basemap's woods, once the map tilts past 20°.
trees().addTo(map)

map.setSky({ 'sky-color': '#87ceeb', 'horizon-color': '#ffffff' })
map.setFog({ 'color': 'rgb(245, 247, 250)', 'horizon-blend': 0.1 })
```

A style of your own extrudes buildings with a `fill-extrusion` layer.
`addCustomLayer` runs your own WebGL2 code inside a vector tile layer drawn
with `renderer: 'webgl'`. See
[3D and the globe](https://ts-maps.stacksjs.com/concepts/3d).

### The globe

```ts
const map = new TsMap('map', {
  center: [30, 10],
  zoom: 2.5,
  projection: 'globe',
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

map.setFog({ 'color': '#ffffff', 'space-color': '#dfe7f0' }) // the halo, and the space behind
```

The globe is a WebGL sphere drawn from the tiles the map has loaded, so the
basemap, raster layers, hillshade and heatmaps all go onto it. Drag to turn
it. Labels stand upright on it, and markers hide round the back. Between zoom
5.5 and 6 it fades into the flat map. `map.setProjection('mercator')` switches
back at any time, and keeps the camera where it is.

### Terrain

Elevation comes in as a `raster-dem` source. [AWS Terrain
Tiles](https://registry.opendata.aws/terrain-tiles/) are free and need no key:

```ts
const map = new TsMap('map', {
  center: [45.992, 7.69], // Looking at the Matterhorn
  zoom: 13,
  pitch: 65,
  bearing: 235,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

map.on('style.load', () => {
  map.addSource('dem', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 15,
    encoding: 'terrarium',
  })

  // Shade the slopes.
  map.addStyleLayer({ id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.6 } })

  // Raise the ground.
  map.setTerrain({ source: 'dem', exaggeration: 1 })
})

map.on('click', (e) => {
  const metres = map.queryTerrainElevation(e.latlng) // null until a DEM tile there has loaded
  console.log(metres)
})
```

`setTerrain` raises the ground by the DEM's heights: mountains stand up and
valleys sink, draped with the map's own tiles. Labels, markers and popups
stand on the surface, and a click lands on the slope under the pointer. It
needs WebGL; without it the map stays flat and the heights are still there
for `queryTerrainElevation`. See
[Terrain](https://ts-maps.stacksjs.com/concepts/terrain).

### Search and turn-by-turn

```ts
import { control, turnByTurn } from 'ts-maps'

const nav = turnByTurn(map)
control.search({ turnByTurn: nav }).addTo(map)
```

That is a search box like Apple Maps': suggestions as you type, Find Nearby,
a pin for every result and a card for the place you choose. Answers come from
the map's own tiles and from Photon, OpenStreetMap's geocoder, with no key.
Directions on a place's card previews the routes on `nav`, and Go starts
guidance: a banner with the next turn, lane hints, a voice, and a camera that
follows from behind.

You can also drive navigation from code:

```ts
const drive = turnByTurn(map, { destinationName: 'Palace of Fine Arts', simulate: true })
await drive.preview({ lat: 37.7955, lng: -122.3937 }, { lat: 37.8029, lng: -122.4484 })
drive.start() // or the reader taps Go
```

Positions come from the Geolocation API. `simulate: true` drives the route
instead, so you can watch it from a desk. Routes come from the public OSRM
server, which only routes cars; pass `directions` for another provider. See
[Search](https://ts-maps.stacksjs.com/concepts/search) and
[Turn-by-turn](https://ts-maps.stacksjs.com/concepts/services#turn-by-turn-navigation).

### Geocoding, directions, isochrones and matrices

```ts
import { defaultDirections, defaultGeocoder, defaultIsochrone, defaultMatrix } from 'ts-maps/services'

const [place] = await defaultGeocoder().search('Tower Bridge, London') // Nominatim
console.log(place.text, place.center) // center is { lat, lng }

const stops = [{ lat: 51.5055, lng: -0.0754 }, { lat: 51.5074, lng: -0.1278 }, { lat: 51.5155, lng: -0.1408 }]

const [route] = await defaultDirections().getDirections(stops, { profile: 'driving' }) // OSRM
console.log(route.distance, route.duration) // metres, seconds

const { durations } = await defaultMatrix().getMatrix(stops, stops) // OSRM: seconds between every pair

const rings = await defaultIsochrone().getIsochrones(stops[0], { contours: [5, 10, 15], profile: 'walking' }) // Valhalla, minutes
```

Nominatim, Photon, OSRM and Valhalla need no key. Mapbox, MapTiler and Google
take yours. Every provider takes a `baseUrl`, so you can point it at your own
server. The public servers are shared and best-effort: fine for trying
things, not for an app with real traffic. The same classes are on the
`services` namespace of `ts-maps`. See
[Services](https://ts-maps.stacksjs.com/concepts/services).

### Offline maps

```ts
import { control } from 'ts-maps'

// The style reads its TileJSON on load, so keep that with every download too.
control.offlineMaps({ resources: ['https://tiles.openfreemap.org/planet'] }).addTo(map)
```

The button opens a list of downloaded areas, and a frame to pick a new one,
with its size estimated before anything is fetched. A download keeps the
tiles, the style's sprites and glyphs, and the area's places and roads, so
search and directions keep working with no connection. Downloads are kept in
IndexedDB. The same manager is on `map.offline`:

```ts
const bounds: [number, number, number, number] = [2.29, 48.84, 2.37, 48.88] // west, south, east, north

const { bytes } = await map.offline.estimate({ bounds })
const region = await map.offline.download({ bounds, name: 'Central Paris' })
```

`ts-maps/offline-sw` builds a service worker that keeps the page itself
loading with the network off. See
[Offline maps](https://ts-maps.stacksjs.com/concepts/offline).

### Map types, indoor maps and Look Around

```ts
import { control, indoorMap, lookAround, mapTypes } from 'ts-maps'

// Explore, Driving, Transit and Satellite, from one basemap.
control.mapType({ types: mapTypes({ url: 'https://tiles.openfreemap.org/planet' }) }).addTo(map)

// A venue's floor plan from its IMDF archive, a level at a time.
indoorMap({ venue: '/imdf/terminal.zip' }).addTo(map)

// Street-level pictures from Panoramax. No key.
lookAround().addTo(map)
```

Choosing a map type keeps the camera and the layers your page added. See
[Map types](https://ts-maps.stacksjs.com/concepts/map-types),
[Indoor maps](https://ts-maps.stacksjs.com/concepts/indoor),
[Look Around](https://ts-maps.stacksjs.com/concepts/look-around) and
[Controls](https://ts-maps.stacksjs.com/concepts/controls).

### Static maps

`ts-maps/static` draws a style to SVG from its vector tiles, with no map
instance, DOM or GPU: for share cards, Open Graph images and figures.

```ts
import { styles } from 'ts-maps'
import { renderStaticMap, staticMapSvg, staticMapView } from 'ts-maps/static'

const style = styles.light({ url: 'https://tiles.openfreemap.org/planet' })
const view = staticMapView([{ lat: 51.5055, lng: -0.0754 }, { lat: 51.5007, lng: -0.1246 }], 1200, 630, 48)!
const drawing = await renderStaticMap({ style, width: 1200, height: 630, view })
const svg = staticMapSvg(drawing, 1200, 630) // the <svg> element, as a string
```

Fills and lines come out as paths and labels as text, so the result is sharp
at any size. Pass `avoid` with a route's pixels, and the labels it would
cover move aside.

### Your own tile server

`ts-maps/server` serves vector or raster tiles from one
[PMTiles](https://github.com/protomaps/PMTiles) archive, on local disk, S3 or
R2, with TileJSON, ETags, CORS and `204` for empty tiles. It runs on Bun:

```ts
import { createTileServer } from 'ts-maps/server'

const tiles = createTileServer({ archive: './california.pmtiles', basePath: '/tiles' })
Bun.serve({ port: 8080, fetch: tiles.fetch }) // http://localhost:8080/tiles/tiles.json
```

`ts-maps/worker` serves the same from an R2 bucket on Cloudflare Workers,
cached at the edge a tile at a time. A map can also read a `pmtiles://`
archive straight from a bucket, with no server. See
[Self-hosted tiles](https://ts-maps.stacksjs.com/concepts/tile-server).

## Subpath imports

Everything the map needs comes from `ts-maps`. Each subpath is its own entry
point, for code that wants one part without the map: a server, a Worker, a
build script, or a page that only geocodes.

| Import | What it is for |
| --- | --- |
| `ts-maps/services` | Geocoding, directions, isochrones, matrices and elevation |
| `ts-maps/gazetteer` | A place-search index of your own, from GeoNames. Bun only |
| `ts-maps/style-spec` | Validate, diff and evaluate styles and expressions |
| `ts-maps/storage` | `TileCache`, and pre-fetching an area into it |
| `ts-maps/geo` | Coordinates, bounds, projections and distances |
| `ts-maps/geometry` | Screen-space points and bounds, and an R-tree |
| `ts-maps/symbols` | Glyphs, sprites and label collision |
| `ts-maps/static` | A map drawn once as SVG |
| `ts-maps/pmtiles` | Read and write PMTiles archives |
| `ts-maps/server` | A tile server for a PMTiles archive. Bun only |
| `ts-maps/worker` | The same tile server on Cloudflare Workers, from R2 |
| `ts-maps/offline-sw` | A service worker that keeps an offline-capable app loading |
| `ts-maps/styles.css`, `ts-maps/css` | The map's stylesheet |

TypeScript reads the subpaths from the package's `exports`, so use
`"moduleResolution": "bundler"`, `"node16"` or `"nodenext"`. The
declarations ship with the package.

## Framework bindings

Each binding wraps the same `TsMap`; the behaviour lives in the core library.
The web bindings share component names: `Map`, `Marker`, `Popup`, `Source`,
`Layer`, the controls, `Search`, `TurnByTurn`, `OfflineMaps`, `MapType`,
`IndoorMap`, `LookAround`, `Landmark` and `Trees`. The Apple Maps-style
components take the same props and fire the same events in every framework.
React Native has one `MapView` that runs the map in a WebView, with each
feature as a prop.

| Framework | Package | Install |
| --- | --- | --- |
| React | `@ts-maps/react` | `bun add ts-maps @ts-maps/react` |
| Vue | `@ts-maps/vue` | `bun add ts-maps @ts-maps/vue` |
| Nuxt | `ts-maps-nuxt` | `bun add ts-maps-nuxt` |
| Svelte | `@ts-maps/svelte` | `bun add ts-maps @ts-maps/svelte` |
| Solid | `@ts-maps/solid` | `bun add ts-maps @ts-maps/solid` |
| stx | `@ts-maps/stx` | `bun add ts-maps @ts-maps/stx` |
| React Native | `@ts-maps/react-native` | `bun add ts-maps @ts-maps/react-native react-native-webview` |

In React:

```tsx
import { Layer, Map, Marker, Source } from '@ts-maps/react'
import { styles } from 'ts-maps'
import '@ts-maps/react/styles.css'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })
const TIMES_SQUARE: [number, number] = [40.758, -73.9855]
const stations = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Times Sq-42 St' }, geometry: { type: 'Point', coordinates: [-73.9873, 40.7553] } },
    { type: 'Feature', properties: { name: 'Grand Central' }, geometry: { type: 'Point', coordinates: [-73.9772, 40.7527] } },
  ],
}

export function App() {
  return (
    <Map center={TIMES_SQUARE} zoom={14} style={basemap} containerStyle={{ height: 480 }}>
      <Marker position={TIMES_SQUARE} options={{ title: 'Times Square' }} />
      <Source id="stations" source={{ type: 'geojson', data: stations }} />
      <Layer layer={{ id: 'stations', type: 'circle', source: 'stations', paint: { 'circle-color': '#e11d48' } }} />
    </Map>
  )
}
```

`<Source>` and `<Layer>` can go straight inside `<Map>`: added while the
basemap loads, they are kept and put on it when it arrives. The Nuxt module
goes in `nuxt.config.ts` as `modules: ['ts-maps-nuxt']`, and registers the Vue
components as `<TsMapsMap>`, `<TsMapsMarker>` and so on.
[Framework bindings](https://ts-maps.stacksjs.com/guide/framework-bindings)
covers where the bindings differ, and links each framework's guide.

## Documentation

- [Introduction](https://ts-maps.stacksjs.com/intro)
- [Installation](https://ts-maps.stacksjs.com/install)
- [Getting started](https://ts-maps.stacksjs.com/guide/getting-started)
- [Concepts](https://ts-maps.stacksjs.com/concepts/map): the map, layers,
  styles, 3D, terrain, services, offline and more
- [Examples](https://ts-maps.stacksjs.com/examples/): small maps, each running
  on its page with an editor
- [Playground](https://ts-maps.stacksjs.com/demos/): larger demos of whole
  features
- [API reference](https://ts-maps.stacksjs.com/api/TsMap)
- Coming from another library:
  [Leaflet](https://ts-maps.stacksjs.com/migration/from-leaflet),
  [Mapbox GL JS](https://ts-maps.stacksjs.com/migration/from-mapbox),
  [MapLibre](https://ts-maps.stacksjs.com/migration/from-maplibre)

## Development

1. Clone the repository:

```bash
git clone https://github.com/stacksjs/ts-maps.git
cd ts-maps
```

2. Install dependencies:

```bash
bun install
```

3. Run the tests, the docs site or the playground:

```bash
bun run test
bun run dev:docs
bun run playground:core-map # http://localhost:3000
```

## Changelog

Please see our [releases](https://github.com/stacksjs/ts-maps/releases) page for more information on what has changed recently.

## Contributing

Please see [CONTRIBUTING](https://github.com/stacksjs/stacks/blob/main/.github/CONTRIBUTING.md) for details.

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/ts-maps/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://stacksjs.com/discord)

## Postcardware

"Software that is free, but hopes for a postcard." We love receiving postcards from around the world showing where `ts-maps` is being used! We showcase them on our website too.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094, United States 🌎

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## Credits

- [Leaflet](https://leafletjs.com/) — the module layout and public API shape of the
  interactive map API follow its design.
- [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js) — the style spec, expression engine, and
  vector-tile renderer are modeled after its design.
- [Chris Breuer](https://github.com/chrisbbreuer)
- [All Contributors](https://github.com/stacksjs/ts-maps/contributors)

## License

The MIT License (MIT). Please see [LICENSE](https://github.com/stacksjs/ts-maps/blob/main/LICENSE.md) for more information.

Made with 💙
