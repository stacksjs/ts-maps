# Vue

`@ts-maps/vue` wraps ts-maps in Vue 3 components. `<Map>` builds a `Map` in
`onMounted` and provides it to its children; every other component adds one
thing to that map and removes it when it unmounts. For what the bindings
share, see [Framework bindings](./framework-bindings.md). In Nuxt, use
[the module](./nuxt.md).

## Install

::: code-group

```sh [bun]
bun add @ts-maps/vue
```

```sh [npm]
npm install @ts-maps/vue
```

```sh [pnpm]
pnpm add @ts-maps/vue
```

:::

`vue` 3.4 or later is a peer dependency. `ts-maps` comes with the package.
Import the stylesheet once:

```ts
import '@ts-maps/vue/styles.css'
```

## A first map

```vue
<script setup lang="ts">
import { Map } from '@ts-maps/vue'
import { styles } from 'ts-maps'
import '@ts-maps/vue/styles.css'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })
</script>

<template>
  <Map
    :center="[40.758, -73.9855]"
    :zoom="13"
    :style="basemap"
    :container-style="{ height: '480px' }"
  />
</template>
```

That draws [OpenFreeMap](https://openfreemap.org)'s planet, free and keyless.

- `center` is `[lat, lng]`.
- `style` is the map's style, not CSS: a style object, or the URL of one.
  `style="height: 480px"` would be taken as a style URL. Give it a different
  style and the map changes; the same style again is left alone.
- `container-style` and `container-class` go on the container `<div>`, and so
  does a plain `class`. Give it a height.

The component is also exported as `Map`, if you would rather not shadow the
global `Map` in your script. The examples below reuse `basemap`.

`center`, `zoom`, `bearing` and `pitch` are followed as they change. When
`center` or `zoom` changes, the map calls `setView(center, zoom)`. An array
written inline in a template is a new array each time the parent renders,
which moves the camera back to it. Keep `center` in a constant or a ref.

## Markers and popups

```vue
<script setup lang="ts">
import { Map, Marker, Popup } from '@ts-maps/vue'

const timesSquare: [number, number] = [40.758, -73.9855]
</script>

<template>
  <Map :center="timesSquare" :zoom="14" :style="basemap" :container-style="{ height: '480px' }">
    <Marker
      :position="timesSquare"
      :options="{ title: 'Times Square', draggable: true }"
      @dragend="e => console.log(e.target.getLatLng())"
    />
    <Popup :position="timesSquare" :options="{ offset: [0, -27] }">
      Times Square
    </Popup>
  </Map>
</template>
```

`<Marker>` takes `position` and `options` (anything the core `Marker` takes:
`icon`, `title`, `draggable`, `opacity`, …), and emits `click` and `dragend`.
A new `position` moves it.

`<Popup>` opens at `position` when it mounts and closes when it unmounts. Its
content is `content`, an HTML string, or plain text in its slot; elements in
the slot are not rendered. A popup is not tied to a marker, so open one from a
click:

```vue
<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <Map :center="timesSquare" :zoom="14" :style="basemap" :container-style="{ height: '480px' }" @popupclose="open = false">
    <Marker :position="timesSquare" @click="open = true" />
    <Popup v-if="open" :position="timesSquare" :options="{ offset: [0, -27] }" content="<b>Times Square</b>" />
  </Map>
</template>
```

For your own pin, give the marker a `divIcon` in `options`:

```ts
import { divIcon } from 'ts-maps'

const pin = divIcon({ html: '<span class="pin"></span>', iconSize: [24, 24], iconAnchor: [12, 24] })
```

```vue
<Marker :position="timesSquare" :options="{ icon: pin }" />
```

## Your own data

`<Source>` adds a style-spec source and `<Layer>` a layer that draws it. Both
are read when they mount. They can go straight inside `<Map>`: added while the
basemap is still loading, they are kept and put on it when it arrives.

```vue
<script setup lang="ts">
import { Layer, Map, Source } from '@ts-maps/vue'

const stations = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Times Sq-42 St' }, geometry: { type: 'Point', coordinates: [-73.9873, 40.7553] } },
    { type: 'Feature', properties: { name: 'Grand Central' }, geometry: { type: 'Point', coordinates: [-73.9772, 40.7527] } },
  ],
}
</script>

<template>
  <Map :center="[40.754, -73.982]" :zoom="14" :style="basemap" :container-style="{ height: '480px' }">
    <Source id="stations" :source="{ type: 'geojson', data: stations }" />
    <Layer
      :layer="{
        id: 'stations',
        type: 'circle',
        source: 'stations',
        paint: { 'circle-radius': 7, 'circle-color': '#e11d48' },
      }"
    />
  </Map>
</template>
```

GeoJSON coordinates are `[lng, lat]`, as GeoJSON has them. `<Layer>` takes
`before`, the id of a layer to insert it under. To change a source's data,
call `map.setSourceData('stations', next)`.

`<TileLayer>` adds raster tiles over or instead of the basemap:

```vue
<TileLayer
  :url="styles.ESRI_WORLD_IMAGERY"
  :options="{ attribution: styles.ESRI_WORLD_IMAGERY_ATTRIBUTION, opacity: 0.6 }"
/>
```

A new `url` swaps the tiles; `options` is read once.

## Controls

```vue
<script setup lang="ts">
import { FullscreenControl, GeocoderControl, LocateControl, Map, ScaleControl } from '@ts-maps/vue'
</script>

<template>
  <Map :center="[40.758, -73.9855]" :zoom="13" :style="basemap" :container-style="{ height: '480px' }">
    <GeocoderControl :options="{ placeholder: 'Search for a place' }" />
    <FullscreenControl position="topright" />
    <LocateControl position="topright" :options="{ follow: true }" />
    <ScaleControl position="bottomleft" :options="{ imperial: false }" />
  </Map>
</template>
```

A control takes `position`, `locale` and `options`. Its own options, such as
`showCompass` or `placeholder`, go in `options`; written as attributes they
are dropped. The control is built again when `position`, `locale` or
`options` changes. The controls are `ZoomControl`, `NavigationControl`,
`GeocoderControl`, `FullscreenControl`, `LocateControl`, `ScaleControl` and
`AttributionControl`; see [Controls](../concepts/controls.md) for their
options. The map has a zoom control of its own; with `<NavigationControl>`
you may want `map.zoomControl.remove()`.

## Apple Maps-style components

Each takes the props and fires the events listed in
[Framework bindings](./framework-bindings.md#components). Events keep the
core's names (`@select`, `@levelchange`, `@openchange`), and `@ready` hands
over the core object. The state a component can change itself works with
`v-model`:

| Component | `v-model` |
|---|---|
| `OfflineMaps` | `open`, `onlyOffline` |
| `MapType` | `value`, `open`, `showTraffic` |
| `IndoorMap` | `level` |
| `LookAround` | `choosing` |

### Search and directions

```vue
<script setup lang="ts">
import type { TurnByTurn as Navigation } from 'ts-maps'
import { Map, Search, TurnByTurn } from '@ts-maps/vue'
import { ref, shallowRef } from 'vue'

const nav = shallowRef<Navigation>()
const chosen = ref('')
</script>

<template>
  <Map :center="[37.7955, -122.3937]" :zoom="15" :style="basemap" :container-style="{ height: '600px' }">
    <TurnByTurn @ready="nav = $event" />
    <Search :turn-by-turn="nav" @select="({ place }) => (chosen = place.name)" />
  </Map>
  <p>{{ chosen }}</p>
</template>
```

Keep core objects such as `nav` in a `shallowRef`. A deep `ref` wraps them in
a proxy.

To navigate without search, set `from`, `to` and `active`:

```vue
<script setup lang="ts">
const driving = ref(false)
</script>

<template>
  <Map :center="[37.7993, -122.4219]" :zoom="13" :style="basemap" :container-style="{ height: '600px' }">
    <TurnByTurn
      :from="[37.7955, -122.3937]"
      :to="[37.8029, -122.4484]"
      destination-name="Palace of Fine Arts"
      :active="driving"
      simulate
      @arrive="driving = false"
      @end="driving = false"
    />
  </Map>
  <button @click="driving = true">
    Go
  </button>
</template>
```

`simulate` drives the route instead of following the device.

### Offline maps

```vue
<script setup lang="ts">
import { OfflineMaps } from '@ts-maps/vue'
import { ref } from 'vue'

const showOffline = ref(false)
</script>

<template>
  <OfflineMaps v-model:open="showOffline" @complete="({ region }) => console.log(`${region.name} is ready offline`)" />
</template>
```

### Map type

```vue
<script setup lang="ts">
import { MapType } from '@ts-maps/vue'
import { mapTypes } from 'ts-maps'
import { ref } from 'vue'

const types = mapTypes({ url: 'https://tiles.openfreemap.org/planet' })
const type = ref('explore')
</script>

<template>
  <MapType v-model:value="type" :types="types" />
</template>
```

### Indoor maps

```vue
<script setup lang="ts">
import type { SearchControl } from 'ts-maps'

const search = shallowRef<SearchControl>()
const level = ref(0)
</script>

<template>
  <Map :center="[37.6155, -122.3866]" :zoom="18" :style="basemap" :container-style="{ height: '600px' }">
    <Search @ready="search = $event" />
    <IndoorMap v-model:level="level" venue="/imdf/terminal.zip" :search="search" />
  </Map>
</template>
```

`venue` is your own IMDF archive. The core
[indoor example](../examples/14-indoor.md) builds one in code.

### Look Around

```vue
<script setup lang="ts">
import type { LookAround as Viewer } from 'ts-maps'

const look = shallowRef<Viewer>()
</script>

<template>
  <Map :center="[48.8606, 2.3376]" :zoom="16" :style="basemap" :container-style="{ height: '600px' }">
    <LookAround @ready="look = $event" />
    <Search :look-around="look" />
  </Map>
</template>
```

### Landmarks and trees

```vue
<Map :center="[37.7952, -122.4028]" :zoom="17" :pitch="60" :style="basemap" :container-style="{ height: '600px' }">
  <Landmark model="/models/transamerica.glb" :position="[37.7952, -122.4028]" :rotation="45" />
  <Trees :spacing="12" />
</Map>
```

`model` is a `.glb` or `.gltf` URL you host, its bytes, or a parsed glTF.

### Territories

```vue
<TerritoryLayer :store="store" self="me" />
<RunTrailLayer :track="track" show-potential />
```

## Map events

`<Map>` emits the map's events under their core names: `click`, `dblclick`,
`contextmenu`, `move`, `movestart`, `moveend`, `zoom`, `zoomstart`, `zoomend`,
`drag`, `dragstart`, `dragend`, `resize`, `viewreset`, `popupopen`,
`popupclose`, `tooltipopen`, `tooltipclose`, `layeradd`, `layerremove` and a
few more. It also emits `load-map` with the `Map`, once it is built.

```vue
<Map
  :center="[40.758, -73.9855]"
  :zoom="13"
  :style="basemap"
  :container-style="{ height: '480px' }"
  @click="e => console.log(e.latlng)"
  @moveend="e => console.log(e.target.getCenter())"
/>
```

Some names need care:

- `@load` is the map's `load` event. A map that loaded while it was being
  built emits it once, just after the listener is bound. `@load-map` is
  different: it hands over the `Map` once it is built.
- `@style-load` is `style.load`, emitted each time a style is in place.
- The mouse events other than `click`, `dblclick` and `contextmenu` are not
  emitted. Use `useMapEvent('mousemove', …)`.

Inside the map, `useMapEvent` subscribes to any event, by its core name, until
the component unmounts:

```vue
<script setup lang="ts">
import { useMap, useMapEvent } from '@ts-maps/vue'

const map = useMap()
useMapEvent('moveend', () => console.log(map.value?.getCenter()))
useMapEvent('style.load', () => console.log('the style is in'))
</script>
```

## Reaching the map

A template ref on `<Map>` exposes `map`:

```vue
<script setup lang="ts">
import type { Map } from 'ts-maps'
import { Map } from '@ts-maps/vue'
import { useTemplateRef } from 'vue'

const view = useTemplateRef<{ map: Map | null }>('view')

function london(): void {
  view.value?.map?.flyTo([51.5072, -0.1276], 12)
}
</script>

<template>
  <Map ref="view" :center="[40.758, -73.9855]" :zoom="13" :style="basemap" :container-style="{ height: '480px' }" />
  <button @click="london">
    London
  </button>
</template>
```

`@load-map` hands over the same instance when it is built. On Vue before 3.5,
use `const view = ref(null)` in place of `useTemplateRef`.

Inside the map, `useMap()` returns a `Ref` to it, and throws outside a
`<Map>`. `useMapOptional()` returns `null` there instead. `mapKey` is the
injection key behind both.

The other components expose their core object on a template ref too:
`control` on `Search`, `OfflineMaps`, `MapType`, `IndoorMap` and
`LookAround`, `nav` on `TurnByTurn`, `landmark` on `Landmark` and `trees` on
`Trees`.

## Server rendering

`<Map>` builds the map in `onMounted`, so on the server it renders the empty
container and none of its children.

## Reference

| Component | Props | Events |
|---|---|---|
| `Map` | `center`, `zoom`, `bearing`, `pitch`, `style`, `locale`, `containerStyle`, `containerClass` | map events, `load-map` |
| `Marker` | `position`, `options` | `click`, `dragend` |
| `Popup` | `position`, `content`, `options`, text slot | — |
| `TileLayer` | `url`, `options` | — |
| `Source` | `id`, `source` | — |
| `Layer` | `layer`, `before` | — |
| Controls | `position`, `locale`, `options` | — |

Composables: `useMap`, `useMapOptional`, `useMapEvent`.
