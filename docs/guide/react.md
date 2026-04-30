# React

`@ts-maps/react` ships first-class React bindings for `TsMap`.

## Installation

::: code-group

```sh [npm]
npm install ts-maps @ts-maps/react
```

```sh [pnpm]
pnpm add ts-maps @ts-maps/react
```

```sh [bun]
bun add ts-maps @ts-maps/react
```

:::

## Components

- `<Map>` — root map instance; forwards `TsMap` options.
- `<TileLayer>` — raster tile source.
- `<Source>` / `<Layer>` — style-spec sources and layers.
- `<Marker>` — marker with an optional `<Popup>` child.
- `<Popup>` — standalone popup.

## Basic usage

```tsx
import { Map, Marker, Popup, TileLayer } from '@ts-maps/react'
import 'ts-maps/styles.css'

export function App() {
  return (
    <Map center={[40.758, -73.9855]} zoom={13} style={{ height: 500 }}>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <Marker position={[40.758, -73.9855]}>
        <Popup>Hello from ts-maps</Popup>
      </Marker>
    </Map>
  )
}
```

## Vector tiles

```tsx
import { Layer, Map, Source } from '@ts-maps/react'

export function Vector() {
  return (
    <Map center={[51.5, -0.12]} zoom={6} style={{ height: 500 }}>
      <Source
        id="osm-tiles"
        type="vector"
        tiles={['https://tiles.example.com/{z}/{x}/{y}.pbf']}
      />
      <Layer
        id="water"
        type="fill"
        source="osm-tiles"
        sourceLayer="water"
        paint={{ 'fill-color': '#0ea5e9' }}
      />
      <Layer
        id="roads"
        type="line"
        source="osm-tiles"
        sourceLayer="transportation"
        paint={{
          'line-color': '#6b7280',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 3],
        }}
      />
    </Map>
  )
}
```

## Hooks

```ts
import { useMap, useMapEvent } from '@ts-maps/react'
```

- `useMap()` — returns the `TsMap` instance from a descendant component.
- `useMapEvent(name, handler)` — subscribe to a map event with automatic

  teardown on unmount.

```tsx
import { useMap, useMapEvent } from '@ts-maps/react'

function CenterReadout() {
  const map = useMap()
  const [center, setCenter] = useState(map?.getCenter())
  useMapEvent('moveend', () => setCenter(map?.getCenter()))
  return <div>{center?.lat.toFixed(4)}, {center?.lng.toFixed(4)}</div>
}
```

## Accessing the map instance

```tsx
import { useEffect, useRef } from 'react'
import { Map, type MapHandle } from '@ts-maps/react'

function Controller() {
  const ref = useRef<MapHandle>(null)
  useEffect(() => {
    ref.current?.map.flyTo({ center: [51.5, -0.12], zoom: 10 })
  }, [])
  return <Map ref={ref} center={[40, 0]} zoom={2} />
}
```

## Next steps

- [Vue](/guide/vue)
- [Nuxt](/guide/nuxt)
