# Style spec

A style is a JSON document that says what the map draws: its _sources_, where
data comes from, and its _layers_, how each part of that data is painted, in
order from the bottom up. ts-maps reads the
[Mapbox GL style specification](https://docs.mapbox.com/style-spec/)
(version 8), so a style written for Mapbox GL JS or MapLibre mostly works as
it is. This page covers the parts ts-maps implements and the API for changing
a style while the map runs.

The built-in basemaps in [Styles & theming](./styles-and-theming.md) are
styles like any other: `styles.light({ url })` returns a document you can
read, change and pass to `setStyle`.

## A style document

```ts
import type { Style } from 'ts-maps/style-spec'

const style: Style = {
  version: 8,
  sources: {
    // A TileJSON: the map reads it for the tile URL, zoom range and credit.
    planet: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers: [
    { id: 'land', type: 'background', paint: { 'background-color': '#f4f1ea' } },
    { id: 'water', type: 'fill', source: 'planet', 'source-layer': 'water', paint: { 'fill-color': '#9cc3e6' } },
    {
      id: 'roads',
      type: 'line',
      source: 'planet',
      'source-layer': 'transportation',
      paint: {
        'line-color': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], '#f2a33a', '#b9b2a6'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 18, 6],
      },
    },
  ],
}
```

A vector source holds several named layers of features; `source-layer` picks
one. OpenFreeMap serves the [OpenMapTiles](https://openmaptiles.org/schema/)
schema, whose layers include `water`, `transportation`, `building`, `place`
and `poi`. The [vector tile example](../examples/03-vector-tile.md) is this
style running, with a click that shows what the tiles say about a feature.

## Setting a style

Pass it when the map is made, or call `setStyle` at any time:

```ts
import { TsMap } from 'ts-maps'

const map = new TsMap('map', { center: [51.5072, -0.1276], zoom: 15, style })

map.setStyle(otherStyle)
map.setStyle('https://example.com/style.json') // a URL works too
```

When the style has sources with a TileJSON `url`, or is itself a URL, the map
fetches those first and keeps showing the current style until they arrive. A
slow answer cannot overwrite a style set after it. A fetch that fails fires
`error` and leaves the map as it was.

Once the new style is in place the map fires `styledata`, and a microtask
later `style.load`, so a handler added right after `new TsMap()` hears it. `map.getStyle()` returns a copy of the current document, and
`map.isStyleLoaded()` says whether there is one.

`setStyle(style, { validate, diff })` takes two options, both on by default:
`validate` checks the document first and throws if it is malformed (see
[validation](#validation)); `diff` changes only what differs from the current
style (see [swapping styles](#swapping-styles)).

## Sources

| Type | Data | |
| --- | --- | --- |
| `vector` | `tiles: [template]`, a TileJSON `url`, or `url: 'pmtiles://…'` | Mapbox Vector Tiles. A [PMTiles](./tile-server.md) archive is read in place with range requests. `minzoom`, `maxzoom` and `attribution` are honoured; past `maxzoom` the last level is overzoomed. |
| `raster` | `tiles` or a TileJSON `url` | Image tiles. `tileSize` defaults to 256. |
| `raster-dem` | `tiles` or a TileJSON `url` | Elevation, `encoding: 'mapbox'` or `'terrarium'`. Drawn by a `hillshade` layer, and used by `setTerrain`. |
| `geojson` | `data`: a GeoJSON object or a URL | Cut into tiles in the page. `cluster`, `clusterRadius` (default 50), `clusterMaxZoom` (default 16) and `clusterMinPoints` (default 2) group points. |

`image`, `video` and `canvas` sources are not implemented, and a style that
uses one throws. For a single image or video on the map, use an
[`ImageOverlay` or `VideoOverlay`](./layers.md#image-video-and-svg-overlays).

Any source can carry `offlineCache: true`, which reads its tiles through the
shared cache that [offline maps](./offline.md) fill.

## Layers

| Type | Draws |
| --- | --- |
| `background` | One colour behind everything. |
| `fill` | Polygons. |
| `line` | Lines, and polygon outlines. |
| `circle` | Points as circles. |
| `symbol` | Labels and icons, placed so they do not collide. |
| `fill-extrusion` | Polygons raised into 3D. See [3D rendering](./3d.md#fill-extrusion). |
| `raster` | A raster source's images. |
| `hillshade` | Shading from a `raster-dem` source. |
| `heatmap` | The density of a GeoJSON source's points. |

Every layer has an `id`, a `type` and, except `background`, a `source`.
`source-layer` names the layer inside a vector source. A layer over a GeoJSON
source leaves it out: the source has one layer, named after itself.
`minzoom` and `maxzoom` limit when it shows, `filter` which features it
draws, and `layout` and `paint` how.

A `symbol` layer over polygons, such as building or park names, labels each
polygon once, at the point inside it farthest from its edges, so the label
sits in the middle of the shape rather than on its outline.

## Adding your own data

A style set with `setStyle` replaces whatever was there, so add your own
sources and layers once the style is in, in a `style.load` handler. It runs
again after every later `setStyle`, which is when they need adding again:

```ts
import { styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [40.7616, -73.9776],
  zoom: 13.5,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

map.on('style.load', () => {
  map.addSource('midtown', {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: { name: 'Midtown' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-73.9935, 40.7505], [-73.9726, 40.7505], [-73.9621, 40.7648], [-73.9819, 40.7733], [-73.9935, 40.7505]]],
      },
    },
  })
  map.addStyleLayer({ id: 'midtown-fill', type: 'fill', source: 'midtown', paint: { 'fill-color': '#4f46e5', 'fill-opacity': 0.2 } })
  map.addStyleLayer({ id: 'midtown-line', type: 'line', source: 'midtown', paint: { 'line-color': '#4f46e5', 'line-width': 3 } })
})
```

Where a layer draws:

- Labels and icons from every source are drawn above every fill and line, so
  your shapes never cover a street name, and below markers and popups.
- Each source is drawn as one tile layer, stacked in the order the sources
  were added. So the layers of a source you add draw above all of the
  basemap's fills and lines.
- Within one source, `addStyleLayer(layer, before)` puts the layer under the
  one with id `before`, or on top without it. A `before` from another source
  changes the order in the document, not on screen.

`addSource` takes a vector or raster source by its `tiles`. A TileJSON `url`
is read only by `setStyle`; to add one later, read the template with
`resolveTileJSON` first (see
[Styles & theming](./styles-and-theming.md#choosing-a-source)).

### Data that changes

A GeoJSON source is for data that moves. `setSourceData` replaces it in
place, without rebuilding the layers or flashing the map:

```ts
map.setSourceData('vehicles', latestPositions) // a GeoJSON object or a URL
```

The map fires `sourcedata` when the new data is in. A `heatmap` layer over
the source follows it too.

### Clusters

With `cluster: true`, a GeoJSON source groups nearby points. A cluster has
`point_count` and `point_count_abbreviated` among its properties, so a layer
can size and label it:

```ts
map.addSource('cafes', { type: 'geojson', data: '/cafes.geojson', cluster: true, clusterRadius: 50 })
map.addStyleLayer({
  id: 'cafe-clusters',
  type: 'circle',
  source: 'cafes',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#4f46e5',
    'circle-radius': ['step', ['get', 'point_count'], 14, 25, 20, 100, 28],
  },
})
map.addStyleLayer({
  id: 'cafe-count',
  type: 'symbol',
  source: 'cafes',
  filter: ['has', 'point_count'],
  layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
  paint: { 'text-color': '#ffffff' },
})
```

## Changing a layer

```ts
map.setPaintProperty('midtown-fill', 'fill-color', '#e11d48')
map.setLayoutProperty('midtown-line', 'visibility', 'none')
map.setFilter('poi', ['==', ['get', 'class'], 'cafe'])

map.getStyleLayer('midtown-fill') // its spec, as it is now
map.removeStyleLayer('midtown-line')
map.removeSource('midtown') // after the layers that use it
```

Each change fires `styledata`. A paint, layout or filter change repaints the
tiles the map already has rather than fetching them again. A layer id that does not exist throws. The
[style spec example](../examples/04-style-spec.md) changes a layer's colour
from buttons.

## Expressions

Most paint and layout properties, and every filter, take an _expression_: a
JSON array whose first element names an operator. Expressions are compiled
once and evaluated for each feature as it is drawn.

```ts
// A colour by feature property, with a fallback.
const fill = ['match', ['get', 'class'], 'water', '#0ea5e9', 'park', '#65a30d', '#e5e7eb']

// A width that grows with zoom.
const width = ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5, 18, 4]

// Only named features.
const filter = ['has', 'name']
```

The older filter syntax, such as `['==', 'class', 'park']`, still works. The
[expression reference](../api/expressions.md) lists every operator.

## Querying features

`map.queryRenderedFeatures(point, { layers })` returns the features drawn at
a point on screen, or inside a box `[[x1, y1], [x2, y2]]`. Each hit is
`{ feature, layer, tile }`, with the feature's properties at
`hit.feature.properties`:

```ts
map.on('click', (e) => {
  const hits = map.queryRenderedFeatures(e.containerPoint, { layers: ['roads', 'water'] })
  if (hits.length)
    console.log(hits[0].layer.id, hits[0].feature.properties)
})
```

`map.querySourceFeatures('planet', { sourceLayer: 'poi' })` returns every
feature of a source in the tiles loaded so far, drawn or not.
[Events on a style layer](./map.md#events-on-a-style-layer) wrap the first of
these.

## Feature state

Feature state is a small set of values you attach to a feature by its id,
which expressions read with `['feature-state', key]`. It changes how a
feature is drawn, for hover or selection, without touching the data:

```ts
map.addStyleLayer({
  id: 'buildings',
  type: 'fill',
  source: 'planet',
  'source-layer': 'building',
  paint: {
    'fill-color': ['case', ['==', ['feature-state', 'selected'], true], '#f59e0b', '#d8d1c4'],
  },
})

map.on('click', 'buildings', (e) => {
  const { feature } = e.features[0]
  map.setFeatureState({ source: 'planet', sourceLayer: 'building', id: feature.id }, { selected: true })
})
```

`getFeatureState(lookup)` reads it back and `removeFeatureState(lookup, key?)`
clears one value or all of them. The feature needs an `id`. On a GeoJSON
source, pass the source's id as `sourceLayer` too, since that is the name of
its one layer.

## Swapping styles

`setStyle(next)` does not rebuild the map. It compares the new document with
the current one and applies only the difference: sources and layers added or
removed, and changed paint and layout properties, filters and zoom ranges.
The tiles already downloaded are repainted, not fetched again. That is what
makes switching between the light and dark styles instant.

Some changes cannot be applied piece by piece, and the map is set up from
the new style instead: a different `sprite` or `glyphs`, layers in a
different order, or a layer whose `type` or `source` changed. Pass
`{ diff: false }` to always start fresh.

## Validation

`setStyle` checks the document and throws an `Error` listing what is wrong
before it changes anything. `validateStyle` gives you the same list without
setting the style, which is useful in tests and editors:

```ts
import { validateStyle } from 'ts-maps/style-spec'

const errors = validateStyle(style) // [{ message, path? }]
if (errors.length)
  console.warn(errors)
```

`ts-maps/style-spec` also has `validateLayer`, `validateSource`, the style's
TypeScript types, `diffStyles`, and the expression compiler.
