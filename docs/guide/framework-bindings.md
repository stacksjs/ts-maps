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
| `TurnByTurn` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `turnByTurn` prop |
| `OfflineMaps` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `offlineMaps` prop |
| `Search` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `search` prop |
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

## Turn-by-turn navigation

`TurnByTurn` puts Apple Maps–style navigation on the map (see
[services](../concepts/services.md#turn-by-turn-navigation)). It is declarative
in every binding: `from` and `to` preview the routes between two places, and
`active` starts guidance — set it false, or tap End, to stop. Places are
`[lat, lng]`, the order `center` takes, or `{ lat, lng }`.

```tsx
// React and Solid
<Map center={[37.79, -122.39]} zoom={13}>
  <TurnByTurn
    from={[37.7955, -122.3937]}
    to={[37.8029, -122.4484]}
    active={driving}
    destinationName="Palace of Fine Arts"
    onProgress={e => setEta(e.progress.arrival)}
    onArrive={() => setDriving(false)}
  />
</Map>
```

```vue
<!-- Vue, and Nuxt as <TsMapsTurnByTurn> -->
<TsTurnByTurn :from="start" :to="end" :active="driving" @arrive="driving = false" />
```

```svelte
<TurnByTurn from={start} to={end} active={driving} onArrive={() => (driving = false)} />
```

The events are the same everywhere — `preview`, `routeselect`, `start`,
`progress`, `instruction`, `reroute`, `arrive`, `end`, `error` — spelled as each
framework spells an event: `onArrive` props in React, Solid and Svelte, `@arrive`
in Vue, and a bubbling `turnbyturn:arrive` DOM event in stx. A `ready` event
(`onReady`, `@ready`, `turnbyturn:ready`) hands over the underlying
`TurnByTurn`, for `selectRoute`, `recenter` and feeding positions with
`update`. The other options — `profile`, `units`, `voice`, `simulate`,
`alternatives`, `destinationName`, `directions` — are read once, when the
component mounts.

On React Native it is a prop of `MapView`, carried over the bridge like
`markers`, with every event arriving at one `onTurnByTurn({ type, data })` as
plain data:

```tsx
<MapView
  runtime={runtime}
  turnByTurn={{ from: start, to: end, active: driving, destinationName: 'Home' }}
  onTurnByTurn={e => e.type === 'arrive' && setDriving(false)}
/>
```

## Offline maps

`OfflineMaps` adds Apple Maps–style offline maps (see
[offline maps](../concepts/offline.md)): a button opening the list of downloaded
maps, an area picker with an estimated size, and a pill when the connection
drops. Two props are followed as they change — `open` shows the panel, and
`onlyOffline` keeps map data off the network — and both report back when the
panel's own ✕ or switch changes them.

```tsx
// React and Solid
<Map center={[37.78, -122.42]} zoom={13}>
  <OfflineMaps
    open={showOffline}
    onOpenChange={e => setShowOffline(e.open)}
    onComplete={e => toast(`${e.region.name} is ready offline`)}
  />
</Map>
```

```vue
<!-- Vue, and Nuxt as <TsMapsOfflineMaps> -->
<TsOfflineMaps v-model:open="showOffline" v-model:onlyOffline="offlineOnly" @complete="done" />
```

```svelte
<OfflineMaps bind:open={showOffline} bind:onlyOffline onComplete={done} />
```

The events are the same everywhere — `change` (`{ regions }`), `progress`,
`complete` and `error` (`{ region }`), `delete` (`{ id }`), `modechange`
(`{ onlyOffline }`) and `openchange` (`{ open }`) — as `onComplete` props in
React, Solid and Svelte, `@complete` in Vue, and a bubbling
`offlinemaps:complete` DOM event in stx. `ready` hands over the control, whose
`maps` is the manager for downloading, listing and deleting from code. The other
options — `position`, `maps`, `geocoder`, `resources`, `showStatus`, `title` —
are read once, when the component mounts.

On React Native it is a prop of `MapView`, with every event arriving at one
`onOfflineMaps({ type, data })`. The manager is reached through `api.call`, whose
method names can now reach one level in:

```tsx
<MapView
  runtime={runtime}
  offlineMaps={{ open: showOffline, onlyOffline }}
  onOfflineMaps={e => e.type === 'complete' && refresh()}
  onReady={api => api.call('offline.list').then(setRegions)}
/>
```

Downloads made in the WebView are kept in its IndexedDB.

## Search

`Search` adds Apple Maps–style search (see [the search control](../concepts/controls.md#search)):

- "Search Maps", with Find Nearby and Recents;
- suggestions from the map itself as you type;
- a pin for every result;
- a place card with Directions.

`query` is followed as it changes: set it and the map searches, and a category's
name runs the category. Set it to `''` to clear. `turnByTurn` is followed too,
so Directions can use a `TurnByTurn` whose `ready` arrives after mount.

```tsx
// React and Solid
<Map center={[37.79, -122.41]} zoom={15}>
  <TurnByTurn onReady={setNav} />
  <Search turnByTurn={nav} onSelect={e => setPlace(e.place)} />
</Map>
```

```vue
<!-- Vue, and Nuxt as <TsMapsSearch> -->
<TsSearch :query="query" :turn-by-turn="nav" @select="({ place }) => (chosen = place)" />
```

```svelte
<Search {query} turnByTurn={nav} onSelect={e => (chosen = e.place)} />
```

The events are the same everywhere. `results` carries
`{ query, category, places }`, `select` and `directions` carry `{ place }`, and
`clear` carries nothing. They arrive as `onSelect` props in React, Solid and
Svelte, `@select` in Vue, and a bubbling `search:select` DOM event in stx.
`ready` hands over the control, for `search`, `searchCategory`, `select` and
`cancel`. The other options — `position`, `placeholder`, `provider`, `offline`,
`categories`, `recents`, `units`, `location`, `origin`, `language` — are read
once, when the component mounts. In stx, a `<Search>` and a `<TurnByTurn>` in
the same map are linked automatically.

On React Native it is a prop of `MapView`, with every event arriving at one
`onSearch({ type, data })`. Directions previews the route on the map's
`turnByTurn` when there is one, and the `directions` event reaches the app
either way:

```tsx
<MapView
  runtime={runtime}
  search={{ query }}
  onSearch={e => e.type === 'directions' && setTrip({ to: e.data.place })}
/>
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
