# Migrating from MapLibre GL JS

MapLibre shares its API and style spec with Mapbox GL JS, so migration
from MapLibre is almost identical to [migrating from Mapbox](./from-mapbox.md).
The differences called out below are what's worth knowing specifically
for MapLibre users.

## What stays the same

Everything listed under [Migrating from Mapbox](./from-mapbox.md#what-stays-the-same)
applies: style spec, expressions, camera API, `setFog` / `setSky` /
`setTerrain`, `fill-extrusion`, `CustomLayerInterface`, layer-scoped
events.

## Renames

| maplibre-gl             | ts-maps                                      |
| ----------------------- | -------------------------------------------- |
| `maplibregl.Map`        | `TsMap`                                      |
| `maplibregl.Marker`     | `Marker`                                     |
| `maplibregl.Popup`      | `Popup`                                      |

```diff
- import maplibregl from 'maplibre-gl'
- import 'maplibre-gl/dist/maplibre-gl.css'
- const map = new maplibregl.Map({ container: 'map', style: 'https://.../style.json' })
+ import 'ts-maps/styles.css'
+ import { TsMap } from 'ts-maps'
+ const styleJson = await (await fetch('https://.../style.json')).json()
+ const map = new TsMap('map', { center: [0, 0], zoom: 2 })
+ map.setStyle(styleJson)
```

## Style URLs

MapLibre accepts a style URL as the `style` option and fetches it for
you. `ts-maps` takes the style as a parsed object — fetch it yourself
(or pass it in as JSON). This also means there is no hardcoded
`mapbox://` / `maplibre://` scheme translation.

## Globe

MapLibre's `projection: 'globe'` at the style level maps 1:1:

```ts
map.setStyle({
  version: 8,
  projection: { type: 'globe' },
  // ...
})
```

Seamless transition around zoom 5.5 and an atmosphere halo are wired up
automatically (see [concepts/3d](../concepts/3d.md)).

## Plugins

| MapLibre plugin                  | ts-maps equivalent                      |
| -------------------------------- | --------------------------------------- |
| `maplibre-gl-geocoder`           | `services.defaultGeocoder()`            |
| `maplibre-gl-directions`         | `services.defaultDirections()`          |
| `@mapbox/mapbox-gl-draw`         | Not yet; open an issue if you need it.  |
| `@maplibre/maplibre-gl-inspect`  | `map.queryRenderedFeatures()` + a UI.   |

## Not yet on parity

- `globeControl`, `maptilerAttributionControl`, and other MapLibre-specific
  controls are not shipped. The built-in `ZoomControl`, `ScaleControl`,
  `AttributionControl`, and `LayersControl` cover most use cases.
- MapLibre's WebGL2-only features (e.g. `render-world-copies: false` at
  extreme zooms) may behave slightly differently.
