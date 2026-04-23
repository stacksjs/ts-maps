# `TsMap`

The root class. An instance owns one DOM container, one camera, one style document, and a registry of sources and layers.

## Construction

| Signature | Summary |
| --------- | ------- |
| `new TsMap(id, options?)` | Create a map on `#id` or a DOM element. |
| `createMap(id, options?)` | Functional alias for the same constructor. |

## Camera

| Method | Summary |
| ------ | ------- |
| `setView(center, zoom?, options?)` | Set center and optionally zoom. |
| `setZoom(z, options?)` | Set fractional zoom. |
| `zoomIn(delta?, options?)` / `zoomOut(delta?, options?)` | Relative zoom. |
| `setZoomAround(latlng, z, options?)` | Zoom while keeping a point fixed on screen. |
| `fitBounds(bounds, options?)` | Frame a `LatLngBounds` with optional padding. |
| `fitWorld(options?)` | Zoom out to show the whole world. |
| `panTo(latlng, options?)` | Pan to a geographic point. |
| `panBy(offsetPx, options?)` | Pan by a pixel offset. |
| `flyTo(center, zoom?, options?)` | Animated zoom-out / zoom-in arc. |
| `flyToBounds(bounds, options?)` | Fly to frame a bounding box. |
| `easeTo({ center, zoom, bearing, pitch, duration })` | Linear tween of any knobs. |
| `jumpTo({ center, zoom, bearing, pitch })` | Instant update with one event batch. |
| `setBearing(deg)` / `rotateTo(deg, options?)` | Rotate the map. |
| `setPitch(deg)` / `pitchTo(deg, options?)` | Tilt the camera. |
| `stop()` | Abort any in-progress animation. |
| `isEasing()` | Whether an animation is currently running. |
| `setMaxBounds(bounds)`, `setMinZoom(z)`, `setMaxZoom(z)` | Constrain the camera. |
| `panInside(latlng, options?)` / `panInsideBounds(bounds, options?)` | Nudge a point or bbox into view. |

## Camera readers

| Method | Summary |
| ------ | ------- |
| `getCenter()` | Current center as `LatLng`. |
| `getZoom()` / `getBearing()` / `getPitch()` | Camera knobs. |
| `getBounds()` | Visible `LatLngBounds`. |
| `getBoundsZoom(bounds, inside?)` | Zoom level that fits the bounds. |
| `getSize()` | Container pixel `Point`. |
| `getPixelBounds()` / `getPixelOrigin()` / `getPixelWorldBounds(z?)` | Pixel-space helpers. |
| `getMinZoom()` / `getMaxZoom()` | Zoom limits. |
| `getCamera()` | A snapshot of all four camera knobs. |

## Layers & sources (style-spec)

| Method | Summary |
| ------ | ------- |
| `setStyle(doc)` | Swap the full style document with an automatic diff. |
| `getStyle()` | Return the current style document. |
| `isStyleLoaded()` | Whether the style has finished parsing. |
| `addSource(id, source)` / `getSource(id)` / `removeSource(id)` | Source registry. |
| `addStyleLayer(layer, beforeId?)` / `getStyleLayer(id)` / `removeStyleLayer(id)` | Style-layer registry. |
| `setPaintProperty(id, name, value)` / `setLayoutProperty(id, name, value)` | Update a single property. |
| `setFilter(id, filter)` | Update a layer's filter expression. |

## Layers (OO, legacy-style)

| Method | Summary |
| ------ | ------- |
| `map.addLayer(layer)` | Inherited from the layer framework. Accepts any `Layer`. |
| `map.removeLayer(layer)` | Detach a layer. |
| `map.hasLayer(layer)` | Membership check. |
| `map.eachLayer(fn)` | Iterate all attached layers. |

## Feature state

| Method | Summary |
| ------ | ------- |
| `setFeatureState({ source, sourceLayer?, id }, state)` | Attach hover / selected flags, read by expressions via `['feature-state', 'hover']`. |
| `getFeatureState({ source, sourceLayer?, id })` | Read current feature state. |
| `removeFeatureState({ source, sourceLayer?, id }, key?)` | Clear one key or the whole entry. |

## 3D & atmosphere

| Method | Summary |
| ------ | ------- |
| `setFog(fog)` / `getFog()` | Atmospheric fog config (color, horizon-blend, range, star-intensity). |
| `setSky(sky)` / `getSky()` | Sky-layer config (sky / horizon color, sun position). |
| `setTerrain(terrain)` / `getTerrain()` / `getTerrainSource()` | 3D terrain from a raster-dem source. |
| `queryTerrainElevation(lngLat)` | Bilinear elevation lookup in metres. |
| `addCustomLayer(layer)` / `removeCustomLayer(id)` / `getCustomLayer(id)` / `getCustomLayers()` | Pluggable WebGL layer registry. |

## Projection helpers

| Method | Summary |
| ------ | ------- |
| `project(latlng, z?)` / `unproject(point, z?)` | LatLng ↔ pixel at zoom `z`. |
| `latLngToContainerPoint(latlng)` / `containerPointToLatLng(point)` | Respects bearing & pitch. |
| `latLngToLayerPoint(latlng)` / `layerPointToLatLng(point)` | Untransformed pane coordinates. |
| `layerPointToContainerPoint(point)` / `containerPointToLayerPoint(point)` | Coordinate bridges. |
| `pointerEventToContainerPoint(e)` / `pointerEventToLatLng(e)` / `pointerEventToLayerPoint(e)` | DOM-event helpers. |
| `getScaleZoom(scale, fromZ?)` / `getZoomScale(toZ, fromZ?)` | Scale ↔ zoom conversions. |
| `distance(a, b)` | Great-circle distance between two points (metres). |
| `wrapLatLng(ll)` / `wrapLatLngBounds(b)` | Normalize longitudes to [-180, 180]. |

## Events

| Method | Summary |
| ------ | ------- |
| `on(type, handler)` / `off(type, handler)` / `once(type, handler)` | Standard event API (inherited from `Evented`). |
| `on(type, layerId, handler)` | Layer-scoped pointer events. |
| `fire(type, data)` | Emit a synthetic event. |
| `listens(type)` | Whether anything is subscribed. |
| `whenReady(fn)` | Run a callback once the map has loaded. |

## Geolocation

| Method | Summary |
| ------ | ------- |
| `locate(options?)` | Wrap `navigator.geolocation`, fires `locationfound` / `locationerror`. |
| `stopLocate()` | Cancel an active geolocation watch. |

## Lifecycle & DOM

| Method | Summary |
| ------ | ------- |
| `getContainer()` | Host DOM element. |
| `getPane(name?)` / `getPanes()` / `createPane(name, parent?)` | Z-ordered rendering panes. |
| `invalidateSize(options?)` | Re-measure the container (call after CSS changes). |
| `addHandler(name, Class)` | Register a custom input handler. |
| `remove()` | Fully tear down the map. |

## Offline

| Method | Summary |
| ------ | ------- |
| `TileLayer` with `{ cache }` | Pass a `TileCache` into any tile-based layer. |
| `saveOfflineRegion(opts)` | Pre-fetch every tile inside a bbox at a zoom range. |
