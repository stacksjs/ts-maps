# Framework bindings

ts-maps has bindings for React, Vue, Svelte, Solid, stx, Nuxt and React
Native. Each one is a thin wrapper: a component builds a core object when it
mounts and removes it when it unmounts, and the behaviour lives in the core
library. `<Search>` in React is the core `SearchControl`; `<Marker>` is the
core `Marker`. Anything the core can do, you can reach from a binding through
the map instance.

This page covers what the bindings share and where they differ. Each
framework has its own page with runnable examples:

- [React](./react.md)
- [Vue](./vue.md)
- [Nuxt](./nuxt.md)
- [Svelte](./svelte.md)
- [Solid](./solid.md)
- [stx](./stx.md)
- [React Native](./react-native.md)

## Install

| Framework | Package | Peer dependencies | Stylesheet |
|---|---|---|---|
| React | `@ts-maps/react` | `react`, `react-dom` >= 18 | `import '@ts-maps/react/styles.css'` |
| Vue | `@ts-maps/vue` | `vue` >= 3.4 | `import '@ts-maps/vue/styles.css'` |
| Nuxt | `ts-maps-nuxt` | `@nuxt/kit` (Nuxt >= 3.12) | added by the module |
| Svelte | `@ts-maps/svelte` | `svelte` >= 4 | `import '@ts-maps/svelte/styles.css'` |
| Solid | `@ts-maps/solid` | `solid-js` >= 1.8 | `import '@ts-maps/solid/styles.css'` |
| stx | `@ts-maps/stx` | — | `@ts-maps/stx/styles.css`, or a `<link>` |
| React Native | `@ts-maps/react-native` | `react`, `react-native`, `react-native-webview` | in the WebView runtime |

Every package depends on `ts-maps`, so it is installed with the binding. Each
binding's `styles.css` is the core stylesheet; `import 'ts-maps/styles.css'`
is the same file. Without it the map's panes are not positioned and the tiles
stack down the page.

All packages are at 0.4.0.

## The parity rule

The rule: a component has the same name, the same props and the same events
in every binding, so a screen written in one framework reads the same in
another. The Apple Maps-style components keep it: `<Search>`, `<TurnByTurn>`,
`<OfflineMaps>` and the rest take the same props everywhere, and their events
have the core's names.

What changes is how each framework spells things:

| | React | Vue / Nuxt | Svelte | Solid | stx |
|---|---|---|---|---|---|
| A prop | `turnByTurn={nav}` | `:turn-by-turn="nav"` | `turnByTurn={nav}` | `turnByTurn={nav()}` | `:prop="…"`, data only |
| An event | `onSelect={fn}` | `@select="fn"` | `onSelect={fn}` | `onSelect={fn}` | `search:select` DOM event |
| The underlying control | `onReady` | `@ready` | `onReady` | `onReady` | `search:ready` DOM event |
| Two-way state | callback | `v-model:open` | `bind:open` | callback | — |

React Native takes no children: the map runs in a WebView, so each component
is a prop of `<MapView>` carrying plain data, and each component's events
arrive at one callback, such as `onSearch({ type: 'select', data })`. See
[React Native](./react-native.md).

### Where the bindings really differ

The basic components grew separately, and these differences are real today:

| | React | Vue | Svelte | Solid | stx | React Native |
|---|---|---|---|---|---|---|
| Map style | `style` prop, followed | `style` prop, followed | `style` prop, followed | `style` prop, followed | `basemap` + `tilejson`, or `styleSpec` | `styleSpec` prop |
| Container | `containerStyle`, `className` | `containerStyle`, `containerClass`, `class` | fills its parent; `containerStyle`, `class` | `containerStyle`, `class` | `containerStyle`, `className` | `style` |
| Map events | `onMoveEnd` props | `@moveend` | `onMoveEnd` props | `onMoveEnd` props | `onMapEvent(el, …)` | `onMove`, `onClick` |
| Map instance | `useMap()`, `onLoad` | `useMap()`, `@load-map`, template ref | `useMap()`, `onLoad` | `useMap()`, `onLoad` | `findMap(el)` | `onReady(api)` |
| Control options | plain props | `options` | plain props or `options` | plain props | `options` | `controls` array |
| `<Marker>` | `position`, `options`, `onClick`, `onDragEnd` | `position`, `options`, `@click`, `@dragend` | the same as React, plus `draggable`, `title`, `bind:position` | the same as React, plus `draggable`, `title` | `lat`, `lng`, `html`, … | `markers` array |
| `<Source>` / `<Layer>` | spec objects: `source`, `layer` | spec objects: `source`, `layer` | spec objects or flat props | spec objects or flat props | flat props | — |
| `useMap()` outside a map | throws | throws | `null` | `null` | — | — |

Every binding with a `useMap()` also has `useMapOptional()`, which returns
`null` outside a map.

The map events are the same set in React, Svelte and Solid, by the same
names. Vue emits most of them, under the core's names. In each, `onLoad` (Vue:
`@load-map`) hands over the map, the map's `load` event reaches a handler even
when the map loaded before the handler was bound, and `style.load` is
`onStyleLoad` (Vue: `@style-load`).

`center`, `zoom`, `bearing` and `pitch` are followed everywhere. React and Vue
call `setView` when the prop changes identity, so an inline array moves the
camera back on every render; Svelte and Solid compare the values.

The per-framework pages show each of these in use.

## The basemap

The examples in these pages draw [OpenFreeMap](https://openfreemap.org)'s
planet with the built-in light style. It is free and needs no key:

```ts
import { styles } from 'ts-maps'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })
```

`url` names a TileJSON. The map fetches it, then sets the style, and fires
`style.load` when the style is in. Use a raster `<TileLayer>` only when you
want raster tiles; OpenStreetMap's own tile server does not allow app traffic.

### Adding your own data

`<Source>` and `<Layer>` go straight inside `<Map>`. While the map fetches
its style (from a URL, or a TileJSON like OpenFreeMap's), a source or layer
added to it is kept and put on the style when it lands:

```tsx
<Map center={[40.758, -73.9855]} zoom={13} style={basemap}>
  <Source id="stations" source={{ type: 'geojson', data: stations }} />
  <Layer layer={{ id: 'stations', type: 'circle', source: 'stations' }} />
</Map>
```

stx is the exception: a basemap from `tilejson` is read by the binding and set
outright once it arrives, which replaces what was added before. The
[stx page](./stx.md#your-own-data) shows what to do instead.

## Components

Every binding except React Native exports these. React Native has the same
features as props of `<MapView>`.

| Component | What it is | Concepts |
|---|---|---|
| `Map` | The map; everything else goes inside it | [The map](../concepts/map.md) |
| `Marker`, `Popup` | A pin, and a bubble pointing at a place | [Layers](../concepts/layers.md) |
| `TileLayer` | Raster tiles from a `{z}/{x}/{y}` URL | [Layers](../concepts/layers.md) |
| `Source`, `Layer` | A style-spec source, and a layer that draws it | [Style spec](../concepts/style-spec.md) |
| `ZoomControl`, `NavigationControl`, `GeocoderControl`, `FullscreenControl`, `LocateControl`, `ScaleControl`, `AttributionControl` | Map controls | [Controls](../concepts/controls.md) |
| `Search` | Apple Maps-style search | [Search](../concepts/search.md) |
| `TurnByTurn` | Route preview and guidance | [Turn-by-turn](../concepts/services.md#turn-by-turn-navigation) |
| `OfflineMaps` | Download areas for use with no connection | [Offline maps](../concepts/offline.md) |
| `MapType` | Explore, Driving, Transit and Satellite | [Map type](../concepts/map-types.md) |
| `IndoorMap` | A venue's IMDF floor plan, a level at a time | [Indoor maps](../concepts/indoor.md) |
| `LookAround` | Street-level pictures | [Look Around](../concepts/look-around.md) |
| `Landmark` | A glTF model standing where a building is | [3D](../concepts/3d.md#landmarks) |
| `Trees` | Low-poly trees in the basemap's woods and parks | [3D](../concepts/3d.md#trees) |
| `TerritoryLayer`, `RunTrailLayer` | Captured ground and a runner's trail | [Territory capture](../concepts/territory-capture.md) |

Svelte and stx also export `MapControl`, which takes a control's `type`. stx
also has `RouteLayer`, for a recorded route.

`LayersControl` is not a component in any binding. It takes dictionaries of
live layer instances, which do not fit props. Use `control.layers(...)` on the
map instance.

The sections below list each component's props and events once. The names
are the same in every binding; the framework pages show how to write them.

### Controls

Every control takes `position` (`'topleft'`, `'topright'`, `'bottomleft'` or
`'bottomright'`) and `options`, an object of anything else the control
accepts. React, Svelte and Solid also take the control's options as plain
props. The
zoom, navigation, locate and fullscreen controls take `locale`.

A control is built when it mounts. React and Svelte rebuild it when
`position` or `locale` changes, Vue when `position`, `locale` or `options`
changes, and Solid when any prop changes.

The map has a zoom control and an attribution control of its own. Only stx's
`<Map>` can turn them off (`:zoomControl="false"`); elsewhere, call
`map.zoomControl.remove()` on the instance.

### Search

`query`, `position`, `placeholder`, `provider`, `offline`, `categories`,
`recents`, `units`, `location`, `turnByTurn`, `origin`, `lookAround`,
`language`, `locale`, `details`, `shareUrl`, `saved`, `showSaved`.

Every prop is followed as it changes. Set `query` and the map searches; a
category's name runs the category, and `''` clears. Give it a `TurnByTurn`
from that component's `ready`, and Directions on a place's card previews the
route.

| Event | Carries |
|---|---|
| `results` | `{ query, category, places }` |
| `select`, `directions`, `save`, `unsave` | `{ place }` |
| `details` | `{ place, details }`: hours, phone and website |
| `clear` | nothing |
| `ready` | the `SearchControl` |

### Turn-by-turn navigation

`from`, `to`, `active`, `profile`, `units`, `voice`, `simulate`,
`alternatives`, `destinationName`, `directions`, `locale`.

`from` and `to` (`[lat, lng]` or `{ lat, lng }`) preview the routes between
them. `active` starts guidance; set it false, or tap End, to stop. Every prop
is followed as it changes.

Events: `preview`, `routeselect`, `start`, `progress`, `instruction`,
`reroute`, `arrive`, `end`, `error`, and `ready` with the core `TurnByTurn`,
for `selectRoute`, `recenter` and `update`.

### Offline maps

`open`, `onlyOffline`, `position`, `maps`, `geocoder`, `resources`,
`showStatus`, `title`, `locale`.

`open` shows the list of downloaded maps. `onlyOffline` keeps map data off
the network. Both report back when the panel changes them.

| Event | Carries |
|---|---|
| `change` | `{ regions }` |
| `progress`, `complete` | `{ region }` |
| `error` | `{ region, error }` |
| `delete` | `{ id }` |
| `modechange` | `{ onlyOffline }` |
| `openchange` | `{ open }` |
| `ready` | the `OfflineMapsControl`; its `maps` is the manager |

### Map type

`types` (required), `value`, `open`, `position`, `title`, `traffic`,
`showTraffic`, `locale`.

`types` is what to offer. `mapTypes({ url })` builds Explore, Driving, Transit
and Satellite from one basemap. Choosing a type sets the map's style and keeps
the layers the page added. Given a `TrafficLayer` as `traffic`, the card has a
Traffic switch, which `showTraffic` turns.

Events: `change` (`{ value }`), `openchange` (`{ open }`), `trafficchange`
(`{ traffic }`), and `ready` with the control.

### Indoor maps

`venue` (required), `level`, `position`, `minZoom`, `language`, `locale`,
`search`.

`venue` is an IMDF archive: a `.zip` URL, a folder URL, its bytes, its files,
or a venue loaded with `loadIMDF`. It is read when the control is made, with
`minZoom`, `language` and `locale`; a new one makes the control again, so keep
its identity stable. `level` and `position` are followed. Given a `search`,
the venue's places are found there.

Events: `load` (`{ venue }`), `levelchange` (`{ level, name }`),
`visibilitychange` (`{ visible }`), and `ready` with the control.

### Look Around

`provider`, `position`, `miniMap`, `locale`, `title`, `choosing`, `at`,
`heading`.

`provider` is `new PanoramaxImagery()` (the default, no key) or
`new MapillaryImagery({ accessToken })`. `choosing` shows the streets with
pictures; `at` opens the viewer at the picture nearest a place, and `null`
closes it. `miniMap`, `locale` and `title` are read when the control is made.

Events: `open` and `imagechange` (`{ image }`), `close`, `viewchange`
(`{ heading, pitch, fov }`), `choosingchange` (`{ choosing }`), `notfound`
(`{ at }`), and `ready` with the control. Give that control to `Search` as
`lookAround` and a place's card shows the pictures near it.

### Landmarks and trees

`Landmark`: `model` (required), `position` (required), `altitude`,
`rotation`, `scale`, `replace`, `minZoom`, `opacity`. `model`, `replace` and
`minZoom` are read when the landmark is made; the rest are followed.

`Trees`: `spacing`, `maxPerTile`, `minZoom`, `minPitch`, `colors`, `height`,
`match`. All followed. One per map.

Both need a vector basemap and WebGL. Neither has events; `ready` hands over
the instance.

### Territories

`TerritoryLayer`: `store`, `styles`, `self`, `captureDuration`,
`labelMinZoom`, `units`, `options`. A new `store` swaps what is drawn without
rebuilding the layer.

`RunTrailLayer`: `track` (`[lng, lat]` positions), `color`, `weight`,
`showPotential`, `options`. `track` is followed.

## Localization

`locale` on the map is the language its controls speak, `'de'` for German.
The default is the browser's. A component's own `locale` wins over the map's.
See [Localization](../concepts/localization.md).

`Search`, `OfflineMaps`, `MapType` and `TurnByTurn` follow a new `locale` in
place. `IndoorMap`, `LookAround` and the zoom, navigation, locate and
fullscreen controls are made again. A change to the map's own `locale`
reaches a control without one the next time that control draws its words.

## Examples

The core library's [examples](../examples/index.md) are small runnable pages,
one feature each, and the [demos](../demos/index.md) are larger. They use the
core API; every binding builds the same objects.
