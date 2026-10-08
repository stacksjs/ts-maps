# @ts-maps/react

React bindings for [ts-maps](https://github.com/stacksjs/ts-maps): a zero-dependency, TypeScript-native interactive mapping library with vector tiles, 3D, a globe, search, turn-by-turn and offline maps.

## Install

```sh
bun add @ts-maps/react
```

`react` and `react-dom` (>= 18) are peer dependencies. `ts-maps` is a normal dependency.

## Usage

```tsx
import { Map, Marker, NavigationControl, Popup } from '@ts-maps/react'
import { styles } from 'ts-maps'
import '@ts-maps/react/styles.css'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })

export default function App() {
  return (
    <Map
      center={[40.758, -73.9855]}
      zoom={13}
      style={basemap}
      containerStyle={{ height: 480 }}
      onLoad={map => console.log('map ready', map)}
    >
      <NavigationControl position="topright" showCompass />
      <Marker position={[40.758, -73.9855]} />
      <Popup position={[40.758, -73.9855]} options={{ offset: [0, -27] }}>Times Square</Popup>
    </Map>
  )
}
```

`center` is `[lat, lng]`. `style` is the map's style (a style object or a URL), not CSS; `containerStyle` and `className` go on the container `<div>`.

## Components

- `<Map>`: owns the `TsMap`. Camera props (`center`, `zoom`, `bearing`, `pitch`), `style`, `locale`, `onLoad` (called with the map), and an `on` prop per map event (`onClick`, `onMoveEnd`, `onZoomEnd`, …).
- `<Marker>`, `<Popup>`, `<TileLayer>`.
- `<Source>`, `<Layer>`: style-spec sources and layers.
- Controls: `<ZoomControl>`, `<NavigationControl>`, `<GeocoderControl>`, `<FullscreenControl>`, `<LocateControl>`, `<ScaleControl>`, `<AttributionControl>`.
- Apple Maps-style: `<Search>`, `<TurnByTurn>`, `<OfflineMaps>`, `<MapType>`, `<IndoorMap>`, `<LookAround>`, `<Landmark>`, `<Trees>`.
- `<TerritoryLayer>`, `<RunTrailLayer>`.

## Hooks

- `useMap()`: the current `TsMap`; throws outside a `<Map>`.
- `useMapOptional()`: the same, or `null` outside a map.
- `useMapEvent(event, handler)`: subscribe to a map event, by its core name (`'moveend'`, `'style.load'`), for the life of the component.

## Styles

```ts
import '@ts-maps/react/styles.css'
```

It is the same file as `ts-maps/styles.css`.

## SSR

`<Map>` builds the map in an effect, so server rendering produces the empty container and none of its children.

See the [React guide](https://ts-maps.stacksjs.com/guide/react) for every component, with examples.

## License

MIT
