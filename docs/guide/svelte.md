# Svelte

`@ts-maps/svelte` wraps ts-maps in Svelte components. `<Map>` builds a `TsMap`
in `onMount` and gives it to its children through context; every other
component adds one thing to that map and removes it when it is destroyed.
For what the bindings share, see [Framework bindings](./framework-bindings.md).

The package ships its Svelte source, and your Svelte build compiles it. The
components are written in Svelte 4 syntax (`export let`, slots), which Svelte
5 also runs; the tests run on Svelte 5.

## Install

::: code-group

```sh [bun]
bun add @ts-maps/svelte
```

```sh [npm]
npm install @ts-maps/svelte
```

```sh [pnpm]
pnpm add @ts-maps/svelte
```

:::

`svelte` is a peer dependency. `ts-maps` comes with the package. Import the
stylesheet once:

```ts
import '@ts-maps/svelte/styles.css'
```

## A first map

```svelte
<script lang="ts">
  import { Map } from '@ts-maps/svelte'
  import { styles } from 'ts-maps'
  import '@ts-maps/svelte/styles.css'

  const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })
</script>

<div style="height: 480px">
  <Map center={[40.758, -73.9855]} zoom={13} style={basemap} />
</div>
```

That draws [OpenFreeMap](https://openfreemap.org)'s planet, free and keyless.
The examples below reuse `basemap`.

- `center` is `[lat, lng]`.
- `style` is the map's style: a style object, or the URL of one. A new one is
  set with `map.setStyle()`.
- The map's container fills its parent, so give the parent a height.
  `containerStyle` adds CSS to the container, and `class` a class.

`center`, `zoom`, `bearing`, `pitch` and `locale` are followed as they change.
A prop is passed on when its value changes: a parent that updates with the
same `center` does not undo a pan.

Children of `<Map>` are created once the map exists, so `useMap()` in a
child's script returns it.

## Markers and popups

```svelte
<script lang="ts">
  import { Map, Marker, Popup } from '@ts-maps/svelte'

  let timesSquare: [number, number] = [40.758, -73.9855]
</script>

<div style="height: 480px">
  <Map center={timesSquare} zoom={14} style={basemap}>
    <Marker
      bind:position={timesSquare}
      draggable
      title="Times Square"
      onDragEnd={e => console.log(e.target.getLatLng())}
    />
    <Popup position={timesSquare} content="Times Square" options={{ offset: [0, -27] }} />
  </Map>
</div>
```

`<Marker>` takes `position`, `options` (anything the core `Marker` takes:
`icon`, `title`, `draggable`, `opacity`, …), `onClick` and `onDragEnd`.
`draggable` and `title` are short for those options. A new `position` moves
the marker, and with `bind:position` a drag writes the new place back.

`<Popup>` takes `position`, `content`, an HTML string, and `options`. It opens
when it is created. A new `position` or `content` is followed. A popup is not
tied to a marker, so open one from a click:

```svelte
<script lang="ts">
  let open = false
</script>

<Map center={timesSquare} zoom={14} style={basemap} onPopupClose={() => (open = false)}>
  <Marker position={timesSquare} onClick={() => (open = true)} />
  {#if open}
    <Popup position={timesSquare} content="<b>Times Square</b>" options={{ offset: [0, -27] }} />
  {/if}
</Map>
```

For your own pin, give the marker a `divIcon`:

```svelte
<script lang="ts">
  import { divIcon } from 'ts-maps'

  const pin = divIcon({ html: '<span class="pin"></span>', iconSize: [24, 24], iconAnchor: [12, 24] })
</script>

<Marker position={timesSquare} options={{ icon: pin }} />
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

```svelte
<script lang="ts">
  import { Layer, Map, Source } from '@ts-maps/svelte'

  const stations = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'Times Sq-42 St' }, geometry: { type: 'Point', coordinates: [-73.9873, 40.7553] } },
      { type: 'Feature', properties: { name: 'Grand Central' }, geometry: { type: 'Point', coordinates: [-73.9772, 40.7527] } },
    ],
  }
</script>

<div style="height: 480px">
  <Map center={[40.754, -73.982]} zoom={14} style={basemap}>
    <Source id="stations" source={{ type: 'geojson', data: stations }} />
    <Layer layer={{ id: 'stations', type: 'circle', source: 'stations', paint: { 'circle-radius': 7, 'circle-color': '#e11d48' } }} />
  </Map>
</div>
```

The same with fields:

```svelte
<Source id="stations" type="geojson" data={stations} />
<Layer id="stations" type="circle" source="stations" paint={{ 'circle-radius': 7, 'circle-color': '#e11d48' }} />
```

GeoJSON coordinates are `[lng, lat]`, as GeoJSON has them. To change a
source's data, call `map.setSourceData('stations', next)`.

`<TileLayer>` adds raster tiles. It takes `url`, `options`, and
`attribution`, `subdomains`, `tileSize`, `minZoom` and `maxZoom` as props. A
new `url` swaps the tiles; the rest are read once:

```svelte
<script lang="ts">
  import { TileLayer } from '@ts-maps/svelte'
  import { styles } from 'ts-maps'
</script>

<TileLayer url={styles.ESRI_WORLD_IMAGERY} options={{ attribution: styles.ESRI_WORLD_IMAGERY_ATTRIBUTION, opacity: 0.6 }} />
```

## Controls

```svelte
<script lang="ts">
  import { FullscreenControl, GeocoderControl, LocateControl, Map, ScaleControl } from '@ts-maps/svelte'
</script>

<div style="height: 480px">
  <Map center={[40.758, -73.9855]} zoom={13} style={basemap}>
    <GeocoderControl placeholder="Search for a place" />
    <FullscreenControl position="topright" />
    <LocateControl position="topright" follow />
    <ScaleControl position="bottomleft" imperial={false} />
  </Map>
</div>
```

A control takes `position`, `options`, and its own options as plain props,
the same ones as in React: `showCompass`, `placeholder`, `imperial` and so
on. `ZoomControl`, `NavigationControl`, `FullscreenControl` and
`LocateControl` also take `locale`. A control is built again when `position`
or `locale` changes; the other props are read once.
`<MapControl type="scale" />` builds any of them by name. See
[Controls](../concepts/controls.md) for the options. The map has a zoom
control of its own; with `<NavigationControl>` you may want
`map.zoomControl.remove()`.

## Apple Maps-style components

These match the React and Solid components: the same props, events as
callback props (`onSelect`, `onLevelChange`), and `onReady` with the core
object. The props and events are listed in
[Framework bindings](./framework-bindings.md#components). State the component
can change itself is bindable:

| Component | `bind:` |
|---|---|
| `OfflineMaps` | `open`, `onlyOffline` |
| `MapType` | `value`, `open`, `showTraffic` |
| `IndoorMap` | `level` |
| `LookAround` | `choosing` |

### Search and directions

```svelte
<script lang="ts">
  import type { TurnByTurn as Navigation } from 'ts-maps'
  import { Map, Search, TurnByTurn } from '@ts-maps/svelte'

  let nav: Navigation | undefined
  let chosen = ''
</script>

<div style="height: 600px">
  <Map center={[37.7955, -122.3937]} zoom={15} style={basemap}>
    <TurnByTurn onReady={n => (nav = n)} />
    <Search turnByTurn={nav} onSelect={e => (chosen = e.place.name)} />
  </Map>
</div>
<p>{chosen}</p>
```

To navigate without search, set `from`, `to` and `active`:

```svelte
<script lang="ts">
  let driving = false
</script>

<TurnByTurn
  from={[37.7955, -122.3937]}
  to={[37.8029, -122.4484]}
  destinationName="Palace of Fine Arts"
  active={driving}
  simulate
  onArrive={() => (driving = false)}
  onEnd={() => (driving = false)}
/>
```

`simulate` drives the route instead of following the device.

### Offline maps

```svelte
<script lang="ts">
  import { OfflineMaps } from '@ts-maps/svelte'

  let showOffline = false
</script>

<OfflineMaps bind:open={showOffline} onComplete={e => console.log(`${e.region.name} is ready offline`)} />
```

### Map type

```svelte
<script lang="ts">
  import { MapType } from '@ts-maps/svelte'
  import { mapTypes } from 'ts-maps'

  const types = mapTypes({ url: 'https://tiles.openfreemap.org/planet' })
  let type = 'explore'
</script>

<MapType {types} bind:value={type} />
```

### Indoor maps

```svelte
<script lang="ts">
  import type { SearchControl } from 'ts-maps'

  let search: SearchControl | undefined
  let level = 0
</script>

<Search onReady={s => (search = s)} />
<IndoorMap venue="/imdf/terminal.zip" {search} bind:level />
```

`venue` is your own IMDF archive. The core
[indoor example](../examples/14-indoor.md) builds one in code.

### Look Around

```svelte
<script lang="ts">
  import type { LookAround as Viewer } from 'ts-maps'

  let look: Viewer | undefined
</script>

<LookAround onReady={l => (look = l)} />
<Search lookAround={look} />
```

### Landmarks and trees

```svelte
<Map center={[37.7952, -122.4028]} zoom={17} pitch={60} style={basemap}>
  <Landmark model="/models/transamerica.glb" position={[37.7952, -122.4028]} rotation={45} />
  <Trees spacing={12} />
</Map>
```

`model` is a `.glb` or `.gltf` URL you host, its bytes, or a parsed glTF.

### Territories

```svelte
<TerritoryLayer {store} self="me" />
<RunTrailLayer {track} showPotential />
```

## Map events

`<Map>` takes an `on` prop for each map event, the core name in PascalCase,
as in React: `onClick`, `onDblClick`, `onContextMenu`, `onMouseMove`,
`onMove`, `onMoveStart`, `onMoveEnd`, `onZoom`, `onZoomStart`, `onZoomEnd`,
`onDrag`, `onDragStart`, `onDragEnd`, `onResize`, `onPopupOpen`,
`onPopupClose`, `onLocationFound`, `onLocationError`, and the rest of the
core's mouse, layer and tooltip events.

```svelte
<Map
  center={[40.758, -73.9855]}
  zoom={13}
  style={basemap}
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

A handler is read when the event fires, so a new one takes over.

Inside the map, `useMapEvent` subscribes to any event, by its core name, and
unsubscribes when the component is destroyed. Call it in the component's
script, not in `onMount`:

```svelte
<!-- CameraLog.svelte -->
<script lang="ts">
  import { useMap, useMapEvent } from '@ts-maps/svelte'

  const map = useMap()
  useMapEvent('moveend', () => console.log(map?.getCenter(), map?.getZoom()))
  useMapEvent('style.load', () => console.log('the style is in'))
</script>
```

## Reaching the map

`onLoad` hands the `TsMap` to the component that renders `<Map>`:

```svelte
<script lang="ts">
  import type { TsMap } from 'ts-maps'
  import { Map } from '@ts-maps/svelte'

  let map: TsMap | undefined
</script>

<div style="height: 480px">
  <Map center={[40.758, -73.9855]} zoom={13} style={basemap} onLoad={m => (map = m)} />
</div>
<button on:click={() => map?.flyTo([51.5072, -0.1276], 12)}>London</button>
```

Inside the map, `useMap()` returns the `TsMap`, or `null` outside a `<Map>`.
`useMapOptional()` is the same, named as in React and Vue, where `useMap()`
throws outside a map. Call either in a component's script: they read Svelte's
context, which is not there in `onMount` or `onDestroy`.

`MAP_CONTEXT_KEY` is the context key, if you need the context itself.

## Server rendering

`<Map>` builds the map in `onMount`, so in SvelteKit the server renders the
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
| Controls | `position`, `options`, the control's own options, and `locale` on zoom, navigation, fullscreen and locate |
| `MapControl` | `type`, `position`, `options`, `locale`, the control's own options |

Functions: `useMap`, `useMapOptional`, `useMapEvent`.
