# Terrain

Elevation comes into a map as a `raster-dem` source: image tiles whose colours encode height. One source can feed two things:

- a **`hillshade` layer**, which shades the slopes so the relief shows on the map;
- **`setTerrain`**, which raises the ground into 3D by those heights, and keeps them so you can ask the elevation at any point and download it with an offline map.

Buildings, landmarks, sky and the globe are on [3D and the globe](./3d.md).

## A DEM source

[AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) are free, need no key, and send CORS headers, which a DEM needs: its pixels are read back to be decoded.

```ts
import { styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [45.992, 7.69], // Looking at the Matterhorn
  zoom: 13,
  pitch: 65,
  bearing: 235,
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

A source named by a TileJSON (`{ type: 'raster-dem', url }`) is read first, in a style passed to `setStyle` or the `style` option and by `addSource`, and its `tiles`, zooms and `encoding` come from the TileJSON. Added with `addSource`, it is ready when the map fires `sourcedata` for it; call `setTerrain` then, so the terrain is decoded with the TileJSON's `encoding`.

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

`source` names a `raster-dem` source on the map. `exaggeration` multiplies the heights and defaults to `1`; `0` lays the ground flat again. Calling `setTerrain` again with a new `exaggeration` changes it in place. A missing `source` throws a `TypeError`, and an exaggeration that is negative or not finite a `RangeError`.

### What it draws

With terrain on, the ground is a 3D surface. Mountains stand up and valleys sink, seen through the same camera as the flat map, at any pitch and bearing. The surface is draped with exactly what the map's tile layers draw: the basemap's vector tiles, raster tiles, the hillshade. Above the horizon, the sky and fog are drawn as on a flat map, and distant ridges stand against them.

Heights are measured from the ground at the centre of the view, not from the sea. The centre stays where it is and the relief around it moves; as you pan, the camera rides over the ground. Raised from the sea, a view in the Alps at zoom 14 would lift right off the top of the screen.

Labels, markers, popups and tooltips stand on the surface: a peak's name sits on the peak, not on the flat map under it. Labels behind a ridge are hidden. A click, and the `latlng` of every pointer event, lands on the slope under the pointer, so `queryTerrainElevation(e.latlng)` is the height of what was clicked. A marker dragged over the terrain lands on the ground under it.

The ground rises as its DEM tiles arrive. Until a tile has loaded, its ground is drawn at the height of the centre; a coarse tile comes first and the detail follows. The map fetches, for each tile of the basemap in view, the DEM one level finer, and one tile four levels up. Past the DEM's `maxzoom`, and wherever a tile is missing, a part of the nearest ancestor (up to six levels up) stands in. A tile the source has nothing for is not asked for again.

The encoding and tile size are read from the source. Calling `setTerrain` before `addSource` is fine; they are read when the first DEM tile is fetched. Naming another source starts again with that one's heights. `setTerrain(null)` frees the heights and cancels fetches.

### Limits

- It needs WebGL. Without it the map is drawn flat, as before, and `queryTerrainElevation` still answers.
- With the globe showing (`projection: 'globe'` below zoom 6), the globe is drawn and the terrain is not.
- Vector overlays — `Polyline`, `Polygon`, `Circle`, `GeoJSON` layers — and 3D buildings are drawn on the flat map at the height of the centre, not draped on the slopes.
- Dragging pans the flat map at the height of the centre under the pointer. Ground much higher or lower than that moves a little faster or slower than the pointer.
- Where the ground sinks far below the centre, the edge of the view can show ground that has no tiles loaded yet, and so no picture.
- Markers and popups are not hidden behind ridges; only labels are.

### Elevation at a point

```ts
map.on('click', (e) => {
  const metres = map.queryTerrainElevation(e.latlng)
  console.log(metres === null ? 'No elevation loaded here' : `${Math.round(metres)} m`)
})
```

`queryTerrainElevation({ lat, lng })` returns metres above sea level, bilinearly sampled from the finest DEM tile loaded there (one level finer than the map's zoom, or the nearest coarser one). It is `null` when terrain is off or no tile covering the point has loaded yet. It does not include the exaggeration. With terrain drawn, `e.latlng` in a click handler is the place on the surface, so the two go together.

For heights along a line, such as a route's climb, the elevation services are a better fit; see [Services](./services.md#drawing-a-route).

### Supplying tiles yourself

To feed heights from a worker or a file rather than the network:

```ts
map.addTerrainTile({ z: 12, x: 2132, y: 1457 }, pixels)
```

`pixels` is RGBA bytes (`Uint8Array` or `Uint8ClampedArray`), `demSize * demSize * 4` long, decoded with the source's encoding. It fires `terrainload`, and the ground it covers rises on the next frame. It does nothing while terrain is off. `map.getTerrainSource()` returns the `TerrainSource` behind it, which also takes decoded heights (`addTileElevation`) and answers `hasTile`, `queryElevation` and `size`.

### Events

```ts
map.on('terrainchange', ({ terrain }) => { /* null when turned off */ })
map.on('terrainload', ({ coord }) => { /* { z, x, y }: a DEM tile arrived */ })
```

`terrainchange` fires on every `setTerrain` call. `terrainload` fires when a DEM tile fetch finishes, found or not, and when `addTerrainTile` adds one, which suits a progress indicator.

## Offline

With terrain on, a downloaded offline map keeps the DEM tiles too, to zoom 12 by default (`terrainMaxZoom` to change it). Past the deepest one kept, terrain uses a part of it, as it does past the DEM's own top zoom online. See [Offline maps](./offline.md).

## Try it

The [terrain example](../examples/06-terrain.md) is the Matterhorn in 3D with the source, hillshade and `setTerrain` above, a slider for the exaggeration and one for the shading, and the height of wherever you click.
