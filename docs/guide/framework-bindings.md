# Framework bindings

ts-maps ships thin bindings for React, Vue, Svelte, Solid, stx, Nuxt and React
Native. They are wrappers, not forks: all behaviour lives in the core library,
and each binding exposes the same component names and prop shapes so a screen
sketched in one framework reads the same in another.

| | React | Vue | Svelte | Solid | stx | Nuxt | React Native |
|---|---|---|---|---|---|---|---|
| `Map` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `MapView` |
| `TileLayer` `Source` `Layer` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `Marker` `Popup` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `markers` prop |
| Controls | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `controls` prop |
| Map access | `useMap` | `useMap` | `useMap` | `useMap` | `findMap` | auto-imported | `onReady` |
| Event subscription | `useMapEvent` | `useMapEvent` | `useMapEvent` | `useMapEvent` | `onMapEvent` | auto-imported | ✅ |

Two bindings render the map somewhere a child component cannot reach it, and
say so with a different shape rather than pretending otherwise: React Native
puts it in a WebView, and stx emits a component's script once per definition
rather than per use. Both are covered below.

## Controls

Every control is a component, placed inside `<Map>` like any other child:

::: code-group

```tsx [React]
import { GeocoderControl, Map, NavigationControl, ScaleControl } from '@ts-maps/react'

<Map center={[34.02, -118.47]} zoom={14}>
  <NavigationControl position="topright" showCompass />
  <GeocoderControl placeholder="Search for a place" />
  <ScaleControl position="bottomleft" />
</Map>
```

```vue [Vue]
<script setup lang="ts">
import { GeocoderControl, Map, NavigationControl } from '@ts-maps/vue'
</script>

<template>
  <Map :center="[34.02, -118.47]" :zoom="14">
    <NavigationControl position="topright" :options="{ showCompass: true }" />
    <GeocoderControl :options="{ placeholder: 'Search for a place' }" />
  </Map>
</template>
```

```svelte [Svelte]
<script lang="ts">
  import { GeocoderControl, Map, NavigationControl } from '@ts-maps/svelte'
</script>

<Map center={[34.02, -118.47]} zoom={14}>
  <NavigationControl position="topright" options={{ showCompass: true }} />
  <GeocoderControl options={{ placeholder: 'Search for a place' }} />
</Map>
```

```tsx [Solid]
import { GeocoderControl, Map, NavigationControl } from '@ts-maps/solid'

<Map center={[34.02, -118.47]} zoom={14}>
  <NavigationControl position="topright" showCompass />
  <GeocoderControl placeholder="Search for a place" />
</Map>
```

```stx [stx]
<Map :center="[34.02, -118.47]" :zoom="14">
  <NavigationControl position="topright" />
  <GeocoderControl :options="{ placeholder: 'Search for a place' }" />
</Map>
```

```vue [Nuxt]
<template>
  <TsMapsMap :center="[34.02, -118.47]" :zoom="14">
    <TsMapsNavigationControl position="topright" />
    <TsMapsGeocoderControl :options="{ placeholder: 'Search' }" />
  </TsMapsMap>
</template>
```

:::

The available components are `ZoomControl`, `NavigationControl`,
`GeocoderControl`, `FullscreenControl`, `LocateControl`, `ScaleControl` and
`AttributionControl` — see [Controls](../concepts/controls.md) for what each
one does and the options it takes.

Every control takes `position` (`'topleft' | 'topright' | 'bottomleft' |
'bottomright'`) and an `options` object for anything else. React and Solid also
accept the common options as plain props; Vue and Svelte take them through
`options`, matching how those frameworks handle pass-through props elsewhere.

Adding a control mounts it; unmounting the component removes it. Changing
`position` rebuilds it, because that is what moving a control means. In React,
passing a fresh `options` object literal on every render does **not** rebuild
the control — only `position` does.

### LayersControl

`LayersControl` is deliberately not a component in any binding. It takes
dictionaries of live layer instances rather than plain data, which does not
translate to props. Reach for the map directly:

```tsx
const map = useMap()
useEffect(() => {
  const layers = control.layers({ Streets: streetsLayer }, { Traffic: trafficLayer })
  layers.addTo(map)
  return () => { layers.remove() }
}, [map])
```

## Subscribing to events

`useMapEvent` binds a handler for the lifetime of the calling component, in
every binding:

```ts
useMapEvent('moveend', () => console.log(map.getCenter()))
```

One difference worth knowing: in React and Vue, `useMap()` throws when called
outside a `<Map>` (with `useMapOptional()` for the tolerant version). In Svelte
and Solid, `useMap()` returns `null` instead. That follows each ecosystem's own
convention for missing context.

## stx

Everything is a component, and a page needs no client script of its own:

```stx
<Map :center="[34.02, -118.47]" :zoom="14" theme="dark"
     basemap="dark" tiles="{{ tileUrl }}">
  <NavigationControl position="topright" />

  <Marker :lat="34.02" :lng="-118.47">
    <Popup>Ocean Park</Popup>
  </Marker>
</Map>
```

Register `@ts-maps/stx/stx-plugin` in `stx.config.ts` and link the stylesheet
from your layout. Two rules are worth knowing up front:

- Write `className`, never `class`. stx seeds every prop into the client scope
  as a variable, and `class` is a reserved word — the generated script then
  fails to parse.
- Children are read once, when the map mounts. stx emits a component's script
  once per *definition* rather than per use, so a marker cannot build itself;
  instead each child renders inert markup and `<Map>` walks its subtree and
  builds what it finds. Markers added to the DOM later are not picked up — add
  those through the map.

Reach the map with `findMap(el)`, and subscribe with `onMapEvent(el, type, fn)`.
Marker taps arrive as a bubbling `marker:click` DOM event, since a callback
cannot cross a prop boundary that carries only data.

See [`@ts-maps/stx`](https://github.com/stacksjs/ts-maps/tree/main/packages/stx)
for the full component list, and `playground/incident-map` for the same screen
built both imperatively and with these components.

## React Native

The map runs inside a `react-native-webview`, so `MapView` takes no children.
Controls and markers are declared as data and built on the other side of the
bridge:

```tsx
import { MapView } from '@ts-maps/react-native'

<MapView
  runtime={{ source: 'cdn', url: 'https://unpkg.com/ts-maps' }}
  center={[34.02, -118.47]}
  zoom={14}
  controls={[
    { type: 'navigation', position: 'topright' },
    { type: 'geocoder', options: { placeholder: 'Search' } },
  ]}
  markers={incidents.map(i => ({
    id: i.id,
    coordinate: i.coords,
    html: `<span class="pin">${i.emoji}</span>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupHtml: `<b>${i.title}</b>`,
  }))}
  onMarkerPress={e => select(e.id)}
  onReady={api => api.call('setTheme', 'dark')}
/>
```

`markers` is live: changing the array updates the map over the bridge, which is
what a feed of moving or filtered points needs. `controls` is read when the map
is built, so changing it after mount needs a remount — the same rule as
`runtime`.

`html` and `popupHtml` are inserted as markup inside the WebView. Treat them
the way you would `dangerouslySetInnerHTML`, and do not build them from
untrusted input.

For anything else, `onReady` hands you an `api` whose `call(method, ...args)`
invokes a method on the map inside the WebView.
