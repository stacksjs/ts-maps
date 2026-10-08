# Migrating from Leaflet

ts-maps grew out of Leaflet's design, and most Leaflet code runs with its
imports changed. Markers, popups, tile layers, GeoJSON, shapes, controls and
events keep their names and signatures. What ts-maps adds — vector tiles, a
style, rotation, tilt, 3D and the globe — is new API beside the old, not a
change to it.

## A first map

Leaflet:

```ts
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const map = L.map('map').setView([51.505, -0.09], 13)

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors',
}).addTo(map)

L.marker([51.5, -0.09]).addTo(map).bindPopup('Hello').openPopup()
```

ts-maps, line for line:

```ts
import { Map, marker, tileLayer } from 'ts-maps'
import 'ts-maps/styles.css'

const map = new Map('map').setView([51.505, -0.09], 13)

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors',
}).addTo(map)

marker([51.5, -0.09]).addTo(map).bindPopup('Hello').openPopup()
```

The same raster tiles work. To draw a vector basemap instead — sharp at every
zoom, with labels that stay upright when the map turns — give the map a style
and drop the tile layer:

```ts
import { Map, marker, styles } from 'ts-maps'
import 'ts-maps/styles.css'

const map = new Map('map', {
  center: [51.505, -0.09],
  zoom: 13,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

marker([51.5, -0.09]).addTo(map).bindPopup('Hello').openPopup()
```

[OpenFreeMap](https://openfreemap.org) is free and needs no key. `url` names
its TileJSON, which the map reads for the tile URLs and the attribution.

## Names

| Leaflet | ts-maps |
| ------- | ------- |
| `L.map(id, options)` | `new Map(id, options)`, or `map(id, options)` |
| `L.Map` | `Map` (also exported as `Map`) |
| `L.marker`, `L.tileLayer`, `L.geoJSON`, `L.polyline`, … | `marker`, `tileLayer`, `geoJSON`, `polyline`, … as named imports |
| `L.Marker`, `L.TileLayer`, … | `Marker`, `TileLayer`, … |
| `L.control.zoom()`, `L.control.layers()`, `L.control.scale()` | `control.zoom()`, `control.layers()`, `control.scale()` |
| `L.tileLayer.wms(url, options)` | `tileLayer.wms(url, options)` |
| `L.Util`, `L.DomUtil`, `L.DomEvent`, `L.Browser` | `Util`, `DomUtil`, `DomEvent`, `Browser` |
| `L` (the global) | `tsMap` (the default export; also `window.tsMap`) |
| `leaflet-*` CSS classes | `tsmap-*` |

Everything else in this list keeps its Leaflet signature: `LatLng`,
`LatLngBounds`, `Point`, `Bounds`, `Layer`, `LayerGroup`, `FeatureGroup`,
`GeoJSON`, `Marker`, `Icon`, `DivIcon`, `Popup`, `Tooltip`, `TileLayer`,
`GridLayer`, `Polyline`, `Polygon`, `Rectangle`, `Circle`, `CircleMarker`,
`ImageOverlay`, `VideoOverlay`, `SVGOverlay`, `Control`, `Class`, `Evented`
and `Handler`.

## What behaves differently

**Fractional zoom.** `zoomSnap` defaults to `0`, so the wheel and pinch stop
at any zoom, not only whole levels. For Leaflet's behaviour:

```ts
const map = new Map('map', { zoomSnap: 1 })
```

**Pointer events, not mouse events.** The map and its layers fire
`pointerdown`, `pointerup`, `pointermove`, `pointerover` and `pointerout`.
The mouse names are not fired: a listener for `mousemove` logs an error and
never runs. `click`, `dblclick` and `contextmenu` are unchanged, and the event
still carries `latlng`, `layerPoint`, `containerPoint` and `originalEvent`.

```ts
// Leaflet
map.on('mousemove', e => coords.textContent = e.latlng.toString())
polygon.on('mouseover', () => polygon.setStyle({ weight: 4 }))

// ts-maps
map.on('pointermove', e => coords.textContent = e.latlng.toString())
polygon.on('pointerover', () => polygon.setStyle({ weight: 4 }))
```

**`flyTo` durations are in milliseconds.** Leaflet's `flyTo` and
`flyToBounds` take `duration` in seconds; in ts-maps they take milliseconds,
as `easeTo` does. `setView`, `panTo` and `panBy` keep Leaflet's seconds.

```ts
// Leaflet
map.flyTo([48.8566, 2.3522], 12, { duration: 2 })

// ts-maps
map.flyTo([48.8566, 2.3522], 12, { duration: 2000 })
```

**The default marker needs no images.** `L.Icon.Default` looks for
`marker-icon.png` next to the stylesheet, which bundlers break. The ts-maps
default pin is built into the library.

**Reduced motion.** When the reader has asked their system for less motion,
`flyTo` and `easeTo` arrive without animating. Pass `essential: true` for a
move that has to animate.

## What is new

**Rotation and tilt.** A map has a `bearing` and a `pitch`. Both start at `0`,
so Leaflet code that never mentions them is unaffected.

```ts
const map = new Map('map', { center: [40.758, -73.9855], zoom: 16, bearing: 30, pitch: 60 })

map.easeTo({ bearing: 0, pitch: 0, duration: 800 })
map.jumpTo({ center: [48.8566, 2.3522], zoom: 14 })
map.getCamera() // { center, zoom, bearing, pitch }
```

Two fingers twist and tilt the map on a touch screen, and
`control.navigation()` adds a compass.

**A style.** Sources and style layers, as in Mapbox GL, for vector tiles and
for data of your own:

```ts
map.on('style.load', () => {
  map.addSource('parks', { type: 'geojson', data: '/parks.geojson' })
  map.addStyleLayer({ id: 'parks', type: 'fill', source: 'parks', paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.3 } })
})

map.on('click', 'parks', e => console.log(e.features[0].feature.properties.name))
```

A `GeoJSON` layer still works and is simpler for a few hundred features. A
style source cuts the data into tiles and is the one to use for tens of
thousands.

**3D and the globe.** `fill-extrusion` buildings, `setTerrain`, `setFog`,
glTF landmarks, and `projection: 'globe'`. See [3D rendering](../concepts/3d.md).

## Plugins

Leaflet plugins extend the `L` global and Leaflet's classes, so they do not
load into ts-maps. Much of what the common ones do is built in:

| Leaflet plugin | ts-maps |
| -------------- | ------- |
| `Leaflet.markercluster` | A `geojson` style source with `cluster: true`, or `GeoJSONClusterSource` with your own markers. See [example 07](../examples/07-clusters.md). |
| `Leaflet.heat` | `HeatmapLayer`, or a `heatmap` style layer. |
| `Leaflet.VectorGrid` | `vectorTileLayer(...)`, or a style with a `vector` source. |
| `leaflet-geosearch`, `Leaflet.Control.Geocoder` | `control.search()` or `control.geocoder()`. |
| `leaflet-routing-machine` | `services.defaultDirections()` for routes, `turnByTurn(map)` for guidance. |
| `Leaflet.fullscreen` | `control.fullscreen()` |
| `Leaflet.Locate` | `control.locate()` |
| `leaflet.offline` | `control.offlineMaps()`, or `offlineCache: true` on a tile layer. |
| `Leaflet.draw`, `Leaflet.Editable` | Not built in. `RouteEditor` edits a route; `Marker` dragging moves points. |
