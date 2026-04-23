# @ts-maps/react

React bindings for [ts-maps](https://github.com/stacksjs/ts-maps) — a zero-dependency TypeScript library for interactive SVG-based vector maps.

## Install

```sh
bun add @ts-maps/react ts-maps react react-dom
```

`react` and `react-dom` are peer dependencies (>= 18). `ts-maps` is a normal dependency.

## Usage

```tsx
import { Map, Marker, Popup, TileLayer } from '@ts-maps/react'
import '@ts-maps/react/styles.css'

export default function App() {
  return (
    <Map
      containerStyle={{ width: '100%', height: 480 }}
      center={[51.505, -0.09]}
      zoom={13}
      onLoad={(map) => console.log('map ready', map)}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[51.505, -0.09]} />
      <Popup position={[51.505, -0.09]} content="Hello!" />
    </Map>
  )
}
```

## Components

- `<Map>` — owns the `TsMap` instance. Accepts camera props (`center`, `zoom`, `bearing`, `pitch`), a `style` prop (style-spec or URL), and React-style camelCase event props (`onClick`, `onMove`, `onStyleLoad`, …).
- `<Marker>`, `<Popup>`, `<TileLayer>` — register legacy layers.
- `<Source>`, `<Layer>` — register style-spec sources and layers (Mapbox-style).

## Hooks

- `useMap()` — returns the current `TsMap` from context; throws outside of `<Map>`.
- `useMapOptional()` — same, but returns `null` outside a map.
- `useMapEvent(event, handler)` — subscribe to a `TsMap` event for the lifetime of the caller.

## Styles

The `ts-maps` stylesheet is re-exported so you can import it directly:

```ts
import '@ts-maps/react/styles.css'
```

Or import from `ts-maps` itself:

```ts
import 'ts-maps/styles.css'
```

## SSR

`<Map>` defers all DOM work to `useEffect`, so server rendering is safe and produces an empty container div.

## License

MIT
