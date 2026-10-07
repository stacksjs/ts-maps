# @ts-maps/react-native

React Native bindings for [ts-maps](https://github.com/stacksjs/ts-maps). ts-maps is a browser library, so on iOS and Android this package renders it inside a `react-native-webview` and proxies events / imperative calls over a JSON bridge.

## Install

```sh
bun add @ts-maps/react-native ts-maps react react-native react-native-webview
```

`react`, `react-native`, and `react-native-webview` are peer dependencies. `ts-maps` is a regular dependency.

## Usage

```tsx
import { MapView } from '@ts-maps/react-native'

export default function Screen() {
  return (
    <MapView
      style={{ flex: 1 }}
      runtime={{ source: 'cdn', url: 'https://unpkg.com/ts-maps/dist/ts-maps.umd.js' }}
      center={[0, 0]}
      zoom={2}
      onLoad={() => console.log('map ready')}
      onMove={(e) => console.log('camera', e)}
      onReady={(api) => {
        api.call('getZoom').then((z) => console.log('zoom', z))
      }}
    />
  )
}
```

## Props

| Prop          | Type                                                            | Notes                                       |
| ------------- | --------------------------------------------------------------- | ------------------------------------------- |
| `runtime`     | `{ source: 'cdn', url } \| { source: 'inline', bundledSource }` | Required — how ts-maps reaches the WebView  |
| `style`       | `ViewStyle`                                                     | Container style                             |
| `center`      | `[number, number]`                                              | `[lng, lat]`                                |
| `zoom`        | `number`                                                        | Initial zoom                                |
| `bearing`     | `number`                                                        | Initial bearing (degrees)                   |
| `pitch`       | `number`                                                        | Initial pitch (degrees)                     |
| `styleSpec`   | `unknown`                                                       | Object passed to `TsMap.setStyle`           |
| `turnByTurn`  | `TurnByTurnSpec`                                                | Navigation — live, options included         |
| `offlineMaps` | `OfflineMapsSpec`                                               | Offline maps — live, options included       |
| `offlineStore` | `{ get, set, delete }`                                         | Keep offline maps in the app's storage      |
| `search`      | `SearchSpec`                                                    | Search — live, options included             |
| `mapType`     | `MapTypeSpec`                                                   | Map type picker — live, options included    |
| `indoor`      | `IndoorSpec`                                                    | Indoor map — live, options included         |
| `landmarks`   | `LandmarkSpec[]`                                                | glTF landmarks — live, options included     |
| `trees`       | `boolean \| TreesSpec`                                          | Trees in woods and parks — live             |
| `onLoad`      | `() => void`                                                    | Fires when the inner map emits `load`       |
| `onMove`      | `(e: { center, zoom, bearing, pitch }) => void`                 | Camera changes                              |
| `onClick`     | `(e: { lngLat, point }) => void`                                | Map click                                   |
| `onError`     | `(e: { message }) => void`                                      | Errors from inside the WebView              |
| `onReady`     | `(api: { call(method, ...args): Promise<unknown> }) => void`    | Escape hatch for imperative `TsMap` methods |

`turnByTurn`, `offlineMaps` and `search` are live: change any field, options included, and the map follows over the bridge without reloading the WebView; a field removed returns to its default. Only data crosses the bridge, so the options the other bindings take as objects or functions — `directions` for navigation, `maps` and `geocoder` for offline maps, `provider`, `offline`, `location`, `origin`, `onDirections`, `details`, `shareUrl` and `saved` for search — are not available here, and the WebView's defaults are used (for transit, `turnByTurn: { profile: 'transit', otpUrl }` plans with OpenTripPlanner at that URL): Save keeps Favorites in the WebView's own `localStorage`, and `showSaved: false` keeps their stars off the map. Search's events, a chosen place's `details` and Save's `save` and `unsave` among them, reach `onSearch` as plain data. `controls` is read when the map is built.

`mapType` is Apple's map type picker — Explore, Driving and Satellite. A style cannot cross the bridge, so it takes the plain options of `mapTypes()` — `tiles`, `imagery`, `imageryAttribution`, `attribution`, `maxzoom`, `theme`, `labels` — and the WebView builds the types, building them again when one changes. `value` and `open` are followed as they change, and `onMapType` receives `{ type: 'change', data: { value } }` and `{ type: 'openchange', data: { open } }`:

```tsx
<MapView
  runtime={runtime}
  mapType={{ tiles, value: type }}
  onMapType={e => e.type === 'change' && setType(e.data.value as string)}
/>
```

For a Traffic switch on the card, `trafficProvider` (`'mapbox'` or `'tomtom'`) and `trafficKey` build the traffic layer inside the WebView — with TomTom, `incidents: true` adds its incidents with the same key. `showTraffic` turns it on or off, and the switch reaches `onMapType` as `{ type: 'trafficchange', data: { traffic } }`:

```tsx
<MapView
  runtime={runtime}
  mapType={{ tiles, trafficProvider: 'tomtom', trafficKey: tomtomKey, showTraffic: traffic }}
  onMapType={e => e.type === 'trafficchange' && setTraffic(e.data.traffic as boolean)}
/>
```

`indoor` draws a venue's IMDF floor plan a level at a time, with the level picker beside the map. `venue` is the archive's URL — a `.zip`, or a folder of its files — loaded inside the WebView; a changed `venue`, `minZoom` or `language` loads it again, and `level` and `position` are followed as they change. With `search` set too, the venue's shops and gates are found there, and choosing one goes to its level. `onIndoor` receives `{ type: 'load', data: { venue: { id, name, levels } } }`, `{ type: 'levelchange', data: { level, name } }` and `{ type: 'visibilitychange', data: { visible } }`:

```tsx
<MapView
  runtime={runtime}
  search={{}}
  indoor={{ venue: 'https://example.org/imdf/sfo.zip', level }}
  onIndoor={e => e.type === 'levelchange' && setLevel(e.data.level as number)}
/>
```

`landmarks` stands glTF models where buildings are, after Apple Maps: drawn with the buildings, hiding the labels behind them, and by default leaving out the extruded building each stands on. `model` is a `.glb` or `.gltf` URL, loaded inside the WebView, and `position` is `[lat, lng]`. Landmarks are matched across updates by `id`, or by index without one: a changed `position`, `rotation`, `scale`, `altitude` or `opacity` moves one, and a changed `model`, `replace` or `minZoom` makes it again. `trees` plants low-poly trees in the basemap's woods and parks as the map tilts — `true` for the defaults, or `spacing`, `maxPerTile`, `minZoom`, `minPitch`, `colors` and `height`:

```tsx
<MapView
  runtime={runtime}
  pitch={60}
  landmarks={[{ id: 'transamerica', model: 'https://example.org/models/transamerica.glb', position: [37.7952, -122.4028], rotation: 45 }]}
  trees
/>
```

## Offline maps in the app's storage

By default a downloaded map lives in the WebView's IndexedDB. The OS may
clear that storage when space runs low, and the app can't see it. With
`offlineStore`, the WebView keeps nothing itself: every tile, region and
index goes across the bridge to the app, which keeps them in its own files.

```tsx
import * as FileSystem from 'expo-file-system/legacy'
import { expoFileSystemStore, MapView } from '@ts-maps/react-native'

const offlineStore = expoFileSystemStore(FileSystem)

<MapView runtime={runtime} offlineMaps={{ open: false }} offlineStore={offlineStore} />
```

`reactNativeFsStore(RNFS)` does the same with `react-native-fs`. Each
writes one file per key into `ts-maps-offline` in the app's documents
folder (pass a second argument for another folder). Anything with async
`get`, `set` and `delete` of strings will also do, such as MMKV or a
SQLite table. `offlineMaps` and `onOfflineMaps` work exactly as they do
without it. The store is read when the WebView is built, so give it from
the first render.

## Bundling the runtime

If you'd rather not fetch from a CDN, bundle `ts-maps` as a UMD string at build time and hand it over as `runtime.bundledSource`. The HTML document injects it as an inline `<script>`.

## License

MIT
