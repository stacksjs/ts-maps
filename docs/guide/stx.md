# stx

`@ts-maps/stx` gives stx apps the same map components as the other bindings,
written as tags. The components render markup on the server, and the map
builds itself from that markup when it mounts, so a page needs no client
script:

```stx
<Map :center="[34.02, -118.47]" :zoom="14" basemap="light" tilejson="https://tiles.openfreemap.org/planet" containerStyle="height: 480px">
  <NavigationControl position="topright" />

  <Marker :lat="34.02" :lng="-118.47">
    <Popup>Ocean Park</Popup>
  </Marker>
</Map>
```

stx passes props as data, so the shapes differ from the other bindings where
a callback or a live object would be needed: events are DOM events, and live
objects are handed over on a `ready` event. See
[How this differs](#how-this-differs-from-the-other-bindings) below, and
[Framework bindings](./framework-bindings.md) for what the bindings share.

## Install

```sh
bun add @ts-maps/stx
```

`ts-maps` comes with the package. Register the plugin, so the components
resolve by tag name:

```ts
// stx.config.ts
export default {
  plugins: ['@ts-maps/stx/stx-plugin'],
}
```

Then add the stylesheet. It is exported as `@ts-maps/stx/styles.css` if your
build collects CSS through imports; otherwise copy it to your public folder
and link it from your layout:

```html
<link rel="stylesheet" href="/ts-maps.css">
```

Without it the map's panes are not positioned, and the tiles stack down the
page below a blank map.

## A first map

```stx
<Map
  :center="[40.758, -73.9855]"
  :zoom="13"
  basemap="light"
  tilejson="https://tiles.openfreemap.org/planet"
  containerStyle="height: 480px"
/>
```

That draws [OpenFreeMap](https://openfreemap.org)'s planet, free and keyless.

- `center` is `[lat, lng]`. Bind it with `:center`; without the colon it is a
  string.
- `basemap` builds one of the bundled styles: `light`, `dark`, or `auto`,
  which follows the page (a `dark` class on `<html>`, else the system
  setting) and restyles when it changes.
- `tilejson` is where the vector tiles come from. A list, or a
  comma-separated string, is tried in order; when none answers, the map draws
  `rasterFallback` (CARTO's raster tiles by default) rather than nothing.
- `tiles` is a fixed `{z}/{x}/{y}` URL instead, with `tilesAttribution`, and
  `basemapMode="raster"` for raster tiles.
- `styleSpec` is a whole style object or a URL, when you want your own.
- `containerStyle` and `className` go on the container. Give it a height.

Write `className`, never `class`. stx seeds every prop into the client scope
as a variable, and `class` is a reserved word: the generated script fails to
parse.

The other `<Map>` props: `minZoom`, `maxZoom`, `bearing`, `pitch`, `theme`
(`light`, `dark` or `auto`, for the map's own chrome), `locale`, `palette`
(basemap colours per theme: `{ light: { water: '#bcd7ea' } }`),
`cooperativeGestures` (two fingers or ⌘ + wheel move the map, so the page
keeps scrolling), `zoomControl` and `attributionControl` (both on by
default). All are read when the map is built.

## Markers and popups

```stx
<Marker :lat="40.758" :lng="-73.9855" title="Times Square">
  <Popup :offset="[0, -27]">Times Square</Popup>
</Marker>

<Marker
  :lat="40.7527"
  :lng="-73.9772"
  :html="'<span class=\'pin\'>🚉</span>'"
  :iconSize="[32, 32]"
  :iconAnchor="[16, 16]"
/>

<Popup :lat="40.7484" :lng="-73.9857" :open="true">Empire State Building</Popup>
```

`<Marker>` takes `lat`, `lng`, `title`, `draggable`, `interactive`,
`opacity`, `zIndexOffset`, and `html` for your own pin markup, with
`iconSize`, `iconAnchor` and `iconClass`.

A `<Popup>` inside a marker binds to it and opens on click; with `:open="true"`
it opens at once. One with its own `lat` and `lng` stands alone. Its content is
the markup between the tags, so it is server-rendered like the rest of the
page. It also takes `closeButton`, `autoPan`, `closeOnClick`, `maxWidth`,
`minWidth`, `offset` and `className`.

A click on a marker dispatches a bubbling `marker:click` DOM event, with
`{ marker, latlng, originalEvent }` as its detail. `clickEvent` renames it.
Listen once on an ancestor, here a `<div ref="wrapper">` around the map:

```ts
const wrapper = useRef('wrapper')

onMount(() => {
  useEventListener(wrapper.value, 'marker:click', (e) => {
    console.log(e.detail.marker.getLatLng())
  })
})
```

## Your own data

`<Source>` adds a style-spec source and `<Layer>` a layer that draws it.
Their props are the spec's fields:

- `Source`: `id`, `type`, `tiles`, `data`, `minzoom`, `maxzoom`,
  `attribution`, `tileSize`, `cluster`, `clusterRadius`, `clusterMaxZoom`.
- `Layer`: `id`, `type`, `source`, `sourceLayer`, `paint`, `layout`,
  `filter`, `minzoom`, `maxzoom`, `before`.

A basemap from `tilejson` arrives after the map has built its children, and
replaces the sources and layers they added. On a map with `<Source>` and
`<Layer>`, give the basemap `tiles` instead. Read the tile URL from the
TileJSON on the server, so the page carries it:

```stx
<Map
  :center="[40.754, -73.982]"
  :zoom="14"
  basemap="light"
  tiles="{{ tileUrl }}"
  tilesAttribution="© OpenFreeMap © OpenStreetMap"
  containerStyle="height: 480px"
>
  <Source id="stations" type="geojson" :data="stations" />
  <Layer id="stations" type="circle" source="stations" :paint="{ 'circle-radius': 7, 'circle-color': '#e11d48' }" />
</Map>

<script server>
  let resolved = ''
  try {
    const tilejson = await fetch('https://tiles.openfreemap.org/planet').then(r => r.json())
    resolved = tilejson?.tiles?.[0] ?? ''
  }
  catch {
    // No connection: the map renders without a basemap.
  }
  export const tileUrl = resolved

  export const stations = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'Times Sq-42 St' }, geometry: { type: 'Point', coordinates: [-73.9873, 40.7553] } },
      { type: 'Feature', properties: { name: 'Grand Central' }, geometry: { type: 'Point', coordinates: [-73.9772, 40.7527] } },
    ],
  }
</script>
```

GeoJSON coordinates are `[lng, lat]`, as GeoJSON has them.

`<TileLayer>` adds raster tiles. It takes `url`, `attribution`, `subdomains`,
`tileSize`, `minZoom`, `maxZoom`, `opacity` and `layerClass`.

`<RouteLayer>` draws a recorded route: a cased line, start and finish, and
distance markers, framed to fit and framed again when the map is resized:

```stx
<Map basemap="auto" cooperativeGestures tilejson="https://tiles.openfreemap.org/planet" containerStyle="height: 320px">
  <FullscreenControl />
  <RouteLayer :coords="run.coords" :markers="run.kmMarkers" />
</Map>
```

`coords` is `[lat, lng]` per point; `markers` is `{ lat, lng, label }`.
`theme` defaults to `auto`; `color`, or `colors` per theme (`line`, `casing`,
`start`, `finish`, `ring`), restyles it, and `weight`, `padding` and `fit`
shape it. A route the page fetches after it renders is handed over on
`route:ready`:

```ts
container.addEventListener('route:ready', (e) => {
  e.detail.route.setRoute(coords, markers)
  // A chart being scrubbed can move a dot along it:
  e.detail.route.setCursor([lat, lng])
})
```

## Controls

```stx
<Map :center="[40.758, -73.9855]" :zoom="13" basemap="light" tilejson="https://tiles.openfreemap.org/planet" :zoomControl="false" containerStyle="height: 480px">
  <NavigationControl position="topright" />
  <GeocoderControl :options="{ placeholder: 'Search for a place' }" />
  <ScaleControl position="bottomleft" />
</Map>
```

A control takes `position` and `options`; the zoom, navigation, locate and
fullscreen controls also take `locale`. The controls are `ZoomControl`,
`NavigationControl`, `GeocoderControl`, `FullscreenControl`, `LocateControl`,
`ScaleControl` and `AttributionControl`, and `<MapControl type="scale" />`
builds any of them by name. See [Controls](../concepts/controls.md) for the
options.

## Apple Maps-style components

`<Search>`, `<TurnByTurn>`, `<OfflineMaps>`, `<MapType>`, `<IndoorMap>`,
`<LookAround>`, `<Landmark>` and `<Trees>` take the props listed in
[Framework bindings](./framework-bindings.md#components), where markup can
carry them. Their events bubble from the map as DOM events named
`<component>:<event>`, with the core event as `detail`: `search:select`,
`turnbyturn:arrive`, `offlinemaps:complete`, `maptype:change`,
`indoor:levelchange`, `lookaround:open`. `<component>:ready` hands over the
core object as `detail.control`; `turnbyturn:ready` has it as `detail.nav`,
and `landmark:ready` and `trees:ready` as `detail.landmark` and
`detail.trees`. Live options that markup cannot carry, such
as a search `provider`, go to that object's `sync`:

```ts
container.addEventListener('search:ready', e => e.detail.control.sync({ saved: myStore }))
```

After the map is built, these components keep following their props: a
change to the markup is handed to the control.

Components in the same map find each other. Directions in `<Search>` uses a
`<TurnByTurn>` in the map, `<IndoorMap>` finds its places through a
`<Search>`, and a `<Search>` place card shows `<LookAround>`'s pictures.

### Search and directions

```stx
<Map :center="[37.7955, -122.3937]" :zoom="15" basemap="light" tilejson="https://tiles.openfreemap.org/planet" containerStyle="height: 600px">
  <TurnByTurn />
  <Search query="coffee" :showSaved="true" />
</Map>
```

`<Search>` follows `query`, `position`, `placeholder`, `categories`,
`recents`, `units`, `language`, `locale` and `showSaved`. To navigate without
search, set `from`, `to` and `active`:

```stx
<TurnByTurn :from="[37.7955, -122.3937]" :to="[37.8029, -122.4484]" destinationName="Palace of Fine Arts" :active="true" :simulate="true" />
```

### Offline maps

```stx
<OfflineMaps :open="false" />
```

```ts
container.addEventListener('offlinemaps:complete', e => console.log(`${e.detail.region.name} is ready offline`))
```

### Map type

A style cannot be written in markup, so `<MapType>` takes the plain options of
`mapTypes()`: `tiles`, `imagery`, `imageryAttribution`, `attribution`,
`maxzoom`, `theme` and `labels`. It does not take a TileJSON, so give it the
tile URL read on the server, as above:

```stx
<MapType tiles="{{ tileUrl }}" value="explore" />
```

For a Traffic switch, `trafficProvider` (`mapbox` or `tomtom`) and
`trafficKey` build the traffic layer in the browser; with TomTom,
`:incidents="true"` adds its incidents. `showTraffic` turns it on.

### Indoor maps

```stx
<Map :center="[37.6155, -122.3866]" :zoom="18" basemap="light" tilejson="https://tiles.openfreemap.org/planet" containerStyle="height: 600px">
  <Search />
  <IndoorMap venue="/imdf/terminal.zip" :level="1" />
</Map>
```

`venue` is the URL of your own IMDF archive: a `.zip`, or a folder of its
files. `level` and `position` are followed; a new `venue`, `minZoom` or
`language` loads the venue again.

### Look Around

```stx
<LookAround :at="[48.8606, 2.3376]" />
```

A provider cannot be written in markup, so `provider` names one: `panoramax`
(the default; `endpoint` for another instance) or `mapillary` with an
`accessToken`.

### Landmarks and trees

```stx
<Map :center="[37.7952, -122.4028]" :zoom="17" :pitch="60" basemap="light" tilejson="https://tiles.openfreemap.org/planet" containerStyle="height: 600px">
  <Landmark model="/models/transamerica.glb" :position="[37.7952, -122.4028]" :rotation="45" />
  <Trees :spacing="12" />
</Map>
```

`model` is a model's URL, or a glTF's JSON with its buffers inline. `match`,
a function, goes to the trees from `trees:ready`.

### Territories

`<TerritoryLayer>` takes `self`, `styles`, `captureDuration`, `labelMinZoom`
and `units`; `<RunTrailLayer>` takes `color`, `weight` and `showPotential`.
A store and a track are live data, so the layers are handed over on
`territory:ready` and `runtrail:ready`, as `detail.layer`.

## Reaching the map

```ts
import { findMap, onMapEvent } from '@ts-maps/stx'

const wrapper = useRef('wrapper')

onMount(() => {
  const container = wrapper.value.querySelector('[data-ts-map]')
  const map = findMap(container)
  map?.flyTo([40.758, -73.9855], 16)

  onDestroy(onMapEvent(container, 'moveend', () => console.log(map?.getCenter())))
})
```

`findMap(el)` returns the map whose container is `el` or holds it, so two
maps on a page each answer for their own children. `onMapEvent(el, type, fn)`
subscribes to a map event and returns the function that unsubscribes.

## How this differs from the other bindings

React, Vue, Svelte and Solid give each child component its own instance and
lifecycle, so `<Marker>` makes its own marker. stx does not work that way: a
component's `<script client>` is emitted once per definition, not per use.
Ten `<Marker>` tags produce ten pieces of markup and one script.

So children render inert markup carrying `data-` attributes, and `<Map>`
walks its subtree once when it mounts and builds what it finds:

- Children are read when the map mounts. Markers added to the DOM later are
  not picked up; add those through the map.
- Nesting is the wiring. There is no context to thread and no ids to match.

Two stx behaviours the components work around, worth knowing if you write
your own:

- A client script with imports is bundled, and a bundled script sees none of
  the server scope; `{{ value }}` interpolation does not happen in it either.
  Pass data on a `data-` attribute.
- stx makes a `const` only for props the caller passed, so a default written
  in the template (`$props.pitch ?? 0`) is `undefined` for anything left out.
  Defaults belong in the TypeScript that reads the props; see
  `mapOptionsFrom`.

`@ts-maps/stx/route` has the same logic as plain functions that take the
ts-maps module as an argument: `resolveTileJson`, `basemapStyle`,
`drawRoute`, `refitOnResize`, `pageTheme`, `watchPageTheme`. An app that
loads ts-maps lazily, as its own chunk, passes in the module it loaded.

## Mobile

The components are ordinary DOM, so they work anywhere stx does, a Capacitor
build included.

## Example

`playground/incident-map` in the repository builds the same screen twice: `/`
imperatively in one client script, and `/components` with these components
and no client script.
