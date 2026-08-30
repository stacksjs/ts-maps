# stx components

`@ts-maps/stx` gives stx apps the same map components the other bindings have.

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
  up; add those through the map itself.
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

`playground/incident-map` in the repository has the same screen twice: `/`
builds everything imperatively in one client script, `/components` uses these
components and has no client script at all.
