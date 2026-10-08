# The map

`TsMap` is the root object. It owns the container element, the camera, the
render loop, the style, and every layer and control on the map. Everything
else in ts-maps is added to a `TsMap` or reads from one.

## Creating a map

A map needs a sized element to live in and the library's stylesheet:

```html
<link rel="stylesheet" href="/node_modules/ts-maps/dist/ts-maps.css">

<div id="map" style="width: 100%; height: 560px;"></div>
```

Then a centre, a zoom and something to draw. Here that is the built-in light
style over [OpenFreeMap](https://openfreemap.org)'s planet, which is free and
needs no key:

```ts
import { styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [51.5074, -0.1278], // [lat, lng]
  zoom: 12,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})
```

The first argument is the element or its id. `center` is latitude first, as
`[lat, lng]`, a `LatLng`, or `{ lat, lng }`. `url` names a TileJSON: the map
reads it when the style is set and takes the tile URL, zoom range and
attribution from it. See [Styles & theming](./styles-and-theming.md) for the
built-in styles, and the [basic map example](../examples/01-basic-map.md) for
this page running with a marker on it.

### Options

Every option is optional. Without `center` and `zoom` the map has no view
until you call `setView`.

| Option | Default | |
| --- | --- | --- |
| `center` | — | `[lat, lng]` the map opens on. |
| `zoom` | — | Fractional zooms are fine: `12.5`. |
| `bearing` | `0` | Compass direction at the top of the screen, in degrees. |
| `pitch` | `0` | Camera tilt in degrees; `0` looks straight down. |
| `minZoom`, `maxZoom` | from the layers | Limits on zoom. |
| `minPitch`, `maxPitch` | `0`, `85` | Limits on pitch. Past about 72° the horizon and sky come into view. |
| `maxBounds` | — | A `LatLngBounds` the view cannot leave. |
| `style` | — | A style object, a URL to one, or a built-in from `styles`. Same as calling `setStyle` once the map is made. |
| `projection` | `'mercator'` | `'globe'` draws the world as a sphere when zoomed out. See [the globe](./3d.md#the-globe). |
| `theme` | `'light'` | The chrome's colours: `'light'`, `'dark'` or `'auto'`. See [theming the chrome](./styles-and-theming.md#theming-the-chrome). |
| `locale` | the browser's | The language the built-in controls speak. See [Localization](./localization.md). |
| `zoomControl` | `true` | Add the `+`/`−` buttons. |
| `attributionControl` | `true` | Add the credits line. |
| `zoomSnap` | `0` | Round zoom to a multiple of this. `1` gives whole levels only. |
| `zoomDelta` | `1` | Levels per zoom button press or `+`/`−` key. |
| `zoomAnimationDuration` | `320` | Milliseconds for an animated zoom. |
| `wheelPxPerZoomLevel` | `60` | Pixels of wheel travel per zoom level. Lower zooms faster. |
| `wheelSmoothing` | `0.13` | Seconds for the camera to catch up with the wheel. |
| `cooperativeGestures` | `false` | Share scroll and one-finger gestures with the page. See [sharing the page](#sharing-the-page). |
| `worldCopyJump` | `false` | Jump back to the main copy of the world when dragging past the date line. |
| `preferCanvas` | `false` | Draw vector paths on a canvas rather than in SVG. See [Layers](./layers.md#lines-polygons-and-circles). |
| `trackResize` | `true` | Re-measure when the container changes size. |
| `layers` | `[]` | Layer objects to add straight away. |
| `crs` | `EPSG3857` | The coordinate reference system. Web Mercator unless you are drawing something that is not a web map. |

The interaction handlers each have an option too; see [interaction](#interaction).

## The camera

The camera is four values: `center`, `zoom`, `bearing` and `pitch`.
`bearing` is the compass direction at the top of the screen, as in Mapbox GL
JS: at `90`, east is up, so the map itself has turned 90° counter-clockwise.
`pitch` tilts the camera away from straight down; [3D rendering](./3d.md#pitch)
covers what that does to the picture.

| Method | Returns |
| --- | --- |
| `getCenter()` | the centre, a `LatLng` |
| `getZoom()` | the zoom, fractional |
| `getBearing()` | the bearing in degrees, `[0, 360)` |
| `getPitch()` | the pitch in degrees |
| `getCamera()` | all four at once: `{ center, zoom, bearing, pitch }` |
| `getBounds()` | a `LatLngBounds` of what is on screen. On a turned or tilted map it holds the whole view; above the horizon it stops at the farthest ground still drawn legibly. |
| `getSize()` | the container's size in pixels, a `Point` |
| `getMinZoom()`, `getMaxZoom()` | the zoom limits in force |

Points on screen and points on the ground convert both ways with
`latLngToContainerPoint(latlng)` and `containerPointToLatLng(point)`.
`project` and `unproject` do the same against the world in pixels at a zoom,
and `distance(a, b)` is metres between two places.

## Moving the camera

Three methods set any of the four values together:

```ts
// At once.
map.jumpTo({ center: [48.8566, 2.3522], zoom: 14, bearing: 20, pitch: 40 })

// Gliding there. Each value moves in a straight line; default 300 ms.
map.easeTo({ bearing: 30, pitch: 50, duration: 900 })

// Out and back in, for a long hop. The duration follows the distance
// unless you give one.
map.flyTo([35.6762, 139.6503], 13, { bearing: 0, pitch: 0 })
```

`flyTo` takes the centre and zoom first, and the rest in its options. Its
pace is worked out from how far it goes; pass `duration` in milliseconds to
fix it. A new camera move cancels one that is running.

For the common cases there are shorter calls:

- `setView(center, zoom)`, `setZoom(zoom)`, `zoomIn()`, `zoomOut()`
- `panTo(center)`, `panBy([x, y])`
- `fitBounds(bounds, { padding })`, `flyToBounds(bounds)`, `fitWorld()`
- `setBearing(degrees)` and `setPitch(degrees)` set at once;
  `rotateTo(degrees, { animate: true })` and `pitchTo(degrees, { animate: true })`
  glide, 300 ms unless `duration` says otherwise.
- `stop()` ends any animation where it is.

When the reader has asked their system for reduced motion, `flyTo` and
`easeTo` jump rather than move. Pass `essential: true` where the animation is
the point.

Zooms from the buttons, a double-click, the keyboard or `setZoom` are
animated frame by frame by the same engine, rather than as a CSS transition,
so labels and markers follow every frame. The point being zoomed around
stays under the cursor, and pressing `+` again mid-zoom adds a level to where
the zoom is heading. `zoomAnimationDuration` sets the pace.

The [camera example](../examples/02-camera.md) has all three moves on
buttons.

## Interaction

Each way of moving the map by hand is a handler, on by default. Turn one off
with its option when the map is made, or later through the handler itself:

```ts
const map = new TsMap('map', {
  center: [40.758, -73.9855],
  zoom: 13,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
  scrollWheelZoom: false,
})

map.dragging.disable()
map.dragging.enable()
```

| Handler | What it does |
| --- | --- |
| `dragging` | Drag to pan, with inertia (`inertia`, `inertiaDeceleration`). On a tilted map or the globe, the ground you grabbed stays under the pointer. |
| `scrollWheelZoom` | Wheel or trackpad to zoom, around the pointer. |
| `doubleClickZoom` | Double-click to zoom in a level; with Shift, out. |
| `boxZoom` | Shift-drag a box to zoom to it. |
| `keyboard` | Once the map has focus: arrow keys pan (`keyboardPanDelta`, default 80 px), `+` and `−` zoom; Shift moves three times as far. Escape closes a popup. |
| `pinchZoom` | Two fingers pinch to zoom. |
| `touchRotate` | Two fingers twist to turn the map. |
| `touchPitch` | Two fingers dragged up or down together to tilt it. |
| `tapHold` | A long press opens the context menu. On by default only in mobile Safari, which does not fire `contextmenu` on a long press. |

On a desktop, the map turns and tilts from code or from the compass in
[`control.navigation()`](./controls.md#zoom-and-navigation); there is no mouse
gesture for either.

### Sharing the page

A map embedded among other content traps the scroll wheel: the page scrolls
until the pointer crosses the map, then the map zooms instead. Pass
`cooperativeGestures: true` to share gestures with the page, as a Google Maps
embed does:

- A plain wheel scrolls the page. ⌘/Ctrl + scroll, or a trackpad pinch, zooms
  the map.
- One finger scrolls the page on a touch screen; two fingers pan, pinch, rotate
  and tilt the map.
- A short hint over the map says so when it matters. Reword it with
  `cooperativeGestures: { wheelHint, touchHint }` (`{key}` becomes ⌘ or Ctrl).

In fullscreen the map is the page, and gestures work directly again.

## What goes on a map

Three kinds of thing are added to a map, each with a page of its own:

- **The style**: the basemap and any data drawn through it, described as
  sources and layers in the [Mapbox GL style spec](./style-spec.md).
  `setStyle`, `addSource`, `addStyleLayer`.
- **Layer objects**: markers, popups, lines and shapes, GeoJSON, raster tiles,
  heatmaps and overlays. See [Layers](./layers.md). `layer.addTo(map)`.
- **Controls**: the buttons and panels drawn over the map. See
  [Controls](./controls.md). `control.addTo(map)`.

Data of your own that should sit inside the basemap, under its labels, goes
in the style. Data you want to click, drag or animate one item at a time is
usually easier as layer objects.

## Events

`map.on(type, handler)` listens, `map.off(type, handler)` stops, and
`map.once(type, handler)` hears the next one only. Handlers get an event
object with `type` and `target`, plus what the table says.

### Camera

| Event | When |
| --- | --- |
| `movestart` / `move` / `moveend` | The centre or zoom changes, by hand or from code. |
| `zoomstart` / `zoom` / `zoomend` | The zoom changes. |
| `rotatestart` / `rotate` / `rotateend` | The bearing changes. Carries `bearing`. |
| `pitchstart` / `pitch` / `pitchend` | The pitch changes. Carries `pitch`. |
| `dragstart` / `drag` / `dragend` | The map is dragged by hand. |
| `boxzoomstart` / `boxzoomend` | A Shift-drag box zoom. |
| `zoomlevelschange` | `minZoom` or `maxZoom` changed. |
| `resize` | The container changed size. Carries `oldSize` and `newSize`. |
| `viewreset` | The view was set from scratch, as by `setView` with no animation. |

### Pointer and keyboard

`click`, `dblclick`, `contextmenu`, `pointerdown`, `pointerup`,
`pointermove`, `pointerover` and `pointerout` carry `latlng`,
`containerPoint`, `layerPoint` and the browser's `originalEvent`. `preclick`
fires just before `click`. `keydown`, `keyup` and `keypress` carry
`originalEvent` only.

```ts
map.on('click', (e) => {
  console.log(e.latlng.lat, e.latlng.lng)
})
```

### Style and rendering

| Event | When |
| --- | --- |
| `style.load` | A style set with `setStyle` (or the `style` option) is in place, with its TileJSON sources read. The moment to add sources and layers of your own. |
| `styledata` | The style changed: set, or a source or layer added, removed or restyled. |
| `sourcedata` | A GeoJSON source's data is in. Carries `sourceId`. |
| `spriteload` | A sprite sheet arrived and its icons can be drawn. |
| `error` | Something failed to load: a style URL, a TileJSON, a sprite sheet, GeoJSON data. Carries `error`. |
| `themechange` | The chrome's theme changed. Carries `theme` and `dark`. |
| `projectionchange` | `setProjection` switched between `'mercator'` and `'globe'`. |
| `rendererchange` | `setRenderer` chose another tile renderer. |
| `fogchange` / `skychange` / `terrainchange` | `setFog`, `setSky` or `setTerrain` was called. See [3D rendering](./3d.md). |
| `terrainload` | A terrain elevation tile was decoded. |
| `customlayer:add` / `customlayer:remove` | A custom WebGL layer was added or removed. |

### Layers and lifecycle

| Event | When |
| --- | --- |
| `load` | The map has a view for the first time. See [lifecycle](#lifecycle). |
| `unload` | `remove()` was called. |
| `layeradd` / `layerremove` | A layer object was added or removed. Carries `layer`. |
| `popupopen` / `popupclose`, `tooltipopen` / `tooltipclose` | A popup or tooltip opened or closed. |
| `locationfound` / `locationerror` | The answer to `map.locate()`. |

Controls fire events of their own on the map, such as `locatefound` and
`fullscreenstart`; [Controls](./controls.md) lists them with each control.

### Events on a style layer

Pass a style layer's id between the type and the handler, and the handler
runs only when the pointer is over a feature of that layer. `e.features` holds
what is under it, each as `{ feature, layer, tile }`:

```ts
map.on('click', 'midtown-fill', (e) => {
  const { feature } = e.features[0]
  console.log(feature.properties.name)
})
```

`map.off(type, layerId, handler)` removes it and `map.once(type, layerId,
handler)` runs it once. The feature lookup is the same as
[`queryRenderedFeatures`](./style-spec.md#querying-features).

## Exporting an image

`map.toCanvas()` copies every canvas and image in the map into a new canvas
at the device's pixel ratio: the vector basemap, raster tiles, heatmaps and
image markers. Things drawn as HTML or SVG are left out: vector paths in the
default SVG renderer, `DivIcon` markers, popups and controls.
`map.toDataURL('image/png')` and `await map.toBlob('image/png')` wrap it.

A vector basemap is drawn from data the map fetched, so it never stops the
export. A raster layer's images do, unless the server sends CORS headers and
the layer asks for them with `crossOrigin: true`: the browser will not read
back an image from another origin without them, and `toDataURL` throws.

## Lifecycle

`load` fires the first time the map has a view. With `center` and `zoom` in
the options, that happens inside the constructor, before your code can listen
for it. `whenReady` works either way:

```ts
map.whenReady(() => {
  console.log('the map has a view')
})
```

`style.load` fires a microtask after the style is in place, so
`map.on('style.load', …)` on the line after the constructor hears it.
[Adding your own data](./style-spec.md#adding-your-own-data) uses it.

The map watches its container and re-measures when its size changes. If you
turn that off with `trackResize: false`, call `map.invalidateSize()` after
changing the container's size yourself.

`map.remove()` takes the map down: it removes its layers and controls,
detaches its listeners, stops any animation and following of the device's
position, fires `unload`, and empties the container. Call it before taking
the element out of the page. The element can then hold a new map.
