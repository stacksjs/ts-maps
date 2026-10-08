# API reference

What `ts-maps` exports, grouped by what it is for. The pages below document
the larger pieces in full; the [concepts](../concepts/map.md) pages explain
how they fit together, with more examples.

| Page | |
| ---- | - |
| [`TsMap`](./TsMap.md) | The map: options, camera, style, queries, feature state, events, 3D, projection, export. |
| [Layers](./layer.md) | Markers, popups, tile layers, vector tiles, GeoJSON, heatmaps, overlays, shapes, 3D objects. |
| [Expressions](./expressions.md) | The style expression operators, and how to evaluate one yourself. |
| [Geometry](./geometry.md) | `LatLng`, `LatLngBounds`, `Point`, `Bounds`, area, distance and polygon operations. |

```ts
import { control, Marker, styles, TsMap } from 'ts-maps'
import 'ts-maps/styles.css'

const map = new TsMap('map', {
  center: [51.5072, -0.1276],
  zoom: 14,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

control.search().addTo(map)
new Marker([51.5072, -0.1276]).addTo(map).bindPopup('Trafalgar Square')
```

Everything is a named export. The default export, `tsMap`, gathers the
common ones in one object; in a browser, importing `ts-maps` also sets it as
`window.tsMap`.

## Map

| Export | |
| ------ | - |
| `TsMap`, `Map` | The map class. See [`TsMap`](./TsMap.md). |
| `createMap(container, options)`, `map(...)` | `new TsMap(...)` as a function. |
| `MapOptions` | The options type. |
| `DragHandler`, `ScrollWheelZoomHandler`, `PinchZoomHandler`, `BoxZoomHandler`, `DoubleClickZoomHandler`, `KeyboardHandler`, `TwoFingerRotateHandler`, `TwoFingerPitchHandler`, `TapHoldHandler`, `CooperativeGesturesHandler` | The interaction handlers, on every map as `map.dragging`, `map.scrollWheelZoom` and so on. |
| `version` | The library's version string. |

## Layers

All in [Layers](./layer.md).

| Export | |
| ------ | - |
| `Layer`, `LayerGroup`, `FeatureGroup` | The base class, and groups. |
| `Marker`, `Icon`, `DivIcon`, `DefaultIcon`, `Popup`, `Tooltip` | Points and the cards on them. |
| `TileLayer`, `WMSTileLayer`, `GridLayer`, `RasterDEMLayer` (`HillshadeLayer`) | Image tiles and hillshading. |
| `VectorTileMapLayer` | Vector tiles drawn with style layers. |
| `GeoJSON`, `HeatmapLayer`, `GeoJSONClusterSource`, `GeoJSONTileSource` | Data. |
| `ImageOverlay`, `VideoOverlay`, `SVGOverlay` | Pictures over bounds. |
| `Polyline`, `Polygon`, `Rectangle`, `Circle`, `CircleMarker`, `Path`, `SVG`, `Canvas` | Shapes, and the renderers that draw them. |
| `Landmark`, `Trees`, `loadModel`, `parseGLB`, `modelFromGltf`, `roofOf` | 3D objects: glTF landmarks, trees and roof shapes. |
| `TrafficLayer`, `trafficSources`, `TomTomIncidents` | Live traffic. |
| `TerritoryLayer`, `RunTrailLayer`, `RouteEditor` | For territory-capture games. |

Factories: `marker`, `icon`, `divIcon`, `popup`, `tooltip`, `layerGroup`,
`featureGroup`, `geoJSON` (`geoJson`), `gridLayer`, `tileLayer`,
`tileLayer.wms`, `vectorTileLayer`, `heatmapLayer`, `rasterDEMLayer`,
`imageOverlay`, `videoOverlay`, `svgOverlay`, `polyline`, `polygon`,
`rectangle`, `circle`, `circleMarker`, `landmark`, `trees`, `trafficLayer`,
`territoryLayer`, `runTrailLayer`, `routeEditor`.

## Controls

Each is a class, and `control.*` makes one. See
[Controls](../concepts/controls.md).

| Factory | Class | |
| ------- | ----- | - |
| `control.zoom()` | `ZoomControl` | `+` and `−`. On by default (`zoomControl: false` to leave it off). |
| `control.navigation()` | `NavigationControl` | Zoom buttons and a compass. Click the compass to turn back to north. |
| `control.attribution()` | `AttributionControl` | Credits from the layers. On by default. |
| `control.scale()` | `ScaleControl` | Metric and imperial scale bars. |
| `control.layers(base, overlays)` | `LayersControl` | A switcher between layers. |
| `control.fullscreen()` | `FullscreenControl` | |
| `control.locate()` | `LocateControl` | Show and follow the device's position. |
| `control.geocoder()` | `GeocoderControl` | A plain search box over a geocoder. |
| `control.search()` | `SearchControl` | Search with suggestions, categories, place cards, directions and saved places. |
| `control.mapType({ types })` | `MapTypeControl` | Explore, Driving, Transit, Satellite. `mapTypes(options)` builds that set. |
| `control.offlineMaps()` | `OfflineMapsControl` | Download areas for use with no connection. |
| `control.lookAround()`, `lookAround()` | `LookAround` | Street-level imagery. |
| `indoorMap({ venue })` | `IndoorMap` | Indoor floor plans from IMDF, with a level picker. |
| `control(options)` | `Control` | The base class, for your own. |

## Styles

`styles` holds the built-in styles. Each is a function that returns a style
document for [`setStyle`](./TsMap.md#style).

| Export | |
| ------ | - |
| `styles.light(options)`, `styles.dark(options)` | The basemap, over any OpenMapTiles source: `{ url }` for a TileJSON, or `{ tiles }`. |
| `styles.transit(options)` | The basemap with transit lines and stations. |
| `styles.satellite(options?)`, `styles.hybrid(options)` | Esri World Imagery; `hybrid` adds the basemap's roads and labels. |
| `styles.LIGHT`, `styles.DARK` | The palettes, to override single colours with `palette`. |
| `resolveTileJSON(urls)`, `resolveStyleSources(style, fetch)`, `tileJSONSources(style)` | Read TileJSON sources yourself. |

See [Styles and theming](../concepts/styles-and-theming.md).

## Search, directions and navigation

| Export | |
| ------ | - |
| `services` | Geocoders, directions, isochrones and matrices — the same as `ts-maps/services`. See [Services](../concepts/services.md). |
| `turnByTurn(map, options)`, `TurnByTurn` | Route choices, then guidance: banner, lanes, voice and a camera that follows. |
| `SearchEngine`, `SearchHistory`, `StreetIndex` | The search behind `SearchControl`, usable on its own. |
| `savedPlaces()`, `SavedPlaces`, `LocalStorageSavedPlaces`, `MemorySavedPlaces` | Favourites and guides. |
| `OverpassPlaceDetails`, `parseOpeningHours`, `openingStatus` | Place details and opening hours. |
| `SEARCH_CATEGORIES`, `categoryForQuery`, `clusterPins` | Categories and result pins. |

## Offline

| Export | |
| ------ | - |
| `offlineMaps()`, `OfflineMaps` | The page's offline maps manager, also `map.offline`. Download areas, list them, search and route over them. |
| `IndexedDBOfflineStore`, `MemoryOfflineStore`, `KeyValueOfflineStore` | Where downloads are kept. |
| `OfflineGeocoder`, `OfflineDirections`, `withOfflineFallback` | Search and directions over downloaded data. |
| `TileCache`, `cachedFetch`, `saveOfflineRegion`, `getDefaultCache` | A tile cache, for `offlineCache` on a tile layer or source. |

See [Offline](../concepts/offline.md).

## Indoor and street level

| Export | |
| ------ | - |
| `loadIMDF`, `searchIndoor` | Read an IMDF venue and search it. |
| `PanoramaxImagery`, `MapillaryImagery` | Street-level imagery providers for `LookAround`. Panoramax is the default and needs no key. |

## Geography and geometry

All in [Geometry](./geometry.md): `LatLng`, `LatLngBounds`, `Point`,
`Bounds`, `Transformation`, `LineUtil`, `PolyUtil`, `RTree`, `earcut`;
`polygonArea`, `haversine`, `formatArea`, `formatDistance`; `union`,
`intersection`, `difference`, `xor`; `CRS`, `EPSG3857`, `EPSG4326`,
`EPSG3395`, `SimpleCRS`, `Projection`.

## Tiles and formats

| Export | |
| ------ | - |
| `VectorTile`, `VectorTileLayer`, `VectorTileFeature`, `Pbf` | Decode a Mapbox Vector Tile by hand: `new VectorTile(new Pbf(bytes))`. |
| `withPMTiles`, `setPMTilesArchive`, `pmtilesTileJSON`, … | `pmtiles://` URLs: a PMTiles archive read in place, with no tile server. |
| `renderStaticMap(options)`, `staticMapSvg(map, w, h)` | A map drawn once as SVG, from the same tiles and style. For share cards and figures. |
| `WebGLTileRenderer` | The WebGL renderer the tile layers use. |

## Localization

`addMessages(locale, messages)`, `message(locale, key)`, `messageLocales()`,
`resolveLocale(locale)`, `translator(locale)`, `formatNumber`, `formatDate`.
English and German are built in. See
[Localization](../concepts/localization.md).

## Core

`Class`, `Evented`, `Handler`, `Util`, `Browser`, `DomUtil`, `DomEvent`,
`Draggable`, `Animation`, `PosAnimation`, `easing`. The building blocks the
rest is made of, for writing layers, controls and handlers of your own.

## Entry points

`ts-maps` itself has everything above. These entry points carry one part each,
and the server-side ones are only there:

| Import | |
| ------ | - |
| `ts-maps/styles.css` (or `ts-maps/css`) | The stylesheet. Needed for controls, popups and markers. |
| `ts-maps/services` | Geocoding, directions, isochrone, matrix and elevation providers. |
| `ts-maps/style-spec` | `validateStyle`, `compileExpression`, `evaluateExpression`, `diffStyles`, `convertLegacyFilter`, the style types. |
| `ts-maps/storage` | `TileCache`, `cachedFetch`, `saveOfflineRegion`. |
| `ts-maps/geo` | Geographic types, CRSs, area and polygon operations, elevation decoding. |
| `ts-maps/geometry` | `Point`, `Bounds`, `Transformation`, `LineUtil`, `PolyUtil`, `RTree`. |
| `ts-maps/symbols` | `CollisionIndex`, `GlyphAtlas`, `IconAtlas`, glyph and sprite loaders. |
| `ts-maps/static` | `renderStaticMap` and `staticMapSvg`. |
| `ts-maps/pmtiles` | Read and write PMTiles archives. |
| `ts-maps/server` | A vector tile server for Bun, from a PMTiles archive on disk, a URL or S3. |
| `ts-maps/worker` | A tile server for Cloudflare Workers over R2. |
| `ts-maps/gazetteer` | A self-hosted place search for Bun, from GeoNames. |
| `ts-maps/offline-sw` | A service worker that keeps the page itself available offline. |

See [Running a tile server](../concepts/tile-server.md) for the server-side
ones.
