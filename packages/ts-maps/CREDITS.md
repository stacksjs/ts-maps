# Credits

ts-maps is an original TypeScript library maintained by the ts-maps team.

Significant portions of the interactive map module under
`src/core-map/` were derived from the open-source
[Leaflet](https://github.com/Leaflet/Leaflet) project (version 2.0.0-alpha.1),
which is licensed under the BSD-2-Clause License:

    Copyright (c) 2010-2024, Volodymyr Agafonkin
    Copyright (c) 2010-2011, CloudMade
    All rights reserved.

The derived work has been translated to idiomatic TypeScript, adapted to
the ts-maps build toolchain (bun, pickier, better-dx) and rebranded.
Class, CSS and identifier names have been changed to the ts-maps namespace.

The style spec, expression engine, and vector-tile renderer follow the
public design of [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js)
and [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js), both
of which are referenced for compatibility but not used as dependencies.

We are grateful to the Leaflet, Mapbox, and MapLibre authors and
contributors for the years of careful work that made this derivative
possible.
