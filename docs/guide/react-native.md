# React Native

`@ts-maps/react-native` runs ts-maps inside a
[`react-native-webview`](https://github.com/react-native-webview/react-native-webview).
ts-maps is a browser library and there is no native renderer, so `<MapView>`
loads a small HTML document into a WebView, builds the map there, and talks
to it over a JSON message bridge.

That shapes the whole API. A component cannot cross the bridge, so
`<MapView>` takes no children: markers, controls, search and the rest are
props carrying plain data, and the map is built from them on the other side.
Events come back as plain data too. For the components these props stand in
for, see [Framework bindings](./framework-bindings.md#components).

## Install

::: code-group

```sh [bun]
bun add @ts-maps/react-native react-native-webview
```

```sh [npm]
npm install @ts-maps/react-native react-native-webview
```

```sh [Expo]
npx expo install @ts-maps/react-native react-native-webview
```

:::

`react`, `react-native` (0.72 or later) and `react-native-webview` (13 or
later) are peer dependencies. `ts-maps` comes with the package.

## The runtime

The WebView needs ts-maps as a script that sets `window.tsMaps`, and the
ts-maps stylesheet. The npm package ships ES modules, which a `<script src>`
cannot load, so build the runtime once with Bun:

```ts
// map-runtime/entry.ts
import * as tsMaps from 'ts-maps'
import css from 'ts-maps/styles.css' with { type: 'text' }

const style = document.createElement('style')
style.textContent = css
document.head.appendChild(style)
;(window as any).tsMaps = tsMaps
```

```ts
// map-runtime/build.ts
const result = await Bun.build({
  entrypoints: ['./map-runtime/entry.ts'],
  format: 'iife',
  target: 'browser',
  minify: true,
})
if (!result.success)
  throw new AggregateError(result.logs, 'map runtime build failed')

const code = await result.outputs[0].text()
await Bun.write('./src/map-runtime.ts', `export default ${JSON.stringify(code)}\n`)
```

```sh
bun map-runtime/build.ts
```

That writes `src/map-runtime.ts`, about 0.9 MB, which the app imports as a
string and hands to `<MapView>`:

```tsx
import mapRuntime from './map-runtime'

const runtime = { source: 'inline', bundledSource: mapRuntime } as const
```

To keep it out of the app bundle, host the built script instead and pass its
URL: `{ source: 'cdn', url: 'https://example.com/ts-maps-runtime.js' }`. The
WebView then loads it over the network.

`runtime` is read when the WebView is built. A new `runtime` object builds the
WebView again, so define it once, outside the component.

## A first map

```tsx
import { MapView } from '@ts-maps/react-native'
import { styles } from 'ts-maps'
import mapRuntime from './map-runtime'

const runtime = { source: 'inline', bundledSource: mapRuntime } as const
const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })

export function MapScreen() {
  return (
    <MapView
      style={{ flex: 1 }}
      runtime={runtime}
      center={[40.758, -73.9855]}
      zoom={13}
      styleSpec={basemap}
    />
  )
}
```

That draws [OpenFreeMap](https://openfreemap.org)'s planet, free and keyless.
`styles.light()` builds a plain style object, so it crosses the bridge; the
WebView reads the TileJSON.

- `center` is `[lat, lng]`.
- `style` is the WebView's own React Native style. The map's style is
  `styleSpec`.
- `center`, `zoom`, `bearing` and `pitch` are followed after the map has
  loaded, and so are `styleSpec` and `locale`.

## Markers

```tsx
<MapView
  style={{ flex: 1 }}
  runtime={runtime}
  center={[40.758, -73.9855]}
  zoom={14}
  styleSpec={basemap}
  markers={[
    { id: 'times-square', coordinate: [40.758, -73.9855], title: 'Times Square', popupHtml: '<b>Times Square</b>' },
    { id: 'grand-central', coordinate: [40.7527, -73.9772], html: '<span class="pin">🚉</span>', iconSize: [32, 32], iconAnchor: [16, 16] },
  ]}
  onMarkerPress={e => console.log('pressed', e.id)}
/>
```

A marker is `coordinate` (`[lat, lng]`) with `title`, `draggable`, `opacity`,
`zIndexOffset`, `html` for your own pin with `iconSize`, `iconAnchor` and
`iconClass`, and `popupHtml` for a popup that opens on tap, with
`popupOptions` and `popupOpen`. `onMarkerPress` gets `{ id, index,
coordinate }`.

`markers` is followed: a new array replaces the markers without reloading the
WebView, which is what a feed of moving points needs.

`html` and `popupHtml` are put into the WebView as markup. Treat them like
`dangerouslySetInnerHTML`, and do not build them from untrusted input.

## Your own data

There are no `Source` or `Layer` props. Put your source and layers in the
style itself:

```tsx
const base = styles.light({ url: 'https://tiles.openfreemap.org/planet' })

const withStations = {
  ...base,
  sources: { ...base.sources, stations: { type: 'geojson', data: stations } },
  layers: [
    ...base.layers,
    { id: 'stations', type: 'circle', source: 'stations', paint: { 'circle-radius': 7, 'circle-color': '#e11d48' } },
  ],
}

<MapView style={{ flex: 1 }} runtime={runtime} center={[40.754, -73.982]} zoom={14} styleSpec={withStations} />
```

`stations` is a GeoJSON `FeatureCollection`; its coordinates are `[lng, lat]`.
To change the data later, call
`api.call('setSourceData', 'stations', next)` (see [Calling the map](#calling-the-map)).

## Controls

```tsx
<MapView
  style={{ flex: 1 }}
  runtime={runtime}
  center={[40.758, -73.9855]}
  zoom={13}
  styleSpec={basemap}
  controls={[
    { type: 'fullscreen', position: 'topright' },
    { type: 'locate', position: 'topright', options: { follow: true } },
    { type: 'scale', position: 'bottomleft' },
  ]}
/>
```

`type` is `zoom`, `navigation`, `geocoder`, `fullscreen`, `locate`, `scale`
or `attribution`. `options` must be JSON. `controls` is read when the map is
built; a change needs a new WebView.

## Apple Maps-style components

Each is a prop holding the component's props as plain data, and each has one
callback that receives every event as `{ type, data }`. `type` is the core
event name. Every field is followed as it changes; one removed returns to its
default, and setting the prop to `undefined` removes the component.

| Prop | Callback | Not available here |
|---|---|---|
| `search` | `onSearch` | `provider`, `offline`, `location`, `origin`, `details`, `shareUrl`, `saved` |
| `turnByTurn` | `onTurnByTurn` | `directions` |
| `offlineMaps` | `onOfflineMaps` | `maps`, `geocoder` |
| `mapType` | `onMapType` | `types`, `traffic` |
| `indoor` | `onIndoor` | `search`; `venue` must be a URL |
| `lookAround` | `onLookAround` | `provider` as an object |
| `landmarks` | — | `model` must be a URL |
| `trees` | — | `match` |

What does not cross the bridge is an object or a function. The WebView's
defaults stand in: Photon for search, OSRM for directions, OpenStreetMap for
a place's details, and the WebView's own storage for Favorites.

### Search and directions

```tsx
<MapView
  style={{ flex: 1 }}
  runtime={runtime}
  center={[37.7955, -122.3937]}
  zoom={15}
  styleSpec={basemap}
  search={{ placeholder: 'Search Maps' }}
  turnByTurn={{}}
  onSearch={e => e.type === 'select' && console.log(e.data.place)}
/>
```

With `turnByTurn` set, Directions on a place's card previews the route. Either
way a `directions` event reaches `onSearch`.

To navigate without search, set `from`, `to` (`[lat, lng]`) and `active`:

```tsx
const [driving, setDriving] = useState(false)

<MapView
  style={{ flex: 1 }}
  runtime={runtime}
  center={[37.7993, -122.4219]}
  zoom={13}
  styleSpec={basemap}
  turnByTurn={{
    from: [37.7955, -122.3937],
    to: [37.8029, -122.4484],
    destinationName: 'Palace of Fine Arts',
    active: driving,
    simulate: true,
  }}
  onTurnByTurn={e => e.type === 'arrive' && setDriving(false)}
/>
```

`simulate` drives the route instead of following the device. For transit,
`profile: 'transit'` with `otpUrl` plans with OpenTripPlanner.

### Offline maps

```tsx
<MapView
  style={{ flex: 1 }}
  runtime={runtime}
  styleSpec={basemap}
  offlineMaps={{ open: showOffline }}
  onOfflineMaps={e => e.type === 'openchange' && setShowOffline(e.data.open as boolean)}
/>
```

Downloads are kept in the WebView's IndexedDB, which the OS may clear when
space runs low. `offlineStore` keeps them in the app's own files instead:

```tsx
import { expoFileSystemStore } from '@ts-maps/react-native'
import * as FileSystem from 'expo-file-system/legacy'

const offlineStore = expoFileSystemStore(FileSystem)

<MapView style={{ flex: 1 }} runtime={runtime} styleSpec={basemap} offlineMaps={{}} offlineStore={offlineStore} />
```

`reactNativeFsStore(RNFS)` does the same with `react-native-fs`. Each writes
one file per key into `ts-maps-offline` in the documents folder; a second
argument names another folder. Anything with async `get`, `set` and `delete`
of strings will do. `offlineStore` is read when the WebView is built, so give
it from the first render.

### Map type

A style cannot cross the bridge, so `mapType` takes the plain options of
`mapTypes()`: `tiles` (required), `imagery`, `imageryAttribution`,
`attribution`, `maxzoom`, `theme`, `labels`. `tiles` is a fixed tile URL;
there is no TileJSON option. For a Traffic switch, `trafficProvider`
(`'mapbox'` or `'tomtom'`), `trafficKey` and, with TomTom, `incidents`.

```tsx
<MapView
  style={{ flex: 1 }}
  runtime={runtime}
  styleSpec={basemap}
  mapType={{ tiles: tileUrl, value: type }}
  onMapType={e => e.type === 'change' && setType(e.data.value as string)}
/>
```

### Indoor maps, Look Around, landmarks and trees

```tsx
<MapView
  style={{ flex: 1 }}
  runtime={runtime}
  center={[37.7952, -122.4028]}
  zoom={17}
  pitch={60}
  styleSpec={basemap}
  search={{ lookAround: true }}
  indoor={{ venue: 'https://example.com/imdf/terminal.zip', level }}
  lookAround={{ provider: 'panoramax' }}
  landmarks={[{ id: 'transamerica', model: 'https://example.com/models/transamerica.glb', position: [37.7952, -122.4028], rotation: 45 }]}
  trees
  onIndoor={e => e.type === 'levelchange' && setLevel(e.data.level as number)}
  onLookAround={e => e.type === 'open' && console.log(e.data.image)}
/>
```

- `indoor.venue` is the URL of an IMDF archive. With `search` set, the
  venue's places are found there.
- `lookAround.provider` is `'panoramax'` (the default; `endpoint` for another
  instance) or `'mapillary'` with `accessToken`. `at` (`[lat, lng]`, or `null`
  to close), `choosing` and `heading` act only when they change. With
  `search.lookAround: true`, a place's card offers the pictures near it.
- `landmarks` are matched across updates by `id`, or by index without one.
- `trees` is `true` for the defaults, or `{ spacing, maxPerTile, minZoom,
  minPitch, colors, height }`.

### Territories

`territories` is a list of `{ owner, geometry, color, fillOpacity, weight }`,
where `geometry` is GeoJSON MultiPolygon coordinates; keep the store in the
app and send `store.get(owner)` when it changes. `self` is the viewer's owner,
and `runTrail` is the runner's path as `[lng, lat]` positions. All three are
followed.

## Language

`locale` is the language of the controls, `'de'` for German; the WebView's by
default. A change after load relabels search, offline maps, the map type
picker and turn-by-turn in place, and makes the indoor map and Look Around
again. `controls` keep the language they were built in.

## Events

| Prop | When |
|---|---|
| `onLoad` | The map has loaded |
| `onReady` | Same moment, with `api` |
| `onMove` | The camera moved: `{ center, zoom, bearing, pitch }`, with `center` as `[lat, lng]` |
| `onClick` | The map was tapped: `{ lngLat, point }`, as `[lng, lat]` and `[x, y]` |
| `onMarkerPress` | A marker was tapped: `{ id, index, coordinate }` |
| `onError` | Something failed inside the WebView: `{ message }` |

The Apple Maps-style props have their own callbacks, listed above.

## Calling the map

`onReady` hands over `api`. `api.call(method, ...args)` calls a method on the
map inside the WebView and resolves with its result:

```tsx
<MapView
  style={{ flex: 1 }}
  runtime={runtime}
  center={[40.758, -73.9855]}
  zoom={13}
  styleSpec={basemap}
  onReady={async (api) => {
    console.log(await api.call('getZoom'))
    await api.call('flyTo', [51.5072, -0.1276], 12)
  }}
/>
```

Arguments and results cross the bridge as JSON. A dotted name reaches one
object in: `api.call('offline.list')` and `api.call('offline.download', { bounds, name })`
call the map's offline maps.

`decode`, `encode`, `nextId` and `buildHtml` are exported for tests and for
building your own host. `useMapEvent` is exported too, but `MapView` does not
expose the listener registry it takes; use the `on` props.
