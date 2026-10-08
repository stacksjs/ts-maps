# Terrain

Elevation comes into a map as a `raster-dem` source: image tiles whose colours encode height. One source can feed two things:

- a **`hillshade` layer**, which shades the slopes so the relief shows on the map;
- **`setTerrain`**, which keeps the heights for the view, so you can ask the elevation at any point and download it with an offline map.

Buildings, landmarks, sky and the globe are on [3D and the globe](./3d.md).

## A DEM source

[AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) are free, need no key, and send CORS headers, which a DEM needs: its pixels are read back to be decoded.

```ts
import { styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [45.9763, 7.6586], // The Matterhorn
  zoom: 12,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

map.on('style.load', () => {
  map.addSource('dem', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 15,
    encoding: 'terrarium',
    attribution: 'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>',
  })
})
```

Add sources and layers of your own on `style.load`. It fires once the style is in, and again after each later `setStyle`, which replaces what was there.

A `raster-dem` source on its own draws nothing. Its colours are data, not a picture, and drawn straight they look like purple and green noise. It waits for a `hillshade` layer or `setTerrain` to use it.

| Source field | | |
| --- | --- | --- |
| `tiles` | required | One URL template; the first is used |
| `encoding` | `'mapbox'` | `'mapbox'` or `'terrarium'` |
| `tileSize` | `512` for hillshade, `256` for terrain | Set it: the two read the default differently |
| `minzoom`, `maxzoom` | | The zooms the DEM is published at. Past `maxzoom` its top tiles are scaled up, not requested |
| `attribution` | | Shown by the attribution control |

A source named by a TileJSON (`{ type: 'raster-dem', url }`) is read when it is part of a style passed to `setStyle` or the `style` option, and its `tiles`, zooms and `encoding` come from the TileJSON. `addSource` does not read TileJSON, so give it `tiles`.

### Encodings

| Encoding | Height in metres | Typical source |
| -------- | ---------------- | -------------- |
| `mapbox` | `-10000 + (r * 65536 + g * 256 + b) * 0.1` | Mapbox Terrain-RGB, MapTiler Terrain |
| `terrarium` | `(r * 256 + g + b / 256) - 32768` | AWS Terrain Tiles (Mapzen Terrarium) |

`decodeMapboxRGB(r, g, b)`, `decodeTerrariumRGB(r, g, b)` and `decodeElevationGrid(pixels, encoding)` are exported, for decoding tiles yourself.

## Hillshade

```ts
map.addStyleLayer({
  id: 'hillshade',
  type: 'hillshade',
  source: 'dem',
  paint: {
    'hillshade-exaggeration': 0.6,
    'hillshade-shadow-color': '#5a4a3a',
  },
})
```

The hillshade draws only light and shadow. Flat ground is left clear, so the map shows through. A slope turned from the light takes the shadow colour, and one turned towards it the highlight, each more strongly the steeper it is. Adding the layer after the source is fine: the source starts drawing when its first `hillshade` arrives. The shading goes over the basemap's tiles and under its labels. A `before` id (the second argument) places the layer in the style document, but does not move it under another source's layers.

| Paint property | Default | |
| --- | --- | --- |
| `hillshade-exaggeration` | `0.5` | How strongly slopes are shaded, `0`–`1` |
| `hillshade-illumination-direction` | `335` | Compass bearing the light comes from |
| `hillshade-shadow-color` | `#000000` | |
| `hillshade-highlight-color` | `#ffffff` | `hillshade-accent-color` is read in its place when it is missing |

The light stands 45° above the horizon. `hillshade-illumination-anchor` is accepted and not used: the light is fixed to the map.

Without a style, `rasterDEMLayer` is the same layer on its own:

```ts
import { rasterDEMLayer, TsMap } from 'ts-maps'

const map = new TsMap('map', { center: [45.9763, 7.6586], zoom: 12 })

rasterDEMLayer('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', {
  encoding: 'terrarium',
  tileSize: 256,
  maxNativeZoom: 15,
  exaggeration: 0.6,
  opacity: 0.8,
}).addTo(map)
```

Its options are `encoding` (default `'mapbox'`), `tileSize` (default `512`), `exaggeration` (`0.5`), `azimuth` (`335`), `altitude` (`45`), `accentColor` (`#ffffff`, the highlight), `shadowColor` (`#000000`), `opacity` (`1`, scales the shading), `minNativeZoom`, `maxNativeZoom`, `attribution` and `crossOrigin`. `crossOrigin` is on by default here, unlike on a plain tile layer: an image read without CORS cannot be decoded, and the layer would draw nothing. `HillshadeLayer` is the same class under Mapbox's name.

## setTerrain

```ts
map.setTerrain({ source: 'dem', exaggeration: 1.3 })
map.getTerrain() // { source: 'dem', exaggeration: 1.3 }
map.setTerrain(null)
```

`source` names a `raster-dem` source already on the map. `exaggeration` scales the heights and defaults to `1`. A missing `source` throws a `TypeError`, and an exaggeration that is negative or not finite a `RangeError`.

With terrain on, the map fetches the DEM tile under each tile in view, at the map's whole zoom. Past the DEM's `maxzoom`, and wherever a tile is missing, a part of the nearest ancestor (up to six levels up) stands in. The encoding and tile size are read from the source on the first `setTerrain` call; call `setTerrain(null)` first to switch to a DEM with a different encoding. `setTerrain(null)` frees the heights and cancels fetches.

`setTerrain` does not yet raise the map into a 3D surface: the map is drawn flat, and the relief you see is the hillshade. What it gives you today is the heights.

### Elevation at a point

```ts
map.on('click', (e) => {
  const metres = map.queryTerrainElevation(e.latlng)
  console.log(metres === null ? 'No elevation loaded here' : `${Math.round(metres)} m`)
})
```

`queryTerrainElevation({ lat, lng })` returns metres, bilinearly sampled from the DEM tile at the map's zoom, or the nearest coarser one that has loaded. It is `null` when terrain is off or no tile covering the point has loaded yet. It does not include the exaggeration.

For heights along a line, such as a route's climb, the elevation services are a better fit; see [Services](./services.md#drawing-a-route).

### Supplying tiles yourself

To feed heights from a worker or a file rather than the network:

```ts
map.addTerrainTile({ z: 12, x: 2132, y: 1457 }, pixels)
```

`pixels` is RGBA bytes (`Uint8Array` or `Uint8ClampedArray`), `demSize * demSize * 4` long, decoded with the source's encoding. It does nothing while terrain is off. `map.getTerrainSource()` returns the `TerrainSource` behind it, which also takes decoded heights (`addTileElevation`) and answers `hasTile`, `queryElevation` and `size`.

### Events

```ts
map.on('terrainchange', ({ terrain }) => { /* null when turned off */ })
map.on('terrainload', ({ coord }) => { /* { z, x, y }: a DEM tile arrived */ })
```

`terrainchange` fires on every `setTerrain` call. `terrainload` fires when a DEM tile fetch finishes, which suits a progress indicator.

## Offline

With terrain on, a downloaded offline map keeps the DEM tiles too, to zoom 12 by default (`terrainMaxZoom` to change it). Past the deepest one kept, terrain uses a part of it, as it does past the DEM's own top zoom online. See [Offline maps](./offline.md).

## Try it

The [terrain example](../examples/06-terrain.md) is the Matterhorn with the source, hillshade and `setTerrain` above, and a slider for the exaggeration.
