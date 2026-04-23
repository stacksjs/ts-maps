# `style-spec/` — in-house Mapbox-style JSON schema

TypeScript types, a runtime validator, and a shallow diff engine for a
subset of the [Mapbox GL Style Specification][spec] (version **8**).

## What's in the box

- `types.ts` — every source, layer, paint, and layout type in the subset,

  expressed as idiomatic TypeScript. Literal values and `ExpressionSpecification`
  (any array) are both accepted wherever the spec says a property is data-driven.

- `schema.ts` — the same information as machine-readable tables

  (`paintPropertySchemas`, `layoutPropertySchemas`) that drive the validator
  and the expression interpolator.

- `validate.ts` — collect-all-errors validator. No short-circuiting, so the

  full list of problems comes back in a single pass.

- `diff.ts` — structural `diffStyles(prev, next)` → minimal command stream.

  Used by `map.setStyle(next, { diff: true })`.

## Scope

Supported sources: `vector`, `raster`, `raster-dem`, `geojson`.

Supported layer types: `background`, `fill`, `fill-extrusion`, `line`,
`circle`, `symbol`, `raster`, `heatmap`, `hillshade`.

Expressions (anything whose first element is an operator name like
`['interpolate', ...]`) are **accepted unconditionally** at this layer;
the authoritative expression validator lives under `./expressions/`.

## Usage

```ts
import { validateStyle, diffStyles, type Style } from 'ts-maps/core-map/style-spec'

const style: unknown = JSON.parse(await fetch('/style.json').then(r => r.text()))
const errors = validateStyle(style)
if (errors.length > 0) {
  for (const e of errors)
    console.warn(`[${(e.path || []).join('.')}] ${e.message}`)
}

// Later, when the user edits a layer:
const diff = diffStyles(currentStyle, nextStyle)
for (const cmd of diff.commands) {
  // cmd.command is one of 'addLayer' | 'removeLayer' | 'setPaintProperty' | ...
  // apply to the live map
}
```

## Spec version

We target Mapbox Style Spec **v8**. Styles with any other `version` are
rejected by `validateStyle`.

## Acknowledgement

This is an independent TypeScript implementation of a subset of the
Mapbox GL Style Specification. No upstream code is copied. See the
upstream reference at
[mapbox/mapbox-gl-style-spec][upstream] (BSD-3-Clause) for the complete
spec and canonical wording.

[spec]: https://docs.mapbox.com/style-spec/reference/root/
[upstream]: https://github.com/mapbox/mapbox-gl-style-spec
