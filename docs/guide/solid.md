# Solid

`@ts-maps/solid` wraps ts-maps in Solid components. `<Map>` builds a `TsMap`
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

Solid's `<Map>` has no prop for the map's style: its `style` is the
container's CSS. Set the map's style from a child component, which can reach
the map:

```tsx
import { Map, useMap } from '@ts-maps/solid'
import { styles } from 'ts-maps'
import '@ts-maps/solid/styles.css'

function Basemap() {
  useMap()?.setStyle(styles.light({ url: 'https://tiles.openfreemap.org/planet' }))
  return null
}

export function App() {
  return (
    <Map center={[40.758, -73.9855]} zoom={13} style={{ height: '480px' }}>
      <Basemap />
    </Map>
  )
}
```

That draws [OpenFreeMap](https://openfreemap.org)'s planet, free and keyless.
The examples below reuse `Basemap`.

- `center` is `[lat, lng]`.
- `style` and `class` go on the container `<div>`. Give it a height.
- `center`, `zoom`, `bearing` and `pitch` are read when the map is built.
  Move the camera later with `map.setView()` or `map.flyTo()`. `locale` is
  followed.

Children of `<Map>` are created once the map exists, so `useMap()` in a
child's body returns it.

## Markers and popups

```tsx
import { Map, Marker, Popup } from '@ts-maps/solid'

const TIMES_SQUARE: [number, number] = [40.758, -73.9855]

<Map center={TIMES_SQUARE} zoom={14} style={{ height: '480px' }}>
  <Basemap />
  <Marker position={TIMES_SQUARE} title="Times Square" draggable />
  <Popup position={TIMES_SQUARE} content="Times Square" />
</Map>
```

`<Marker>` takes `position`, `draggable` and `title`. `<Popup>` takes
`position` and `content`, an HTML string, and opens when it is created. Both
are read once: a new `position` does not move them. Solid's marker has no
events and no custom icon, and a popup is not tied to a marker. For those,
use the core `Marker` from a child component:

```tsx
import { onCleanup } from 'solid-js'
import { divIcon, marker } from 'ts-maps'

function Pin(props: { position: [number, number], label: string }) {
  const map = useMap()
  const pin = marker(props.position, { icon: divIcon({ html: '<span class="pin"></span>', iconSize: [24, 24], iconAnchor: [12, 24] }) })
    .bindPopup(props.label)
  if (map)
    pin.addTo(map)
  onCleanup(() => pin.remove())
  return null
}
```

## Your own data

`<Source>` adds a style-spec source and `<Layer>` a layer that draws it.
Their props are the spec's fields:

- `Source`: `id`, `type`, `tiles`, `tileSize`, `data`.
- `Layer`: `id`, `type`, `source`, `sourceLayer`, `paint`, `layout`,
  `filter`.

Both are read once.

They can go straight inside `<Map>`, after `<Basemap />`: added while the
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

<Map center={[40.754, -73.982]} zoom={14} style={{ height: '480px' }}>
  <Basemap />
  <Source id="stations" type="geojson" data={stations} />
  <Layer id="stations" type="circle" source="stations" paint={{ 'circle-radius': 7, 'circle-color': '#e11d48' }} />
</Map>
```

GeoJSON coordinates are `[lng, lat]`, as GeoJSON has them. To change a
source's data, call `map.setSourceData('stations', next)`.

`<TileLayer>` adds raster tiles. It takes `url`, `attribution`, `subdomains`,
`tileSize`, `minZoom` and `maxZoom`, read once:

```tsx
import { TileLayer } from '@ts-maps/solid'
import { styles } from 'ts-maps'

<TileLayer url={styles.ESRI_WORLD_IMAGERY} attribution={styles.ESRI_WORLD_IMAGERY_ATTRIBUTION} />
```

## Controls

```tsx
import { FullscreenControl, GeocoderControl, LocateControl, Map, ScaleControl } from '@ts-maps/solid'

<Map center={[40.758, -73.9855]} zoom={13} style={{ height: '480px' }}>
  <Basemap />
  <GeocoderControl placeholder="Search for a place" />
  <FullscreenControl position="topright" />
  <LocateControl position="topright" follow />
  <ScaleControl position="bottomleft" options={{ imperial: false }} />
</Map>
```

A control takes `position`, `options`, and its own options as plain props:

| Component | Typed props |
|---|---|
| `ZoomControl`, `FullscreenControl` | `locale` |
| `NavigationControl` | `locale`, `showZoom`, `showCompass`, `visualizePitch`, `resetDuration` |
| `GeocoderControl` | `placeholder`, `limit`, `debounce`, `minLength`, `collapsed`, `flyTo`, `zoom`, `marker`, `proximity` |
| `LocateControl` | `locale`, `zoom`, `follow`, `showMarker` |
| `ScaleControl`, `AttributionControl` | none; use `options` |

Anything else the control accepts goes in `options`. A control is built again
when any of its props changes. See [Controls](../concepts/controls.md) for
the options. The map has a zoom control of its own; with
`<NavigationControl>` you may want `map.zoomControl.remove()`.

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
      <Map center={[37.7955, -122.3937]} zoom={15} style={{ height: '600px' }}>
        <Basemap />
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
<Map center={[37.7952, -122.4028]} zoom={17} pitch={60} style={{ height: '600px' }}>
  <Basemap />
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

`<Map>` has no event props. Subscribe from a child with `useMapEvent`, which
takes the core event name and unsubscribes on cleanup:

```tsx
import { useMap, useMapEvent } from '@ts-maps/solid'

function CameraLog() {
  const map = useMap()
  useMapEvent('moveend', () => console.log(map?.getCenter(), map?.getZoom()))
  useMapEvent('click', e => console.log(e.latlng))
  return null
}
```

## Reaching the map

`useMap()` returns the `TsMap`, or `null` outside a `<Map>`. Read in an effect,
it is tracked. The map lives on the context, so only a child of `<Map>` can
read it. To hand it to the page, pass it up:

```tsx
import type { TsMap } from 'ts-maps'

function MapHandle(props: { onMap: (map: TsMap) => void }) {
  const map = useMap()
  if (map)
    props.onMap(map)
  return null
}

export function App() {
  const [map, setMap] = createSignal<TsMap>()
  return (
    <>
      <Map center={[40.758, -73.9855]} zoom={13} style={{ height: '480px' }}>
        <Basemap />
        <MapHandle onMap={setMap} />
      </Map>
      <button onClick={() => map()?.flyTo([51.5072, -0.1276], 12)}>London</button>
    </>
  )
}
```

`MapContext` is exported too. Its value is an accessor for the map.

## Server rendering

`<Map>` builds the map in `onMount`, so in SolidStart the server renders the
empty container and none of its children.

## Reference

| Component | Props |
|---|---|
| `Map` | `center`, `zoom`, `bearing`, `pitch`, `locale`, `style`, `class` |
| `Marker` | `position`, `draggable`, `title` |
| `Popup` | `position`, `content` |
| `TileLayer` | `url`, `attribution`, `subdomains`, `tileSize`, `minZoom`, `maxZoom` |
| `Source` | `id`, `type`, `tiles`, `tileSize`, `data` |
| `Layer` | `id`, `type`, `source`, `sourceLayer`, `paint`, `layout`, `filter` |

Functions: `useMap`, `useMapEvent`.
