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

Svelte's `<Map>` has no `style` prop. Set the style from a child component,
which can reach the map:

```svelte
<!-- Basemap.svelte -->
<script lang="ts">
  import { useMap } from '@ts-maps/svelte'
  import { styles } from 'ts-maps'

  useMap()?.setStyle(styles.light({ url: 'https://tiles.openfreemap.org/planet' }))
</script>
```

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { Map } from '@ts-maps/svelte'
  import Basemap from './Basemap.svelte'
  import '@ts-maps/svelte/styles.css'
</script>

<div style="height: 480px">
  <Map center={[40.758, -73.9855]} zoom={13}>
    <Basemap />
  </Map>
</div>
```

That draws [OpenFreeMap](https://openfreemap.org)'s planet, free and keyless.

- `center` is `[lat, lng]`.
- The map's container fills its parent, so give the parent a height. `<Map>`
  takes no class or style of its own.
- `center`, `zoom`, `bearing` and `pitch` are read when the map is built.
  Move the camera later with `map.setView()` or `map.flyTo()`. `locale` is
  followed.

Children of `<Map>` are created once the map exists, so `useMap()` in a
child's script returns it.

## Markers and popups

```svelte
<script lang="ts">
  import { Map, Marker, Popup } from '@ts-maps/svelte'
  import Basemap from './Basemap.svelte'

  const timesSquare: [number, number] = [40.758, -73.9855]
</script>

<div style="height: 480px">
  <Map center={timesSquare} zoom={14}>
    <Basemap />
    <Marker position={timesSquare} title="Times Square" draggable />
    <Popup position={timesSquare} content="Times Square" />
  </Map>
</div>
```

`<Marker>` takes `position`, `draggable` and `title`. `<Popup>` takes
`position` and `content`, an HTML string, and opens when it is created. Both
are read once: a new `position` does not move them. Svelte's marker has no
events and no custom icon, and a popup is not tied to a marker. For those,
use the core `Marker` from a child component:

```svelte
<!-- Pin.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { useMap } from '@ts-maps/svelte'
  import { divIcon, marker } from 'ts-maps'

  export let position: [number, number]
  export let label: string

  const map = useMap()
  const pin = marker(position, { icon: divIcon({ html: '<span class="pin"></span>', iconSize: [24, 24], iconAnchor: [12, 24] }) })
    .bindPopup(label)
  if (map)
    pin.addTo(map)
  onDestroy(() => pin.remove())
</script>
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

```svelte
<script lang="ts">
  import { Layer, Map, Source } from '@ts-maps/svelte'
  import Basemap from './Basemap.svelte'

  const stations = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'Times Sq-42 St' }, geometry: { type: 'Point', coordinates: [-73.9873, 40.7553] } },
      { type: 'Feature', properties: { name: 'Grand Central' }, geometry: { type: 'Point', coordinates: [-73.9772, 40.7527] } },
    ],
  }
</script>

<div style="height: 480px">
  <Map center={[40.754, -73.982]} zoom={14}>
    <Basemap />
    <Source id="stations" type="geojson" data={stations} />
    <Layer id="stations" type="circle" source="stations" paint={{ 'circle-radius': 7, 'circle-color': '#e11d48' }} />
  </Map>
</div>
```

GeoJSON coordinates are `[lng, lat]`, as GeoJSON has them. To change a
source's data, call `map.setSourceData('stations', next)`.

`<TileLayer>` adds raster tiles. It takes `url`, `attribution`, `subdomains`,
`tileSize`, `minZoom` and `maxZoom`, read once:

```svelte
<script lang="ts">
  import { TileLayer } from '@ts-maps/svelte'
  import { styles } from 'ts-maps'
</script>

<TileLayer url={styles.ESRI_WORLD_IMAGERY} attribution={styles.ESRI_WORLD_IMAGERY_ATTRIBUTION} />
```

## Controls

```svelte
<script lang="ts">
  import { FullscreenControl, GeocoderControl, LocateControl, Map, ScaleControl } from '@ts-maps/svelte'
  import Basemap from './Basemap.svelte'
</script>

<div style="height: 480px">
  <Map center={[40.758, -73.9855]} zoom={13}>
    <Basemap />
    <GeocoderControl options={{ placeholder: 'Search for a place' }} />
    <FullscreenControl position="topright" />
    <LocateControl position="topright" options={{ follow: true }} />
    <ScaleControl position="bottomleft" options={{ imperial: false }} />
  </Map>
</div>
```

A control takes `position` and `options`; its own options, such as
`showCompass` or `placeholder`, go in `options`. `ZoomControl`,
`NavigationControl`, `FullscreenControl` and `LocateControl` also take
`locale`. The control is built again when `locale` changes; `position` and
`options` are read once. `<MapControl type="scale" />` builds any of them by
name. See [Controls](../concepts/controls.md) for the options. The map has a
zoom control of its own; with `<NavigationControl>` you may want
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
  import Basemap from './Basemap.svelte'

  let nav: Navigation | undefined
  let chosen = ''
</script>

<div style="height: 600px">
  <Map center={[37.7955, -122.3937]} zoom={15}>
    <Basemap />
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
<Map center={[37.7952, -122.4028]} zoom={17} pitch={60}>
  <Basemap />
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

`<Map>` has no event props. Subscribe from a child with `useMapEvent`, which
takes the core event name and unsubscribes when the component is destroyed.
Call it in the component's script, not in `onMount`:

```svelte
<!-- CameraLog.svelte -->
<script lang="ts">
  import { useMap, useMapEvent } from '@ts-maps/svelte'

  const map = useMap()
  useMapEvent('moveend', () => console.log(map?.getCenter(), map?.getZoom()))
  useMapEvent('click', e => console.log(e.latlng))
</script>
```

## Reaching the map

`useMap()` returns the `TsMap`, or `null` outside a `<Map>`. The map lives on
the context, so only a child of `<Map>` can read it. To hand it to the page,
pass it up:

```svelte
<!-- MapHandle.svelte -->
<script lang="ts">
  import type { TsMap } from 'ts-maps'
  import { useMap } from '@ts-maps/svelte'

  export let onmap: (map: TsMap) => void

  const map = useMap()
  if (map)
    onmap(map)
</script>
```

```svelte
<script lang="ts">
  import type { TsMap } from 'ts-maps'
  import { Map } from '@ts-maps/svelte'
  import Basemap from './Basemap.svelte'
  import MapHandle from './MapHandle.svelte'

  let map: TsMap | undefined
</script>

<div style="height: 480px">
  <Map center={[40.758, -73.9855]} zoom={13}>
    <Basemap />
    <MapHandle onmap={m => (map = m)} />
  </Map>
</div>
<button on:click={() => map?.flyTo([51.5072, -0.1276], 12)}>London</button>
```

`MAP_CONTEXT_KEY` is the context key, if you need the context itself.

## Server rendering

`<Map>` builds the map in `onMount`, so in SvelteKit the server renders the
empty container and none of its children.

## Reference

| Component | Props |
|---|---|
| `Map` | `center`, `zoom`, `bearing`, `pitch`, `locale` |
| `Marker` | `position`, `draggable`, `title` |
| `Popup` | `position`, `content` |
| `TileLayer` | `url`, `attribution`, `subdomains`, `tileSize`, `minZoom`, `maxZoom` |
| `Source` | `id`, `type`, `tiles`, `tileSize`, `data` |
| `Layer` | `id`, `type`, `source`, `sourceLayer`, `paint`, `layout`, `filter` |
| Controls | `position`, `options`, and `locale` on zoom, navigation, fullscreen and locate |
| `MapControl` | `type`, `position`, `options`, `locale` |

Functions: `useMap`, `useMapEvent`.
