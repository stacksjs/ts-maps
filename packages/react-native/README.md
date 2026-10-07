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
| `search`      | `SearchSpec`                                                    | Search — live, options included             |
| `mapType`     | `MapTypeSpec`                                                   | Map type picker — live, options included    |
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

## Bundling the runtime

If you'd rather not fetch from a CDN, bundle `ts-maps` as a UMD string at build time and hand it over as `runtime.bundledSource`. The HTML document injects it as an inline `<script>`.

## License

MIT
