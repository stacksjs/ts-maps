# React

`@ts-maps/react` wraps ts-maps in React components. `<Map>` builds a `TsMap`
when it mounts and gives it to its children through context; every other
component adds one thing to that map and removes it when it unmounts. For
what the bindings share, see [Framework bindings](./framework-bindings.md).

## Install

::: code-group

```sh [bun]
bun add @ts-maps/react
```

```sh [npm]
npm install @ts-maps/react
```

```sh [pnpm]
pnpm add @ts-maps/react
```

:::

`react` and `react-dom` 18 or later are peer dependencies. `ts-maps` comes
with the package. Import the stylesheet once:

```ts
import '@ts-maps/react/styles.css'
```

## A first map

```tsx
import { Map } from '@ts-maps/react'
import { styles } from 'ts-maps'
import '@ts-maps/react/styles.css'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })

export function App() {
  return (
    <Map
      center={[40.758, -73.9855]}
      zoom={13}
      style={basemap}
      containerStyle={{ height: 480 }}
    />
  )
}
```

That draws [OpenFreeMap](https://openfreemap.org)'s planet, free and keyless.
The examples below reuse `basemap`.

- `center` is `[lat, lng]`.
- `style` is the map's style: a style object, or the URL of one. It is read
  when the map is built. To change it later, call `map.setStyle()`.
- `containerStyle` and `className` go on the container `<div>`. Give it a
  height; a map in a container with no height draws nothing.

`center`, `zoom`, `bearing` and `pitch` are followed as they change. When
`center` or `zoom` changes, the map calls `setView(center, zoom)`. An array
written inline is a new array on every render, so a parent that re-renders
moves the camera back to it. Keep `center` in a constant or in state.

## Markers and popups

```tsx
import { Map, Marker, Popup } from '@ts-maps/react'

const TIMES_SQUARE: [number, number] = [40.758, -73.9855]

<Map center={TIMES_SQUARE} zoom={14} style={basemap} containerStyle={{ height: 480 }}>
  <Marker
    position={TIMES_SQUARE}
    options={{ title: 'Times Square', draggable: true }}
    onDragEnd={e => console.log(e.target.getLatLng())}
  />
  <Popup position={TIMES_SQUARE} options={{ offset: [0, -27] }}>
    Times Square
  </Popup>
</Map>
```

`<Marker>` takes `position`, `options` (anything the core `Marker` takes:
`icon`, `title`, `draggable`, `opacity`, …), `onClick` and `onDragEnd`. A new
`position` moves it.

`<Popup>` opens at `position` when it mounts and closes when it unmounts. Its
content is `content`, an HTML string, or plain text children. JSX children
are not rendered. A popup is not tied to a marker, so open one from a click:

```tsx
function Landmarks() {
  const [open, setOpen] = useState(false)
  return (
    <Map
      center={TIMES_SQUARE}
      zoom={14}
      style={basemap}
      containerStyle={{ height: 480 }}
      onPopupClose={() => setOpen(false)}
    >
      <Marker position={TIMES_SQUARE} onClick={() => setOpen(true)} />
      {open && <Popup position={TIMES_SQUARE} options={{ offset: [0, -27] }} content="<b>Times Square</b>" />}
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

Keep `pin` outside the component. `options` is read when the marker is made.

## Your own data

`<Source>` adds a style-spec source and `<Layer>` a layer that draws it. Both
are read when they mount. They can go straight inside `<Map>`: added while the
basemap is still loading, they are kept and put on it when it arrives.

```tsx
import { Layer, Map, Source } from '@ts-maps/react'

const stations = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Times Sq-42 St' }, geometry: { type: 'Point', coordinates: [-73.9873, 40.7553] } },
    { type: 'Feature', properties: { name: 'Grand Central' }, geometry: { type: 'Point', coordinates: [-73.9772, 40.7527] } },
  ],
}

<Map center={[40.754, -73.982]} zoom={14} style={basemap} containerStyle={{ height: 480 }}>
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

GeoJSON coordinates are `[lng, lat]`, as GeoJSON has them. `<Layer>` takes
`before`, the id of a layer to insert it under. To change a source's data,
call `map.setSourceData('stations', next)`.

`<TileLayer>` adds raster tiles over or instead of the basemap:

```tsx
import { TileLayer } from '@ts-maps/react'
import { styles } from 'ts-maps'

<TileLayer
  url={styles.ESRI_WORLD_IMAGERY}
  options={{ attribution: styles.ESRI_WORLD_IMAGERY_ATTRIBUTION, opacity: 0.6 }}
/>
```

A new `url` swaps the tiles; `options` is read once.

## Controls

```tsx
import { FullscreenControl, GeocoderControl, LocateControl, Map, ScaleControl } from '@ts-maps/react'

<Map center={[40.758, -73.9855]} zoom={13} style={basemap} containerStyle={{ height: 480 }}>
  <GeocoderControl placeholder="Search for a place" />
  <FullscreenControl position="topright" />
  <LocateControl position="topright" follow />
  <ScaleControl position="bottomleft" imperial={false} />
</Map>
```

Every control takes `position` and `options`, and its own options as plain
props:

| Component | Props |
|---|---|
| `ZoomControl` | `locale`, `zoomInTitle`, `zoomOutTitle` |
| `NavigationControl` | `locale`, `showZoom`, `showCompass`, `visualizePitch`, `resetDuration`, `compassTitle` |
| `GeocoderControl` | `provider`, `placeholder`, `limit`, `debounce`, `minLength`, `collapsed`, `flyTo`, `zoom`, `marker`, `proximity`, `language`, `countries` |
| `FullscreenControl` | `locale`, `container`, `title`, `titleCancel` |
| `LocateControl` | `locale`, `zoom`, `follow`, `showMarker`, `enableHighAccuracy`, `timeout`, `maximumAge` |
| `ScaleControl` | `metric`, `imperial`, `maxWidth` |
| `AttributionControl` | `prefix` |

A control is built when it mounts, and built again when `position` or
`locale` changes. Other props are read once. The map has a zoom control of
its own; with `<NavigationControl>` you may want `map.zoomControl.remove()`.
See [Controls](../concepts/controls.md) for what each one does.

## Apple Maps-style components

Each takes the props and fires the events listed in
[Framework bindings](./framework-bindings.md#components). Events are `on`
props, and `onReady` hands over the core object.

### Search and directions

```tsx
import type { TurnByTurn as Navigation } from 'ts-maps'
import { Map, Search, TurnByTurn } from '@ts-maps/react'
import { useState } from 'react'

export function Explore() {
  const [nav, setNav] = useState<Navigation>()
  const [chosen, setChosen] = useState('')
  return (
    <>
      <Map center={[37.7955, -122.3937]} zoom={15} style={basemap} containerStyle={{ height: 600 }}>
        <TurnByTurn onReady={setNav} />
        <Search turnByTurn={nav} onSelect={e => setChosen(e.place.name)} />
      </Map>
      <p>{chosen}</p>
    </>
  )
}
```

`turnByTurn` arrives after the first render, from `onReady`, and `<Search>`
follows it. Directions on a place's card then previews the route.

To navigate without search, set `from`, `to` and `active`:

```tsx
const [driving, setDriving] = useState(false)

<Map center={[37.7993, -122.4219]} zoom={13} style={basemap} containerStyle={{ height: 600 }}>
  <TurnByTurn
    from={[37.7955, -122.3937]}
    to={[37.8029, -122.4484]}
    destinationName="Palace of Fine Arts"
    active={driving}
    simulate
    onArrive={() => setDriving(false)}
    onEnd={() => setDriving(false)}
  />
</Map>
<button onClick={() => setDriving(true)}>Go</button>
```

`simulate` drives the route instead of following the device, which is how to
try it at a desk.

### Offline maps

```tsx
const [open, setOpen] = useState(false)

<OfflineMaps
  open={open}
  onOpenChange={e => setOpen(e.open)}
  onComplete={e => console.log(`${e.region.name} is ready offline`)}
/>
```

### Map type

```tsx
import { MapType } from '@ts-maps/react'
import { mapTypes } from 'ts-maps'

const types = mapTypes({ url: 'https://tiles.openfreemap.org/planet' })

function Picker() {
  const [type, setType] = useState('explore')
  return <MapType types={types} value={type} onChange={e => setType(e.value)} />
}
```

Keep `types` outside the component, or in `useMemo`: a new array redraws the
card.

### Indoor maps

```tsx
import type { SearchControl } from 'ts-maps'

const [search, setSearch] = useState<SearchControl>()
const [level, setLevel] = useState(0)

<Map center={[37.6155, -122.3866]} zoom={18} style={basemap} containerStyle={{ height: 600 }}>
  <Search onReady={setSearch} />
  <IndoorMap venue="/imdf/terminal.zip" search={search} level={level} onLevelChange={e => setLevel(e.level)} />
</Map>
```

`venue` is your own IMDF archive. The core
[indoor example](../examples/14-indoor.md) builds one in code.

### Look Around

```tsx
import type { LookAround as Viewer } from 'ts-maps'

const [look, setLook] = useState<Viewer>()

<Map center={[48.8606, 2.3376]} zoom={16} style={basemap} containerStyle={{ height: 600 }}>
  <LookAround onReady={setLook} />
  <Search lookAround={look} />
</Map>
```

### Landmarks and trees

```tsx
<Map center={[37.7952, -122.4028]} zoom={17} pitch={60} style={basemap} containerStyle={{ height: 600 }}>
  <Landmark model="/models/transamerica.glb" position={[37.7952, -122.4028]} rotation={45} />
  <Trees spacing={12} />
</Map>
```

`model` is a `.glb` or `.gltf` URL you host, its bytes, or a parsed glTF.

### Territories

```tsx
<TerritoryLayer store={store} self="me" />
<RunTrailLayer track={track} showPotential />
```

## Map events

`<Map>` takes an `on` prop for each map event, the core name in PascalCase:
`onClick`, `onDblClick`, `onContextMenu`, `onMouseMove`, `onMove`,
`onMoveStart`, `onMoveEnd`, `onZoom`, `onZoomStart`, `onZoomEnd`, `onDrag`,
`onDragStart`, `onDragEnd`, `onResize`, `onPopupOpen`, `onPopupClose`,
`onLocationFound`, `onLocationError`, and the rest of the core's mouse, layer
and tooltip events.

```tsx
<Map
  center={[40.758, -73.9855]}
  zoom={13}
  style={basemap}
  containerStyle={{ height: 480 }}
  onClick={e => console.log(e.latlng)}
  onMoveEnd={e => console.log(e.target.getCenter())}
/>
```

Three names differ from the pattern:

- `onLoad` is not the map's `load` event. It is called once with the `TsMap`,
  right after the map is built.
- `onLoadEvent` is the map's `load` event. A map that loaded while it was
  being built calls it once, just after the prop is bound.
- `onStyleLoad` is `style.load`, called each time a style is in place.
  `onStyleDataLoading` listens for `styledataloading`, which the map does not
  fire.

Inside the map, `useMapEvent` subscribes to any event, by its core name, for
the life of the component:

```tsx
import { useMap, useMapEvent } from '@ts-maps/react'

function CameraLog() {
  const map = useMap()
  useMapEvent('moveend', () => console.log(map.getCenter(), map.getZoom()))
  useMapEvent('style.load', () => console.log('the style is in'))
  return null
}

<Map center={[40.758, -73.9855]} zoom={13} style={basemap} containerStyle={{ height: 480 }}>
  <CameraLog />
</Map>
```

A new handler on each render is bound again, which is cheap; wrap it in
`useCallback` if it matters.

## Reaching the map

`onLoad` hands the `TsMap` to the component that renders `<Map>`:

```tsx
import type { TsMap } from 'ts-maps'

export function App() {
  const [map, setMap] = useState<TsMap>()
  return (
    <>
      <Map center={[40.758, -73.9855]} zoom={13} style={basemap} containerStyle={{ height: 480 }} onLoad={setMap} />
      <button onClick={() => map?.flyTo([51.5072, -0.1276], 12)}>London</button>
    </>
  )
}
```

Inside the map, `useMap()` returns it. It throws outside a `<Map>`;
`useMapOptional()` returns `null` there instead. `MapContext` is exported for
the rare case that needs the context itself.

## Server rendering

`<Map>` builds the map in an effect, so on the server it renders the empty
container and none of its children. In the Next.js App Router, a file that
renders `<Map>` needs `'use client'`.

## Reference

| Component | Props |
|---|---|
| `Map` | `center`, `zoom`, `bearing`, `pitch`, `style`, `locale`, `containerStyle`, `className`, `onLoad`, event props |
| `Marker` | `position`, `options`, `onClick`, `onDragEnd` |
| `Popup` | `position`, `content`, `options`, text children |
| `TileLayer` | `url`, `options` |
| `Source` | `id`, `source` |
| `Layer` | `layer`, `before` |

Hooks: `useMap`, `useMapOptional`, `useMapEvent`. Each component's props type
is exported as `<Name>Props`, such as `MapProps` and `SearchProps`.
