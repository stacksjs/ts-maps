# Geometry primitives

All coordinate types are plain classes with value semantics. Factory helpers (`toPoint`, `toBounds`, `toLatLng`, `toLatLngBounds`) accept arrays, plain objects, or another instance and return a normalized value.

## `Point`

2D pixel vector.

| Signature | Summary |
| --------- | ------- |
| `new Point(x, y, round?)` | If `round`, coordinates are `Math.round`ed. |
| `.add(p)`, `.subtract(p)`, `.multiplyBy(n)`, `.divideBy(n)` | Immutable math; returns a new Point. |
| `.scaleBy(p)`, `.unscaleBy(p)` | Component-wise scaling. |
| `.round()`, `.floor()`, `.ceil()`, `.trunc()` | Rounded copies. |
| `.distanceTo(p)` | Euclidean distance. |
| `.equals(p)`, `.contains(p)` | Comparisons. |
| `toPoint(arg)` | Factory accepting `Point \| [x,y] \| {x,y}`. |

## `Bounds`

Axis-aligned pixel bounding box built from two `Point`s.

| Signature | Summary |
| --------- | ------- |
| `new Bounds(a, b)` | Top-left / bottom-right corners in any order. |
| `.extend(p)` | Grow to include a point. |
| `.getCenter()`, `.getSize()` | Derived geometry. |
| `.contains(p \| b)`, `.intersects(b)`, `.overlaps(b)` | Relational tests. |
| `toBounds(arg)` | Factory. |

## `LatLng`

WGS-84 geographic point.

| Signature | Summary |
| --------- | ------- |
| `new LatLng(lat, lng, alt?)` | Also accepts `[lat, lng]` or `{lat, lng}`. |
| `.equals(other, maxMargin?)` | Equality with tolerance. |
| `.distanceTo(other)` | Great-circle distance (metres). |
| `.wrap()` | Normalize longitude into [-180, 180]. |
| `.toBounds(sizeMeters)` | Square `LatLngBounds` centered here. |
| `toLatLng(arg)` | Factory. |

## `LatLngBounds`

Geographic bounding box.

| Signature | Summary |
| --------- | ------- |
| `new LatLngBounds(sw, ne)` | Two corners (array / object / `LatLng`). |
| `.extend(x)` | Grow to include a point or another bounds. |
| `.getCenter()`, `.getSouthWest()`, `.getNorthEast()`, `.getNorthWest()`, `.getSouthEast()` | Corners. |
| `.contains(x)`, `.intersects(b)`, `.overlaps(b)` | Relational tests. |
| `.pad(ratio)` | Scale around the center. |
| `.isValid()` | Whether corners have been set. |
| `toLatLngBounds(arg)` | Factory. |

## `Transformation`

Affine _(a · x + b, c · y + d)_ transform used by projections.

| Signature | Summary |
| --------- | ------- |
| `new Transformation(a, b, c, d)` | Coefficients. |
| `.transform(point, scale?)` | Forward transform. |
| `.untransform(point, scale?)` | Inverse transform. |
| `toTransformation(...args)` | Factory. |

## Utilities

| Function | Summary |
| -------- | ------- |
| `LineUtil.simplify(points, tolerance)` | Ramer–Douglas–Peucker simplification. |
| `LineUtil.clipSegment(a, b, bounds)` | Cohen–Sutherland line clipping. |
| `PolyUtil.clipPolygon(points, bounds)` | Sutherland–Hodgman polygon clipping. |
