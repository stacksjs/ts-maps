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

| Prop        | Type                                                                          | Notes                                         |
| ----------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `runtime`   | `{ source: 'cdn', url } \| { source: 'inline', bundledSource }`               | Required — how ts-maps reaches the WebView    |
| `style`     | `ViewStyle`                                                                   | Container style                               |
| `center`    | `[number, number]`                                                            | `[lng, lat]`                                  |
| `zoom`      | `number`                                                                      | Initial zoom                                  |
| `bearing`   | `number`                                                                      | Initial bearing (degrees)                     |
| `pitch`     | `number`                                                                      | Initial pitch (degrees)                       |
| `styleSpec` | `unknown`                                                                     | Object passed to `TsMap.setStyle`             |
| `onLoad`    | `() => void`                                                                  | Fires when the inner map emits `load`         |
| `onMove`    | `(e: { center, zoom, bearing, pitch }) => void`                               | Camera changes                                |
| `onClick`   | `(e: { lngLat, point }) => void`                                              | Map click                                     |
| `onError`   | `(e: { message }) => void`                                                    | Errors from inside the WebView                |
| `onReady`   | `(api: { call(method, ...args): Promise<unknown> }) => void`                  | Escape hatch for imperative `TsMap` methods   |

## Bundling the runtime

If you'd rather not fetch from a CDN, bundle `ts-maps` as a UMD string at build time and hand it over as `runtime.bundledSource`. The HTML document injects it as an inline `<script>`.

## License

MIT
