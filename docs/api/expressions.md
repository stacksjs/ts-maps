# Expression operators

Expressions are JSON arrays where the first element names an operator and the rest are arguments. Compile once, evaluate per-feature on the render path. Compatible with a subset of the Mapbox GL Style Spec expression language.

```ts
import { compile, evaluate } from 'ts-maps/style-spec'

const expr = ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2]
const compiled = compile(expr, 'number', [])
const width = compiled.evaluate({ zoom: 11, properties: {} })  // → 1.25

// One-shot convenience (recompiles every call):
evaluate(['*', 2, 3], {})  // → 6
```

## Math

| Operator | Summary |
| -------- | ------- |
| `+`, `-`, `*`, `/`, `%`, `^` | Arithmetic; variadic where it makes sense. |
| `min`, `max` | Variadic min / max. |
| `abs`, `floor`, `ceil`, `round` | Single-number utilities. |
| `sqrt`, `ln`, `log10`, `log2` | Single-number utilities (domain-checked). |
| `sin`, `cos`, `tan` | Trigonometry, in radians. |
| `asin`, `acos`, `atan` | Inverses; `asin`/`acos` are domain-checked. |
| `e`, `pi` | Constants: `["e"]`, `["pi"]`. |
| `rand` | `["rand"]` or `["rand", min, max]`. |

## Logical & comparison

| Operator | Summary |
| -------- | ------- |
| `!`, `==`, `!=`, `<`, `<=`, `>`, `>=` | Boolean + comparison. |
| `all`, `any`, `none` | Short-circuit combinators. |
| `case` | `["case", condA, valA, condB, valB, ..., fallback]`. |
| `match` | `["match", input, label, value, ..., fallback]`. Labels may be scalars or arrays. |
| `coalesce` | First non-null argument. |
| `in`, `!in` | Membership test. |
| `has`, `!has` | Property presence test. |

## Interpolation & step

| Operator | Summary |
| -------- | ------- |
| `interpolate` | `["interpolate", type, input, stop, value, ...]`. Type is `["linear"]`, `["exponential", base]`, or `["cubic-bezier", x1, y1, x2, y2]`. |
| `step` | `["step", input, first, stop1, value1, ...]` — piecewise-constant interpolation. |

## Lookups & feature context

| Operator | Summary |
| -------- | ------- |
| `literal` | Wrap a literal array / object so it isn't parsed as an expression. |
| `get` | `["get", name]` — property from the current feature, or `["get", name, obj]` from a given object. |
| `has` | Whether a property is defined. |
| `at` | `["at", index, array]`. |
| `length` | String / array length. |
| `properties` | The feature's property bag. |
| `geometry-type` | Current feature's geometry type. |
| `id` | Current feature's id. |
| `zoom` | Current zoom (valid only where the host supports zoom expressions). |
| `line-progress` | 0..1 progress along a line feature (for `line-gradient`). |
| `feature-state` | `["feature-state", key]` — data attached via `map.setFeatureState`. |

## Strings

| Operator | Summary |
| -------- | ------- |
| `concat` | Variadic string concatenation. |
| `downcase`, `upcase` | Locale-agnostic case mapping. |
| `index-of` | `["index-of", needle, haystack, start?]` — position in a string or array, or `-1`. |
| `slice` | `["slice", input, start, end?]` — a sub-range of a string or array. |
| `number-format` | `["number-format", n, { locale, currency, min-fraction-digits, max-fraction-digits }]`. |
| `format` | Sectioned text: `["format", "M", { "font-scale": 1.4 }, "5", { "font-scale": 0.8 }]`. Each section may carry `font-scale`, `text-font` and `text-color`, and those may themselves be expressions. The label places as one box on one baseline; sections falling back to the layer's own text properties for anything they don't set. Reads as the concatenation anywhere a plain string is expected. |
| `resolved-locale` | Returns a BCP-47 tag for a collator. |

## Bindings

| Operator | Summary |
| -------- | ------- |
| `let` | `["let", name, value, …, body]` — bind names for the body. |
| `var` | `["var", name]` — read one back. An unbound name is an error, not `null`. |

Bind a sub-expression you would otherwise repeat:

```js
['let', 'p', ['get', 'population'],
  ['interpolate', ['linear'], ['var', 'p'], 0, 4, 1e6, 20]]
```

## Geometry

| Operator | Summary |
| -------- | ------- |
| `within` | `["within", polygon]` — is every vertex of the feature inside this GeoJSON Polygon or MultiPolygon? |
| `distance` | `["distance", geometry]` — metres from the feature to the nearest vertex of the given geometry. |

Both need the feature's coordinates, which are supplied when a **filter** is
evaluated:

```js
{ filter: ['within', downtownPolygon] }
{ filter: ['<', ['distance', { type: 'Point', coordinates: [-118.47, 34.02] }], 500] }
```

Paint and layout properties are evaluated without geometry, where `within`
returns `false` and `distance` returns `Infinity` — the answers that leave a
feature unstyled rather than styling it wrongly. Projecting a feature back to
lng/lat is not free, so it happens lazily and only when one of these operators
actually asks.

## Type conversions

| Operator | Summary |
| -------- | ------- |
| `to-string`, `to-number`, `to-boolean` | Coerce a value to the named type. |
| `to-color`, `to-rgba` | Parse a color literal or convert an `[r, g, b, a]` tuple. |

## Legacy filter compatibility

`convertLegacyFilter(filter)` rewrites old-style filters (`["==", "type", "Polygon"]`) into modern expression form (`["==", ["get", "type"], "Polygon"]`). Handy for migrating existing style documents.

## Filters on `VectorTileMapLayer`

Style-layer filters on `VectorTileMapLayer` use a hybrid evaluator for speed:

- **Legacy MVT forms** (`==` / `!=` / `<` / `<=` / `>` / `>=` / `in` / `!in` / `has` / `!has` / `all` / `any` / `none`) with simple operands (literal or `['get', key]` / `['geometry-type']`) run through a zero-allocation inline evaluator.
- **Modern expressions** (`case`, `match`, `coalesce`, nested `['get']` on both sides, `feature-state`, etc.) compile via the expression engine the first time they're evaluated on a style layer. The compiled result is memoised so a filter seeing 50,000 features only compiles once.

```ts
vectorTileLayer({
  url: '…',
  layers: [{
    id: 'road-fast',
    type: 'line',
    sourceLayer: 'transportation',
    // Legacy form — fast path.
    filter: ['==', ['get', 'class'], 'motorway'],
    paint: { 'line-color': '#dc2626', 'line-width': 2 },
  }, {
    id: 'road-themed',
    type: 'line',
    sourceLayer: 'transportation',
    // Modern form — compiled once, reused per feature.
    filter: ['match', ['get', 'class'], ['primary', 'trunk'], true, false],
    paint: { 'line-color': '#6b7280' },
  }],
})
```

A filter that fails to compile (unknown operator, bad shape) falls through as pass-through rather than suppressing every feature — matching Mapbox GL JS behaviour.
