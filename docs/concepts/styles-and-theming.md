# Styles & theming

Two things on a map get called its "theme", and it helps to keep them apart:

- the **basemap style**: the colours of land, water, roads and labels, which
  come from a [style document](./style-spec.md);
- the **chrome**: the controls, popups, tooltips, scale bar and attribution
  the library draws on top.

They are set separately because they can rightly disagree: a dark basemap on
a machine set to light mode still wants dark controls.

## Built-in basemaps

`styles.light()` and `styles.dark()` build a complete style for you. Point
one at a source of vector tiles and pass it as the map's `style`:

```ts
import { styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [34.02, -118.47],
  zoom: 14,
  theme: 'dark',
  style: styles.dark({ url: 'https://tiles.openfreemap.org/planet' }),
})
```

They are functions, not constants, because ts-maps ships no tile service: a
style only means something once it is pointed at a source. What they save you
is the part worth not writing by hand: the layer order, the zoom ramps, and
a palette checked against data drawn over it. Light and dark share one set of
layers and differ only in their palettes, so the two cannot drift apart.

Both draw, from the bottom: ground, land cover and land use, water, roads
with their casings, 3D buildings from zoom 14 (they stand up as you
[tilt the map](./3d.md#pitch)), boundaries, then road names, points of
interest, water names and place names. The layer ids are `background`,
`landcover`, `landuse`, `water`, `road-casing`, `road-minor`, `road-major`,
`building`, `boundary`, `road-label`, `poi`, `water-label`, `place-minor` and
`place-label`, for `setPaintProperty` and friends.

| Option | Default | |
| --- | --- | --- |
| `url` | — | A TileJSON to read the tiles from. This or `tiles`. |
| `tiles` | — | Tile URL template(s) with `{z}/{x}/{y}`. This or `url`. |
| `attribution` | from the TileJSON | The credit the tile service asks for. |
| `minzoom`, `maxzoom` | from the TileJSON; `0`, `14` with `tiles` | The zooms the service has tiles for. Past `maxzoom` the last level is overzoomed. |
| `tileSize` | `512` vector, `256` raster | |
| `mode` | `'vector'` | `'raster'` wraps image tiles in a one-layer style instead. |
| `emphasis` | `'explore'` | `'driving'` is Apple's Driving map. See [below](#satellite-hybrid-and-driving). |
| `sourceLayers` | OpenMapTiles names | Layer names for tiles on another schema. |
| `palette` | — | Colours to change. |
| `fonts` | — | Font stacks for the labels. |
| `glyphs`, `sprite` | — | A glyph server and sprite sheet, as in any style. |
| `offlineCache` | `false` | Read tiles through the offline cache. |
| `name` | `'ts-maps light'` / `'ts-maps dark'` | The style's name. |

### Choosing a source

The styles read the [OpenMapTiles](https://openmaptiles.org/schema/) schema,
which is what the public services publish. A keyless one is
[OpenFreeMap](https://openfreemap.org). It rebuilds its tiles often and puts
the build in the tile URL, so the URL is published through a TileJSON
instead of being fixed. `url` names it, as a Mapbox or MapLibre style names a
source's:

```ts
map.setStyle(styles.dark({ url: 'https://tiles.openfreemap.org/planet' }))

map.on('style.load', () => {
  // The style is in: add your own sources and layers.
})
```

The map reads the TileJSON when the style is set and takes the tiles, zoom
range and attribution from it; what you pass yourself wins. Any style whose
sources have a `url` loads the same way, and `style.load` fires once they
have all been read.

Check what attribution each service requires. It is a licence condition, not
a courtesy, and the attribution control shows it for you.

`resolveTileJSON` does that fetch with what a real page needs around it:
each source raced against a timeout (6 s by default), the next tried when one
fails, and the answer kept in `sessionStorage` so only the first page of a
visit waits. It resolves to `null` when nothing answers, which is the cue for
a raster fallback:

```ts
import { resolveTileJSON, styles } from 'ts-maps'

const found = await resolveTileJSON([
  'https://tiles.example.com/tiles.json', // your own, first
  'https://tiles.openfreemap.org/planet',
])
map.setStyle(found
  ? styles.light({ tiles: found.tiles, maxzoom: found.maxzoom, attribution: found.attribution })
  : styles.light({ mode: 'raster', tiles: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '© CARTO © OpenStreetMap contributors' }))
```

For tiles on a different schema, rename the layers rather than fork the
style. The keys are `water`, `landcover`, `landuse`, `building`,
`transportation`, `transportationName`, `boundary`, `place`, `waterName` and
`poi`:

```ts
styles.dark({
  tiles: 'https://tiles.example.com/{z}/{x}/{y}.pbf',
  sourceLayers: { transportation: 'road', transportationName: 'road_label' },
})
```

For a service that only publishes rendered images, `mode: 'raster'` wraps
them in a one-layer style. None of the palette applies then: the colours are
baked into the pictures. [Self-hosted tiles](./tile-server.md) covers serving
your own.

### Adjusting the palette

Change single colours without rebuilding the style:

```ts
styles.dark({
  url: 'https://tiles.openfreemap.org/planet',
  palette: { water: '#0b1f38', roadMajor: '#4a5160' },
})
```

The keys are `background`, `land`, `green` (parks and woods), `water`,
`roadMajor`, `roadMinor`, `roadCasing`, `buildings`, `boundary`, `label`,
`labelHalo`, `labelMuted`, `labelMinor` and `waterLabel`. The full palettes
are exported as `styles.LIGHT` and `styles.DARK`.

### Fonts and offline tiles

Labels use three faces: `regular` for street and POI names, `semibold` for
places, `italic` for water. Give any of them your app's own font stack; a
face left out keeps the default:

```ts
styles.light({
  url: 'https://tiles.openfreemap.org/planet',
  fonts: { regular: ['Geist Medium'], semibold: ['Geist Semibold'] },
})
```

`offlineCache: true` reads the basemap's tiles through the shared offline
cache, so a page that saved an area draws it with no connection. See
[Offline maps](./offline.md).

### Satellite, hybrid and Driving

Apple's other map types are built the same way:

```ts
const url = 'https://tiles.openfreemap.org/planet'

styles.satellite() // imagery alone
styles.hybrid({ url }) // imagery, with the basemap's roads and names over it
styles.light({ url, emphasis: 'driving' }) // roads first
styles.transit({ url }) // rail and tram lines in colour, stations named
```

- **Driving** makes roads wider, draws major roads in amber, and shows only
  the places a driver stops at: fuel, charging, parking, car washes and
  repairs, fast food and toilets.
- **Transit** quietens the streets and draws rail, subway, light rail and tram
  lines in a colour per kind (`styles.TRANSIT_COLORS`), with stations named.
  Pass `theme: 'dark'` for the dark version.
- **Satellite** and **hybrid** draw imagery from a raster tile service. Esri
  World Imagery is the default because it needs no key; check its terms for
  your use, or pass your own with its credit:
  `styles.hybrid({ url, imagery: 'https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=…', imageryAttribution: '© MapTiler © Maxar' })`.

A downloaded map keeps the imagery too, since it is a tile layer like any
other. The [map type picker](./map-types.md) puts all four in one control.

### Points of interest

The built-in styles show points of interest as Apple Maps does: a round
badge in the category's colour with a white glyph, and the name beside it in
the same colour, a deeper shade on the light map and a lighter one on the
dark. Food is orange, shopping gold, parks green, transit blue, health red,
and so on across fifteen categories, mapped from the OpenMapTiles `poi`
classes. They start at zoom 15, and more appear as you zoom in, most
important first. Bus and tram stops wait until zoom 18 so they do not bury
everything else downtown.

The badges ship with the library, with no sprite sheet needed, and are drawn
at high density the first time they are used. Any style can use them by
name:

```ts
map.addStyleLayer({
  id: 'my-cafes',
  type: 'symbol',
  source: 'places', // a GeoJSON source of your own
  layout: {
    'icon-image': 'tsmap-poi-cafe',
    'text-field': ['get', 'name'],
    'text-anchor': 'left',
    'text-offset': [1.15, 0],
  },
})
```

Names are `tsmap-poi-` plus one of `food`, `cafe`, `nightlife`, `shopping`,
`grocery`, `park`, `transit`, `health`, `education`, `lodging`, `culture`,
`sports`, `civic`, `worship`, `car` and `place`. A style's own sprite sheet
always wins over a built-in of the same name.

## Loading a style from a URL

`setStyle` takes a URL as well as an object:

```ts
map.setStyle('https://example.com/style.json')
```

The map keeps its current style until the document arrives, fires
`styledata` and `style.load` when it is applied, and `error` if the fetch
fails. A slow answer cannot overwrite a style set after it.

## Theming the chrome

```ts
const map = new TsMap('map', { theme: 'dark' })
map.setTheme('light')
map.getTheme() // 'light'
```

`theme` is `'light'` by default. `'auto'` follows the page: a theme the page
declares on `<html>` (`data-theme="dark"` or `"light"`, `data-color-mode`, or
a `dark` or `light` class, which is what most sites' theme toggles write),
and otherwise the system's `prefers-color-scheme`. It keeps following both
until the theme is set again or the map is removed. The map fires
`themechange` with `{ theme, dark }` whenever the chrome changes.

Under the hood this toggles one class, `tsmap-dark`, on the container. Every
colour the chrome draws with is a CSS custom property, so a page can give the
controls its own palette without fighting selector specificity:

```css
.tsmap-container {
  --tsmap-accent: #e0245e;
  --tsmap-surface: #14161a;
  --tsmap-fg: #f2f3f5;
}
```

The properties, all defined at the top of `ts-maps.css`:

| Property | Colours |
| --- | --- |
| `--tsmap-accent` | links and highlights |
| `--tsmap-surface`, `--tsmap-surface-hover` | control and panel backgrounds |
| `--tsmap-fg`, `--tsmap-fg-muted`, `--tsmap-fg-disabled` | text and icons |
| `--tsmap-divider`, `--tsmap-hairline` | lines between things |
| `--tsmap-scrim` | the see-through backing of the attribution, scale bar and zoom box |
| `--tsmap-scale-line` | the scale bar |
| `--tsmap-shadow`, `--tsmap-shadow-lg` | control and panel shadows |
| `--tsmap-tile-bg` | the ground behind tiles still loading |
| `--tsmap-action`, `--tsmap-action-bg` | buttons in search, place cards and turn-by-turn |
| `--tsmap-danger`, `--tsmap-saved` | warnings, and saved places |
| `--tsmap-nav-banner-bg`, `--tsmap-nav-card-bg`, `--tsmap-nav-card-fg`, `--tsmap-nav-card-muted`, `--tsmap-nav-option-bg` | turn-by-turn's banner and cards |

They live on the container rather than on `:root`, so two maps on one page
can carry different themes.

## Switching both together

A theme switch in an app usually moves the basemap, the chrome and the page
at once:

```ts
import { styles } from 'ts-maps'

const url = 'https://tiles.openfreemap.org/planet'

function setMode(mode: 'dark' | 'light'): void {
  map.setStyle(mode === 'dark' ? styles.dark({ url }) : styles.light({ url }))
  map.setTheme(mode)
  document.documentElement.dataset.theme = mode
}
```

The two styles share their sources and layer ids, so `setStyle` changes only
the colours: paint properties are updated in place and the tiles already
downloaded are repainted, not fetched again. See
[swapping styles](./style-spec.md#swapping-styles).

`playground/incident-map` in the repository has this wired up end to end.

## Density fields and terrain shading

`heatmap` and `hillshade` layers can be written in a style document, not only
made as layer objects:

```ts
const style = {
  version: 8,
  sources: {
    quakes: { type: 'geojson', data: '/quakes.geojson' },
    terrain: { type: 'raster-dem', tiles: ['https://example.com/dem/{z}/{x}/{y}.png'], encoding: 'terrarium' },
  },
  layers: [
    {
      id: 'shade',
      type: 'hillshade',
      source: 'terrain',
      paint: { 'hillshade-exaggeration': 0.6, 'hillshade-shadow-color': '#000044' },
    },
    {
      id: 'heat',
      type: 'heatmap',
      source: 'quakes',
      paint: {
        'heatmap-radius': 24,
        'heatmap-weight': ['get', 'mag'],
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0, 0, 255, 0)', 0.5, 'lime', 1, 'red'],
      },
    },
  ],
}
```

`heatmap-color` is sampled into a colour ramp, so any expression the spec can
write works. A heatmap over a GeoJSON source follows `setSourceData`, which
is what makes it usable for a live feed.

A `raster-dem` source with no `hillshade` layer over it draws nothing: its
pixels encode height, not colour. It is still there for `setTerrain` and for
elevation queries; see [Terrain](./terrain.md).

## Sprites and glyphs

A style's `sprite` and `glyphs` URLs are loaded and used.

### Sprites

```json
{ "sprite": "https://example.com/sprites/basic" }
```

Two files are read from that base: `basic.json`, an index of named icons, and
`basic.png`, their pixels. On a high-density screen the `@2x` pair is
preferred, falling back to the plain one when a style publishes only one.
The icons are then what `icon-image` names:

```ts
map.addStyleLayer({
  id: 'poi-icons',
  type: 'symbol',
  source: 'basemap',
  'source-layer': 'poi',
  layout: { 'icon-image': ['get', 'class'], 'icon-size': 1 },
})
```

Loading does not hold up the map: the basemap draws as soon as its tiles
arrive, and tiles are repainted when the sheet lands. The map fires
`spriteload`, or `error` if the sheet cannot be fetched. A missing sprite
costs icons, not the map.

#### Several sheets

`sprite` also takes an array, which is how a style layers its own icons over
a vendor's sheet without either knowing the other's names:

```json
{
  "sprite": [
    { "id": "base", "url": "https://example.com/sprites/basic" },
    { "id": "brand", "url": "https://example.com/sprites/ours" }
  ]
}
```

Icon names are prefixed with their sheet's id, so `icon-image` names an icon
as `"base:marker"` or `"brand:marker"`. Sheets load separately, so one slow
or missing sheet costs its own icons rather than everyone's.

#### SDF icons

An icon marked `"sdf": true` in the index stores the distance from the shape's
edge rather than the icon's own colours. Two things follow, and they are why
the format is worth the trouble: one grey shape can be drawn in any colour a
style asks for, and the edge stays sharp however far the icon is scaled.

```ts
map.addStyleLayer({
  id: 'pins',
  type: 'symbol',
  source: 'incidents',
  layout: { 'icon-image': 'pin', 'icon-size': 1.5 },
  paint: {
    'icon-color': ['match', ['get', 'category'], 'fire', '#ff5a36', '#3b82f6'],
    'icon-halo-color': '#0b0d10',
    'icon-halo-width': 2,
  },
})
```

`icon-color`, `icon-halo-color`, `icon-halo-width` and `icon-opacity` all take
expressions. A halo needs a width as well as a colour: the spec's default
colour is transparent black, so honouring the colour alone would ring every
icon in the style. Ordinary picture icons ignore `icon-color`; they carry
their own colours.

### Glyphs

```json
{ "glyphs": "https://example.com/fonts/{fontstack}/{range}.pbf" }
```

Labels are drawn with the browser's own text engine, which is sharper on a
canvas than a distance field and needs no network. The glyph server is for
the case local fonts cannot cover: a style whose typeface the viewer does not
have.

When a `text-font` names a font the viewer does not have and the style has a
`glyphs` URL, the map draws that text from the server's glyphs instead of
falling back to some other font. The ranges a label needs are fetched the
first time it is seen; the label waits for them rather than appearing in the
wrong typeface. Ranges are cached, a range already on its way is shared, and
each font is checked once rather than for every label.

The glyph source is there to preload from:

```ts
const glyphs = map.getGlyphSource() // undefined when the style has no `glyphs`
map.isFontAvailable(['Noto Sans Regular']) // false: the server is the answer
await glyphs?.loadForText('Noto Sans Regular', 'Santa Monica')
```

One limit: a `format` label with styling per section always uses local
fonts, since each section may name a different one.

### `text-font`

Style fonts carry weight and slant in the name, such as
`"Noto Sans Bold Italic"`, because the renderers they were written for look
them up on a glyph server. ts-maps splits those words off and applies them as
CSS font weight and style, with the family falling back to the system font,
so a style naming a font the viewer lacks still draws in something sensible.
