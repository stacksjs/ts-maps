# `Map`

The map. One instance owns a DOM container, a camera, an optional style
document and the layers and controls added to it. Everything on this page is a
method or event of `Map`; the layers it holds are in [Layers](./layer.md).

Before 0.5 the class was called `TsMap`. That name still works, as a
deprecated alias of `Map`.

```ts
import { Map, styles } from 'ts-maps'
import 'ts-maps/styles.css'

const map = new Map('map', {
  center: [40.758, -73.9855], // [lat, lng]
  zoom: 14,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})
```

Coordinates are `[lat, lng]` throughout the map's own API, as in Leaflet.
Anywhere a point is taken, a `LatLng`, a `[lat, lng]` pair or a
`{ lat, lng }` object will do. GeoJSON and the style spec keep their
`[lng, lat]` order.

## Creating a map

| Signature | |
| --------- | - |
| `new Map(container, options?)` | `container` is an element id or an `HTMLElement`. |
| `createMap(container, options?)` | The same, as a function. Also exported as `map`. |
| `Map` | An alias of `Map`. |

The view is set at construction only when both `center` and `zoom` are given.
Without them the map is empty until the first `setView` or `fitBounds`.
Before then, `getCenter()` — and so `flyTo`, `easeTo` and `jumpTo` — throws
`Set map center and zoom first.`

### Options

#### View

| Option | Type | Default | |
| ------ | ---- | ------- | - |
| `center` | `LatLngLike` | — | Initial centre. Needs `zoom` too. |
| `zoom` | `number` | — | Initial zoom. Fractional zooms are fine. |
| `bearing` | `number` | `0` | Degrees clockwise from north, wrapped to `[0, 360)`. |
| `pitch` | `number` | `0` | Camera tilt in degrees. `0` looks straight down. |
| `minZoom` | `number` | — | Lowest zoom. Falls back to the layers' `minZoom`, then `0`. |
| `maxZoom` | `number` | — | Highest zoom. Falls back to the layers' `maxZoom`, then no limit. |
| `minPitch` | `number` | `0` | Lowest pitch. |
| `maxPitch` | `number` | `85` | Highest pitch. Past about 72° the horizon is on screen and a sky is drawn above it. |
| `maxBounds` | `LatLngBoundsLike` | — | Keep the view inside these bounds. |
| `projection` | `'mercator' \| 'globe'` | `'mercator'` | `'globe'` draws the world as a sphere when zoomed out. See [Projection](#projection). |
| `crs` | `CRS` | `EPSG3857` | Coordinate reference system. `EPSG4326`, `EPSG3395` and `SimpleCRS` are exported too. |

#### Style and look

| Option | Type | Default | |
| ------ | ---- | ------- | - |
| `style` | `StyleSpec \| string` | — | A style to set at construction: an object, or a URL to fetch one from. Same as calling `setStyle()`. |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Colour scheme of the controls, popups and attribution. `'auto'` follows the page, then the OS. |
| `locale` | `string` | `navigator.language` | Language of the built-in controls. English and German are built in. |
| `layers` | `Layer[]` | `[]` | Layers to add at construction. |
| `renderer` | `Renderer` | — | Renderer for vector paths (`Polyline`, `Circle`, …). |
| `preferCanvas` | `boolean` | — | Draw vector paths on a `<canvas>` instead of SVG. |

#### Interaction

Each of these is also a handler on the map, with `enable()` and `disable()`:
`map.dragging.disable()`.

| Option | Type | Default | |
| ------ | ---- | ------- | - |
| `dragging` | `boolean` | `true` | Drag to pan. |
| `inertia` | `boolean` | `true` | Keep panning after a fling. |
| `inertiaDeceleration` | `number` | `3400` | px/s². |
| `inertiaMaxSpeed` | `number` | `Infinity` | px/s. |
| `easeLinearity` | `number` | `0.2` | |
| `worldCopyJump` | `boolean` | `false` | Jump back to the main world copy after panning past the antimeridian. |
| `maxBoundsViscosity` | `number` | `0` | How hard `maxBounds` resists dragging: `0` to `1`. |
| `scrollWheelZoom` | `boolean` | `true` | Wheel and trackpad zoom. |
| `wheelPxPerZoomLevel` | `number` | `60` | Wheel travel per zoom level. Lower zooms faster. |
| `wheelSmoothing` | `number` | `0.13` | Seconds for the camera to catch up with the wheel. |
| `doubleClickZoom` | `boolean` | `true` | |
| `boxZoom` | `boolean` | `true` | Shift-drag to zoom to a box. |
| `keyboard` | `boolean` | `true` | Arrow keys pan, `+` and `-` zoom. |
| `keyboardPanDelta` | `number` | `80` | Pixels per arrow key press. |
| `pinchZoom` | `boolean` | `true` | Two-finger pinch. (`touchZoom` is the old name and still accepted.) |
| `bounceAtZoomLimits` | `boolean` | `true` | Let a pinch overshoot the zoom limits, then settle back. |
| `touchRotate` | `boolean` | `true` | Two-finger twist to rotate. |
| `touchPitch` | `boolean` | `true` | Two-finger vertical drag to tilt. |
| `tapHold` | `boolean` | mobile Safari only | Long press fires `contextmenu`. |
| `tapTolerance` | `number` | `15` | Pixels a finger may move and still count as a tap. |
| `cooperativeGestures` | `boolean \| { wheelHint?, touchHint? }` | `false` | Plain scroll and one-finger swipes scroll the page; ⌘/Ctrl + scroll and two fingers move the map. |
| `closePopupOnClick` | `boolean` | `true` | A click on the map closes the open popup. |
| `trackResize` | `boolean` | `true` | Re-measure when the container resizes. |

#### Animation

| Option | Type | Default | |
| ------ | ---- | ------- | - |
| `zoomSnap` | `number` | `0` | Round zoom to a multiple of this. `0` allows any fractional zoom; `1` gives Leaflet's whole levels. |
| `zoomDelta` | `number` | `1` | Levels per `zoomIn()` / `zoomOut()`, zoom button or `+` / `-` key. |
| `zoomAnimation` | `boolean` | `true` | Animate zoom changes. |
| `zoomAnimationThreshold` | `number` | `4` | Zoom jumps larger than this are not animated. |
| `zoomAnimationDuration` | `number` | `320` | Milliseconds for an animated zoom step. |
| `fadeAnimation` | `boolean` | `true` | Fade tiles in. |
| `markerZoomAnimation` | `boolean` | `true` | Animate markers during a zoom. |
| `transform3DLimit` | `number` | `8388608` | Reset the pane position after panning this many pixels. |

#### Controls

| Option | Type | Default | |
| ------ | ---- | ------- | - |
| `zoomControl` | `boolean` | `true` | Add a `ZoomControl`. |
| `attributionControl` | `boolean` | `true` | Add an `AttributionControl`. |

## Camera

### Moving

| Method | |
| ------ | - |
| `setView(center, zoom?, options?)` | Centre and zoom. Animates when the map is already showing; `{ animate: false }` snaps. |
| `setZoom(zoom, options?)` | |
| `zoomIn(delta?, options?)` / `zoomOut(delta?, options?)` | By `zoomDelta` unless given. Counted from where a running zoom is heading, so three quick presses go three levels. |
| `setZoomAround(latlngOrPoint, zoom, options?)` | Zoom keeping one point fixed on screen. Takes a `LatLng` or a container `Point`. |
| `panTo(latlng, options?)` | |
| `panBy([x, y], options?)` | Pan by pixels. |
| `fitBounds(bounds, options?)` | Frame a bounds. Throws on invalid bounds. |
| `fitWorld(options?)` | |
| `flyTo(center, zoom?, options?)` | Zoom out, across and back in, along a curve. |
| `flyToBounds(bounds, options?)` | `flyTo` the bounds' centre and fitting zoom. |
| `easeTo(options)` | Glide any of `center`, `zoom`, `bearing`, `pitch` together. |
| `jumpTo(options)` | Set any of `center`, `zoom`, `bearing`, `pitch` at once, without animation. |
| `setBearing(deg)` / `rotateTo(deg, options?)` | Rotate. `rotateTo` animates with `{ animate: true, duration?, easing? }`. |
| `setPitch(deg)` / `pitchTo(deg, options?)` | Tilt, clamped to `[minPitch, maxPitch]`. `pitchTo` animates like `rotateTo`. |
| `panInside(latlng, options?)` | Pan just enough to bring a point into view, inside `padding`. |
| `panInsideBounds(bounds, options?)` | Pan the centre back inside bounds. |
| `stop()` | Stop any camera animation. |
| `isEasing()` | Whether a `flyTo`, `easeTo` or animated rotate or pitch is running. |

```ts
map.flyTo([51.5074, -0.1278], 13, { bearing: 30, pitch: 50 })
map.easeTo({ zoom: 16, bearing: 90, pitch: 60, duration: 1200 })
map.jumpTo({ center: [48.8566, 2.3522], zoom: 14 })
map.fitBounds([[40.70, -74.02], [40.80, -73.93]], { padding: [40, 40] })
```

Options:

- `flyTo(center, zoom, { bearing?, pitch?, duration?, animate?, essential? })`.
  `duration` is in milliseconds; left out, it follows the distance flown.
- `easeTo({ center?, zoom?, bearing?, pitch?, duration?, easing?, essential?, noMoveStart? })`.
  `duration` defaults to 300 ms. Bearing turns the short way round.
- `setView`, `panTo` and `panBy` take Leaflet's options: `animate`, and
  `duration` in **seconds** (default 0.25), unlike `flyTo` and `easeTo`.
- `fitBounds` and `flyToBounds` take `padding` as a `[x, y]` pair (not a
  single number), or `paddingTopLeft` and `paddingBottomRight`, and
  `maxZoom`. `fitBounds` also takes `setView`'s `animate`.
- When the reader has asked the system for reduced motion, `flyTo` and
  `easeTo` arrive without animating, unless the call says
  `essential: true`.

Starting a camera move cancels the one running.

### Limits

| Method | |
| ------ | - |
| `setMaxBounds(bounds)` | Keep the view inside bounds. Pass an invalid or empty bounds to lift it. |
| `setMinZoom(zoom)` / `setMaxZoom(zoom)` | Fires `zoomlevelschange`, and moves the zoom inside the new range. |

### Reading

| Method | Returns |
| ------ | ------- |
| `getCenter()` | `LatLng` |
| `getZoom()` | `number` |
| `getBearing()` | `number`, `[0, 360)` |
| `getPitch()` | `number` |
| `getCamera()` | `{ center, zoom, bearing, pitch }` |
| `getBounds()` | `LatLngBounds` of what is on screen. On a turned or tilted map, it holds the whole view; above the horizon it stops at the farthest ground still drawn legibly. |
| `getBoundsZoom(bounds, inside?, padding?)` | The zoom that fits `bounds` (or fills the view with it, `inside: true`) |
| `getMinZoom()` / `getMaxZoom()` | `number` |
| `getSize()` | Container size as a `Point` |
| `getPixelBounds()` / `getPixelOrigin()` / `getPixelWorldBounds(zoom?)` | Projected pixel geometry |

## Style

The map can hold one style document: sources, and style layers that draw
them, as in the [Mapbox GL Style Spec](https://docs.mapbox.com/style-spec/).
Leaflet-style layers (`Marker`, `TileLayer`, …) sit alongside it and are
added with `addLayer` — see [Layers and controls](#layers-and-controls).

| Method | |
| ------ | - |
| `setStyle(style, options?)` | Replace the style. `style` is an object or a URL. `options`: `{ diff?: boolean = true, validate?: boolean = true }`. |
| `getStyle()` | A copy of the current style document, or `undefined`. |
| `isStyleLoaded()` | Whether the map has a style yet. |
| `addSource(id, source)` | Add a source. Creates an empty style if there is none. A TileJSON `url` is read first; see Loading below. |
| `getSource(id)` | The source's spec object. |
| `removeSource(id)` | |
| `setSourceData(id, data)` | Replace a `geojson` source's data: a GeoJSON object or a URL. Fires `sourcedata`. |
| `addStyleLayer(layer, beforeId?)` | Add a style layer, before `beforeId` if given. Throws when there is no style and none is loading. |
| `getStyleLayer(id)` | The layer's spec object. |
| `removeStyleLayer(id)` | |
| `setPaintProperty(id, name, value)` | Throws for an unknown layer id. |
| `setLayoutProperty(id, name, value)` | `'visibility'`, `'text-field'`, … |
| `setFilter(id, filter)` | An [expression](./expressions.md) or a legacy filter. |
| `setLayerZoomRange(id, minzoom?, maxzoom?)` | The zooms the layer draws at: from `minzoom`, up to but not including `maxzoom`. |
| `getGlyphSource()` | The style's `glyphs` server, when it names one. |
| `isFontAvailable(textFont)` | Whether the browser has a `text-font` stack. |

```ts
map.on('style.load', () => {
  map.addSource('parks', { type: 'geojson', data: '/parks.geojson' })
  map.addStyleLayer({
    id: 'parks',
    type: 'fill',
    source: 'parks',
    paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.3 },
  })
})

map.setPaintProperty('parks', 'fill-opacity', 0.6)
map.setFilter('parks', ['>', ['get', 'area'], 10000])
```

**Sources.** `vector` (a `tiles` template, a TileJSON `url`, or a
`pmtiles://` archive), `raster`, `raster-dem` and `geojson`. A `geojson`
source takes `data` as an object or a URL, and `cluster`, `clusterRadius`
(default 50), `clusterMaxZoom` (16) and `clusterMinPoints` (2); clusters carry
`point_count` for expressions. `image` and `video` sources are not supported:
use `ImageOverlay` and `VideoOverlay`.

**Layers.** `background`, `fill`, `fill-extrusion`, `line`, `circle`,
`symbol`, `raster`, `hillshade` and `heatmap`.

A `raster` source is drawn only through `raster` layers that use it. With none,
it draws nothing. The layer's `minzoom`, `maxzoom` and `visibility` decide when
it shows, and outside them its tiles are not fetched. `raster-opacity` is
applied, and can change with the zoom. `raster-brightness-min`,
`raster-brightness-max`, `raster-contrast`, `raster-saturation` and
`raster-hue-rotate` become a CSS filter on the layer, close to Mapbox's but not
the same. If several raster layers use one source, the first one that shows at
the current zoom is drawn.

**Loading.** A style given as a URL is fetched; one whose sources name a
TileJSON `url` has those read first. Either way `setStyle` returns at once and
the style goes in when they arrive. Sources and layers added in the meantime
are put on it then.

`addSource` reads a TileJSON `url` too, for `vector`, `raster` and `raster-dem`
sources. The source is in the style at once, with its `url`, and layers can be
added for it straight away; it draws once the TileJSON is in, with `tiles`,
`minzoom`, `maxzoom`, `attribution`, `bounds` and `encoding` filled in from it.
What the source says itself wins. The map fires `sourcedata` with `sourceId`
when it is ready, or `error` with `sourceId` if the TileJSON cannot be read. A
`pmtiles://` URL is read in place, as before.

When both the old and the new style are in place, `setStyle` applies the
difference rather than rebuilding, so swapping a light basemap for a dark one
keeps the tiles it has.

`style.load` fires each time a style goes in, a microtask after `setStyle`
puts it in place — so a listener added on the line after the constructor
hears it, even for a style with nothing to fetch. If two styles are set in
quick succession, it fires for the one that won. `isStyleLoaded()` is already
`true` by then.

Setting a new style replaces the old one's sources and layers. Add your own
again on `style.load`.

## Querying features

| Method | |
| ------ | - |
| `queryRenderedFeatures(point?, options?)` | Features drawn at a container point, in a box, or everywhere. |
| `querySourceFeatures(sourceId, { sourceLayer?, filter? })` | Every feature of a source in the tiles loaded, drawn or not. |

The first argument is a point or a box, in container pixels: a `Point`,
`{ x, y }` or `[x, y]`, or a box as `[[x1, y1], [x2, y2]]`. A box returns the
features that touch it. Options go second, or on their own as the only
argument: `layers`, a list of style layer ids, and `filter`, an expression the
features must also pass. The options may carry the geometry themselves, as
`point` or `bbox`. With no point and no box, every feature in the loaded tiles
that passes the filters is returned.

```ts
map.queryRenderedFeatures([[0, 0], [200, 100]], { layers: ['poi'] })
map.queryRenderedFeatures({ layers: ['roads'], filter: ['==', ['get', 'class'], 'motorway'] })
```

Each result is `{ feature, layer, tile }`: `feature.properties`, `feature.id`
and `feature.type` (1 point, 2 line, 3 polygon), `layer` the style layer that
drew it, and `tile` its `{ x, y, z }`. `feature.toGeoJSON(x, y, z)` gives a
GeoJSON feature. Only `vector` and `geojson` sources answer.

```ts
map.on('click', (e) => {
  const [hit] = map.queryRenderedFeatures(e.containerPoint, { layers: ['roads'] })
  if (hit)
    console.log(hit.layer.id, hit.feature.properties)
})
```

## Feature state

State kept per feature, read by style expressions with
`['feature-state', key]`. Changing it repaints the tiles already loaded; it
does not refetch them.

| Method | |
| ------ | - |
| `setFeatureState({ source, sourceLayer?, id }, state)` | Merge `state` into the feature's state. |
| `getFeatureState({ source, sourceLayer?, id })` | The feature's state, or `{}`. |
| `removeFeatureState({ source, sourceLayer?, id }, key?)` | Remove one key, or all of it. |

`sourceLayer` is the `source-layer` the feature is in, and a `vector` source
needs it. A `geojson` source has only one, so `{ source, id }` is enough, as in
Mapbox; giving the source's id as `sourceLayer` reaches the same state.

```ts
map.on('pointermove', 'parks', (e) => {
  const id = e.features[0].feature.id
  map.setFeatureState({ source: 'parks', id }, { hover: true })
})

map.setPaintProperty('parks', 'fill-opacity',
  ['case', ['boolean', ['feature-state', 'hover'], false], 0.6, 0.3])
```

## Events

| Method | |
| ------ | - |
| `on(type, fn, context?)` / `off(type, fn?, context?)` / `once(type, fn, context?)` | `type` may hold several names separated by spaces, or be a `{ type: fn }` object. |
| `on(type, layerId, fn)` / `off(type, layerId, fn)` / `once(type, layerId, fn)` | Pointer events that hit a feature drawn by a style layer. The event gets `features`, as `queryRenderedFeatures` returns them. |
| `fire(type, data?)` | Fire an event. |
| `listens(type)` | Whether anything listens. |
| `whenReady(fn)` | Run `fn` now if the view is set, otherwise on `load`. |

```ts
map.on('moveend', () => console.log(map.getCenter()))
map.on('click', 'roads', e => console.log(e.features[0].feature.properties))
```

Pointer events follow the Pointer Events names. `mousedown`, `mouseup`,
`mousemove`, `mouseover` and `mouseout` are not fired: listen for
`pointerdown`, `pointerup`, `pointermove`, `pointerover` and `pointerout`.

### Pointer and keyboard events

| Event | Payload |
| ----- | ------- |
| `click`, `dblclick`, `contextmenu`, `pointerdown`, `pointerup`, `pointermove`, `pointerover`, `pointerout` | `{ originalEvent, latlng, layerPoint, containerPoint }` |
| `preclick` | The same, before `click`. |
| `keypress`, `keydown`, `keyup` | `{ originalEvent }` |

### Camera events

| Event | Payload | When |
| ----- | ------- | ---- |
| `load` | — | The view is first set. With `center` and `zoom` options, that is inside the constructor; use `whenReady`. |
| `movestart`, `move`, `moveend` | — | The centre changes. |
| `zoomstart`, `zoom`, `zoomend` | — | The zoom changes. |
| `rotatestart`, `rotate`, `rotateend` | `{ bearing }` | The bearing changes. |
| `pitchstart`, `pitch`, `pitchend` | `{ pitch }` | The pitch changes. |
| `dragstart`, `drag`, `dragend` | `{ distance }` on `dragend` | The user drags the map. |
| `boxzoomstart`, `boxzoomend` | `{ boxZoomBounds }` on end | Shift-drag zoom. |
| `zoomlevelschange` | — | The zoom range changes. |
| `viewreset` | — | The view is reset without animation. |
| `resize` | `{ oldSize, newSize }` | The container changes size. |
| `projectionchange` | `{ projection }` | `setProjection()` switched projection. |

`jumpTo` fires `move` and `zoom`, and `rotate` and `pitch` without a payload;
it does not fire `movestart` or `moveend`.

### Style and data events

| Event | Payload | When |
| ----- | ------- | ---- |
| `style.load` | — | A style is in place, after any URL and TileJSON sources are read. A microtask late, so a listener added after the constructor hears it. |
| `styledata` | — | The style changed: `setStyle`, `addSource`, `addStyleLayer`, `setPaintProperty`, … |
| `sourcedata` | `{ sourceId, isSourceLoaded }` | `setSourceData` replaced a source's data, or a source added with a TileJSON `url` is ready. |
| `spriteload` | `{ sprite, id, icons, added }` | A sprite sheet loaded. |
| `error` | `{ error }`, with `style`, `sprite` or `sourceId` | A style, sprite, TileJSON or data URL failed. |

### Other events

| Event | Payload | When |
| ----- | ------- | ---- |
| `terrainchange` | `{ terrain }` | `setTerrain()` was called, including with `null`. |
| `terrainload` | `{ coord: { z, x, y } }` | A DEM tile was fetched for terrain. |
| `fogchange` | `{ fog }` | `setFog()` |
| `skychange` | `{ sky }` | `setSky()` |
| `customlayer:add`, `customlayer:remove` | `{ id, layer }` | A custom WebGL layer was added or removed. |
| `themechange` | `{ theme, dark }` | The chrome's theme changed. Fires once at construction. |
| `rendererchange` | `{ renderer }` | `setRenderer()` |
| `layeradd`, `layerremove` | `{ layer }` | A layer was added or removed. |
| `popupopen`, `popupclose` | `{ popup }` | |
| `tooltipopen`, `tooltipclose` | `{ tooltip }` | |
| `locationfound` | `{ latlng, bounds, accuracy, timestamp, … }` | `locate()` found the device. |
| `locationerror` | `{ code, message }` | `locate()` failed. |
| `unload` | — | `remove()` |

## 3D

### Terrain

| Method | |
| ------ | - |
| `setTerrain({ source, exaggeration? })` | Raise the ground by a `raster-dem` source's heights, measured from the ground at the centre of the view. Labels, markers and popups stand on it. Needs WebGL; without it the map stays flat. `exaggeration` multiplies the heights and defaults to `1`. `null` turns terrain off. |
| `getTerrain()` | The terrain options, or `null`. |
| `queryTerrainElevation({ lat, lng })` | Metres above sea level at a point, from the DEM tiles loaded, or `null`. |
| `getTerrainSource()` | The `TerrainSource` holding the decoded DEM tiles. |
| `addTerrainTile({ z, x, y }, rgba)` | Feed a DEM tile in yourself, as RGBA bytes. |

```ts
map.addSource('dem', {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  tileSize: 256,
  encoding: 'terrarium',
})
map.setTerrain({ source: 'dem', exaggeration: 1.3 })
```

### Fog and sky

| Method | |
| ------ | - |
| `setFog(fog)` / `getFog()` | `{ color?, 'high-color'?, 'horizon-blend'?, range?, 'star-intensity'?, 'space-color'? }`, or `null`. Throws when `range[0] >= range[1]`. |
| `setSky(sky)` / `getSky()` | `{ 'sky-color'?, 'horizon-color'?, 'fog-ground-blend'?, 'sun-position'?, 'sun-intensity'? }`, or `null`. |

Tilted far enough to see the horizon, the map draws a sky above it whether or
not `setSky` was called; `setSky` chooses its colours. On the globe, fog's
`color` colours the halo and `space-color` the space around it.

### Custom WebGL layers

| Method | |
| ------ | - |
| `addCustomLayer(layer)` | `{ id, type: 'custom', render(gl, matrix), onAdd?, onRemove? }`. Throws on a duplicate id. |
| `removeCustomLayer(id)` / `getCustomLayer(id)` / `getCustomLayers()` | |

`render` runs each frame after a WebGL tile layer has drawn. See
[3D rendering](../concepts/3d.md).

### Projection

| Method | |
| ------ | - |
| `setProjection('mercator' \| 'globe')` | Switch at runtime. The camera stays where it is. Fires `projectionchange`. |
| `getProjection()` | `'mercator'` or `'globe'`. |

With `'globe'`, the map zoomed out is a WebGL sphere textured with the tiles
the flat map has loaded. Between zoom 5.5 and 6 it fades into the flat map.
Without WebGL the flat map shows, with a halo round it.

## Rendering and theme

| Method | |
| ------ | - |
| `setRenderer('canvas2d' \| 'webgl' \| 'svg')` | Ask the style's tile layers to draw with this backend. Canvas 2D is the default; a layer that cannot honour the request keeps its own. Fires `rendererchange`. |
| `getPreferredRenderer()` | The backend asked for. |
| `setTheme('light' \| 'dark' \| 'auto')` | The chrome's colour scheme. Fires `themechange`. |
| `getTheme()` | As set: `'auto'` stays `'auto'`. |

The theme colours the controls, popups and attribution, not the basemap. Pair
`styles.dark(...)` with `setTheme('dark')`.

## Image export

| Method | |
| ------ | - |
| `toCanvas()` | Every `<canvas>` and `<img>` in the map drawn onto one canvas, at the device pixel ratio. |
| `toDataURL(type = 'image/png', quality?)` | A data URL, returned directly. |
| `toBlob(type = 'image/png', quality?)` | A `Promise<Blob \| null>`. |

Tiles from a server that sends no CORS headers taint the canvas, and
`toDataURL` then throws.

## Layers and controls

| Method | |
| ------ | - |
| `addLayer(layer)` / `removeLayer(layer)` | A `Layer` instance: a marker, tile layer, overlay, … Not a style layer: those go through `addStyleLayer`. |
| `hasLayer(layer)` / `eachLayer(fn)` | |
| `addControl(control)` / `removeControl(control)` | Same as `control.addTo(map)` / `control.remove()`. |
| `openPopup(content, latlng, options?)` / `closePopup(popup?)` | |
| `openTooltip(content, latlng, options?)` / `closeTooltip(tooltip)` | |

## Coordinates

| Method | |
| ------ | - |
| `latLngToContainerPoint(latlng)` / `containerPointToLatLng(point)` | Pixels from the container's top-left, allowing for bearing, pitch and the globe. |
| `latLngToLayerPoint(latlng)` / `layerPointToLatLng(point)` | Pixels in the map pane. |
| `containerPointToLayerPoint(point)` / `layerPointToContainerPoint(point)` | |
| `pointerEventToContainerPoint(e)` / `pointerEventToLayerPoint(e)` / `pointerEventToLatLng(e)` | From a DOM event. |
| `project(latlng, zoom?)` / `unproject(point, zoom?)` | To and from world pixels at a zoom. |
| `getZoomScale(toZoom, fromZoom?)` / `getScaleZoom(scale, fromZoom?)` | |
| `distance(a, b)` | Metres between two points. |
| `wrapLatLng(latlng)` / `wrapLatLngBounds(bounds)` | Longitudes into `[-180, 180]`. |

## Geolocation

| Method | |
| ------ | - |
| `locate(options?)` | Ask for the device's position. Fires `locationfound` or `locationerror`. Options: `setView`, `maxZoom`, `watch`, and the Geolocation API's `timeout` (default 10000), `maximumAge`, `enableHighAccuracy`. |
| `stopLocate()` | Stop watching. |

`LocateControl` (`control.locate()`) is the button for it.

## Offline

`map.offline` is the page's offline maps manager: `download`, `list`,
`delete`, `estimate`, `usage`, and search and routing over what was
downloaded. Reading it through a map makes that map the one a bare
`download({ bounds })` downloads. See [Offline](../concepts/offline.md).

```ts
const region = await map.offline.download({ bounds: map.getBounds(), name: 'Paris' })
```

## Lifecycle and DOM

| Method | |
| ------ | - |
| `invalidateSize(options?)` | Re-measure the container. Only needed with `trackResize: false`. |
| `getContainer()` | The container element. |
| `getPane(name)` / `getPanes()` / `createPane(name, container?)` | The stacked panes layers draw into. |
| `addHandler(name, HandlerClass)` | Add an interaction handler, reachable as `map[name]`. |
| `remove()` | Tear the map down and fire `unload`. |
