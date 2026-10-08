# Expressions

An expression is a JSON array: an operator name, then its arguments. They are
the style spec's way to compute a value per feature or per zoom, and ts-maps
reads them wherever a style takes a value: paint and layout properties, and
filters.

```ts
map.setPaintProperty('roads', 'line-width',
  ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 4])

map.setFilter('roads', ['match', ['get', 'class'], ['motorway', 'trunk'], true, false])
```

The language is the Mapbox GL / MapLibre one. The operators below are the ones
ts-maps implements; [Not supported](#not-supported) lists the common ones it
does not.

## Evaluating one yourself

`ts-maps/style-spec` exports the compiler. Compile once, evaluate as often as
you like:

```ts
import { compileExpression, evaluateExpression } from 'ts-maps/style-spec'

const width = compileExpression(['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2], 'number')
width.evaluate({ zoom: 11 }) // 1.25

const label = compileExpression(['concat', ['get', 'name'], ' (', ['get', 'ref'], ')'], 'string')
label.evaluate({ zoom: 14, feature: { type: 2, properties: { name: 'High St', ref: 'A40' } } })
// 'High St (A40)'

// One-shot, recompiling each call: for tests and tools, not a render loop.
evaluateExpression(['*', 2, 3], { zoom: 0 }) // 6
```

`compileExpression(expr, expectedType?)` returns `{ evaluate(context),
returnType, dependsOnZoom, dependsOnFeature, dependsOnFeatureState }`. The
context is `{ zoom, feature?: { type, id?, properties }, featureState? }`, with
`type` 1 for points, 2 for lines and 3 for polygons. A malformed expression
throws `ExpressionError`. `validateExpression(expr)` and `isExpression(value)`
check without compiling.

## Data

| Operator | |
| -------- | - |
| `["get", key]` / `["get", key, object]` | A feature property, or a key of an object. |
| `["has", key]` / `["has", key, object]` | Whether the property is there. |
| `["!has", key]` | Whether it is not. |
| `["properties"]` | All of the feature's properties. |
| `["id"]` | The feature's id. |
| `["geometry-type"]` | `"Point"`, `"LineString"` or `"Polygon"`. |
| `["feature-state", key]` | State set with [`map.setFeatureState`](./TsMap.md#feature-state). |
| `["literal", value]` | An array or object taken as data, not as an expression. |
| `["at", index, array]` | An array item. |
| `["length", stringOrArray]` | |

## Camera and rendering

| Operator | |
| -------- | - |
| `["zoom"]` | The map's zoom. Use it as the input of a top-level `interpolate` or `step`. |
| `["line-progress"]` | 0 to 1 along a line, for `line-gradient`. |
| `["heatmap-density"]` | 0 to 1, for `heatmap-color`. |

## Decisions

| Operator | |
| -------- | - |
| `["case", cond, value, …, fallback]` | The value of the first true condition. |
| `["match", input, label, value, …, fallback]` | The value whose label equals `input`. A label may be a list: `["a", "b"]`. |
| `["coalesce", a, b, …]` | The first value that is not null. |
| `["==", a, b]`, `["!=", a, b]` | Strict equality: `1` does not equal `"1"`. |
| `["<", a, b]`, `["<=", …]`, `[">", …]`, `[">=", …]` | Numbers or strings. |
| `["!", bool]` | |
| `["all", …]`, `["any", …]`, `["none", …]` | And, or, neither. |
| `["in", needle, haystack]` | Whether an array holds `needle`, or a string contains it. |
| `["in", key, v1, v2, …]`, `["!in", key, v1, …]` | The legacy filter form: whether a property is one of the values. |

## Ramps

| Operator | |
| -------- | - |
| `["interpolate", type, input, stop, value, …]` | Blend between stops. `type` is `["linear"]`, `["exponential", base]` or `["cubic-bezier", x1, y1, x2, y2]`. Numbers and colours interpolate. |
| `["step", input, value0, stop1, value1, …]` | `value0` below the first stop, then each value from its stop on. |

```js
['interpolate', ['exponential', 1.5], ['zoom'], 10, 1, 18, 24]
['step', ['get', 'point_count'], '#51bbd6', 100, '#f1f075', 750, '#f28cb1']
```

## Maths

| Operator | |
| -------- | - |
| `+`, `*` | Any number of arguments. |
| `-` | Two arguments, or one to negate. |
| `/`, `%`, `^` | Two arguments. |
| `min`, `max` | Any number of arguments. |
| `abs`, `floor`, `ceil`, `round` | |
| `sqrt`, `ln`, `log10`, `log2` | Throw on a negative (or, for logs, zero) input. |
| `sin`, `cos`, `tan`, `asin`, `acos`, `atan` | Radians. |
| `["e"]`, `["pi"]` | Constants. |
| `["rand", min, max, seed?]` | A random number in `[min, max)`; with a `seed`, the same one each time. Not in the Mapbox spec. |

## Strings

| Operator | |
| -------- | - |
| `["concat", a, b, …]` | Joins values as strings. |
| `["upcase", s]`, `["downcase", s]` | |
| `["index-of", needle, haystack, start?]` | Position in a string or array, or `-1`. |
| `["slice", input, start, end?]` | Part of a string or array. |
| `["number-format", n, options]` | Options: `locale`, `currency`, `min-fraction-digits`, `max-fraction-digits`. |
| `["format", text, sectionOptions, …]` | Text in sections, each with its own `font-scale`, `text-font` and `text-color`. Where a plain string is wanted, it reads as the joined text. |
| `["resolved-locale"]` | Returns `"en"` for now. |

```js
['number-format', ['get', 'price'], { locale: 'de-DE', currency: 'EUR' }] // "12,00 €"
['format', ['get', 'name'], { 'font-scale': 1.2 }, '\n', {}, ['get', 'ele'], { 'font-scale': 0.8 }]
```

## Types

| Operator | |
| -------- | - |
| `["to-string", v]` | |
| `["to-number", v, fallback…]` | The first argument that converts. |
| `["to-boolean", v]` | |
| `["to-color", v, fallback…]` | The first argument that parses as a colour. |
| `["to-rgba", color]` | `[r, g, b, a]`, channels 0–255 and alpha 0–1. |

## Variables

| Operator | |
| -------- | - |
| `["let", name, value, …, body]` | Name values for use in `body`. |
| `["var", name]` | Read one back. An unbound name is an error. |

```js
['let', 'p', ['get', 'population'],
  ['interpolate', ['linear'], ['var', 'p'], 0, 4, 1e6, 20]]
```

## Geometry

| Operator | |
| -------- | - |
| `["within", polygon]` | Whether every vertex of the feature is inside a GeoJSON `Polygon` or `MultiPolygon`. |
| `["distance", geometry]` | Metres from the feature to a GeoJSON geometry, vertex to vertex. Exact for points; for lines and polygons, a little over. |

Both need the feature's coordinates, which are supplied when a filter is
evaluated:

```js
{ filter: ['within', downtownPolygon] }
{ filter: ['<', ['distance', { type: 'Point', coordinates: [-118.47, 34.02] }], 500] }
```

In paint and layout properties there are no coordinates to read, and `within`
returns `false` and `distance` `Infinity`.

## Filters

A layer's `filter` is an expression that returns a boolean. The older filter
syntax, which names properties by bare strings, works too:

```js
['==', 'class', 'motorway']           // legacy
['==', ['get', 'class'], 'motorway']  // expression
['==', '$type', 'Polygon']            // legacy; ['==', ['geometry-type'], 'Polygon']
```

`convertLegacyFilter(filter)` from `ts-maps/style-spec` rewrites a legacy
filter as an expression.

Vector tile layers evaluate simple filters — comparisons, `in`, `has`, `all`,
`any`, `none` over literals, `["get", key]` and `["geometry-type"]` — without
compiling them. Anything else is compiled the first time a layer sees it, and
the compiled form is reused for every feature after. A filter that fails to
compile lets every feature through rather than hiding them all.

## Not supported

These parts of the Mapbox spec are not implemented: the type assertions
`array`, `boolean`, `number`, `string` and `object`; `typeof`;
`interpolate-hcl` and `interpolate-lab`; `image`; `collator` and
`is-supported-script`; `accumulated`; `config` and `global-state`; `pitch`,
`distance-from-center` and `sky-radial-progress`.

An array whose first item is not a known operator is read as plain data, not
as an error. `['typeof', x]` evaluates to the array `['typeof', x]` itself, so
an unsupported operator shows up as a wrong value rather than a message. Where
a type assertion only guards a value, drop it:
`['boolean', ['feature-state', 'hover'], false]` becomes
`['coalesce', ['feature-state', 'hover'], false]`.
