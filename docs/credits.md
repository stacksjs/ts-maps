# Credits

ts-maps is an original codebase, but it stands on the shoulders of a few widely-used open-source projects. Each contributed ideas, algorithms, or an API shape that ts-maps adapted; none of their code is vendored.

## Leaflet

[Leaflet](https://leafletjs.com/), © Volodymyr Agafonkin and contributors, [BSD-2-Clause](https://github.com/Leaflet/Leaflet/blob/main/LICENSE).

The layer framework, marker / popup / tooltip API, tile grid, DOM pane ordering, and many of the smaller utility helpers (CRS, event plumbing, gesture handlers) trace their lineage to Leaflet. ts-maps reimplements the design in TypeScript with a modern camera (bearing + pitch) and the style-spec / MVT renderer bolted on the side.

## Mapbox GL Style Spec

[Mapbox GL Style Specification](https://docs.mapbox.com/style-spec/), © Mapbox Inc., [BSD-3-Clause](https://github.com/mapbox/mapbox-gl-js/blob/main/LICENSE.txt).

The shape of ts-maps style documents — sources, layers, paint & layout properties, expressions — mirrors the Mapbox spec so existing tooling (style generators, validators) stays useful. The ts-maps expression compiler is an original implementation of a subset of the spec.

## Supercluster (algorithm only)

The KD-tree clustering in `GeoJSONClusterSource` follows the algorithm described by [supercluster](https://github.com/mapbox/supercluster), © Mapbox Inc., ISC. The TypeScript implementation is independent.

## OpenStreetMap

Every example page in these docs uses raster tiles served by [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Please respect the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) in production.
