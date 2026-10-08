<p align="center"><img src="https://github.com/stacksjs/ts-maps/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of this repo"></p>

# Introduction

ts-maps is an interactive map library written in TypeScript, with no runtime
dependencies. It draws vector tiles styled with the Mapbox GL Style Spec,
tilts and rotates the camera, puts the world on a globe, raises terrain and
3D buildings. You drive it with the API Leaflet made familiar: a map, layers
you `addTo` it, markers with popups.

## Why

Two libraries cover most web maps today. Leaflet is small and easy to use, but
it draws raster tiles on a flat, north-up map. Mapbox GL JS and MapLibre draw
styled vector tiles in 3D, but their API is larger and lower-level, and
Mapbox's is tied to an account.

ts-maps aims at both: the vector, 3D map, with Leaflet's way of building one.
It is written in TypeScript from the start, so the types are the source, and
it has no dependencies, so `ts-maps` is the only thing you install. It needs
no API key: the examples here use [OpenFreeMap](https://openfreemap.org)'s
free vector tiles.

## What it does

- **Camera.** Fractional zoom, rotation (`bearing`) and tilt (`pitch`, up to
  85°). `flyTo`, `easeTo` and `jumpTo` move any of them together.
- **Vector tiles and styles.** Tiles are decoded in the library (MVT, or read
  straight out of a PMTiles archive). Styles follow the Mapbox GL Style Spec:
  `background`, `fill`, `line`, `circle`, `symbol`, `raster`, `hillshade`,
  `heatmap` and `fill-extrusion` layers, with expressions (`interpolate`,
  `step`, `match`, `case`, `coalesce`, `feature-state` and the rest). Built-in
  basemap styles: `styles.light`, `styles.dark`, `styles.transit`,
  `styles.satellite` and `styles.hybrid`.
- **Labels.** Symbol layers place text and icons along lines and at points,
  and drop the ones that would collide.
- **3D.** Extruded buildings, glTF landmark models and trees, hillshading
  and ground heights from a `raster-dem` source, fog and sky, and custom
  WebGL2 layers with `addCustomLayer`.
- **Globe.** With `projection: 'globe'` the map zoomed out is a sphere, drawn
  from the same tiles. It fades into the flat map between zoom 5.5 and 6.
- **Your own data.** GeoJSON sources with clustering and heatmaps, styled like
  any other layer. Leaflet-style `Marker`, `Popup`, `Polyline`, `Polygon`,
  `Circle` and `GeoJSON` layers on top. `map.on('click', 'layer-id', fn)`
  fires only for features of that layer.
- **Services.** Geocoding, directions, isochrones and travel-time matrices
  behind one interface. The defaults need no key (Nominatim, OSRM, Valhalla);
  Mapbox, Google, MapTiler and Photon are opt-in. Turn-by-turn navigation is
  built on them.
- **Offline.** Download an area and the map, search and directions keep
  working there without a connection. A service worker in `ts-maps/offline-sw`
  keeps the page itself loading.
- **Your own tiles.** `ts-maps/server` serves a PMTiles archive from Bun, and
  `ts-maps/worker` from a Cloudflare Worker.
- **Controls.** Zoom and compass, scale, search, geocoder, map type picker,
  locate, fullscreen, layer switcher and offline maps. The chrome follows
  `theme: 'light' | 'dark' | 'auto'` and speaks the reader's language.
- **More.** Indoor maps (IMDF), street-level imagery, live traffic, and
  static SVG maps for share cards.
- **Framework bindings.** React, Vue, Svelte, Solid, Nuxt, stx and React
  Native, with the same components in each.

## A first map

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

`'map'` is the id of a `<div>` with a height. The style is the built-in light
basemap, drawn from OpenFreeMap's tiles. You can see this one running, and
change it, in the [Basic map example](./examples/01-basic-map.md).

## Next steps

- [Installation](./install.md): package managers, the stylesheet, subpath
  imports, framework bindings, and using it from a CDN.
- [Getting started](./guide/getting-started.md): from an empty page to a
  styled map with a marker, camera moves and data of your own.
- [Concepts](./concepts/map.md): how the map, layers, styles, 3D, services
  and offline work.
- [Examples](./examples/index.md): small, focused maps, each running on its
  page, with an editor to change and re-run it.
- [Playground](/demos/): larger demos of whole features.
- [API reference](./api/index.md): classes, methods and options.
- Coming from another library? See the guides for
  [Leaflet](./migration/from-leaflet.md),
  [Mapbox GL JS](./migration/from-mapbox.md) and
  [MapLibre](./migration/from-maplibre.md).

## Community

- [GitHub Discussions](https://github.com/stacksjs/ts-maps/discussions)
- [Discord](https://discord.gg/stacksjs)

## License

ts-maps is released under the MIT License. See
[LICENSE](https://github.com/stacksjs/ts-maps/blob/main/LICENSE.md).
