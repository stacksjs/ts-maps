# Solid

`@ts-maps/solid` wraps ts-maps in Solid components. `<Map>` builds a `Map`
in `onMount` and gives it to its children through context; every other
component adds one thing to that map and removes it on cleanup. For what the
bindings share, see [Framework bindings](./framework-bindings.md).

The package ships its TSX source, and your Solid build compiles it.

## Install

::: code-group

```sh [bun]
bun add @ts-maps/solid
```

```sh [npm]
npm install @ts-maps/solid
```

```sh [pnpm]
pnpm add @ts-maps/solid
```

:::

`solid-js` 1.8 or later is a peer dependency. `ts-maps` comes with the
package. Import the stylesheet once:

```ts
import '@ts-maps/solid/styles.css'
```

## A first map

```tsx
import { Map } from '@ts-maps/solid'
import { styles } from 'ts-maps'
import '@ts-maps/solid/styles.css'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })

export function App() {
  return (
    <Map
      center={[40.758, -73.9855]}
      zoom={13}
      style={basemap}
      containerStyle={{ height: '480px' }}
    />
  )
}
```

That draws [OpenFreeMap](https://openfreemap.org)'s planet, free and keyless.
The examples below reuse `basemap`.

- `center` is `[lat, lng]`.
- `style` is the map's style: a style object, or the URL of one. When it
  changes, the map calls `setStyle()`.
- `containerStyle` and `class` go on the container `<div>`. Give it a height.

`center`, `zoom`, `bearing`, `pitch` and `locale` are followed as they change.
A prop is passed on when its value changes: a new array with the same
`center` does not undo a pan.

Up to 0.4.0, `style` was the container's CSS and there was no prop for the
map's style. Move container CSS to `containerStyle`.

Children of `<Map>` are created once the map exists, so `useMap()` in a
child's body returns it.

## Markers and popups

```tsx
import { Map, Marker, Popup } from '@ts-maps/solid'

const TIMES_SQUARE: [number, number] = [40.758, -73.9855]

<Map center={TIMES_SQUARE} zoom={14} style={basemap} containerStyle={{ height: '480px' }}>
  <Marker
    position={TIMES_SQUARE}
    options={{ title: 'Times Square', draggable: true }}
    onDragEnd={e => console.log(e.target.getLatLng())}
  />
  <Popup position={TIMES_SQUARE} content="Times Square" options={{ offset: [0, -27] }} />
</Map>
```

`<Marker>` takes `position`, `options` (anything the core `Marker` takes:
`icon`, `title`, `draggable`, `opacity`, …), `onClick` and `onDragEnd`.
`draggable` and `title` are also props of their own, short for those options.
A new `position` moves it.

`<Popup>` takes `position`, `content`, an HTML string, and `options`. It opens
when it is created. A new `position` or `content` is followed. A popup is not
tied to a marker, so open one from a click:

```tsx
function Landmarks() {
  const [open, setOpen] = createSignal(false)
  return (
    <Map
      center={TIMES_SQUARE}
      zoom={14}
      style={basemap}
      containerStyle={{ height: '480px' }}
      onPopupClose={() => setOpen(false)}
    >
      <Marker position={TIMES_SQUARE} onClick={() => setOpen(true)} />
      <Show when={open()}>
        <Popup position={TIMES_SQUARE} content="<b>Times Square</b>" options={{ offset: [0, -27] }} />
      </Show>
    </Map>
  )
}
```

For your own pin, give the marker a `divIcon`:

```tsx
import { divIcon } from 'ts-maps'

const pin = divIcon({ html: '<span class="pin"></span>', iconSize: [24, 24], iconAnchor: [12, 24] })

<Marker position={TIMES_SQUARE} options={{ icon: pin }} />
```

`options` is read when the marker is made.

## Your own data

`<Source>` adds a style-spec source and `<Layer>` a layer that draws it. Give
the spec as one object, as in React and Vue, or its fields as props:

- `Source`: `id`, and `source`, the spec; or `type`, `url`, `tiles`,
  `tileSize`, `data`. `url` is a TileJSON.
- `Layer`: `layer`, the spec; or `id`, `type`, `source`, `sourceLayer`,
  `paint`, `layout`, `filter`. Either way, `before` is the id of a layer to
  put it under.

Both are read once. They can go straight inside `<Map>`: added while the
basemap is still loading, they are kept and put on it when it arrives.

```tsx
import { Layer, Map, Source } from '@ts-maps/solid'

const stations = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Times Sq-42 St' }, geometry: { type: 'Point', coordinates: [-73.9873, 40.7553] } },
    { type: 'Feature', properties: { name: 'Grand Central' }, geometry: { type: 'Point', coordinates: [-73.9772, 40.7527] } },
  ],
}

<Map center={[40.754, -73.982]} zoom={14} style={basemap} containerStyle={{ height: '480px' }}>
  <Source id="stations" source={{ type: 'geojson', data: stations }} />
  <Layer
    layer={{
      id: 'stations',
      type: 'circle',
      source: 'stations',
      paint: { 'circle-radius': 7, 'circle-color': '#e11d48' },
    }}
  />
</Map>
```

The same with fields:

```tsx
<Source id="stations" type="geojson" data={stations} />
<Layer id="stations" type="circle" source="stations" paint={{ 'circle-radius': 7, 'circle-color': '#e11d48' }} />
```

GeoJSON coordinates are `[lng, lat]`, as GeoJSON has them. To change a
source's data, call `map.setSourceData('stations', next)`.

`<TileLayer>` adds raster tiles. It takes `url`, `options`, and
`attribution`, `subdomains`, `tileSize`, `minZoom` and `maxZoom` as props. A
new `url` swaps the tiles; the rest are read once:

```tsx
import { TileLayer } from '@ts-maps/solid'
import { styles } from 'ts-maps'

<TileLayer
  url={styles.ESRI_WORLD_IMAGERY}
  options={{ attribution: styles.ESRI_WORLD_IMAGERY_ATTRIBUTION, opacity: 0.6 }}
/>
```

## Controls

```tsx
import { FullscreenControl, GeocoderControl, LocateControl, Map, ScaleControl } from '@ts-maps/solid'

<Map center={[40.758, -73.9855]} zoom={13} style={basemap} containerStyle={{ height: '480px' }}>
  <GeocoderControl placeholder="Search for a place" />
  <FullscreenControl position="topright" />
  <LocateControl position="topright" follow />
  <ScaleControl position="bottomleft" imperial={false} />
</Map>
```

Every control takes `position` and `options`, and its own options as plain
props, typed as in React:

| Component | Props |
|---|---|
| `ZoomControl` | `locale`, `zoomInTitle`, `zoomOutTitle` |
| `NavigationControl` | `locale`, `showZoom`, `showCompass`, `visualizePitch`, `resetDuration`, `compassTitle` |
| `GeocoderControl` | `provider`, `placeholder`, `limit`, `debounce`, `minLength`, `collapsed`, `flyTo`, `zoom`, `marker`, `proximity`, `language`, `countries` |
| `FullscreenControl` | `locale`, `container`, `title`, `titleCancel` |
| `LocateControl` | `locale`, `zoom`, `follow`, `showMarker`, `enableHighAccuracy`, `timeout`, `maximumAge` |
| `ScaleControl` | `metric`, `imperial`, `maxWidth` |
| `AttributionControl` | `prefix` |

A control is built again when any of its props changes. See
[Controls](../concepts/controls.md) for the options. The map has a zoom
control of its own; with `<NavigationControl>` you may want
`map.zoomControl.remove()`.

## Apple Maps-style components

These match the React components: the same props, events as `on` props
(`onSelect`, `onLevelChange`), and `onReady` with the core object. The props
and events are listed in
[Framework bindings](./framework-bindings.md#components). Every prop is
followed as it changes, so pass a signal's value and update it from the
event.

### Search and directions

```tsx
import type { TurnByTurn as Navigation } from 'ts-maps'
import { Map, Search, TurnByTurn } from '@ts-maps/solid'
import { createSignal } from 'solid-js'

export function Explore() {
  const [nav, setNav] = createSignal<Navigation>()
  const [chosen, setChosen] = createSignal('')
  return (
    <>
      <Map center={[37.7955, -122.3937]} zoom={15} style={basemap} containerStyle={{ height: '600px' }}>
        <TurnByTurn onReady={setNav} />
        <Search turnByTurn={nav()} onSelect={e => setChosen(e.place.name)} />
      </Map>
      <p>{chosen()}</p>
    </>
  )
}
```

To navigate without search, set `from`, `to` and `active`:

```tsx
const [driving, setDriving] = createSignal(false)

<TurnByTurn
  from={[37.7955, -122.3937]}
  to={[37.8029, -122.4484]}
  destinationName="Palace of Fine Arts"
  active={driving()}
  simulate
  onArrive={() => setDriving(false)}
  onEnd={() => setDriving(false)}
/>
```

`simulate` drives the route instead of following the device.

### Offline maps

```tsx
const [open, setOpen] = createSignal(false)

<OfflineMaps
  open={open()}
  onOpenChange={e => setOpen(e.open)}
  onComplete={e => console.log(`${e.region.name} is ready offline`)}
/>
```

### Map type

```tsx
import { MapType } from '@ts-maps/solid'
import { mapTypes } from 'ts-maps'

const types = mapTypes({ url: 'https://tiles.openfreemap.org/planet' })

function Picker() {
  const [type, setType] = createSignal('explore')
  return <MapType types={types} value={type()} onChange={e => setType(e.value)} />
}
```

### Indoor maps

```tsx
import type { SearchControl } from 'ts-maps'

const [search, setSearch] = createSignal<SearchControl>()
const [level, setLevel] = createSignal(0)

<Search onReady={setSearch} />
<IndoorMap venue="/imdf/terminal.zip" search={search()} level={level()} onLevelChange={e => setLevel(e.level)} />
```

`venue` is your own IMDF archive. The core
[indoor example](../examples/14-indoor.md) builds one in code.

### Look Around

```tsx
import type { LookAround as Viewer } from 'ts-maps'

const [look, setLook] = createSignal<Viewer>()

<LookAround onReady={setLook} />
<Search lookAround={look()} />
```

### Landmarks and trees

```tsx
<Map center={[37.7952, -122.4028]} zoom={17} pitch={60} style={basemap} containerStyle={{ height: '600px' }}>
  <Landmark model="/models/transamerica.glb" position={[37.7952, -122.4028]} rotation={45} />
  <Trees spacing={12} />
</Map>
```

`model` is a `.glb` or `.gltf` URL you host, its bytes, or a parsed glTF.

### Territories

```tsx
<TerritoryLayer store={store} self="me" />
<RunTrailLayer track={track()} showPotential />
```

## Map events

`<Map>` takes an `on` prop for each map event, the core name in PascalCase,
as in React: `onClick`, `onDblClick`, `onContextMenu`, `onMouseMove`,
`onMove`, `onMoveStart`, `onMoveEnd`, `onZoom`, `onZoomStart`, `onZoomEnd`,
`onDrag`, `onDragStart`, `onDragEnd`, `onResize`, `onPopupOpen`,
`onPopupClose`, `onLocationFound`, `onLocationError`, and the rest of the
core's mouse, layer and tooltip events.

```tsx
<Map
  center={[40.758, -73.9855]}
  zoom={13}
  style={basemap}
  containerStyle={{ height: '480px' }}
  onClick={e => console.log(e.latlng)}
  onMoveEnd={e => console.log(e.target.getCenter())}
/>
```

Three names differ from the pattern:

- `onLoad` is not the map's `load` event. It is called once with the `Map`,
  right after the map is built.
- `onLoadEvent` is the map's `load` event. A map that loaded while it was
  being built calls it once, just after the prop is bound.
- `onStyleLoad` is `style.load`, called each time a style is in place.
  `onStyleDataLoading` listens for `styledataloading`, which the map does not
  fire.

A handler is read when the event fires, so a new one takes over.

Inside the map, `useMapEvent` subscribes to any event, by its core name, and
unsubscribes on cleanup:

```tsx
import { useMap, useMapEvent } from '@ts-maps/solid'

function CameraLog() {
  const map = useMap()
  useMapEvent('moveend', () => console.log(map?.getCenter(), map?.getZoom()))
  useMapEvent('style.load', () => console.log('the style is in'))
  return null
}
```

## Reaching the map

`onLoad` hands the `Map` to the component that renders `<Map>`:

```tsx
import type { Map } from 'ts-maps'

export function App() {
  const [map, setMap] = createSignal<Map>()
  return (
    <>
      <Map center={[40.758, -73.9855]} zoom={13} style={basemap} containerStyle={{ height: '480px' }} onLoad={setMap} />
      <button onClick={() => map()?.flyTo([51.5072, -0.1276], 12)}>London</button>
    </>
  )
}
```

Inside the map, `useMap()` returns the `Map`, or `null` outside a `<Map>`.
Read in an effect, it is tracked. `useMapOptional()` is the same, named as in
React and Vue, where `useMap()` throws outside a map. Read it in the
component's body, not in `onCleanup`, where the context is gone.

`MapContext` is exported too. Its value is an accessor for the map.

## Server rendering

`<Map>` builds the map in `onMount`, so in SolidStart the server renders the
empty container and none of its children.

## Reference

| Component | Props |
|---|---|
| `Map` | `center`, `zoom`, `bearing`, `pitch`, `style`, `locale`, `containerStyle`, `class`, `onLoad`, and the event props |
| `Marker` | `position`, `options`, `draggable`, `title`, `onClick`, `onDragEnd` |
| `Popup` | `position`, `content`, `options` |
| `TileLayer` | `url`, `options`, `attribution`, `subdomains`, `tileSize`, `minZoom`, `maxZoom` |
| `Source` | `id`, `source`, or `type`, `url`, `tiles`, `tileSize`, `data` |
| `Layer` | `layer`, or `id`, `type`, `source`, `sourceLayer`, `paint`, `layout`, `filter`; and `before` |
| Controls | `position`, `options`, and the props in the table above |

Functions: `useMap`, `useMapOptional`, `useMapEvent`.
