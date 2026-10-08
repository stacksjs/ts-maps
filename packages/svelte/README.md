# @ts-maps/svelte

Svelte bindings for [ts-maps](https://github.com/stacksjs/ts-maps): a zero-dependency, TypeScript-native interactive mapping library with vector tiles, 3D, a globe, search, turn-by-turn and offline maps.

## Install

```sh
bun add @ts-maps/svelte
```

`svelte` (>= 4) is a peer dependency. `ts-maps` is a normal dependency.

## Usage

```svelte
<script lang="ts">
  import { GeocoderControl, Map, Marker, NavigationControl } from '@ts-maps/svelte'
  import { styles } from 'ts-maps'
  import '@ts-maps/svelte/styles.css'

  const basemap = styles.light({ url: 'https://tiles.openfreemap.org/planet' })
  let pier: [number, number] = [34.0094, -118.4973]
</script>

<div style="height: 480px">
  <Map center={[34.02, -118.47]} zoom={14} style={basemap} onMoveEnd={e => console.log(e.target.getCenter())}>
    <NavigationControl position="topright" showCompass />
    <GeocoderControl placeholder="Search for a place" />
    <Marker bind:position={pier} draggable onClick={() => console.log('pier')} />
  </Map>
</div>
```

`center` is `[lat, lng]`. `style` is the map's style, a style object or a URL. The map fills its parent, so give the parent a height. `center`, `zoom`, `bearing`, `pitch` and `style` are followed as they change. Map events are `on` props with the same names as in React: `onClick`, `onMoveEnd`, `onStyleLoad`, and so on.

## Components

- `<Map>`: the root. Creates the map on mount, gives it to its children through context, and removes it on destroy. `onLoad` hands over the map.
- `<Marker>`, `<Popup>`, `<TileLayer>`, `<Source>`, `<Layer>`.
- Controls: `<ZoomControl>`, `<NavigationControl>`, `<GeocoderControl>`, `<FullscreenControl>`, `<LocateControl>`, `<ScaleControl>`, `<AttributionControl>`, `<MapControl>`.
- Apple Maps-style features: `<Search>`, `<TurnByTurn>`, `<OfflineMaps>`, `<MapType>`, `<IndoorMap>`, `<Landmark>`, `<Trees>`, `<LookAround>`.
- `<TerritoryLayer>`, `<RunTrailLayer>`.
- `useMap()`, `useMapOptional()` and `useMapEvent(event, handler)` for components inside a `<Map>`. Call them in the component's script.

The package ships its Svelte source, which your Svelte build compiles.

See the [Svelte guide](https://ts-maps.stacksjs.com/guide/svelte) for every component's props and events, with examples.

## License

MIT
