# API reference

This section documents the public `ts-maps` API. For the full signature
of every method, see the generated `.d.ts` declarations shipped with the
package.

## Overview

- [`TsMap`](./TsMap.md) — the interactive map class; camera, sources,
  layers, events, style spec.
- [Layers](./layer.md) — `TileLayer`, `VectorTileMapLayer`, `Marker`,
  `Popup`, `Polyline`, `Polygon`, `Rectangle`, `Circle`, `CircleMarker`,
  `HeatmapLayer`, `RasterDEMLayer`, `ImageOverlay`, `VideoOverlay`,
  `SVGOverlay`, `LayerGroup`, `FeatureGroup`, `GeoJSON`.
- [Geometry](./geometry.md) — `LatLng`, `LatLngBounds`, `Point`,
  `Bounds`, `Transformation`.
- [Expressions](./expressions.md) — style-spec expression operators
  (`get`, `match`, `interpolate`, …).

## Services

Import from `ts-maps/services`:

```ts
import {
  defaultGeocoder,
  defaultDirections,
  defaultIsochrone,
  defaultMatrix,
  GeocoderProvider,
  DirectionsProvider,
  IsochroneProvider,
  MatrixProvider,
} from 'ts-maps/services'
```

Providers: `OsmNominatim`, `Photon`, `Mapbox`, `Maptiler`, `Google`
(geocoding); `OSRM`, `Valhalla`, `Mapbox`, `Google` (directions).

## Style spec

Import from `ts-maps/style-spec`:

```ts
import { validateStyle, compileExpression } from 'ts-maps/style-spec'
```

## Storage

Import from `ts-maps/storage`:

```ts
import { TileCache, saveOfflineRegion, cachedFetch } from 'ts-maps/storage'
```
