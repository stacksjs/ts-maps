# Plugins

`ts-maps` is designed so most extension points do not need a plugin
system at all — you can drop in custom layers, custom services,
or custom controls using the same APIs the built-ins use. This page is
an orientation for plugin authors and a pointer to the community
registry.

## Extension surfaces

### Custom layers

Any class that implements the `Layer` contract can be `addTo(map)`'d.
For GPU-rendered overlays on top of the tile panes, prefer
`CustomLayerInterface` — it hooks into the same render loop as the
built-in vector-tile renderer:

```ts
map.addCustomLayer({
  id: 'wind',
  type: 'custom',
  onAdd(map, gl) { /* compile shaders */ },
  render(gl, projectionMatrix) { /* draw frame */ },
  onRemove(map, gl) { /* release resources */ },
})
```

See [concepts/3d.md](./concepts/3d.md) for the full interface.

### Custom sources

For non-tile data, hook into the style-spec source registry by
calling `map.addSource(id, { type: 'geojson', data: … })` or
`{ type: 'vector', tiles: [...] }`. If you need a bespoke tile format,
extend `GridLayer` or `TileLayer` directly — they handle the pan /
zoom bookkeeping so your plugin only needs a `createTile(coords, done)`.

### Custom services

The `services` interfaces (`GeocoderProvider`, `DirectionsProvider`,
`IsochroneProvider`, `MatrixProvider`) are public:

```ts
import type { GeocoderProvider } from 'ts-maps/services'

class MyProvider implements GeocoderProvider {
  name = 'my-provider'
  async search(query: string) { /* ... */ }
  async reverse(center) { /* ... */ }
}
```

Hand the instance to whichever consumer expects a provider (e.g. your
own geocoder control).

### Custom controls

Any object with `onAdd(map)` / `onRemove(map)` can be passed to
`map.addControl(ctrl, position)`. The four built-in controls
(`ZoomControl`, `ScaleControl`, `AttributionControl`, `LayersControl`)
are reference implementations.

### Custom renderers

The WebGL path is pluggable — `map.setRenderer('webgl' | 'canvas2d' | 'svg')`
picks the backend for style-spec layers. If you want an entirely
different backend, subclass `Renderer` and register it via the same
setter; the map will rewire source hosts on the next paint.

## Publishing a plugin

Plugins are just npm packages. Follow these conventions so they're
discoverable:

- **Name:** `ts-maps-plugin-<name>` (unscoped) or `@<scope>/ts-maps-<name>`.
- **Keywords:** include `ts-maps`, `ts-maps-plugin`, and the relevant
  extension surface (`geocoder`, `directions`, `layer`, `control`).
- **Peer:** `"peerDependencies": { "ts-maps": "^0.2.0" }`.
- **Readme:** add a "Requires" section listing any external services
  (tile endpoints, API keys, etc.).

## Plugin registry

Plugins that meet the naming convention above auto-surface in the npm
search: <https://www.npmjs.com/search?q=ts-maps-plugin>. A curated list
lives at <https://ts-maps.dev/plugins>.

Submissions welcome — open a PR against `docs/plugins.md` with a short
description and a link to your package.

## Best practices

- **Keep runtime deps to zero** if you can. `ts-maps` core has none;
  plugins that inherit that discipline are easier to ship.
- **Declare `ts-maps` as a peer**, not a dependency — otherwise apps
  end up with two copies.
- **Use subpath imports** (`ts-maps/style-spec`, `ts-maps/services`, …)
  so bundlers only pull in the slice you actually use.
- **Fail soft.** If your plugin wraps a third-party API, handle 4xx /
  5xx responses gracefully and surface them as a rejected Promise —
  don't throw synchronously from a `render()` callback.
