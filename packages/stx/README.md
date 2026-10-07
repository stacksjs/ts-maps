# @ts-maps/stx

stx components for [ts-maps](https://github.com/stacksjs/ts-maps).

```stx
<Map :center="[34.02, -118.47]" :zoom="14" theme="dark"
     basemap="dark" tiles="{{ tileUrl }}">
  <NavigationControl position="topright" />
  <GeocoderControl :options="{ placeholder: 'Search' }" />

  <Marker :lat="34.02" :lng="-118.47">
    <Popup>Ocean Park</Popup>
  </Marker>
</Map>
```

That is the whole page — no client script. The components render markup on the
server; the map builds itself from it on mount.

## Install

```bash
bun add @ts-maps/stx ts-maps
```

Register the plugin so the components resolve by tag name, and link the
stylesheet from your layout:

```ts
// stx.config.ts
export default {
  plugins: ['@ts-maps/stx/stx-plugin'],
}
```

```html
<link rel="stylesheet" href="/ts-maps.css">
```

The stylesheet is exported as `@ts-maps/stx/styles.css` if your build collects
CSS through imports. Without it the map's panes fall back to `position: static`
and stack down the page instead of overlaying — a blank-looking map with the
tiles somewhere below the fold.

## Components

| | |
|---|---|
| `Map` | The map, and the container everything else nests inside |
| `TileLayer` | Raster tiles |
| `Source` / `Layer` | Style-spec sources and the layers that draw them |
| `Marker` | A pin, default or your own markup |
| `Popup` | A bubble, bound to a marker or free-standing |
| `RouteLayer` | A recorded route: cased line, start and finish, distance markers, framed to fit |
| `ZoomControl` `NavigationControl` `GeocoderControl` `FullscreenControl` `LocateControl` `ScaleControl` `AttributionControl` | Map controls |

Same names and prop shapes as the React, Vue, Svelte and Solid bindings.

`LayersControl` is deliberately not a component: it takes dictionaries of live
layer instances rather than plain data. Use the map directly for that one.

### `<Map>`

`center` `zoom` `minZoom` `maxZoom` `bearing` `pitch` — the camera.

`theme` — `'light'`, `'dark'` or `'auto'`, for the map's own chrome.

`basemap` + `tiles` — build one of the bundled basemaps without composing a
style yourself. `basemapMode` picks `'vector'` (default) or `'raster'`;
`tilesAttribution` is passed through to the attribution control.

`basemap="auto"` follows the page between light and dark (a `dark` class on
`<html>`, else the system setting), restyling in place when it changes.

`tilejson` — vector tiles from a TileJSON instead of a fixed `tiles` URL, for
a tile service whose URLs carry a build date. A list (or a comma-separated
string) is tried in order, each source raced against a timeout; when none
answers the map draws `rasterFallback` (CARTO's raster tiles by default) under
everything else rather than nothing. The answer is cached for the session.
`palette` overrides basemap colours per theme: `{ light: { water: '#bcd7ea' } }`.

`cooperativeGestures` — for a map inside a page that scrolls (on a phone,
almost always): one finger or a plain wheel scrolls the page, two fingers or
⌘/Ctrl + wheel move the map, with a hint saying so.

`styleSpec` — a full style object or a URL, when you want your own.

`className`, `containerStyle` — the container. Give it a height.

> Write `className`, never `class`. stx seeds every prop into the client scope
> as a variable, and `class` is a reserved word — the generated script then
> fails to parse with `Unexpected token 'class'`.

### `<Marker>` and `<Popup>`

```stx
<Marker
  :lat="34.02" :lng="-118.47"
  :html="'<span class=\'pin\'>🔥</span>'"
  :iconSize="[46, 46]" :iconAnchor="[23, 23]"
>
  <Popup :closeButton="false" :open="true">Structure fire</Popup>
</Marker>
```

`html` swaps the default pin for your own markup. A `<Popup>` inside a marker
binds to it and opens on click; one with its own `lat`/`lng` stands alone.

Clicks dispatch a bubbling `marker:click` DOM event (rename it with
`clickEvent`), because stx passes props as data and a callback cannot cross the
component boundary. Listen once on an ancestor:

```ts
onMount(() => {
  useEventListener(mapEl.value, 'marker:click', (e) => {
    console.log(e.detail.marker.getLatLng())
  })
})
```

### `<RouteLayer>`

```stx
<Map basemap="auto" cooperativeGestures
     tilejson="https://tiles.example.org/tiles.json,https://tiles.openfreemap.org/planet"
     containerStyle="height: 320px">
  <FullscreenControl />
  <RouteLayer :coords="run.coords" :markers="run.kmMarkers" />
</Map>
```

`coords` is `[lat, lng]` per point; `markers` is `{ lat, lng, label }`. The
route is cased so it reads over any ground, starts green and finishes red,
frames itself, and re-frames when the map is resized for as long as nobody has
moved the camera. `theme` defaults to `'auto'`; `color`, or `colors` per theme
(`line`, `casing`, `start`, `finish`, `ring`), restyles it.

A route the page fetches after it renders is handed over on `route:ready`:

```ts
container.addEventListener('route:ready', (e) => {
  e.detail.route.setRoute(coords, markers)
  // A chart being scrubbed can move a dot along it:
  e.detail.route.setCursor([lat, lng])
})
```

### `<Search>`

```stx
<Map center="[37.79, -122.41]" zoom="15">
  <TurnByTurn />
  <Search query="coffee" :showSaved="true" />
</Map>
```

Apple Maps–style search, linked to a `<TurnByTurn>` in the same map for
Directions. `query`, `position`, `placeholder`, `categories`, `recents`,
`units`, `language` and `showSaved` (Favorites as stars on the map) are
followed after mount. Events bubble as DOM events with the core event as
`detail`: `search:results`, `search:select`, `search:details`,
`search:directions`, `search:save` and `search:unsave` (Save on a place's
card, `{ place }`) and `search:clear`. Live options — `provider`, `details`,
`saved` (where Save keeps Favorites; default the page's `savedPlaces()`) and
the like — go to the control `search:ready` hands over:

```ts
container.addEventListener('search:ready', e => e.detail.control.sync({ saved: myStore }))
container.addEventListener('search:save', e => console.log('saved', e.detail.place.name))
```

### `<MapType>`

```stx
<Map center="[37.78, -122.42]" zoom="13">
  <MapType tiles="{{ tileUrl }}" value="explore" />
</Map>
```

Apple's map type picker: Explore, Driving and Satellite. A style cannot be
written in markup, so `<MapType>` takes the plain options of `mapTypes()` —
`tiles`, `imagery`, `imageryAttribution`, `attribution`, `maxzoom`, `theme`,
`labels` — and builds the types in the browser. `value` shows a type and
`open` shows the card. A choice arrives as a bubbling `maptype:change` DOM
event (`{ value }`), the card opening or closing as `maptype:openchange`
(`{ open }`), and `maptype:ready` hands over the control, for `select`.

For a Traffic switch on the card, `trafficProvider` (`mapbox` or `tomtom`) and
`trafficKey` build the traffic layer in the browser — with TomTom, `incidents`
adds its incidents with the same key. `showTraffic` turns it on or off, and the
switch reports `maptype:trafficchange` (`{ traffic }`):

```stx
<MapType tiles="{{ tileUrl }}" trafficProvider="tomtom" trafficKey="{{ tomtomKey }}" :incidents="true" :showTraffic="true" />
```

### `<IndoorMap>`

```stx
<Map center="[37.6155, -122.3866]" zoom="17">
  <Search />
  <IndoorMap venue="/imdf/sfo.zip" :level="1" />
</Map>
```

A venue's IMDF floor plan, a level at a time, with Apple's level picker.
`venue` is the archive's URL — a `.zip`, or a folder of its files. With a
`<Search>` in the same map, the venue's shops and gates are found there, and
choosing one goes to its level. `level` and `position` are followed after
mount; a changed `venue`, `minZoom` or `language` loads the venue again.
Events bubble as DOM events: `indoor:load` (`{ venue }`), `indoor:levelchange`
(`{ level, name }`) and `indoor:visibilitychange` (`{ visible }`), and
`indoor:ready` hands over the control, for `setLevel`, `search` and `levels`:

```ts
container.addEventListener('indoor:levelchange', e => console.log('now on', e.detail.name))
```

### `<Landmark>` and `<Trees>`

```stx
<Map :center="[37.7952, -122.4028]" :zoom="17" :pitch="60">
  <Landmark model="/models/transamerica.glb" :position="[37.7952, -122.4028]" :rotation="45" />
  <Trees :spacing="12" />
</Map>
```

A landmark is a glTF model standing where a building is, after Apple Maps:
drawn with the buildings, hiding the labels behind it, and by default leaving
out the extruded building it stands on. `model` is the model's URL, or a
glTF's JSON with its buffers inline. `position`, `rotation`, `scale`,
`altitude` and `opacity` are followed after mount; a changed `model`,
`replace` or `minZoom` makes it again. `<Trees>` plants low-poly trees in the
basemap's woods and parks as the map tilts, one set per map, following
`spacing`, `maxPerTile`, `minZoom`, `minPitch`, `colors` and `height`.
Neither has events of its own: `landmark:ready` and `trees:ready` hand over
the instance, for `ready()`, the setters, or a `match` function, which
markup cannot carry:

```ts
container.addEventListener('trees:ready', e => e.detail.trees.setOptions({ match: myMatch }))
```

### Without the components

`@ts-maps/stx/route` is the same logic as plain functions that take the
ts-maps module as an argument — `resolveTileJson`, `basemapStyle`,
`drawRoute`, `refitOnResize`, `pageTheme`, `watchPageTheme` — and import only
its types. An app that loads ts-maps lazily, as its own chunk so pages without
a map never download it, passes in the module it loaded.

## Reaching the map

```ts
import { findMap, onMapEvent } from '@ts-maps/stx'

onMount(() => {
  const map = findMap(el.value)
  map.flyTo([34.02, -118.47], 16)

  onDestroy(onMapEvent(el.value, 'moveend', () => console.log(map.getCenter())))
})
```

`findMap` walks up to the nearest `<Map>`, so two maps on a page each answer
for their own children.

## How this differs from the other bindings

React, Vue, Svelte and Solid give a child component its own instance and its
own lifecycle, so `<Marker>` creates a marker for itself. stx does not work
that way: a component's `<script client>` is emitted **once per definition**,
not per use. Ten `<Marker>` tags produce ten pieces of markup and one script —
so a marker that builds itself yields exactly one marker however many you
write.

So children here render inert markup carrying `data-` attributes, and `<Map>`
walks its subtree once on mount and builds what it finds. Two consequences:

- **Children are read at mount.** Markers added to the DOM later are not picked
  up; add those through the map itself. `<TurnByTurn>`, `<Search>`,
  `<OfflineMaps>` and `<MapType>` do follow their props after that: change a
  child's `data-options` and its control's `sync` brings it into line.
- **Nesting is the wiring.** There is no context to thread and no ids to match.

Two further stx behaviours the components work around, noted here because they
bite anyone writing a component of their own:

- A client script **with imports** is bundled, and a bundled script sees none
  of the server scope — `{{ value }}` interpolation does not happen either. Pass
  data on a `data-` attribute instead.
- stx materialises a `const` only for props the caller actually passed, so a
  default written in the template (`$props.pitch ?? 0`) evaluates to `undefined`
  for anything omitted. Defaults belong in the TypeScript that reads the props;
  see `mapOptionsFrom`.

## Mobile

The components are ordinary DOM, so they work anywhere stx does — including a
Capacitor build. Nothing here is web-only beyond the map itself, which is a
canvas.

## Example

`playground/incident-map` in this repo has the same screen twice: `/` builds
everything imperatively in one client script, `/components` uses these
components and has no client script at all.
