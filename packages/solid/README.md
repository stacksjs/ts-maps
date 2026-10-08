# @ts-maps/solid

SolidJS bindings for [ts-maps](https://github.com/stacksjs/ts-maps): a zero-dependency, TypeScript-native interactive mapping library with vector tiles, 3D, a globe, search, turn-by-turn and offline maps.

## Install

```sh
bun add @ts-maps/solid
```

`solid-js` (>= 1.8) is a peer dependency. `ts-maps` is a normal dependency.

## Usage

```tsx
import { GeocoderControl, Map, Marker, NavigationControl } from '@ts-maps/solid'
import { styles } from 'ts-maps'
import '@ts-maps/solid/styles.css'

const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })

export function App() {
  return (
    <Map
      center={[34.02, -118.47]}
      zoom={14}
      style={basemap}
      containerStyle={{ height: '480px' }}
      onMoveEnd={e => console.log(e.target.getCenter())}
    >
      <NavigationControl position="topright" showCompass />
      <GeocoderControl placeholder="Search for a place" />
      <Marker position={[34.0094, -118.4973]} draggable onDragEnd={e => console.log(e.target.getLatLng())} />
    </Map>
  )
}
```

`center` is `[lat, lng]`. `style` is the map's style, a style object or a URL. `containerStyle` and `class` go on the container `<div>`. `center`, `zoom`, `bearing`, `pitch` and `style` are followed as they change. Map events are `on` props with the same names as in React: `onClick`, `onMoveEnd`, `onStyleLoad`, and so on.

Up to 0.4.0, `style` was the container's CSS. Move it to `containerStyle`.

## Components

- `<Map>`: the root. Creates the map on mount, gives it to its children through context, and removes it on cleanup. `onLoad` hands over the map.
- `<Marker>`, `<Popup>`, `<TileLayer>`, `<Source>`, `<Layer>`.
- Controls: `<ZoomControl>`, `<NavigationControl>`, `<GeocoderControl>`, `<FullscreenControl>`, `<LocateControl>`, `<ScaleControl>`, `<AttributionControl>`.
- Apple Maps-style features: `<Search>`, `<TurnByTurn>`, `<OfflineMaps>`, `<MapType>`, `<IndoorMap>`, `<Landmark>`, `<Trees>`, `<LookAround>`.
- `<TerritoryLayer>`, `<RunTrailLayer>`.
- `useMap()`, `useMapOptional()` and `useMapEvent(event, handler)` for components inside a `<Map>`.

The package ships its TSX source, which your Solid build compiles.

See the [Solid guide](https://ts-maps.stacksjs.com/guide/solid) for every component's props and events, with examples.

## License

MIT
