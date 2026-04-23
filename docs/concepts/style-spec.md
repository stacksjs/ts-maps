# Style spec

ts-maps understands a subset of the Mapbox GL Style Specification. A _style document_ is a plain JSON object describing sources, layers and layout/paint properties. You can swap the entire document at runtime, diff against the previous one, and mutate individual properties with typed setters.

## Shape of a style document

```json
{
  "version": 8,
  "sources": {
    "osm":   { "type": "raster", "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], "tileSize": 256 },
    "roads": { "type": "vector", "url": "https://tiles.example.com/roads/{z}/{x}/{y}.pbf" }
  },
  "layers": [
    { "id": "basemap", "type": "raster", "source": "osm" },
    { "id": "roads",   "type": "line",   "source": "roads", "source-layer": "roads",
      "paint": { "line-color": "#6b7280", "line-width": 1.25 } }
  ]
}
```

## Applying a style

```ts
map.setStyle(styleDoc)           // full swap with automatic diff
map.addSource('pois', { /* ... */ })
map.addStyleLayer({ id: 'pois-dots', type: 'circle', source: 'pois', paint: { 'circle-radius': 3 } })
map.setPaintProperty('roads', 'line-color', '#0ea5e9')
map.setLayoutProperty('roads', 'visibility', 'none')
map.setFilter('pois-dots', ['==', ['get', 'kind'], 'cafe'])
map.removeStyleLayer('pois-dots')
map.removeSource('pois')
```

## Expressions

Most paint and layout properties accept _expressions_ — JSON arrays whose first element is an operator name. Expressions are compiled once and evaluated per-feature on the render path.

```jsonc
// data-driven fill by feature property
"fill-color": ["match", ["get", "class"],
  "water", "#0ea5e9",
  "park",  "#65a30d",
  /* other */ "#e5e7eb"
]

// zoom-interpolated line width
"line-width": [
  "interpolate", ["linear"], ["zoom"],
  10, 0.5,
  14, 1.5,
  18, 4
]
```

See the [expression operator reference](../api/expressions.md) for the full list.

## Diffing

Calling `setStyle(next)` does _not_ rebuild the world. It runs a structural diff between the old and new documents and emits the minimum sequence of add/remove/update commands. Layer ordering, source definitions, paint and layout properties, filters, and root-level keys are all diffed.

## Validation

`validateStyle(doc)` returns a list of structured errors. Useful in development; skip in production for speed.

```ts
import { validateStyle } from 'ts-maps/style-spec'

const errors = validateStyle(myStyle)
if (errors.length)
  console.warn(errors)
```
