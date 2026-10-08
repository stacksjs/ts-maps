# @ts-maps/react-native

React Native bindings for [ts-maps](https://github.com/stacksjs/ts-maps). ts-maps is a browser library, so on iOS and Android this package renders it inside a `react-native-webview` and proxies events / imperative calls over a JSON bridge.

## Install

```sh
bun add @ts-maps/react-native react-native-webview
```

`react`, `react-native` (>= 0.72) and `react-native-webview` (>= 13) are peer dependencies. `ts-maps` is a regular dependency.

## The runtime

The WebView needs ts-maps as a classic script that sets `window.tsMaps`, plus the ts-maps stylesheet. The npm package ships ES modules, so build one with Bun:

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
const result = await Bun.build({ entrypoints: ['./map-runtime/entry.ts'], format: 'iife', target: 'browser', minify: true })
if (!result.success)
  throw new AggregateError(result.logs, 'map runtime build failed')
await Bun.write('./src/map-runtime.ts', `export default ${JSON.stringify(await result.outputs[0].text())}\n`)
```

Pass the string as `{ source: 'inline', bundledSource }`, or host the built script and pass `{ source: 'cdn', url }`.

## Usage

```tsx
import { MapView } from '@ts-maps/react-native'
import { styles } from 'ts-maps'
import mapRuntime from './map-runtime'

const runtime = { source: 'inline', bundledSource: mapRuntime } as const
const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })

export default function Screen() {
  return (
    <MapView
      style={{ flex: 1 }}
      runtime={runtime}
      center={[40.758, -73.9855]}
      zoom={13}
      styleSpec={basemap}
      markers={[{ id: 'ts', coordinate: [40.758, -73.9855], popupHtml: '<b>Times Square</b>' }]}
      onMarkerPress={e => console.log('pressed', e.id)}
      onReady={(api) => {
        api.call('getZoom').then(z => console.log('zoom', z))
      }}
    />
  )
}
```

## Props

| Prop          | Type                                                            | Notes                                       |
| ------------- | --------------------------------------------------------------- | ------------------------------------------- |
| `runtime`     | `{ source: 'cdn', url } \| { source: 'inline', bundledSource }` | Required — how ts-maps reaches the WebView  |
| `style`       | `ViewStyle`                                                     | The WebView's style                         |
| `center`      | `[number, number]`                                              | `[lat, lng]` — live                         |
| `zoom`        | `number`                                                        | Live                                        |
| `bearing`     | `number`                                                        | Degrees — live                              |
| `pitch`       | `number`                                                        | Degrees — live                              |
| `styleSpec`   | `unknown`                                                       | The map's style, JSON — live                |
| `locale`      | `string`                                                        | The controls' language — live               |
| `controls`    | `ControlSpec[]`                                                 | `{ type, position, options }` — read once   |
| `markers`     | `MarkerSpec[]`                                                  | Markers, with popups — live                 |
| `territories` | `TerritorySpec[]`                                               | Captured ground — live                      |
| `self`        | `string`                                                        | The viewer's owner, for `territories`       |
| `runTrail`    | `number[][]`                                                    | A runner's path, `[lng, lat]` — live        |
| `turnByTurn`  | `TurnByTurnSpec`                                                | Navigation — live, options included         |
| `offlineMaps` | `OfflineMapsSpec`                                               | Offline maps — live, options included       |
| `offlineStore` | `{ get, set, delete }`                                         | Keep offline maps in the app's storage      |
| `search`      | `SearchSpec`                                                    | Search — live, options included             |
| `mapType`     | `MapTypeSpec`                                                   | Map type picker — live, options included    |
| `indoor`      | `IndoorSpec`                                                    | Indoor map — live, options included         |
| `lookAround`  | `LookAroundSpec`                                                | Look Around — live, options included        |
| `landmarks`   | `LandmarkSpec[]`                                                | glTF landmarks — live, options included     |
| `trees`       | `boolean \| TreesSpec`                                          | Trees in woods and parks — live             |
| `onLoad`      | `() => void`                                                    | The inner map has loaded                    |
| `onMove`      | `(e: { center, zoom, bearing, pitch }) => void`                 | Camera changes; `center` is `[lat, lng]`    |
| `onClick`     | `(e: { lngLat, point }) => void`                                | Map tap; `[lng, lat]` and `[x, y]`          |
| `onMarkerPress` | `(e: { id, index, coordinate }) => void`                      | Marker tap                                  |
| `onError`     | `(e: { message }) => void`                                      | Errors from inside the WebView              |
| `onTurnByTurn`, `onOfflineMaps`, `onSearch`, `onMapType`, `onIndoor`, `onLookAround` | `(e: { type, data }) => void` | Every event of that component |
| `onReady`     | `(api: { call(method, ...args): Promise<unknown> }) => void`    | Escape hatch for imperative `Map` methods |

`turnByTurn`, `offlineMaps` and `search` are live: change any field, options included, and the map follows over the bridge without reloading the WebView; a field removed returns to its default. Only data crosses the bridge, so the options the other bindings take as objects or functions — `directions` for navigation, `maps` and `geocoder` for offline maps, `provider`, `offline`, `location`, `origin`, `onDirections`, `details`, `shareUrl` and `saved` for search — are not available here, and the WebView's defaults are used (for transit, `turnByTurn: { profile: 'transit', otpUrl }` plans with OpenTripPlanner at that URL): Save keeps Favorites in the WebView's own `localStorage`, and `showSaved: false` keeps their stars off the map. Search's events, a chosen place's `details` and Save's `save` and `unsave` among them, reach `onSearch` as plain data. `controls` is read when the map is built.

`locale` is the language the built-in controls speak, `'de'` for German; the WebView's own by default. It is baked into the document, and a change after load goes over the bridge: search, offline maps, the map type picker and turn-by-turn relabel in place, and the indoor map and Look Around are made again. `controls` keep the language they were built in.

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

`lookAround` is Apple's Look Around: a binoculars button that shows the streets with pictures, and a full-bleed viewer to turn in and walk through them, inside the WebView. A provider cannot cross the bridge, so `provider` names one — `'panoramax'` (the default; `endpoint` for another instance) or `'mapillary'` with an `accessToken`. `choosing` shows the streets with pictures, `at` (`[lat, lng]`) opens the viewer at the picture nearest it and `null` closes it, and `heading` turns it — each followed only when it changes, so the viewer closed by its own Done stays closed. With `search` set too and its `lookAround: true`, a place's card offers the pictures near it. `onLookAround` receives `{ type: 'open' | 'imagechange', data: { image: { id, provider, lat, lng, heading, capturedAt } } }`, `{ type: 'close', data: {} }`, `{ type: 'viewchange', data: { heading, pitch, fov } }`, `{ type: 'choosingchange', data: { choosing } }` and `{ type: 'notfound', data: { at } }`:

```tsx
<MapView
  runtime={runtime}
  search={{ lookAround: true }}
  lookAround={{ at }}
  onLookAround={e => e.type === 'close' && setAt(null)}
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

See the [React Native guide](https://ts-maps.stacksjs.com/guide/react-native) for more.

## License

MIT
