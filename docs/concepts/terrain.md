# Terrain

ts-maps renders 3D terrain by reading elevation from a `raster-dem` source, building a warped mesh per visible tile, and drawing it on a dedicated WebGL overlay canvas that sits above all tile layers. It works with **any** basemap — raster `TileLayer`, `VectorTileMapLayer`, or none at all — because the overlay is map-scoped rather than layer-scoped.

## Enable it

```ts
map.addSource('terrain-dem', {
  type: 'raster-dem',
  tiles: ['https://tiles.example.com/terrain-rgb/{z}/{x}/{y}.png'],
  tileSize: 512,
  encoding: 'mapbox', // or 'terrarium'
})

map.setTerrain({
  source: 'terrain-dem',
  exaggeration: 1.4,   // optional; defaults to 1
})
```

The first render tilts the camera to show relief:

```ts
map.setPitch(50)
map.setBearing(25)
```

## DEM encodings

| Encoding | Formula | Typical source |
| -------- | ------- | -------------- |
| `mapbox` | `-10000 + (r * 65536 + g * 256 + b) * 0.1` metres | Mapbox Terrain-RGB, Maxar |
| `terrarium` | `(r * 256 + g + b / 256) - 32768` metres | Mapzen / AWS Terrarium |

The encoding is inherited from the source spec when `setTerrain` is called after `addSource`. If the source has `encoding: 'terrarium'`, the terrain source uses that decoder; otherwise it defaults to `'mapbox'`.

## Auto-loading vs manual tiles

When `setTerrain({ source })` names a `raster-dem` source that's already on the style, ts-maps fetches DEM tiles on demand — each visible tile coordinate kicks off a background fetch, and the overlay re-renders when the tile lands.

For offline flows or worker-decoded tiles, inject pre-decoded pixels directly:

```ts
map.addTerrainTile({ z: 12, x: 2048, y: 1364 }, pixelBuffer)
```

`pixelBuffer` is a `Uint8Array` / `Uint8ClampedArray` in RGBA order, `demSize * demSize * 4` bytes. The TerrainSource decodes through the configured encoding.

## Querying elevation

```ts
const metres = map.queryTerrainElevation({ lng: -74, lat: 40.7 })
```

Returns the bilinearly-sampled elevation at the requested lng/lat, walking up the loaded tile pyramid when the preferred zoom level isn't cached yet. Returns `null` when terrain is off or no DEM tile covers the point.

`map.getTerrainSource()` exposes the raw `TerrainSource` if you want finer control — it's the same object `addTerrainTile()` writes to.

## Events

- `terrainchange` — fires on every `setTerrain()` call, including `setTerrain(null)`.
- `terrainload` — fires when a DEM tile finishes decoding and is ready to render. Useful if you want a progress UI.

```ts
map.on('terrainchange', ({ terrain }) => { /* terrain === null when off */ })
map.on('terrainload', ({ coord }) => { /* coord = { z, x, y } */ })
```

## Turning it off

```ts
map.setTerrain(null)
```

Clears the terrain source, removes the overlay canvas, and cancels any in-flight fetches.

## Rendering model

- The overlay is a `<canvas class="ts-maps-terrain-overlay">` inside the map container with `pointer-events: none` and a z-index above the tile pane.
- Each visible tile coordinate gets an orthographic projection matrix mapping tile-local pixel space (`0..tileSize`) onto its screen rectangle.
- `buildTerrainMesh()` constructs a regular grid (default `32×32` cells = 1089 vertices) with central-difference normals.
- Rendering is triggered by the `moveend`, `zoomend`, `rotate`, `pitch`, `resize`, and `terrainload` events.
- WebGL2 is required — if the host can't allocate a GL context, the overlay stays blank and the map falls back to a flat basemap.
