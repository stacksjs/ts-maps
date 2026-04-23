# Layer taxonomy

ts-maps organises rendered content into layers. Every layer descends from `Layer` and can be added with `layer.addTo(map)` or `map.addLayer(layer)`, and removed with `map.removeLayer(layer)`.

## Raster tile layers

`TileLayer` fetches standard XYZ raster tiles and paints them in a grid. `WMSTileLayer` wraps any OGC WMS server.

```ts
import { tileLayer } from 'ts-maps'

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map)

// WMS:
tileLayer.wms('https://example.com/wms', { layers: 'topo' }).addTo(map)
```

## Vector tile layers

`VectorTileMapLayer` decodes Mapbox Vector Tiles (MVT / PBF) and renders them through style layers. Each style layer references a source layer inside the tile and produces fills, lines, or circles.

```ts
import { vectorTileLayer } from 'ts-maps'

vectorTileLayer({
  url: 'https://tiles.example.com/{z}/{x}/{y}.pbf',
  tileSize: 512,
  layers: [
    { id: 'water',  type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0ea5e9' } },
    { id: 'roads',  type: 'line', sourceLayer: 'roads', paint: { 'line-color': '#444', 'line-width': 1 } },
    { id: 'places', type: 'circle', sourceLayer: 'place', paint: { 'circle-radius': 4 } },
  ],
}).addTo(map)
```

## Heatmap layer

`HeatmapLayer` renders a density field on a full-viewport canvas. Control `radius`, `blur` and `gradient`.

## DEM / hillshade

`RasterDEMLayer` consumes Mapbox Terrain-RGB or Terrarium tiles and renders a hillshade. Configure sun azimuth / altitude and the z-exaggeration.

## Image, video, SVG overlays

`ImageOverlay`, `VideoOverlay`, `SVGOverlay` georeference a single resource onto a `LatLngBounds`.

## GeoJSON

`GeoJSON` converts a feature collection into a hierarchy of vector paths and markers. Per-feature style via the `style` and `pointToLayer` options; per-feature popup via `onEachFeature`.

```ts
import { GeoJSON } from 'ts-maps'

new GeoJSON(featureCollection, {
  style: (f) => ({ color: f.properties.color ?? '#3b82f6', weight: 2 }),
  onEachFeature: (f, layer) => layer.bindPopup(f.properties.name),
}).addTo(map)
```

## Clustering

`GeoJSONClusterSource` is a zero-dep KD-tree clustering engine (compatible with the supercluster algorithm). Feed it a feature array; query with `getClusters(bbox, zoom)`.

## Markers & icons

`Marker` anchors an `Icon` or `DivIcon` to a `LatLng`. Both popups and tooltips can be bound to any layer.

## Vector paths

`Polyline`, `Polygon`, `Rectangle`, `Circle`, `CircleMarker` render via the SVG or Canvas renderer. The map auto-picks a renderer; override with `{ renderer: canvas() }` in the layer options.

## Grouping

`LayerGroup` and `FeatureGroup` collect any number of layers so they can be added, removed, and queried as a unit. `FeatureGroup` additionally forwards events and computes a combined `getBounds()`.
