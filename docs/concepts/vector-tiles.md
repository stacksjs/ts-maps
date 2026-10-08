# Vector tiles

A vector tile holds the features of one square of the map (roads, buildings, water, place names) as geometry and properties, in the [Mapbox Vector Tile](https://github.com/mapbox/vector-tile-spec) format (`.pbf`). The map draws them itself, so the same tiles can be styled any way, stay sharp at any zoom, and can be queried for what is under the pointer.

ts-maps reads them in two ways:

- **In a style.** A `vector` source and style layers that draw from it, as Mapbox and MapLibre styles are written. This is what `styles.light()` builds, and what most maps want.
- **As a layer on its own.** `vectorTileLayer({ url, layers })`, added to the map like any tile layer, with no style document.

Both end up in the same place: a `VectorTileMapLayer`, which fetches, decodes and draws the tiles.

## In a style

```ts
import { TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [51.5072, -0.1276],
  zoom: 15,
  style: {
    version: 8,
    sources: {
      // A TileJSON: the map reads it for the tile URL, zoom range and credit.
      planet: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { 'id': 'land', 'type': 'background', 'paint': { 'background-color': '#f4f1ea' } },
      { 'id': 'water', 'type': 'fill', 'source': 'planet', 'source-layer': 'water', 'paint': { 'fill-color': '#9cc3e6' } },
      {
        'id': 'roads',
        'type': 'line',
        'source': 'planet',
        'source-layer': 'transportation',
        'paint': {
          'line-color': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], '#f2a33a', '#b9b2a6'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 18, 6],
        },
      },
    ],
  },
})
```

[OpenFreeMap](https://openfreemap.org) is free and needs no key. Its tiles use the OpenMapTiles schema: `source-layer` names such as `water`, `landcover`, `transportation`, `building`, `place` and `poi`. The built-in styles are written for that schema; see [Styles & theming](./styles-and-theming.md).

A `vector` source takes:

| Field | | |
| --- | --- | --- |
| `url` | | A TileJSON, read when the style is set, or a PMTiles archive as `pmtiles://https://…/file.pmtiles` |
| `tiles` | | URL templates, used instead of `url`. The first is used |
| `minzoom`, `maxzoom` | from the TileJSON | The zooms the tiles are published at. Past `maxzoom` the map keeps zooming and draws from the deepest tile it has |
| `tileSize` | `512` | |
| `attribution` | from the TileJSON | Shown by the attribution control |
| `offlineCache` | | `true` reads tiles through the shared tile cache; see [Offline maps](./offline.md#tile-cache) |

The style can be passed as the `style` option or to `map.setStyle()`. Either way, sources named by a TileJSON are fetched first, and the style goes in once they arrive; the map fires `style.load` then. `map.addSource()` reads a TileJSON `url` too, and fires `sourcedata` when the source is ready. `resolveStyleSources(style, fetch)` and `tileJSONSources(style)` are exported if you want to read them yourself.

Style layers, paint and layout properties and expressions are covered in [Style spec](./style-spec.md). A PMTiles archive, on your own server or straight from a bucket, is in [Self-hosted vector tiles](./tile-server.md).

## A layer on its own

```ts
import { resolveTileJSON, TsMap, vectorTileLayer } from 'ts-maps'

const map = new TsMap('map', { center: [51.5072, -0.1276], zoom: 13 })

// OpenFreeMap puts its build date in the tile URL, so read it from the TileJSON.
const found = await resolveTileJSON('https://tiles.openfreemap.org/planet')
if (!found)
  throw new Error('No tiles')

const layer = vectorTileLayer({
  url: found.tiles,
  // In the grid's zooms, which for 512px tiles are one above the server's.
  sourceMaxZoom: (found.maxzoom ?? 14) + 1,
  attribution: found.attribution,
  layers: [
    {
      id: 'water',
      type: 'fill',
      sourceLayer: 'water',
      paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.5 },
    },
    {
      id: 'roads',
      type: 'line',
      sourceLayer: 'transportation',
      minzoom: 6,
      paint: { 'line-color': '#6b7280', 'line-width': 1.2 },
    },
  ],
}).addTo(map)
```

Its style layers are plain objects: `id`, `type` (`'fill'`, `'line'`, `'circle'`, `'symbol'` or `'fill-extrusion'`), `sourceLayer`, and optional `minzoom`, `maxzoom`, `filter`, `paint` and `layout`, with the same properties and expressions as a style. Note `sourceLayer`, not `'source-layer'`.

| Option | Default | |
| --- | --- | --- |
| `url` | | A URL template, or a `pmtiles://` archive. With an archive, `sourceMaxZoom`, `minNativeZoom`, `bounds` and `attribution` left unset come from the archive |
| `layers` | `[]` | Style layers, drawn in order |
| `tileSize` | `512` | |
| `sourceMaxZoom` | | The deepest grid zoom the source publishes. Past it, each tile draws its part of the ancestor at full resolution |
| `minZoom`, `maxZoom` | `0`, `22` | Where the layer is shown |
| `subdomains` | `'abc'` | For `{s}` |
| `zoomOffset` | `0` | Added to the zoom in the URL, for services on a shifted grid |
| `workers` | `true` | Decode on worker threads. A number sets the pool size, `false` decodes on the main thread |
| `renderer` | `'canvas2d'` | `'webgl'` draws fills, lines and circles with WebGL; see [Rendering](#rendering) |
| `offlineCache` | | `true` for the shared `TileCache`, or one of your own |
| `localSource` | | An object with `getTile(z, x, y)` producing tiles in process, as GeoJSON sources do. `url` is then ignored |
| `attribution`, `pane`, `className`, `crossOrigin` | | As on any tile layer |

On the layer:

- `setStyleLayers(layers)` swaps the style layers and fetches the tiles again.
- `updateStyleLayers(layers)` swaps them and redraws the tiles already decoded, with no network: the right call for a colour or filter change.
- `getStyleLayer(id)` returns one.
- `sourceReady()` resolves once a `pmtiles://` archive's header has been read (at once for a URL template), and `getTileJSON()` returns what the archive said about itself.

## Querying features

```ts
map.on('click', (e) => {
  const hits = map.queryRenderedFeatures(e.containerPoint, { layers: ['roads', 'water'] })
  for (const { feature, layer } of hits)
    console.log(layer.id, feature.properties)
})
```

`map.queryRenderedFeatures` asks every source on a styled map; a layer made with `vectorTileLayer` has the same method. It takes:

- a point in container pixels, as above, as `[x, y]`, or as `{ point: [x, y] }`;
- a rectangle, as `[[x1, y1], [x2, y2]]` or `{ bbox: [[x1, y1], [x2, y2]] }`;
- nothing, for every feature in every decoded tile.

Options go second, or alone. `layers` limits it to those style-layer ids, and `filter` is an expression the features must also pass. Each hit is `{ feature, layer, tile }`: the decoded feature (`properties`, `id`, `type`, `loadGeometry()`), the style layer that drew it, and the tile it came from. Features are tested against their real geometry: inside a polygon, near a line, within a circle's radius. A feature cut by tile edges can appear once per tile.

`map.querySourceFeatures(sourceId, { sourceLayer, filter })` returns every feature of a source in the tiles that have loaded, drawn or not. Features with an `id` are returned once.

## Tile URLs

Templates take `{z}`, `{x}` and `{y}`, `{s}` for a subdomain from `subdomains`, and `{r}`, which is always empty. A template naming any other variable throws when the first tile is requested, so a typo fails loudly. Any `{name}` that matches an option on the layer is filled from it.

512px tiles, the vector default, sit on a grid one zoom above the 256px world. The layer asks the server for the zoom the tile was published at, so a 512px OpenMapTiles source needs no `zoomOffset`.

## Decoding

- **Off the main thread.** Tiles are decoded on a shared pool of Web Workers, sized to the machine (up to four, leaving a core for drawing), and shared by every vector layer on the page. Where workers are unavailable, decoding happens inline.
- **Lazily.** A feature's geometry is parsed when it is drawn or queried, not when the tile arrives.
- **Indexed.** Each decoded tile keeps an R-tree of its features' bounding boxes, so a point or rectangle query only tests the few features near it.
- **Cancelled.** A tile that leaves the view before it arrives has its request aborted, so a fast pan does not queue up work nobody will see.

`VectorTile` and `Pbf` are exported, so a tile can be decoded by hand, to check an archive before publishing it, for instance:

```ts
import { Pbf, VectorTile } from 'ts-maps'

const bytes = new Uint8Array(await (await fetch(tileUrl)).arrayBuffer())
const tile = new VectorTile(new Pbf(bytes))
console.log(Object.keys(tile.layers)) // ['water', 'landcover', 'transportation', …]
```

## Rendering

Each tile is drawn into its own `<canvas>` with Canvas2D, which works everywhere. What the renderer reads:

- **fill:** `fill-color`, `fill-opacity`, `fill-outline-color`
- **line:** `line-color`, `line-width`, `line-opacity`, `line-dasharray`, `line-cap`, `line-join`, `line-gradient`
- **circle:** `circle-color`, `circle-radius`, `circle-opacity`, `circle-stroke-color`, `circle-stroke-width`
- **fill-extrusion:** 3D buildings, drawn with WebGL in one canvas over the tiles; see [3D and the globe](./3d.md#buildings)
- **symbol:** labels and icons; see below

Patterns (`fill-pattern`, `line-pattern`) are not drawn.

Tiles are drawn at the display's own pixel density. A canvas sized in CSS pixels is stretched across twice as many device pixels on a retina screen, and everything drawn into it arrives upscaled and soft. The backing store is sized by `devicePixelRatio`, capped at 2, since 3x costs nine times the fill rate for a difference nobody can see.

`renderer: 'webgl'` on `vectorTileLayer` draws fills, lines and circles with WebGL2 instead, and is what [custom WebGL layers](./3d.md#custom-webgl-layers) run inside. Each tile gets its own WebGL context, and browsers keep only a handful alive at once, so it suits a small overlay better than a full-screen basemap. Without WebGL2 the layer warns once and falls back to Canvas2D. Layers a style makes always use Canvas2D.

## Labels

Labels are drawn in screen space over the tiles, so they stay upright as the map rotates and are not cut off at tile edges. They are placed every frame the camera moves, not only when it comes to rest, so a street name stays on its street through a zoom and a neighbourhood name stays over its neighbourhood, the way Apple Maps and Google Maps behave.

- **Resolved once per tile.** Text, font, size, colours and the label's box are evaluated when a tile arrives (layout at the tile's zoom, as the style spec does). A frame is then projection, collision and a sprite blit per label, typically well under 2 ms for a city view.
- **Priority.** Layers later in the style are placed first, and within a layer a lower `symbol-sort-key` wins, as in the style spec. The older `symbol-priority` layout property keeps its higher-wins meaning.
- **Stable.** A label that was showing last frame is tried before an equal one that was not, so labels do not trade places as the camera moves. A label that was not showing needs a few pixels of clear space before it takes a slot, so one on the edge of fitting does not blink through a slow zoom.
- **Steady.** Labels are projected with the camera's exact, unrounded maths and drawn on whole device pixels, so they hold still on the ground through a zoom rather than shaking by a pixel. The same place from two zoom levels' tiles is recognised as one label and keeps its fade.
- **Faded.** Labels fade in and out over 200 ms when they gain or lose their slot, instead of popping.
- **Not repeated.** The same street name is kept a label-width and a half, or most of `symbol-spacing`, from its last copy on screen, even across tiles.
- **Sharp.** Text is drawn with the canvas's own text engine at the device resolution, with a halo that follows the glyph outline. The glyph atlas measures text and serves the WebGL path.

`symbol-placement` (`point`, `line`, `line-center`), `text-max-width` (wraps point labels onto balanced lines, default 10 ems), `text-transform`, `text-padding` (default 2px), `text-letter-spacing`, `text-anchor`, `text-offset`, `text-rotate`, `text-max-angle`, the `*-allow-overlap` and `*-ignore-placement` pairs, `text-opacity` and the icon properties are honoured. Fonts, sprites and SDF icons are in [Styles & theming](./styles-and-theming.md#sprites-and-glyphs).

## Try it

- The [vector tile example](../examples/03-vector-tile.md) styles the OpenFreeMap planet from scratch and shows what a click finds.
- The playground's [vector tiles](../demos/2-vector-tiles.md), [labels](../demos/10-labels.md) and [WebGL](../demos/6-webgl.md) demos.

---

Architecture inspired by mapbox-gl-js and maplibre-gl-js. Independent TypeScript implementation with no runtime dependencies.
