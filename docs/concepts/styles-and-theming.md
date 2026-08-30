# Styles & theming

Two separate things wear the word "theme" on a map, and it helps to keep them
apart:

- the **basemap style** — the colours of land, water, roads and labels, which
  comes from a `StyleSpec`;
- the **map chrome** — the controls, popups, tooltips, scale bar and attribution
  the library draws on top.

They are set independently, because they can legitimately disagree: a dark
basemap on a machine set to light mode still wants dark controls.

## Built-in basemap styles

`styles.dark()` and `styles.light()` build a complete `StyleSpec` for you:

```ts
import { styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [34.02, -118.47],
  zoom: 14,
  theme: 'dark',
  style: styles.dark({
    tiles: 'https://example.com/tiles/{z}/{x}/{y}.pbf',
    attribution: '© OpenMapTiles © OpenStreetMap contributors',
  }),
})
```

They are **functions, not constants**, because ts-maps ships no tile service: a
style only means something once it is pointed at a source. What the presets save
you is the part worth not hand-writing — the layer order, the zoom ramps, and a
palette that has been checked against overlaid data.

Light and dark share one layer skeleton and differ only in a palette table, so
the two cannot drift apart as the style grows.

### Choosing a source

The presets default to the **OpenMapTiles** schema, which is what the public
services publish. A keyless option is [OpenFreeMap](https://openfreemap.org),
whose current tile URL is published through a TileJSON:

```ts
const tilejson = await fetch('https://tiles.openfreemap.org/planet').then(r => r.json())
map.setStyle(styles.dark({
  tiles: tilejson.tiles[0],
  attribution: '© OpenFreeMap © OpenStreetMap',
}))
```

Check the attribution each service requires — it is a licence condition, not a
courtesy, and `AttributionControl` renders it for you.

For a source on a different schema, remap the layer names rather than forking
the style:

```ts
styles.dark({
  tiles,
  sourceLayers: { transportation: 'road', transportationName: 'road_label' },
})
```

For a service that only publishes rendered images, `mode: 'raster'` wraps them
in a one-layer style. None of the palette applies in that mode — the colours are
baked into the pictures.

### Adjusting the palette

Override individual entries without rebuilding the style:

```ts
styles.dark({ tiles, palette: { water: '#0b1f38', roadMajor: '#4a5160' } })
```

## Loading a style from a URL

`setStyle` accepts a URL as well as an object:

```ts
map.setStyle('https://example.com/style.json')
```

The map keeps its current style until the document arrives, fires `styledata`
when it is applied, and `error` if the fetch fails. Out-of-order responses are
discarded, so a slow first request cannot overwrite a later style.

## Theming the chrome

```ts
const map = new TsMap('map', { theme: 'dark' })
map.setTheme('light')
map.getTheme() // 'light'
```

`'auto'` follows the operating system's `prefers-color-scheme` and keeps
following it until the theme is changed again or the map is removed.

Under the hood this toggles one class on the container. Every colour the chrome
draws with resolves through CSS custom properties, so a host page can retheme
the controls to its own palette without fighting selector specificity:

```css
.tsmap-container {
  --tsmap-accent: #e0245e;
  --tsmap-surface: #14161a;
  --tsmap-fg: #f2f3f5;
}
```

The full set is defined at the top of `ts-maps.css`: `--tsmap-accent`,
`--tsmap-surface`, `--tsmap-surface-hover`, `--tsmap-fg`, `--tsmap-fg-muted`,
`--tsmap-fg-disabled`, `--tsmap-divider`, `--tsmap-scrim`, `--tsmap-hairline`,
`--tsmap-scale-line`, `--tsmap-shadow`, `--tsmap-shadow-lg` and
`--tsmap-tile-bg`.

Because they live on the container rather than on `:root`, two maps on one page
can carry different themes.

## Switching both together

A theme switch in a real application usually moves all three surfaces at once:

```ts
function setMode(mode: 'dark' | 'light') {
  map.setStyle(mode === 'dark' ? styles.dark({ tiles }) : styles.light({ tiles }))
  map.setTheme(mode)
  document.body.dataset.theme = mode
}
```

Swapping between two styles that share source and layer ids takes the
incremental path: paint properties are updated in place and the tiles already
downloaded are re-rasterised, rather than being thrown away and fetched again.

See `playground/incident-map` for this wired up end to end.

## Sprites and glyphs

A style's `sprite` and `glyphs` URLs are now loaded rather than merely
validated.

### Sprites

```json
{ "sprite": "https://example.com/sprites/basic" }
```

Two files are derived from that base — `basic.json` (an index of named icons)
and `basic.png` (their pixels) — and on a retina display the `@2x` pair is
preferred, falling back to 1x when a style publishes only one density. The
icons land in each vector layer's icon atlas, which is what makes `icon-image`
draw something:

```js
{ id: 'poi', type: 'symbol', source: 'basemap', 'source-layer': 'poi',
  layout: { 'icon-image': ['get', 'class'], 'icon-size': 1 } }
```

Loading is asynchronous and `setStyle` does not wait for it: the basemap draws
as soon as its tiles arrive, and tiles are repainted when the sheet lands. The
map fires `spriteload`, or `error` if the sheet cannot be fetched — a missing
sprite costs icons, not the map.

#### Several sheets

`sprite` also takes an array, which is how a style layers its own icons over a
vendor sheet without either having to know the other's names:

```json
{
  "sprite": [
    { "id": "base", "url": "https://example.com/sprites/basic" },
    { "id": "brand", "url": "https://example.com/sprites/ours" }
  ]
}
```

Ids are namespaced by sheet, so `icon-image` names an icon as
`"base:marker"` or `"brand:marker"`. Sheets load independently and land as
they arrive, so one slow or missing sheet costs its own icons rather than
everyone's.

#### SDF icons

An entry marked `"sdf": true` stores distance from the shape's edge in its
alpha channel instead of the icon's own colours. Two things follow, and they
are why the format is worth the trouble: one grey shape can be drawn in any
colour a style asks for, and the edge is recovered by thresholding rather than
resampled, so it stays sharp however far the icon is scaled.

```js
{ id: 'pins', type: 'symbol', source: 'incidents',
  layout: { 'icon-image': 'pin', 'icon-size': 24 },
  paint: {
    'icon-color': ['match', ['get', 'category'], 'fire', '#ff5a36', '#3b82f6'],
    'icon-halo-color': '#0b0d10',
    'icon-halo-width': 2,
  } }
```

`icon-color`, `icon-halo-color`, `icon-halo-width` and `icon-opacity` are all
honoured, and all take expressions. A halo needs a width as well as a colour —
the spec's default colour is transparent black, so honouring the colour alone
would ring every icon in the style. Ordinary picture sprites ignore
`icon-color`; they carry their own colours.

### Glyphs

```json
{ "glyphs": "https://example.com/fonts/{fontstack}/{range}.pbf" }
```

Labels are drawn with the browser's own text engine, which is sharper on a
canvas than resampling a distance field and needs no network — so this is not
how text normally reaches the screen. The glyph server answers the case local
fonts cannot: a style whose typeface the viewer does not have installed.

```ts
const glyphs = map.getGlyphSource()
map.isFontAvailable(['Noto Sans Regular']) // false → the server is the answer
await glyphs?.loadForText('Noto Sans Regular', 'Santa Monica')
```

Ranges are fetched on demand and cached, and a range already in flight is
shared rather than fetched twice — a font stack is 65,536 code points and a map
shows a handful of blocks.

### `text-font`

`text-font` is honoured. Style-spec font names carry weight and slant in the
name — `"Noto Sans Bold Italic"` — because the SDK they were written for looks
them up in a glyph server; those modifiers are split out and applied as CSS
font properties, with the family stack falling back to the system font so a
style naming an unavailable font still renders in something sensible.
