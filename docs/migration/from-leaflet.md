# Migrating from Leaflet

`ts-maps` models its interactive map API after Leaflet, so most code ports
almost verbatim — renames aside, the ergonomic shape is identical. The
big-ticket additions (vector tiles, style spec, 3D) are new capabilities;
they don't change how your existing code works.

## What stays the same

- `LatLng`, `LatLngBounds`, `Point`, `Bounds`.
- `Layer`, `LayerGroup`, `FeatureGroup`, `GeoJSON`.
- `TileLayer`, `Marker`, `Popup`, `Tooltip`, `Polyline`, `Polygon`,

  `Rectangle`, `Circle`, `CircleMarker`, `ImageOverlay`, `VideoOverlay`,
  `SVGOverlay`.

- `Class`, `Evented`, `Handler`, `Control`.
- The namespace object (`L.marker(...)` → `tsMap.marker(...)`) and the

  classic `new Marker([lat, lng]).addTo(map)` flow.

## Renames

| Leaflet            | ts-maps               |
| ------------------ | --------------------- |
| `L.Map`            | `TsMap`               |
| `L.map(...)`       | `map(...)` / `new TsMap(...)` |
| `L`                | `tsMap`               |
| `window.L`         | `window.tsMap`        |

```diff

- import L from 'leaflet'
+ import tsMap, { TsMap, Marker, tileLayer } from 'ts-maps'

- const map = L.map('map').setView([40.7, -74], 13)
- L.tileLayer('https://tile.example.com/{z}/{x}/{y}.png').addTo(map)
- L.marker([40.7, -74]).addTo(map).bindPopup('hi')
+ const map = new TsMap('map', { center: [40.7, -74], zoom: 13 })
+ tileLayer('https://tile.example.com/{z}/{x}/{y}.png').addTo(map)
+ new Marker([40.7, -74]).addTo(map).bindPopup('hi')

```

## Camera API

Leaflet's `setView(center, zoom)` still works. Additionally, `ts-maps`
ships a Mapbox-style camera:

```ts
map.jumpTo({ center: [lat, lng], zoom, bearing, pitch })
map.easeTo({ zoom: 14, duration: 800 })
map.flyTo({ center: [35.67, 139.65], zoom: 9 })
map.getCamera() // { center, zoom, bearing, pitch, padding }
```

Leaflet has no `bearing` / `pitch`; both default to `0` and don't affect
existing code.

## CSS

```diff

- import 'leaflet/dist/leaflet.css'
+ import 'ts-maps/styles.css'

```

Class names are rebranded from `leaflet-*` to `tsmap-*` / `ts-maps-*`.
If you target those in your stylesheets, update the selectors.

## Plugins

Most Leaflet plugins rely on `L` and DOM class names; they won't work
directly. The equivalent patterns:

| Leaflet plugin              | ts-maps equivalent                                  |
| --------------------------- | --------------------------------------------------- |
| `leaflet.markercluster`     | `GeoJSONClusterSource` (built-in)                   |
| `leaflet-routing-machine`   | `services.defaultDirections()`                      |
| `leaflet-geosearch`         | `services.defaultGeocoder()`                        |
| `leaflet.heat`              | `HeatmapLayer` (built-in)                           |
| `leaflet-offline`           | `TileCache` + `saveOfflineRegion()`                 |
| `Leaflet.VectorGrid`        | `vectorTileLayer(...)` + style spec (built-in)      |

## Events

Leaflet event names carry over. Pointer events have been renamed
internally to reflect the Pointer Events spec (`pointerdown` / `pointermove`
/ `pointerup`). If you listen for `mousedown`, it still works.

Layer-scoped events are new:

```ts
map.on('click', 'roads', (e) => {
  console.log(e.features[0].properties)
})
```
