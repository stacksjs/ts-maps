# Layers

The things a map holds that are not its style: markers, popups, tile layers,
overlays, shapes, data layers and 3D objects. Each is a class, and most have a
lowercase factory that does the same as `new`:

```ts
import { marker, Marker } from 'ts-maps'

new Marker([51.5, -0.12]).addTo(map)
marker([51.5, -0.12]).addTo(map) // the same
```

Layers here are added with `layer.addTo(map)` or `map.addLayer(layer)`.
Style layers — `fill`, `line`, `symbol` and the rest, drawn from a style's
sources — are a different thing and go through
[`map.addStyleLayer`](./Map.md#style).

## Every layer

`Layer` is the base class. All of the classes below have:

| Method | |
| ------ | - |
| `addTo(map)` / `remove()` / `removeFrom(mapOrGroup)` | |
| `on(type, fn)` / `off(type, fn)` / `once(type, fn)` / `fire(type, data?)` | Events, as on the map. |
| `bindPopup(content, options?)` / `openPopup()` / `closePopup()` / `togglePopup()` / `unbindPopup()` | A popup that opens on click. |
| `bindTooltip(content, options?)` / `openTooltip()` / `closeTooltip()` / `unbindTooltip()` | A tooltip that opens on hover. |
| `getPane()` / `getAttribution()` | |

Every layer fires `add` and `remove` on itself, and the map fires `layeradd`
and `layerremove`.

## Groups

| Class | Factory | |
| ----- | ------- | - |
| `LayerGroup(layers?)` | `layerGroup` | Add and remove several layers as one. `addLayer`, `removeLayer`, `hasLayer`, `clearLayers`, `eachLayer`, `getLayers`, `getLayer(id)`, `setZIndex`. |
| `FeatureGroup(layers?)` | `featureGroup` | A `LayerGroup` that passes its layers' events on, with `getBounds()`, `setStyle()`, `bringToFront()` and `bringToBack()`. |

```ts
const stops = featureGroup([marker(a), marker(b), marker(c)]).addTo(map)
map.fitBounds(stops.getBounds(), { padding: [40, 40] })
```

## Markers

| Class | Factory | |
| ----- | ------- | - |
| `Marker(latlng, options?)` | `marker` | A point with an icon. |
| `Icon(options)` | `icon` | An image icon: `iconUrl`, `iconRetinaUrl`, `iconSize`, `iconAnchor`, `popupAnchor`, `tooltipAnchor`, `shadowUrl`, `shadowSize`, `shadowAnchor`, `className`. |
| `DivIcon(options)` | `divIcon` | An HTML icon: `html`, `className` (default `'tsmap-div-icon'`), `iconSize` (default `[12, 12]`), `iconAnchor`, `bgPos`. |
| `DefaultIcon` | | The default pin, built in, with no image files to host. |

Marker options: `icon`, `draggable` (`false`), `title`, `alt` (`'Marker'`),
`opacity` (`1`), `zIndexOffset`, `riseOnHover`, `riseOffset`, `keyboard`
(`true`), `interactive` (`true`), `autoPanOnFocus`, `pane` (`'markerPane'`).

Methods: `getLatLng()`, `setLatLng(latlng)`, `setIcon(icon)`, `getIcon()`,
`setOpacity(n)`, `setZIndexOffset(n)`, `getElement()`. A draggable marker has
`marker.dragging.enable()` / `disable()`, and fires `dragstart`, `drag`,
`dragend` and `move`.

```ts
const pin = new DivIcon({ className: '', html: '<div class="pin"></div>', iconSize: [26, 26], iconAnchor: [13, 26] })
new Marker([40.758, -73.9855], { icon: pin, draggable: true })
  .addTo(map)
  .on('dragend', e => console.log(e.target.getLatLng()))
```

## Popups and tooltips

| Class | Factory | |
| ----- | ------- | - |
| `Popup(options?, source?)` | `popup` | A card anchored to a point. |
| `Tooltip(options?, source?)` | `tooltip` | A small label. |

Both have `setLatLng(latlng)`, `setContent(htmlOrElement)`, `getContent()`,
`openOn(map)`, `close()`, `toggle()`, `isOpen()`, `getElement()` and
`update()`.

Popup options: `maxWidth` (`300`), `minWidth` (`50`), `maxHeight`, `offset`
(`[0, 7]`), `autoPan` (`true`), `autoPanPadding` (`[5, 5]`), `keepInView`,
`closeButton` (`true`), `autoClose` (`true`), `closeOnClick`,
`closeOnEscapeKey` (`true`), `className`.

Tooltip options: `direction` (`'auto'`; or `'top'`, `'bottom'`, `'left'`,
`'right'`, `'center'`), `permanent` (`false`), `sticky` (`false`), `offset`,
`opacity` (`0.9`).

```ts
new Popup().setLatLng([51.5074, -0.1278]).setContent('<b>London</b>').openOn(map)
marker([51.5, -0.09]).bindTooltip('Bank', { permanent: true, direction: 'top' }).addTo(map)
```

## Tile layers

| Class | Factory | |
| ----- | ------- | - |
| `TileLayer(urlTemplate, options?)` | `tileLayer` | Image tiles from `{z}/{x}/{y}` URLs. `{s}` picks a subdomain, `{r}` adds `@2x` on high-DPI screens with `detectRetina`. |
| `WMSTileLayer(baseUrl, options)` | `tileLayer.wms` | A WMS service. Options: `layers`, `styles`, `format` (`'image/jpeg'`), `transparent`, `version` (`'1.1.1'`), `crs`, `uppercase`. |
| `GridLayer(options?)` | `gridLayer` | The base of both: subclass it and implement `createTile(coords, done)` to draw tiles yourself. |
| `VectorTileMapLayer(options)` | `vectorTileLayer` | Vector tiles drawn with style layers. See below. |
| `RasterDEMLayer(urlTemplate, options?)` | `rasterDEMLayer` | Hillshading from elevation tiles. Also exported as `HillshadeLayer`. |

TileLayer options: `attribution`, `minZoom` (`0`), `maxZoom` (`18`),
`minNativeZoom`, `maxNativeZoom` (scale the top tiles up above this),
`tileSize` (`256`), `subdomains` (`'abc'`), `zoomOffset`, `tms`,
`detectRetina`, `crossOrigin`, `errorTileUrl`, `opacity`, `zIndex`, `bounds`,
`noWrap`, `offlineCache` (`true` for the shared `TileCache`, or a cache of
your own). Methods: `setUrl(url)`, `redraw()`, `setOpacity(n)`,
`setZIndex(n)`, `isLoading()`.

```ts
tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors',
}).addTo(map)
```

RasterDEMLayer options: `encoding` (`'mapbox'` or `'terrarium'`),
`exaggeration`, `azimuth`, `altitude`, `accentColor`, `shadowColor`,
`opacity`, `tileSize` (`512`). It requests tiles with CORS on, since it reads
their pixels.

### `VectorTileMapLayer`

Most maps get vector tiles through a style
([`setStyle`](./Map.md#style)), which builds these layers itself. Use one
directly to put a vector source on a map without a style.

```ts
import { resolveTileJSON, vectorTileLayer } from 'ts-maps'

// OpenFreeMap publishes its current tile URL in a TileJSON.
const found = await resolveTileJSON('https://tiles.openfreemap.org/planet')

vectorTileLayer({
  url: found!.tiles,
  tileSize: 512,
  layers: [
    { id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': '#9cc3e6' } },
    {
      id: 'roads',
      type: 'line',
      sourceLayer: 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
      paint: { 'line-color': '#f2a33a', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 6] },
    },
  ],
}).addTo(map)
```

Options: `url` (a `{z}/{x}/{y}` template or a `pmtiles://` archive),
`localSource` (tiles made in-process, such as a `GeoJSONTileSource`),
`layers`, `tileSize`, `sourceMaxZoom` (the source's top zoom; above it tiles
are cut from their ancestors), `attribution`, `workers` (decode on worker
threads, default `true`), `renderer` (`'canvas2d'` default, or `'webgl'` for
fills, lines and circles), `offlineCache`.

A style layer here has `id`, `type`, `sourceLayer`, and optionally `minzoom`,
`maxzoom`, `filter`, `paint` and `layout`. `type` is one of `fill`,
`fill-extrusion`, `line`, `circle` and `symbol`. Note `sourceLayer`, not the
style spec's `source-layer`.

Methods: `queryRenderedFeatures(point?, options?)` and
`querySourceFeatures({ sourceLayer?, filter? })`, as on the
[map](./Map.md#querying-features); `setStyleLayers(layers)` to replace the
layers; `getStyleLayer(id)`; `sourceReady()`, a promise for a `pmtiles://`
archive's header.

## Data layers

| Class | Factory | |
| ----- | ------- | - |
| `GeoJSON(geojson?, options?)` | `geoJSON` | Markers and shapes from GeoJSON, one layer per feature. |
| `HeatmapLayer(options)` | `heatmapLayer` | A density field over points. |
| `GeoJSONClusterSource(options?)` | | A point clustering index. Not a layer: it answers which clusters are in view. |
| `GeoJSONTileSource(data?, options?)` | | GeoJSON cut into vector tiles in memory, for `VectorTileMapLayer`'s `localSource`. |

GeoJSON options: `style(feature)` or a path style object,
`pointToLayer(feature, latlng)`, `onEachFeature(feature, layer)`,
`filter(feature)`, `coordsToLatLng(coords)`. Methods: `addData(geojson)`,
`setStyle(style)`, `resetStyle(layer?)`, `toGeoJSON()`.

```ts
geoJSON(parks, {
  style: { color: '#16a34a', weight: 1, fillOpacity: 0.3 },
  onEachFeature: (feature, layer) => layer.bindPopup(feature.properties.name),
}).addTo(map)
```

HeatmapLayer options: `data` (`{ lat, lng, weight? }[]`), `radius` (`25`),
`blur` (`15`), `gradient` (stops from 0 to 1 to colours), `max`,
`minOpacity`. Without `max`, the densest spot in view is the top of the ramp.
Methods: `setData(points)`, `addPoint(point)`, `clearData()`,
`setOptions(options)`, `redraw()`.

GeoJSONClusterSource options: `radius` (`40`, in units of `extent`), `extent`
(`512`), `minZoom` (`0`), `maxZoom` (`16`), `minPoints` (`2`), `reduce`,
`map`. Methods: `load(features)`, `getClusters([west, south, east, north],
zoom)`, `getChildren(id)`, `getLeaves(id, limit?, offset?)`,
`getClusterExpansionZoom(id)`, `getTile(z, x, y)`. A cluster's properties
carry `cluster: true` and `point_count`. In a style, a `geojson` source with
`cluster: true` uses it for you.

## Overlays

| Class | Factory | |
| ----- | ------- | - |
| `ImageOverlay(url, bounds, options?)` | `imageOverlay` | An image stretched over bounds. |
| `VideoOverlay(video, bounds, options?)` | `videoOverlay` | A video: a URL, a list of URLs, or a `<video>`. Options: `autoplay` (`true`), `loop` (`true`), `muted` (`false`), `controls`, `playsInline`, `keepAspectRatio`. |
| `SVGOverlay(svgElement, bounds, options?)` | `svgOverlay` | An `<svg>` element over bounds. |

ImageOverlay options: `opacity` (`1`), `alt`, `interactive` (`false`),
`crossOrigin`, `errorOverlayUrl`, `zIndex`, `className`. Methods:
`setUrl(url)`, `setBounds(bounds)`, `setOpacity(n)`, `setZIndex(n)`,
`getBounds()`, `getElement()`.

## Shapes

| Class | Factory | |
| ----- | ------- | - |
| `Polyline(latlngs, options?)` | `polyline` | A line. Options add `smoothFactor` (`0.5`) and `noClip`. |
| `Polygon(latlngs, options?)` | `polygon` | A filled shape. Pass rings `[outer, hole, …]` for holes. |
| `Rectangle(bounds, options?)` | `rectangle` | |
| `Circle(latlng, { radius, … })` | `circle` | Radius in metres. |
| `CircleMarker(latlng, { radius, … })` | `circleMarker` | Radius in pixels (default `10`). |

Shared path options, with defaults: `stroke` (`true`), `color`
(`'#3388ff'`), `weight` (`3`), `opacity` (`1`), `lineCap` and `lineJoin`
(`'round'`), `dashArray`, `dashOffset`, `fill` (`false`; `true` for polygons
and circles), `fillColor`, `fillOpacity` (`0.2`), `fillRule`, `className`,
`interactive` (`true`), `renderer`.

Methods: `setStyle(options)`, `bringToFront()`, `bringToBack()`,
`getElement()`, `redraw()`. Lines and polygons add `getLatLngs()`,
`setLatLngs()`, `addLatLng()`, `getBounds()` and `getCenter()`; circles add
`getLatLng()`, `setLatLng()`, `getRadius()` and `setRadius()`.

Shapes draw with SVG by default, or on a canvas with the map's
`preferCanvas: true` or a `renderer: new Canvas()` per shape.

```ts
polyline(route.geometry, { color: '#4f46e5', weight: 5 }).addTo(map)
circle([51.508, -0.11], { radius: 500, color: '#e11d48' }).addTo(map)
```

## 3D objects

| Export | |
| ------ | - |
| `landmark(options)` / `Landmark` | A glTF model standing in for a building. Options: `model` (a `.glb` or `.gltf` URL, bytes, or a parsed model), `position`, `altitude`, `rotation`, `scale`, `replace` (hide the extruded building under it), `minZoom`, `opacity`. |
| `trees(options?)` / `Trees` | Trees planted in the basemap's woods and parks when the map tilts. Options: `spacing`, `maxPerTile`, `minZoom`, `minPitch`, `colors`, `height`. |

Both are drawn with the extruded buildings, in the same depth buffer. See
[3D rendering](../concepts/3d.md).

```ts
landmark({ model: '/models/transamerica.glb', position: [37.7952, -122.4028] }).addTo(map)
trees().addTo(map)
```

## Traffic

`trafficLayer(options?)` / `TrafficLayer` colours roads by congestion from a
traffic provider's flow tiles and shows incidents. Mapbox Traffic and TomTom
are built in (`trafficSources`); both need your key. Methods: `addTo(map)`,
`remove()`, `toggle(map)`, `refresh()`.

## Territory games

`territoryLayer`, `runTrailLayer` and `routeEditor` draw the territories, the
run in progress and an editable route for a territory-capture game. See
[Territory capture](../concepts/territory-capture.md).

## Related

- Controls — zoom, navigation, search, map type, offline maps, Look Around,
  indoor maps — are in [Controls](../concepts/controls.md).
- Labels with collision are drawn by the style's `symbol` layers. The pieces
  behind them (`CollisionIndex`, `GlyphAtlas`, `IconAtlas`) are in
  `ts-maps/symbols`.
