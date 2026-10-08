# @ts-maps/svelte

Svelte bindings for [ts-maps](https://github.com/stacksjs/ts-maps): a zero-dependency, TypeScript-native interactive mapping library with vector tiles, 3D, a globe, search, turn-by-turn and offline maps.

## Install

```sh
bun add @ts-maps/svelte ts-maps svelte
```

`svelte` (>= 4) is a peer dependency. `ts-maps` is a normal dependency.

## Usage

```svelte
<script lang="ts">
  import { GeocoderControl, Map, NavigationControl } from '@ts-maps/svelte'
  import '@ts-maps/svelte/styles.css'
</script>

<Map center={[34.02, -118.47]} zoom={14}>
  <NavigationControl position="topright" options={{ showCompass: true }} />
  <GeocoderControl options={{ placeholder: 'Search for a place' }} />
</Map>
```

## Components

- `<Map>`: the root. Creates the map on mount, gives it to its children through context, and removes it on destroy.
- `<Marker>`, `<Popup>`, `<TileLayer>`, `<Source>`, `<Layer>`.
- Controls: `<ZoomControl>`, `<NavigationControl>`, `<GeocoderControl>`, `<FullscreenControl>`, `<LocateControl>`, `<ScaleControl>`, `<AttributionControl>`, `<MapControl>`.
- Apple Maps-style features: `<Search>`, `<TurnByTurn>`, `<OfflineMaps>`, `<MapType>`, `<IndoorMap>`, `<Landmark>`, `<Trees>`, `<LookAround>`.
- `<TerritoryLayer>`, `<RunTrailLayer>`.
- `useMap()` and `useMapEvent(event, handler)` for components inside a `<Map>`.

The package ships its Svelte source, which your Svelte build compiles.

See the [framework bindings guide](https://ts-maps.stacksjs.com/guide/framework-bindings) for every component's props and events.

## License

MIT
