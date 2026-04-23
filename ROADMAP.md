# ts-maps — Roadmap to a Mapbox-class library

> _A zero-dependency, TypeScript-native, batteries-included interactive mapping library._
> Target: parity with Mapbox GL JS feature set, with a Leaflet-style developer experience.
> Constraints: **no runtime deps**, everything in-house, tooling = bun/pickier/better-dx/stx.

This document is the authoritative execution plan. Each phase is scoped to be
independently testable and shippable. Phases are **gated** — do not start a phase
before the previous one's exit criteria are green.

---

## Where we are today (baseline)

- **`src/core-map/`** — a from-scratch TypeScript port of the open-source Leaflet

  2.0 codebase (82 files, ~14k LOC). Fully rebranded; credits in `CREDITS.md`.

- **Public API surface**: `TsMap`, `Marker`, `TileLayer`, `Popup`, `Tooltip`,

  `Polyline/Polygon/Circle/Rectangle`, `GeoJSON`, vector renderers
  (`SVG`, `Canvas`), `GridLayer`, `WMSTileLayer`, `ImageOverlay`/`VideoOverlay`/
  `SVGOverlay`, all controls (`Zoom`, `Layers`, `Attribution`, `Scale`),
  all handlers (`Drag`, `ScrollWheelZoom`, `DoubleClickZoom`, `PinchZoom`,
  `BoxZoom`, `Keyboard`, `TapHold`), full `Evented`/`Class`/`Handler` base,
  `LatLng`/`LatLngBounds`, `Point`/`Bounds`/`Transformation`, CRS family
  (`EPSG3857`/`EPSG3395`/`EPSG4326`/`Simple`/`EarthCRS`).

- **Namespace object** `tsMap` (and `window.tsMap` in browsers) with factory

  helpers (`marker()`, `tileLayer()`, `map()`, …).

- **Toolchain**: `bun run typecheck` passes under `isolatedDeclarations: true`.

## Where we are going

A library that can do **everything Mapbox GL JS can do**, with:

1. The Leaflet-style ergonomic API for casual users (`L.marker(...)` feel).
2. The Mapbox-style style-spec + vector-tile + GPU rendering for pros.
3. 3D, terrain, globe, labels, expressions, custom layers.
4. Geocoding, routing, isochrones, static images, offline tiles — all with

   pluggable backends (no Mapbox account required).

---

## Class-field invariant (repo-wide rule)

**All subclasses of `Class` / `Evented` / `Layer` / `Handler` / `Control`
must use `declare` for uninitialized field type annotations.** Never use
bare `foo!: T` or `foo?: T` in a subclass — those produce class-field
initializers that run _after_ `super()`, which calls `this.initialize(...)`,
and they silently wipe any values `initialize()` assigned.

```ts
// ❌ BAD — wipes whatever `initialize()` set on these fields
class Marker extends Layer {
  _icon?: HTMLElement
  _shadow?: HTMLElement
}

// ✅ GOOD — `declare` is type-only, no runtime initializer
class Marker extends Layer {
  declare _icon?: HTMLElement
  declare _shadow?: HTMLElement
}
```

Same for arrow-function class fields: prefer ordinary methods and pass an
explicit `context` to `on()/off()`:

```ts
// ❌ BAD — `_onDown` is undefined when the base constructor runs
class DragHandler extends Handler {
  _onDown = (e: PointerEvent): void => { /_ ... _/ }
}

// ✅ GOOD — method is on the prototype from the start
class DragHandler extends Handler {
  _onDown(e: PointerEvent): void { /_ ... _/ }
  addHooks(): void {
    DomEvent.on(this._target, 'pointerdown', this._onDown, this)
  }
}
```

Enforce with a pickier rule (TODO) or grep in CI:
`! grep -rnE '^  [_a-z][A-Za-z0-9_]*[!?]: ' packages/ts-maps/src/core-map/`
from classes that extend something. A one-time sweep fixed 178 field
declarations and 80 arrow-function fields across 29 files; stay vigilant.

## Phase 0 — Testing + demo harness (prerequisite)

**Exit criteria:** every phase after this one ships with unit tests and a
playground demo that a reviewer can open in a browser.

- **0.1**Set up `bun test` matrix for `src/core-map/**`. Use

  [very-happy-dom](https://github.com/stacksjs/very-happy-dom) (our
  in-house MIT drop-in for happy-dom/jsdom) as the test DOM. Dev-only
  dependency — doesn't affect the zero-runtime-deps rule. If we find gaps
  (e.g. obscure Canvas 2D calls, PointerEvent edge cases) we improve
  `very-happy-dom` itself rather than shim locally.

- **0.2** Port Leaflet's `spec/` suite (~2k assertions) to `bun test`.

  We don't ship it, but it's our regression corpus.

- **0.3** Add a `playground/core-map/` HTML page per major feature. Each

  phase drops a new page here and wires it into an index.

- **0.4** Wire `scripts/bench.ts` — frame-time + layer-count benchmarks

  (we'll refer back to it in Phase 6 to justify the WebGL renderer).

---

## Phase 1 — Modernize the 2D map UX

These are table-stakes features that Leaflet doesn't have but that any modern
map needs.

- **1.1 Fractional zoom end-to-end.** Remove the integer-round in the tile

  loader for the default rendering path. Tiles are fetched at the nearest
  integer zoom but CSS-scaled for intermediate levels.

- **1.2 `bearing` (rotation).** Add `getBearing()/setBearing()/rotateTo()`.

  Panes get a CSS rotation transform around the map center.

- **1.3 `pitch` (tilt).** Add `getPitch()/setPitch()`. Apply CSS `rotateX()`

  to the tile+overlay panes; keep marker panes upright (like Mapbox).

- **1.4 Easing + animation engine.** Extend `PosAnimation` to a generic

  `Animation` that drives `setView`/`flyTo`/`rotateTo`/`setPitch` with the
  same interpolation primitives (cubic-bezier, cosh spline for fly).

- **1.5 Gesture overhaul.** New handlers: `TwoFingerRotate`, `TwoFingerPitch`

  (drag with two fingers vertically), and `DragPan` enhancements so rotation
  and pitch compose cleanly with existing pinch-zoom.

- **1.6 Padding & camera API.** `getCamera()`/`easeTo({center, zoom, bearing, pitch, padding, duration, easing})` as the unified camera method.
- **1.7 Retina/HiDPI canvas fix** on rotate + pitch.

**Exit:** `playground/core-map/1-camera.html` lets the user pan/zoom/rotate/
pitch the map and all existing layers (markers, paths, tiles) stay visually
correct.

---

## Phase 2 — Vector tiles & the style spec (core differentiator)

This is the phase that turns ts-maps from "a Leaflet port" into "a Mapbox
competitor".

- **2.1 Protobuf reader.** Minimal, in-house, zero-dep PBF decoder in

  `src/core-map/proto/Pbf.ts`. Just enough for MVT (varint, string, packed,
  message). ~400 lines.

- **2.2 MVT parser.** `src/core-map/mvt/VectorTile.ts` that matches

  mapbox/vector-tile-spec: tiles → layers → features → geometry commands
  (MoveTo/LineTo/ClosePath). Zero-dep, fully typed.

- **2.3 `VectorTileLayer`.** New layer that extends `GridLayer`, fetches

  `.pbf`, decodes, hands features to a renderer.

- **2.4 Canvas2D vector tile renderer.** First target: paint `fill`, `line`,

  `circle`, and `symbol` (text-only) layers to the existing Canvas renderer.

- **2.5 Style spec v1.** TypeScript types + runtime validator for a subset

  of the Mapbox Style Specification. Sources (`vector`, `geojson`,
  `raster`), layers (`fill`, `line`, `circle`, `symbol`, `raster`,
  `background`). Paint/layout properties. A `StyleSpec` export.

- **2.6 Expressions engine.** Interpreter for: `get`, `has`, `!`, `==`, `!=`,

  `<`, `<=`, `>`, `>=`, `all`, `any`, `case`, `match`, `coalesce`, `to-string`,
  `to-number`, `to-boolean`, `interpolate` (linear, exponential,
  cubic-bezier), `step`, `zoom`, `literal`, `concat`, `number-format`.

- **2.7 `map.setStyle(style)`.** Loads a style document, instantiates

  sources + layers, wires them to the map. `map.addSource`, `map.addLayer`,
  `map.removeLayer`, `map.getStyle`.

- **2.8 `map.queryRenderedFeatures(point | bbox, { layers, filter })`.** An

  in-house R-tree indexes rendered geometry per tile.

**Exit:** `playground/core-map/2-vector-tiles.html` loads the OpenMapTiles
basic style from a pluggable tile server and looks equivalent to a minimal
Mapbox-rendered basemap (fills, lines, text labels).

---

## Phase 3 — Symbols, labels & collision

Symbol rendering is the hardest part of a vector map. Giving it a dedicated
phase.

- **3.1 Glyph atlas.** Generate on-the-fly SDF (signed-distance-field)

  glyphs from system fonts via Canvas `measureText` + a zero-dep SDF
  computation. Cache per codepoint.

- **3.2 Text layout.** Line-break, BiDi-aware (use the browser's native

  `Intl.Segmenter` — zero-dep), kerning from font metrics.

- **3.3 Icon atlas.** Pack user-provided sprites into a single canvas

  atlas (in-house rectangle bin-pack).

- **3.4 Placement engine.** Collision detection via a grid index. Symbols

  along lines use the Mapbox "label anchor + offset" algorithm.

- **3.5 `symbol-sort-key`, `symbol-placement` (`point`/`line`/`line-center`).**
- **3.6 Text-halo, text-translate, icon-translate, icon-text-fit.**

**Exit:** labeled roads render without overlap; city labels switch with
zoom; icons with text labels (POIs) work.

---

## Phase 4 — Raster & raster-color & hillshade

- **4.1 `RasterSource` + `RasterLayer`.** Already have `TileLayer`; add a

  style-spec wrapper.

- **4.2 `raster-dem` source.** Decodes Mapbox Terrain-RGB and Terrarium

  encodings.

- **4.3 `hillshade` layer.** Pure Canvas2D implementation: convolve a DEM

  tile to compute slope/aspect, then shade. Slow but correct — WebGL takes
  over later.

- **4.4 `heatmap` layer.** Gaussian density accumulation into an offscreen

  canvas, then color-ramp.

- **4.5 `raster-color` (Mapbox v3 feature).** Per-pixel color ramp applied

  to single-band raster tiles.

**Exit:** elevation hillshade + a GeoJSON heatmap over a vector basemap,
all without WebGL.

---

## Phase 5 — Advanced interaction & data

- **5.1 `feature-state`.** `map.setFeatureState({source, id}, {hover: true})`

  usable from expressions (`['feature-state', 'hover']`). Drives
  hover/selected styling without re-parsing tiles.

- **5.2 `map.project`/`unproject` rewired** to honor bearing+pitch.
- **5.3 `querySourceFeatures`.** Unrendered queries against vector sources.
- **5.4 Event model upgrade.** `map.on('click', 'layer-id', handler)` —

  layer-scoped events, matching Mapbox ergonomics.

- **5.5 Cluster source.** Ported kdbush+supercluster algorithms, in-house,

  zero-dep. `source: { type: 'geojson', cluster: true, clusterRadius, clusterMaxZoom }`.

- **5.6 Line metrics, `line-gradient`, `line-dasharray` interpolation.**

**Exit:** hover, click-to-select, clustering, gradient paths.

---

## Phase 6 — The WebGL leap

All phases 1–5 target Canvas2D so we get correctness before performance.
Phase 6 rebuilds the renderer to match Mapbox's performance envelope.

- **6.1 `WebGLRenderer`.** Alternative `Renderer` subclass. Tiles upload

  their vector geometry as triangulated buffers.

- **6.2 In-house earcut polygon triangulator.** Zero-dep, ~500 lines.
- **6.3 Fill + line shaders.** Line shader uses mitre/bevel/round via

  extrusion; anti-aliased.

- **6.4 Circle shader.**
- **6.5 SDF text & icon shader.** Instanced quads sampling the glyph/icon

  atlas textures.

- **6.6 Raster shader.** Including raster-color ramps.
- **6.7 Fade-in + cross-fade on zoom.**
- **6.8 `map.setRenderer('webgl' | 'canvas2d' | 'svg')`.** Users opt in;

  default is `canvas2d` for compatibility until `webgl` is stable.

**Exit:** the vector basemap from phase 2 renders at a solid 60fps with
hundreds of thousands of features; `playground/core-map/6-webgl.html`
visibly beats the Canvas2D renderer on the same scene.

---

## Phase 7 — 3D

- **7.1 Terrain.** `map.setTerrain({source, exaggeration})`. DEM tiles

  become a displacement grid rendered under the normal 2D tiles.

- **7.2 Sky & fog.** `sky` and `fog` layers per the style spec.
- **7.3 `fill-extrusion` layer.** 3D buildings from an `extrude` paint

  property. Requires WebGL (phase 6).

- **7.4 `CustomLayerInterface`.** Users hook into the render loop with

  their own WebGL/Three.js code. Matches Mapbox's API 1:1.

**Exit:** 3D NYC buildings + terrain + sky, interactive.

---

## Phase 8 — Globe

- **8.1 `GlobeProjection`.** CRS plus a vertex shader that warps the

  planar Mercator-like tiles onto a sphere at low zoom.

- **8.2 Seamless transition.** Auto-swap between globe and Mercator

  around zoom 5.5 (matches Mapbox GL JS v3).

- **8.3 Atmosphere halo.**

**Exit:** zoom out to see a rotating Earth; zoom in to see streets; no
visible transition seam.

---

## Phase 9 — Services adapters (the "Mapbox APIs" layer)

All adapters are thin, pluggable, and default to **free/OSM-based** backends
so nobody is forced into a vendor account.

- **9.1 Geocoding.** Interface `GeocoderProvider`. Built-ins:

  `OsmNominatim` (default), `Photon`, `Maptiler`, `Mapbox`, `Google`.

- **9.2 Reverse geocoding** same interface.
- **9.3 Directions.** Interface `DirectionsProvider` → `OSRM` (default),

  `Valhalla`, `Mapbox`, `GraphHopper`.

- **9.4 Isochrone.** `Valhalla` default.
- **9.5 Matrix.**
- **9.6 Static image export.** Renders the current map (any renderer) to

  a `Blob`/`dataURL`. WebGL path uses `toDataURL`; SVG path serializes.

- **9.7 `MapGeocoderControl`, `MapDirectionsControl`** — drop-in UI

  controls matching Mapbox's plugin set, built with stx.

**Exit:** the playground has search, turn-by-turn, reachable-within-X-min,
all fully functional against OSRM+Nominatim with no API keys.

---

## Phase 10 — Offline & performance

- **10.1 Tile cache.** `IndexedDB`-backed (built-in in-browser DB, zero-dep).

  Policies: LRU by tile count or bytes, TTL.

- **10.2 Offline regions.** `map.offline.save(bounds, zoomRange, style)` —

  pre-fetches + stores.

- **10.3 Web worker tile parsing.** Move MVT decoding + triangulation off

  the main thread. In-house `WorkerPool` (no deps).

- **10.4 Main-thread budget.** Frame-time instrumentation + regression

  guards in `bench.ts`.

**Exit:** cold-loaded map with fewer than 16ms frame spikes at p95 on a
2019 MacBook Air.

---

## Phase 11 — Framework integrations (ride the existing packages)

The repo already has `packages/vue` and `packages/react`. Update + add:

- **11.1 `ts-maps-react`** — `<Map>`, `<TileLayer>`, `<Marker>`, `<Source>`,

  `<Layer>`, `<Popup>`, hooks (`useMap`, `useMapEvent`).

- **11.2 `ts-maps-vue`** — matching SFC components.
- **11.3 `ts-maps-svelte`** (new).
- **11.4 `ts-maps-solid`** (new).
- **11.5 `ts-maps-nuxt`** module (already scaffolded; wire it).
- **11.6 `ts-maps-stx`** — native components for our own stx templating.

**Exit:** `npm create ts-maps@latest` scaffolds a demo app in any of the
five frameworks.

---

## Phase 12 — Docs, site, ecosystem

- **12.1 Docs site.** Built with stx + crosswind. Hosted. API reference

  generated from TSDoc (zero-dep custom extractor).

- **12.2 Examples gallery.** ~40 examples matching Mapbox's + Leaflet's.
- **12.3 Style playground** (edit style JSON, see the map re-render).
- **12.4 Plugin guide + public plugin registry.**
- **12.5 Migration guides.** From Leaflet, from Mapbox GL JS, from MapLibre.

---

## Phase 13 — Native: integrate with Craft

We own [Craft](https://github.com/stacksjs/craft) (`~/Code/Tools/craft`), a
Zig-powered cross-platform app framework (macOS/Linux/Windows/iOS/Android) —
297 KB binary, ~168 ms startup, WebView+native hybrid. Craft already has an
abstract `maps.zig` module with a `MapProvider` enum covering Apple Maps,
Google Maps, Mapbox, OpenStreetMap, and HERE. **ts-maps is Craft's
new first-class map provider.**

- **13.1 Add `ts_maps` to Craft's `MapProvider` enum.** Supports offline

  (via Phase 10's IndexedDB cache). On Linux/Windows/Android (no native
  Apple Maps) and in web targets, `defaultProvider()` returns `.ts_maps`.
  Lives in `~/Code/Tools/craft/packages/zig/src/maps.zig`.

- **13.2 Craft binding package — `@craft/ts-maps`.** New TypeScript SDK at

  `~/Code/Tools/craft/packages/ts-maps/` that:

  - Re-exports the ts-maps runtime.
  - Bridges Craft's native `MapConfiguration`/`MapMarker`/`MapPolyline`

    /`MapCamera` to ts-maps primitives so Craft apps get a uniform API
    whether the map runs via native MapKit/GoogleMaps or via ts-maps in
    a WebView.

  - Listens for native events (marker tap, region change, user

    location) through Craft's bridge (`packages/typescript/src/bridge/core.ts`).

  - Exposes methods callable from Zig (addMarker, setRegion, etc.) via

    the bridge protocol.

- **13.3 Craft examples.** Add `~/Code/Tools/craft/examples/ts-maps-demo/`

  showing a full Craft app using ts-maps: drop a marker on tap, show a
  popup, query a local tile cache offline.

- **13.4 Canvas / SVG / WebGL renderer parity on mobile.** Our WebGL

  renderer (Phase 6) runs inside Craft's iOS WKWebView and Android
  WebView. Canvas2D is the fallback on older OS versions.

- **13.5 Offline regions from Craft.** Craft native code pre-downloads

  tile regions to the app's sandboxed storage via `api_filesystem.zig`;
  ts-maps reads from there through a Craft-specific `TileSource` adapter.

- **13.6 React-Native path (stretch).** `@craft/ts-maps-rn` ports the

  WebGL renderer onto WebGL-RN. Not a priority while we have the
  WebView path.

The end state: any Craft app can `import { MapView } from '@craft/ts-maps'`
and get a Mapbox-class map on every platform Craft targets, with zero
runtime deps and no third-party API keys required.

---

## Exit / success criteria for the whole project

- Feature parity matrix vs Mapbox GL JS ≥ 85%.
- Benchmarks within 1.5× of mapbox-gl on the same scenes.
- Zero runtime dependencies in `packages/ts-maps/package.json`.
- 100% TypeScript, `isolatedDeclarations: true`, clean `bun run typecheck`.
- Tests cover every style-spec property and every public method.
- Docs + examples for every feature.
- Credits to Leaflet and any other prior-art projects we draw ideas from.
