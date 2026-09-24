# The `TsMap` class

`TsMap` is the root object: it owns the DOM container, the camera state, the render loop, and the registry of layers, sources and style layers. Everything else in ts-maps either feeds into `TsMap` or reads from it.

## Creating a map

```ts
import { TsMap } from 'ts-maps'

const map = new TsMap('map-id', {
  center: [51.5074, -0.1278],   // [lat, lng] or LatLng
  zoom: 10,                     // fractional zoom is supported
  bearing: 0,                   // degrees clockwise from north
  pitch: 0,                     // 0–85, degrees of camera tilt (maxPitch)
  minZoom: 2,
  maxZoom: 19,
  worldCopyJump: true,
})
```

## Camera model

The camera is specified by four independent knobs: `center`, `zoom`, `bearing` and `pitch`. Every camera change — whether a drag, a wheel zoom, a programmatic `setView`, or an animated `flyTo` — resolves to the same underlying state.

| Method | Returns |
| ------ | ------- |
| `getCenter()` | a `LatLng` |
| `getZoom()` | current fractional zoom |
| `getBearing()` | rotation in degrees (0 is north-up) |
| `getPitch()` | tilt in degrees (0 is top-down) |
| `getBounds()` | visible `LatLngBounds` (respects bearing & pitch) |
| `getSize()` | pixel `Point` of the container |

## Moving the camera

Three animation modes share a unified engine:

- `jumpTo({ center, zoom, bearing, pitch })` — instant.
- `easeTo({ ..., duration })` — linear tween of every provided knob.
- `flyTo(center, zoom, { duration })` — zoom-out/zoom-in arc for long hops.
- Plus: `setView`, `panTo`, `panBy`, `fitBounds`, `setZoom`, `zoomIn`/`zoomOut`, `setBearing`/`rotateTo`, `setPitch`/`pitchTo`.

Animated zooms — the zoom buttons, a double-click, the keyboard, `setZoom` — run
frame by frame on the same engine rather than as a CSS transition, so every
frame is a real camera that labels and overlays follow. The point being zoomed
around stays exactly under the cursor, pressing `+` again mid-zoom adds a level
to where the zoom is heading, and `zoomAnimationDuration` (default `320` ms,
eased out) sets the pace.

## Events

Every user interaction and programmatic camera change fires events on the map. Attach handlers with `map.on(type, handler)`; remove with `map.off(type, handler)`.

| Event | When |
| ----- | ---- |
| `load` | First render is complete. |
| `movestart` / `move` / `moveend` | Center changes. |
| `zoomstart` / `zoom` / `zoomend` | Zoom changes. |
| `rotate` | Bearing changes. |
| `pitch` | Pitch changes. |
| `click`, `contextmenu`, `mousemove`, `mouseover`, `mouseout` | Pointer events, with `latlng`, `containerPoint`, `layerPoint`. |
| `resize` | Container size changed. |
| `styledata` / `sourcedata` | Style or source mutation. |
| `fogchange` / `skychange` / `terrainchange` | 3D / atmosphere state mutated via `setFog` / `setSky` / `setTerrain`. |
| `terrainload` | A DEM tile finished decoding into the terrain source. |
| `customlayer:add` / `customlayer:remove` | Custom 3D layer registered or unregistered. |

## Layer-scoped pointer events

Handlers can be scoped to a style layer ID so they only fire when the pointer is over a feature from that layer.

```ts
map.on('click', 'poi-labels', (e) => {
  console.log('clicked POI', e.features[0])
})
```

## Lifecycle

Call `map.remove()` when tearing down — this detaches all event listeners, cancels in-flight tile requests, stops the animation loop and clears the container. Call it before removing the host element from the DOM.
