# `mvt/` — in-house Mapbox Vector Tile (v2) decoder

A zero-dependency TypeScript decoder for the [Mapbox Vector Tile
specification v2][spec]. Pairs with the [`proto/` Pbf reader](../proto/)
to turn a raw tile buffer into named layers, features, and GeoJSON.

## What MVT is

An MVT is a protobuf-encoded bundle of map features for a single slippy-map
tile (z/x/y). Each tile carries one or more named **layers** (e.g. `roads`,
`water`, `buildings`), each layer holds a **feature** list, and each feature
is a point / linestring / polygon plus property bag. Coordinates live in a
tile-local grid (typically `0..4096`) and are decoded from a compact
command stream (MoveTo / LineTo / ClosePath with zigzagged deltas).

## Lazy decoding

Parsing an MVT eagerly would materialize every feature, every property bag,
and every coordinate up front — expensive when you only need one layer, or
when you're rendering on demand at zoom-dependent LODs. This decoder is
structured around three levels of laziness:

- `VectorTile(pbf)` walks the outer envelope and instantiates a

  `VectorTileLayer` for each layer submessage.

- `VectorTileLayer` scans its keys/values tables and records the **byte

  offset** of every feature, but does not decode feature bodies.

- `VectorTileFeature` is only materialized when the caller asks for

  `.feature(i)`. Its geometry is decoded on demand via `.loadGeometry()` /
  `.bbox()` / `.toGeoJSON(x, y, z)`. Properties are interned once at
  construction (cheap — just index lookups into the layer tables).

This mirrors the access patterns of a tile renderer: you pick a layer,
iterate features, and only pay for geometry when you're about to draw.

## Usage

```ts
import { VectorTile } from 'ts-maps/core-map/mvt'
import { Pbf } from 'ts-maps/core-map/proto'

const bytes = new Uint8Array(await (await fetch('/tiles/0/0/0.mvt')).arrayBuffer())
const tile = new VectorTile(new Pbf(bytes))

for (const name of Object.keys(tile.layers)) {
  const layer = tile.layers[name]
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    // Tile-local geometry (Point[][], coords in 0..layer.extent):
    const rings = feature.loadGeometry()
    // Or GeoJSON in WGS84 for tile (x, y, z):
    const geojson = feature.toGeoJSON(0, 0, 0)
    console.log(feature.properties, geojson.geometry.type)
  }
}
```

## Coordinate system

Geometries are returned in **tile-local** coordinates: `x` runs left-to-right
and `y` runs top-to-bottom over the range `0..extent` (default 4096). For
standard WGS84 lat/lng, use `toGeoJSON(x, y, z)` with the tile's slippy-map
coordinates — the decoder applies the Web-Mercator inverse projection.

Polygon rings follow the MVT orientation convention: outer rings are
clockwise in tile space (which, under a y-down shoelace computation,
produces a positive signed area); inner rings (holes) are counter-clockwise.
`toGeoJSON` uses this to classify rings into polygons and produce
`Polygon` / `MultiPolygon` output.

## Error handling

The decoder throws on:

- Unknown geometry command ids (anything other than `1`, `2`, or `7`).
- Truncated geometry streams (a command announced more coordinate pairs

  than the packed region contained).

- Out-of-bounds feature indices on `layer.feature(i)`.

Unknown protobuf tags and unknown Value types are silently skipped — this
is forward-compatible with vendor extensions that stick to the wire format.

## Acknowledgement

This is an independent TypeScript implementation inspired by the API shape
of [mapbox/vector-tile-js][mapbox-vt] (BSD-3-Clause) and the [MVT
spec][spec]. No code was copied; the layout and naming align with
vector-tile-js to keep the mental model familiar to anyone who's used it.

[spec]: https://github.com/mapbox/vector-tile-spec/tree/master/2.1
[mapbox-vt]: https://github.com/mapbox/vector-tile-js
