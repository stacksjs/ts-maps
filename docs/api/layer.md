# Layer classes

Every layer exported from `ts-maps` descends from the abstract `Layer` class. Most have a matching lowercase factory helper — both forms are public API.

## Base

| Class | Signature |
| ----- | --------- |
| `Layer` | Abstract base. `.addTo(map)`, `.remove()`, `.on/off`, `.bindPopup()`, `.bindTooltip()`. |
| `LayerGroup` | `new LayerGroup(layers?)`. `.addLayer/removeLayer`, `.eachLayer`, `.getLayers`. |
| `FeatureGroup` | Extends `LayerGroup` with forwarded events and `.getBounds()`. |

## Markers

| Class | Signature |
| ----- | --------- |
| `Marker` | `new Marker(latlng, options?)` — draggable, with optional icon / title / alt / rise-on-hover. |
| `Icon` | `new Icon({ iconUrl, iconSize, iconAnchor, popupAnchor, shadowUrl? })`. |
| `DefaultIcon` | Built-in default marker icon. |
| `DivIcon` | `new DivIcon({ html, className, iconSize, iconAnchor })` — DOM-based icon. |

## Popup & tooltip

| Class | Signature |
| ----- | --------- |
| `Popup` | `new Popup(options?, source?).setLatLng(ll).setContent(html).openOn(map)`. |
| `Tooltip` | Like `Popup` but lighter; binds via `layer.bindTooltip(...)`. |

## Raster tiles

| Class | Signature |
| ----- | --------- |
| `GridLayer` | Abstract grid-of-tiles layer. Subclass to implement `createTile`. |
| `TileLayer` | `new TileLayer(urlTemplate, options?)`. Options: `tileSize`, `minZoom`, `maxZoom`, `subdomains`, `attribution`, `cache`. |
| `WMSTileLayer` | `tileLayer.wms(baseUrl, { layers, styles?, format? })`. |
| `RasterDEMLayer` | `new RasterDEMLayer(urlTemplate, { encoding, exaggeration, sun })` — hillshade. |

## Vector tiles

| Class | Signature |
| ----- | --------- |
| `VectorTileMapLayer` | `vectorTileLayer({ url, tileSize, layers })`. Exposes `queryRenderedFeatures(pt)`. |

## Data layers

| Class | Signature |
| ----- | --------- |
| `GeoJSON` | `new GeoJSON(geojson, { style, pointToLayer, onEachFeature, filter })`. |
| `GeoJSONClusterSource` | `new GeoJSONClusterSource({ radius, maxZoom, minZoom, minPoints, reduce, map }).load(features)`. |
| `HeatmapLayer` | `new HeatmapLayer({ data, radius, blur, gradient, max, minOpacity })`. |

## Overlays

| Class | Signature |
| ----- | --------- |
| `ImageOverlay` | `new ImageOverlay(url, bounds, options?)`. |
| `VideoOverlay` | `new VideoOverlay(urlOrUrls, bounds, options?)`. |
| `SVGOverlay` | `new SVGOverlay(svgEl, bounds, options?)`. |

## Vector paths

| Class | Signature |
| ----- | --------- |
| `Polyline` | `new Polyline(latlngs, options?)`. |
| `Polygon` | `new Polygon(latlngs, options?)`. |
| `Rectangle` | `new Rectangle(bounds, options?)`. |
| `Circle` | `new Circle(latlng, { radius, ...pathOptions })`. |
| `CircleMarker` | `new CircleMarker(latlng, { radius, ...pathOptions })`. |

## Controls

| Class | Signature |
| ----- | --------- |
| `Control` | Abstract base. `.addTo(map)`, `.setPosition(pos)`. |
| `ZoomControl` | `control.zoom({ position? })`. |
| `AttributionControl` | `control.attribution({ prefix? })`. |
| `ScaleControl` | `control.scale({ metric?, imperial? })`. |
| `LayersControl` | `control.layers(baseLayers, overlays, { collapsed? })`. |

## Symbols

| Class | Signature |
| ----- | --------- |
| `GlyphAtlas` | SDF glyph atlas used by text symbols. |
| `IconAtlas` | Sprite sheet manager. |
| `CollisionIndex` | Priority-based collision detection for placed labels. |
