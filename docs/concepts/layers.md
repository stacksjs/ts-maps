# Layers

There are two ways to put something on a map.

- **Through the style.** Sources and style layers, as in Mapbox GL JS:
  `map.addSource()` and `map.addStyleLayer()`. Your data is drawn by the same
  renderer as the basemap, can sit under its labels, and is styled with
  expressions. See [Style spec](./style-spec.md).
- **As layer objects.** Markers, popups, lines and shapes, GeoJSON, raster
  tiles, heatmaps and overlays, each an object you add, change and remove,
  as in Leaflet. That is this page.

Use the style for a lot of features styled by their data, or anything that
belongs inside the basemap. Use layer objects for a handful of things you
want to click, drag, animate or change one at a time. A map can carry both.

The examples below assume a map like this one:

```ts
import { styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 14,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})
```

## Adding and removing

Every layer object descends from `Layer`. Add it with `layer.addTo(map)` or
`map.addLayer(layer)`; take it off with `layer.remove()` or
`map.removeLayer(layer)`. `map.hasLayer(layer)` says whether it is on, and
`map.eachLayer(fn)` visits every one.

Each class has a lower-case factory that does the `new` for you: `marker()`,
`polyline()`, `tileLayer()` and so on. Both spellings make the same object.

The map fires `layeradd` and `layerremove`; the layer fires `add` and
`remove`.

## Markers

A `Marker` pins an icon to a place. It is drawn as HTML over the map, so it
can be clicked, focused with the keyboard and dragged.

```ts
import { DivIcon, Marker } from 'ts-maps'

const pin = new DivIcon({
  className: '',
  html: '<div class="pin"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 26], // the point of the pin, from its top left
  popupAnchor: [0, -22],
})

const marker = new Marker([40.758, -73.9855], { icon: pin, draggable: true, title: 'Times Square' })
  .addTo(map)

marker.on('dragend', () => console.log(marker.getLatLng()))
```

- `Icon` draws an image: `new Icon({ iconUrl, iconSize, iconAnchor })`, with
  `iconRetinaUrl` and a shadow if you have them.
- `DivIcon` draws HTML of your own, styled with your CSS.
- Without an `icon`, a marker gets the default blue pin.

`setLatLng`, `setIcon`, `setOpacity` and `setZIndexOffset` change a marker
after it is added. A draggable marker fires `dragstart`, `drag` and
`dragend`.

## Popups and tooltips

Any layer can carry a popup, opened on click, and a tooltip, shown on hover:

```ts
marker
  .bindPopup('<b>Times Square</b><br>Manhattan')
  .bindTooltip('Times Square')
  .openPopup()
```

A popup closes when another opens, on Escape, and when the map is clicked;
`autoClose`, `closeOnEscapeKey` and the map's `closePopupOnClick` turn each
off. `map.openPopup(content, latlng)` opens one with no layer behind it. A
tooltip can stay up with `permanent: true`, or follow the pointer with
`sticky: true`.

## Lines, polygons and circles

```ts
import { Circle, Polygon, Polyline } from 'ts-maps'

new Polyline([[40.7484, -73.9857], [40.7527, -73.9772], [40.758, -73.9855]], {
  color: '#4f46e5',
  weight: 4,
}).addTo(map)

new Polygon([[40.7644, -73.9730], [40.7681, -73.9819], [40.7967, -73.9580], [40.8003, -73.9498]], {
  color: '#059669',
  fillOpacity: 0.3,
}).addTo(map)

new Circle([40.7536, -73.9832], { radius: 150 }).addTo(map) // metres
```

`Polyline`, `Polygon`, `Rectangle`, `Circle` (radius in metres) and
`CircleMarker` (radius in pixels) share their style options: `color`,
`weight`, `opacity`, `dashArray`, `fill`, `fillColor`, `fillOpacity`.
`setStyle({ … })` changes them later, and `setLatLngs` changes the shape.

They are drawn in SVG unless the map was made with `preferCanvas: true`. One
canvas is quicker for thousands of shapes; SVG gives each shape an element
you can style with CSS. A layer can choose for itself:

```ts
import { Canvas, Polyline } from 'ts-maps'

new Polyline([[40.7484, -73.9857], [40.758, -73.9855]], { renderer: new Canvas() }).addTo(map)
```

## GeoJSON

`GeoJSON` turns a feature collection into markers and shapes, one layer per
feature:

```ts
import { CircleMarker, GeoJSON } from 'ts-maps'

const featureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Bryant Park', color: '#059669' }, geometry: { type: 'Point', coordinates: [-73.9832, 40.7536] } },
    { type: 'Feature', properties: { name: '42nd St' }, geometry: { type: 'LineString', coordinates: [[-73.9918, 40.7590], [-73.9725, 40.7505]] } },
  ],
}

new GeoJSON(featureCollection, {
  style: feature => ({ color: feature.properties.color ?? '#3b82f6', weight: 2 }),
  pointToLayer: (feature, latlng) => new CircleMarker(latlng, { radius: 6 }),
  onEachFeature: (feature, layer) => layer.bindPopup(feature.properties.name),
  filter: feature => feature.properties.visible !== false,
}).addTo(map)
```

Points become markers unless `pointToLayer` says otherwise. `addData(geojson)`
adds more, and `setStyle(fn)` restyles every feature.

For thousands of features, a GeoJSON _source_ in the style is the faster
choice: it is cut into tiles and drawn by the vector renderer. See
[Style spec](./style-spec.md#adding-your-own-data).

## Groups

`LayerGroup` holds any number of layers, so they can be added and removed
together. `FeatureGroup` is a `LayerGroup` that also passes on its layers'
events and has `getBounds()`, which is what `fitBounds` wants:

```ts
import { FeatureGroup, Marker } from 'ts-maps'

const stops = new FeatureGroup([
  new Marker([40.7527, -73.9772]),
  new Marker([40.7580, -73.9855]),
]).addTo(map)

map.fitBounds(stops.getBounds(), { padding: [40, 40] })
stops.on('click', e => console.log('clicked a stop', e.propagatedFrom))
```

`clearLayers()` empties a group, and `eachLayer(fn)` visits its layers.

## Clustering

`GeoJSONClusterSource` groups points that would overlap at a zoom. It is the
supercluster algorithm with nothing to install. Load points, then ask for the
clusters in a box at a zoom:

```ts
import { GeoJSONClusterSource } from 'ts-maps'

const index = new GeoJSONClusterSource({ radius: 60, extent: 256, maxZoom: 16 })
index.load([
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-73.9855, 40.758] }, properties: {} },
  // … GeoJSON point features, [lng, lat] as GeoJSON has it
])

const b = map.getBounds()
for (const f of index.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], Math.floor(map.getZoom()))) {
  // A cluster has properties.cluster === true and properties.point_count.
}
```

`getClusterExpansionZoom(id)` is the zoom at which a cluster comes apart,
and `getLeaves(id)` the points in it. The
[clusters example](../examples/07-clusters.md) draws them as bubbles that
regroup as you zoom.

A GeoJSON style source with `cluster: true` does the same inside the style;
see [Style spec](./style-spec.md#adding-your-own-data).

## Heatmaps

`HeatmapLayer` draws the density of a set of points:

```ts
import { HeatmapLayer } from 'ts-maps'

const heat = new HeatmapLayer({
  data: [{ lat: 40.758, lng: -73.9855, weight: 1 } /* , … */],
  radius: 25, // default 25
  blur: 15, // default 15
  gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' },
}).addTo(map)

heat.setData([{ lat: 40.75, lng: -73.99 }, { lat: 40.76, lng: -73.97, weight: 2 }])
heat.addPoint({ lat: 40.76, lng: -73.98 })
```

Without `max`, the densest spot on screen is the top of the ramp and the rest
is shaded against it, so many points do not run together into one red blob.
Set `max` to fix the scale instead. The
[heatmap example](../examples/05-heatmap.md) changes the ramp as it runs. A
`heatmap` style layer draws the same thing from a style source; see
[Styles & theming](./styles-and-theming.md#density-fields-and-terrain-shading).

## Raster tiles

`TileLayer` draws a grid of image tiles from a URL template. `{z}`, `{x}` and
`{y}` are the tile, `{s}` one of `subdomains`, and `{r}` becomes `@2x` on a
high-density screen.

```ts
import { tileLayer } from 'ts-maps'

tileLayer('https://tiles.example.com/{z}/{x}/{y}.png', {
  attribution: '© Example',
  maxZoom: 19,
  opacity: 0.6,
}).addTo(map)
```

Raster tiles suit imagery, scanned maps and overlays rendered on a server.
For the basemap itself, prefer the vector styles in
[Styles & theming](./styles-and-theming.md): they are sharper, can be
restyled, and do not lean on a shared server. OpenStreetMap's own tile
server, in particular, has a usage policy that rules out app traffic.

`tileLayer.wms(url, { layers, format, transparent })` asks an OGC WMS server
for the same grid.

## Vector tile layers

`VectorTileMapLayer` draws Mapbox Vector Tiles with style layers of its own,
outside the map's style. Mostly you want the map's style instead: a source
and its layers in `setStyle`, which also gets you `addStyleLayer`,
`setPaintProperty` and the rest. The layer object is there for a vector
overlay you want to add and remove as one thing.

```ts
import { resolveTileJSON, vectorTileLayer } from 'ts-maps'

const planet = await resolveTileJSON(['https://tiles.openfreemap.org/planet'])
if (planet) {
  vectorTileLayer({
    url: planet.tiles,
    attribution: planet.attribution,
    // In the layer's own zooms: 512 px tiles sit one above the server's.
    sourceMaxZoom: (planet.maxzoom ?? 14) + 1,
    layers: [
      { id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#0ea5e9' } },
      { id: 'roads', type: 'line', sourceLayer: 'transportation', paint: { 'line-color': '#444', 'line-width': 1 } },
    ],
  }).addTo(map)
}
```

Its `url` is a tile template or a `pmtiles://` archive, not a TileJSON;
`resolveTileJSON` reads the template from one. Style layers here write
`sourceLayer` rather than `source-layer`. [Vector tiles](./vector-tiles.md)
goes into the layer in depth.

## Hillshade

`RasterDEMLayer` (also exported as `HillshadeLayer`) shades terrain from
elevation tiles:

```ts
import { RasterDEMLayer } from 'ts-maps'

// AWS's open Terrain Tiles: keyless, Terrarium-encoded.
new RasterDEMLayer('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', {
  encoding: 'terrarium', // or 'mapbox' for Terrain-RGB tiles
  tileSize: 256,
  maxNativeZoom: 15,
  exaggeration: 0.5, // default 0.5
  azimuth: 335, // where the light comes from, default 335°
  altitude: 45, // default 45°
}).addTo(map)
```

In a styled map, a `hillshade` layer over a `raster-dem` source does the
same, and `setTerrain` on that source raises the ground into 3D and gives
you its height anywhere; see [Terrain](./terrain.md).

## Image, video and SVG overlays

`ImageOverlay`, `VideoOverlay` and `SVGOverlay` stretch one image, video or
SVG element over a box on the map:

```ts
import { ImageOverlay } from 'ts-maps'

new ImageOverlay('/plans/hall.png', [[40.7570, -73.9870], [40.7590, -73.9840]], {
  opacity: 0.8,
}).addTo(map)
```

A video starts playing and loops by default (`autoplay`, `loop`). Browsers
only autoplay a silent video, so pass `muted: true` unless a click starts it.

## More

- **Territory, run trails and route editing:** `TerritoryLayer`,
  `RunTrailLayer` and `RouteEditor`, in
  [Territory capture](./territory-capture.md).
- **Landmarks and trees:** 3D models and trees standing on the map, in
  [3D rendering](./3d.md#landmarks).
- **Traffic:** `trafficLayer()`, in [Map types](./map-types.md#traffic).
- **Indoor maps:** `indoorMap()`, in [Indoor maps](./indoor.md).
- **Custom WebGL:** `map.addCustomLayer()`, in
  [3D rendering](./3d.md#custom-webgl-layers).
