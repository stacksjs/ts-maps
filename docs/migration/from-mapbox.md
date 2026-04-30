# Migrating from Mapbox GL JS

`ts-maps` implements a Mapbox-style API (style spec, expressions,
`addSource` / `addLayer`, `setFog` / `setSky` / `setTerrain`,
`queryRenderedFeatures`, layer-scoped events) without the `mapbox-gl`
runtime dependency or the Mapbox account requirement.

## What stays the same

- The style spec: `fill`, `line`, `circle`, `symbol`, `raster`,

  `background`, `fill-extrusion`, `heatmap` layer types.

- Expressions: `interpolate`, `step`, `case`, `match`, `coalesce`,

  `get`, `has`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `all`, `any`,
  `zoom`, `literal`, `concat`, `to-number`, `to-string`, `to-boolean`,
  `feature-state`, `number-format`.

- Layer-scoped events: `map.on('click', 'layer-id', handler)`.
- Camera API: `jumpTo` / `easeTo` / `flyTo` / `getCamera`.
- 3D: `setFog`, `setSky`, `setTerrain`, `fill-extrusion`,

  `CustomLayerInterface`.

- Services: geocoding / directions / isochrones / matrix share the same

  conceptual shape; the providers are named here (Nominatim, OSRM,
  Valhalla, Mapbox, Google).

## Renames

| mapbox-gl                   | ts-maps                                      |
| --------------------------- | -------------------------------------------- |
| `mapboxgl.Map`              | `TsMap`                                      |
| `new mapboxgl.Map({...})`   | `new TsMap(container, {...})`                |
| `mapboxgl.Marker`           | `Marker`                                     |
| `mapboxgl.Popup`            | `Popup`                                      |
| `mapboxgl.accessToken`      | N/A (keyless providers by default)           |
| `map.setFilter(id, filter)` | `map.setFilter(id, filter)` (same)           |

```diff

- import mapboxgl from 'mapbox-gl'
- import 'mapbox-gl/dist/mapbox-gl.css'
- mapboxgl.accessToken = 'pk.xxx'
- const map = new mapboxgl.Map({ container: 'map', center: [-74, 40], zoom: 13 })
+ import 'ts-maps/styles.css'
+ import { TsMap, tileLayer } from 'ts-maps'
+ const map = new TsMap('map', { center: [40, -74], zoom: 13 })
+ tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

```

Note: `ts-maps` uses `[lat, lng]` in its camera options (to match its
Leaflet heritage). Most other APIs (style spec, expressions) use
`[lng, lat]` like Mapbox.

## Style spec

```ts
map.setStyle({
  version: 8,
  sources: {
    osm: { type: 'vector', tiles: ['https://tiles.example.com/{z}/{x}/{y}.pbf'] },
  },
  layers: [
    { id: 'water', type: 'fill', source: 'osm', 'source-layer': 'water',
      paint: { 'fill-color': '#0ea5e9' } },
  ],
})

map.addSource('cities', { type: 'geojson', data: geojson })
map.addLayer({ id: 'city-circles', type: 'circle', source: 'cities',
  paint: { 'circle-radius': 4, 'circle-color': '#ef4444' } })
```

## Expressions

```ts
map.addLayer({
  id: 'primary-roads',
  type: 'line',
  source: 'osm',
  'source-layer': 'transportation',
  filter: ['match', ['get', 'class'], ['primary', 'trunk'], true, false],
  paint: {
    'line-color': '#6b7280',
    'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 3],
  },
})
```

## Services — no account required

```ts
import { services } from 'ts-maps'

// Keyless defaults (Nominatim + OSRM):
const hits = await services.defaultGeocoder().search('Tower Bridge, London')
const routes = await services.defaultDirections().getDirections([A, B])

// Explicit Mapbox provider when you want it:
import { MapboxGeocoder } from 'ts-maps/services'
const geocoder = new MapboxGeocoder({ accessToken: 'pk.xxx' })
```

## Static image export

```ts
const dataUrl = await map.toDataURL()
const blob = await map.toBlob('image/png')
```

Mapbox's `map.getCanvas().toDataURL()` requires `preserveDrawingBuffer: true`
on map construction; `ts-maps` handles the readback issue for you.

## Not yet on parity

- `map.setMaxBounds` accepts the same shape as Mapbox, but fit-to-bounds

  semantics are Leaflet-style (no automatic padding).

- `map.getFreeCameraOptions()` is not implemented.
- Mapbox's 3D lighting / ambient-occlusion controls are only partial.
