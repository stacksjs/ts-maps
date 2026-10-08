# @ts-maps/solid

SolidJS bindings for [ts-maps](https://github.com/stacksjs/ts-maps): a zero-dependency, TypeScript-native interactive mapping library with vector tiles, 3D, a globe, search, turn-by-turn and offline maps.

## Install

```sh
bun add @ts-maps/solid
```

`solid-js` (>= 1.8) is a peer dependency. `ts-maps` is a normal dependency.

## Usage

```tsx
import { GeocoderControl, Map, NavigationControl } from '@ts-maps/solid'
import '@ts-maps/solid/styles.css'

export function App() {
  return (
    <Map center={[34.02, -118.47]} zoom={14} style={{ height: '480px' }}>
      <NavigationControl position="topright" showCompass />
      <GeocoderControl placeholder="Search for a place" />
    </Map>
  )
}
```

`center` is `[lat, lng]`. `style` and `class` go on the container `<div>`; `<Map>` has no prop for the map's style. Set it from a child component with `useMap()?.setStyle(styles.light({ url: 'https://tiles.openfreemap.org/planet' }))`. The guide shows how.

## Components

- `<Map>`: the root. Creates the map on mount, gives it to its children through context, and removes it on cleanup.
- `<Marker>`, `<Popup>`, `<TileLayer>`, `<Source>`, `<Layer>`.
- Controls: `<ZoomControl>`, `<NavigationControl>`, `<GeocoderControl>`, `<FullscreenControl>`, `<LocateControl>`, `<ScaleControl>`, `<AttributionControl>`.
- Apple Maps-style features: `<Search>`, `<TurnByTurn>`, `<OfflineMaps>`, `<MapType>`, `<IndoorMap>`, `<Landmark>`, `<Trees>`, `<LookAround>`.
- `<TerritoryLayer>`, `<RunTrailLayer>`.
- `useMap()` and `useMapEvent(event, handler)` for components inside a `<Map>`.

The package ships its TSX source, which your Solid build compiles.

See the [Solid guide](https://ts-maps.stacksjs.com/guide/solid) for every component's props and events, with examples.

## License

MIT
