# Vector tiles — deep dive

`VectorTileMapLayer` is a `GridLayer` that fetches [Mapbox Vector Tile](https://github.com/mapbox/vector-tile-spec) (`.pbf`) tiles, decodes them with the in-house `Pbf` + `VectorTile` pipeline, and rasterises the result to a per-tile `<canvas>` via Canvas2D (default) or WebGL (opt-in).

Use it when you want vector-quality rendering from an MVT tileset (OpenMapTiles, Mapbox, MapLibre, Protomaps, your own) without pulling in a GL renderer. It shares the tile-scheduling machinery with `TileLayer`, so pan / zoom / tile pruning / abort / attribution all behave the same way.

## Minimal usage

```ts
import { TsMap, vectorTileLayer } from 'ts-maps'

const map = new TsMap('map', { center: [51.5, -0.12], zoom: 6 })

vectorTileLayer({
  url: 'https://tiles.example.com/{z}/{x}/{y}.pbf',
  tileSize: 512,
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

Query features under a pointer (`point`) or within a rectangle (`bbox`):

```ts
map.on('click', (e) => {
  const hits = layer.queryRenderedFeatures({
    point: [e.containerPoint.x, e.containerPoint.y],
    layers: ['roads'],
  })
  console.log(hits.map(h => h.feature.properties))
})

// Rectangle select:
const inArea = layer.queryRenderedFeatures({ bbox: [[100, 100], [400, 400]] })
```

## Architecture notes

- **One canvas per tile.** Each `createTile` returns a `<canvas>` whose size matches `tileSize`; `GridLayer` handles layout, positioning, and pruning.
- **Canvas2D today, WebGL opt-in.** `fill` / `line` / `circle` / `fill-extrusion` paint properties map directly onto 2D-context primitives (or GL programs when `renderer: 'webgl'`). Line dashes and paint opacity are supported; gradients, patterns, and pixel-perfect antialias live on the Canvas2D path.
- **Lazy feature decoding.** `VectorTileFeature.loadGeometry()` parses the geometry command stream on demand; property tables are built eagerly per layer, but a feature's values are resolved only when accessed.
- **Expression engine.** Paint and layout properties accept the full style-spec expression DSL — `['interpolate', ...]`, `['match', ...]`, `['case', ...]`, `['get', ...]`, `['feature-state', ...]` and friends. Unknown operators fall back to pass-through evaluation, not an error.
- **R-tree `queryRenderedFeatures`.** Each decoded tile builds a per-tile R-tree keyed on feature bboxes. Point and bbox queries bulk-load the tree lazily after decode, then refine R-tree candidates with a precise point-in-geometry pass (ray casting for polygons, segment-distance for lines, radius-check for points).
- **Abort on pan/zoom.** Each in-flight tile gets an `AbortController`; `_removeTile` and `onRemove` cancel pending fetches so tile churn doesn't leak network work.
- **Post-pass hooks.** When the WebGL renderer is active, `_drawTile` runs a terrain underlay (if `map.setTerrain(...)` is active) and iterates registered custom layers via `map._invokeCustomLayerRender(gl, proj)` after the style-layer draw loop.

## Tile URL templates

Templates use the same variables as `TileLayer`:

- `{z}`, `{x}`, `{y}` — tile coordinates
- `{s}` — subdomain (from `options.subdomains`, a string like `'abc'` or an array)
- `{r}` — retina suffix (reserved)

Missing template variables throw eagerly so typos fail loudly.

---

Architecture inspired by mapbox-gl-js / maplibre-gl-js. Independent TypeScript implementation with no runtime dependencies.
