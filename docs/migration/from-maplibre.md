# Migrating from MapLibre GL JS

MapLibre GL JS and Mapbox GL JS share an API, so the
[Mapbox guide](./from-mapbox.md) is the one to follow: coordinates as
`[lat, lng]`, `addStyleLayer` for style layers, `style.load` for adding data,
Leaflet-style markers and controls. This page covers what is particular to
MapLibre.

## A first map

MapLibre GL JS:

```ts
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/positron',
  center: [2.3522, 48.8566],
  zoom: 12,
})

map.addControl(new maplibregl.NavigationControl())
```

ts-maps:

```ts
import { control, styles, TsMap } from 'ts-maps'
import 'ts-maps/styles.css'

const map = new TsMap('map', {
  center: [48.8566, 2.3522], // [lat, lng]
  zoom: 12,
  zoomControl: false,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

control.navigation().addTo(map)
```

`styles.light` and `styles.dark` are ts-maps' own OpenMapTiles styles, drawn
from the same OpenFreeMap tiles. A style URL works too —
`style: 'https://example.com/style.json'` — and is fetched for you.

Two things to watch with a style from elsewhere:

- **Give the map `center` and `zoom`.** ts-maps does not take the view from the
  style's root `center` and `zoom`, and a map with neither has no view.
- **Raster sources are always drawn.** A style's `raster` source is drawn at
  every zoom whether or not a layer uses it. OpenFreeMap's Positron, Bright
  and Liberty styles carry a low-zoom shaded-relief raster (`ne2_shaded`) that
  would then cover the land at street level; load the JSON and delete that
  source before `setStyle`.

## The globe

MapLibre sets the globe with a projection object, in the style or on the map.
ts-maps takes a string, on the map:

```ts
// MapLibre
map.setProjection({ type: 'globe' })

// ts-maps
const map = new TsMap('map', {
  center: [30, 10],
  zoom: 2.5,
  projection: 'globe',
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})
map.setProjection('mercator') // and back with 'globe'
```

A `projection` in the style itself is ignored. The globe is drawn with WebGL
from the tiles the flat map has loaded, and fades into the flat map between
zoom 5.5 and 6. See [The globe](../concepts/3d.md#the-globe).

## Terrain

A style's root `terrain` is not applied. Add the `raster-dem` source and call
`setTerrain`, as with MapLibre's `map.setTerrain`:

```ts
map.on('style.load', () => {
  map.addSource('dem', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    tileSize: 256,
    encoding: 'terrarium',
  })
  map.setTerrain({ source: 'dem', exaggeration: 1.3 })
})
```

## PMTiles

MapLibre reads PMTiles through the `pmtiles` package and `addProtocol`.
ts-maps reads `pmtiles://` URLs itself:

```ts
// MapLibre
import { Protocol } from 'pmtiles'
maplibregl.addProtocol('pmtiles', new Protocol().tile)

// ts-maps: nothing to register
map.addSource('area', { type: 'vector', url: 'pmtiles://https://example.com/area.pmtiles' })
```

`ts-maps/pmtiles` reads and writes archives, and `ts-maps/server` serves one
as an ordinary tile server. See [Running a tile server](../concepts/tile-server.md).

## Plugins and controls

| MapLibre | ts-maps |
| -------- | ------- |
| `NavigationControl`, `GeolocateControl`, `FullscreenControl`, `ScaleControl` | `control.navigation()`, `control.locate()`, `control.fullscreen()`, `control.scale()` |
| `GlobeControl` | No button; call `map.setProjection('globe')`. |
| `TerrainControl` | No button; call `map.setTerrain(...)`. |
| `@maplibre/maplibre-gl-geocoder` | `control.search()`, or `control.geocoder()` for a plain box |
| `@maplibre/maplibre-gl-directions` | `services.defaultDirections()`, and `turnByTurn(map)` for guidance |
| `pmtiles` | Built in |
| `@maplibre/maplibre-gl-inspect` | `map.queryRenderedFeatures()` |
| `@mapbox/mapbox-gl-draw`, `terra-draw` | Not built in |

Everything under [Not available](./from-mapbox.md#not-available) in the
Mapbox guide applies here too.
