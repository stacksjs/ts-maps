# Geometry

Coordinates, bounds, and the maths that works on them. Everything here is
exported from `ts-maps`. Most of it is also in the smaller `ts-maps/geo`
(geographic) and `ts-maps/geometry` (pixel) entry points.

There are two kinds of coordinate:

- **Geographic**: `LatLng` and `LatLngBounds`, in degrees. The map's own API
  is `[lat, lng]`.
- **Pixel**: `Point` and `Bounds`, in screen or world pixels.

The area, distance and polygon functions further down take GeoJSON-style
`[lng, lat]` positions instead, so they can be fed GeoJSON coordinates as they
are.

## `LatLng`

| | |
| - | - |
| `new LatLng(lat, lng, alt?)` | Also takes `[lat, lng]`, `[lat, lng, alt]`, or `{ lat, lng }` (or `lon`). |
| `toLatLng(value)` | The same, as a function. Returns a `LatLng` given one unchanged. |
| `.lat`, `.lng`, `.alt` | |
| `.equals(other, maxMargin?)` | Equal within `maxMargin` degrees. |
| `.distanceTo(other)` | Metres along the great circle. |
| `.wrap()` | Longitude moved into `[-180, 180]`. |
| `.toBounds(metres)` | A square `LatLngBounds` of that size, centred here. |
| `.clone()`, `.toString(precision?)` | |

```ts
const a = new LatLng(51.5074, -0.1278)
a.distanceTo([48.8566, 2.3522]) // ≈ 343,500
```

## `LatLngBounds`

| | |
| - | - |
| `new LatLngBounds(southWest, northEast)` | Or one array of points: `new LatLngBounds([[40.7, -74.0], [40.8, -73.9]])`. |
| `toLatLngBounds(value)` | The same, as a function. |
| `.extend(latlngOrBounds)` | Grow to include it. Changes this bounds. |
| `.pad(ratio)` | A copy grown by `ratio` of its size on each side. |
| `.getCenter()` | |
| `.getSouthWest()`, `.getNorthEast()`, `.getNorthWest()`, `.getSouthEast()` | Corners, as `LatLng`. |
| `.getWest()`, `.getSouth()`, `.getEast()`, `.getNorth()` | Edges, as numbers. |
| `.contains(latlngOrBounds)` | |
| `.intersects(bounds)`, `.overlaps(bounds)` | `overlaps` needs a shared area; touching is not enough. |
| `.equals(bounds, maxMargin?)` | |
| `.isValid()` | Whether it has corners yet. An empty `new LatLngBounds()` is not valid. |
| `.toBBoxString()` | `'west,south,east,north'`. |

```ts
const bounds = new LatLngBounds()
for (const stop of stops)
  bounds.extend([stop.lat, stop.lng])
map.fitBounds(bounds, { padding: [40, 40] })
```

## `Point`

| | |
| - | - |
| `new Point(x, y, round?)` | Also takes `[x, y]` or `{ x, y }`. With `round`, both are rounded. |
| `toPoint(value)` | The same, as a function. |
| `.add(p)`, `.subtract(p)`, `.multiplyBy(n)`, `.divideBy(n)` | Return a new point. |
| `.scaleBy(p)`, `.unscaleBy(p)` | Multiply or divide component by component. |
| `.round()`, `.floor()`, `.ceil()`, `.trunc()` | |
| `.distanceTo(p)` | Straight-line distance. |
| `.equals(p)` | |
| `.contains(p)` | Whether `p`'s components are each no larger, in absolute value. |
| `.clone()`, `.toString()` | |

## `Bounds`

A rectangle in pixels.

| | |
| - | - |
| `new Bounds(a, b)` | Two corners in any order, or one array of points. |
| `toBounds(value)` | The same, as a function. |
| `.min`, `.max` | Top-left and bottom-right. |
| `.extend(pointOrBounds)` | Changes this bounds. |
| `.pad(ratio)` | A grown copy. |
| `.getCenter(round?)`, `.getSize()` | |
| `.getTopLeft()`, `.getTopRight()`, `.getBottomLeft()`, `.getBottomRight()` | |
| `.contains(pointOrBounds)`, `.intersects(bounds)`, `.overlaps(bounds)`, `.equals(bounds)`, `.isValid()` | |

## `Transformation`

`new Transformation(a, b, c, d)` maps a point to `(a·x + b, c·y + d)`, times
an optional scale. Projections use it to turn projected metres into pixels.

| | |
| - | - |
| `.transform(point, scale?)` | |
| `.untransform(point, scale?)` | The inverse. |
| `toTransformation(a, b, c, d)` | Also takes `[a, b, c, d]`. |

## Lines and polygons in pixels

`LineUtil` and `PolyUtil` are namespaces of functions over `Point` arrays. The
vector layers use them to simplify and clip what they draw.

| | |
| - | - |
| `LineUtil.simplify(points, tolerance)` | Douglas–Peucker simplification. |
| `LineUtil.pointToSegmentDistance(p, a, b)` | |
| `LineUtil.closestPointOnSegment(p, a, b)` | |
| `LineUtil.clipSegment(a, b, bounds)` | Cohen–Sutherland clipping: the clipped pair, or `false`. |
| `LineUtil.polylineCenter(latlngs, crs)` | The midpoint along a line. |
| `PolyUtil.clipPolygon(points, bounds)` | Sutherland–Hodgman clipping. |
| `PolyUtil.polygonCenter(latlngs, crs)` | The area-weighted centre. |

## Area and distance

On the sphere, with positions as `[lng, lat]`.

| | |
| - | - |
| `haversine(a, b)` | Metres between two positions. |
| `ringArea(ring)` | Square metres, positive when the ring runs counter-clockwise. |
| `polygonArea(rings)`, `multiPolygonArea(polygons)` | Square metres, holes taken out. |
| `ringPerimeter(ring, closed = true)` | Metres. |
| `formatArea(m², { units?, locale? })` | `'850 m²'`, `'2.4 ha'`, `'1.3 km²'`; or ft², acres and mi² with `units: 'imperial'`. |
| `formatDistance(m, { units?, locale? })` | `'420 m'`, `'3.2 km'`; or ft and mi. |
| `EARTH_RADIUS` | 6,371,008.8 m. |

```ts
import { formatArea, polygonArea } from 'ts-maps'

const park = feature.geometry.coordinates // a GeoJSON Polygon
formatArea(polygonArea(park)) // '3.41 km²'
```

## Polygon operations

Boolean operations on multipolygons (`[lng, lat]` positions, nested as in a
GeoJSON `MultiPolygon`). They handle shared edges and holes.

| | |
| - | - |
| `union(a, b)` | Covered by either. |
| `intersection(a, b)` | Covered by both. |
| `difference(a, b)` | Covered by `a` and not `b`. |
| `xor(a, b)` | Covered by one but not both. |
| `intersects(a, b)` | Whether they overlap at all. |
| `contains(multiPolygon, position)` | Whether a position is inside. |

Rings drawn by hand or by a GPS trace need checking first:

| | |
| - | - |
| `validateRing(ring)` | Throws `InvalidGeometryError` for a ring that cannot be used: fewer than four positions, a non-finite number, a latitude past ±90. |
| `unwrapRing(ring)` | Make a ring that crosses the antimeridian continuous. |
| `selfIntersects(ring)` | |
| `splitSelfIntersecting(ring)` | Split a figure of eight into its loops. |
| `resolveSelfIntersections(ring)` | The loops, as a multipolygon. |
| `prepareClaim(ring)` | All of the above in order: validate, unwrap, resolve. |

## Spatial index and triangulation

| | |
| - | - |
| `new RTree<T>({ maxEntries?, minEntries? })` | An R-tree of `[minX, minY, maxX, maxY]` boxes. `insert(bbox, data)`, `load(entries)` (bulk), `remove(bbox, data)`, `search(bbox)`, `searchPoint(x, y)`, `all()`, `size()`, `clear()`. |
| `earcut(vertices, holes?, dim = 2)` | Triangulate a polygon given as a flat coordinate array. Returns vertex indices, three per triangle. |
| `flatten(rings)` | Rings to `{ vertices, holes, dimensions }` for `earcut`. |
| `deviation(vertices, holes, dim, triangles)` | How far a triangulation's area is from the polygon's; `0` is exact. |

## Coordinate reference systems

The map projects with a `CRS`. The default is `EPSG3857`, Web Mercator.

| | |
| - | - |
| `EPSG3857` | Web Mercator. The map default. |
| `EPSG3395` | Mercator on the ellipsoid. |
| `EPSG4326` | Plain latitude and longitude. |
| `SimpleCRS` | Flat x/y, for images and game boards. |
| `Projection` | The projections they are built from: `SphericalMercator`, `Mercator`, `LonLat`, and `Globe`. |

```ts
const map = new Map('map', { crs: SimpleCRS, center: [0, 0], zoom: 0 })
```
