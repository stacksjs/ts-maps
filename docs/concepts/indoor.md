# Indoor maps

Inside an airport or a mall, as Apple Maps shows them: the floor plan over
the basemap, one level at a time, a level picker beside the map, and the
shops and gates in search.

```ts
import { control, indoorMap, Map, styles } from 'ts-maps'

const map = new Map('map', {
  center: [37.6155, -122.3897],
  zoom: 18,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

const search = control.search().addTo(map)

const terminal = await indoorMap({ venue: '/imdf/terminal-2.zip' }).addTo(map).ready()
terminal.connect(search) // "Gate D12" finds the gate, and goes to its level
terminal.setLevel(1)
```

The [indoor example](../examples/14-indoor.md) has a terminal with a level
picker, connected to search: try "Gate A4" or "coffee".

## The venue

The venue is in IMDF, Apple's Indoor Mapping Data Format: a set of GeoJSON
files, one per kind of feature. `venue` can be:

- a URL ending in `.zip`, fetched and unzipped in the page;
- the URL of a folder holding the archive's `.geojson` files (`venue.geojson`,
  `level.geojson`, `unit.geojson` and so on);
- the zip's bytes, as an `ArrayBuffer` or `Uint8Array`;
- the files already parsed, as `{ venue, level, unit, opening, … }`;
- a venue `loadIMDF` has already read.

The files read are `venue`, `level`, `unit`, `opening`, `amenity`, `anchor`,
`occupant`, `fixture`, `kiosk`, `section`, `footprint` and `building`. An
archive with no venue is an error.

`ready()` resolves once the venue is loaded, to the indoor map itself. The
plan is drawn as soon as it is.

## How it is drawn

- Units are filled by category: walkways white, restrooms blue, lifts and
  stairs lilac, food and shops warm, parking grey, and back-of-house a
  quiet stone.
- Doors are gaps in the walls.
- Names appear one zoom closer than the plan, so the plan reads first.
- The plan and the level picker appear from zoom 16 (`minZoom`), and only
  while the venue is in view. The picker shows only for a venue with more
  than one level, highest level at the top.
- While the plan shows, the basemap's 3D buildings under it are cleared, so
  the floor is not hidden inside its own building.

The plan is a GeoJSON source and four style layers, drawn again whenever the
style changes and marked as an overlay, so the
[map type picker](./map-types.md) keeps it.

## Options

| Option | Default | |
| --- | --- | --- |
| `venue` | — | The IMDF venue. Required. |
| `level` | the ground floor | The level shown first, by ordinal: 0 the ground floor, 1 the one above, -1 the one below. Without a level 0, the lowest above it. |
| `minZoom` | `16` | Below this zoom the plan and picker are hidden. |
| `language` | English | Which of IMDF's names to show, by language tag. |
| `locale` | `language`, else the map's | The level picker's language. |
| `position` | `'topright'` | Where the level picker sits. |

## Levels, search and events

```ts
terminal.levels // [{ ordinal, name, shortName, … }], lowest first
terminal.level // the ordinal showing
terminal.setLevel(-1) // a level by ordinal
terminal.visible // whether the plan is in view and close enough to show
```

`connect(search)` adds the venue's places to a
[search control](./search.md): its shops, gates and facilities are found by
name or kind, and choosing one goes to its level. It returns a function that
undoes it. Without the control, `terminal.search('coffee')` returns the
matching places, each with its `level` and `levelName`.

`terminal.listen((type, e) => …)` hears `load` (`{ venue }`),
`levelchange` (`{ level, name }`) and `visibilitychange` (`{ visible }`),
and returns a function that stops listening. Every framework binding has it
as `<IndoorMap>`; see
[framework bindings](../guide/framework-bindings.md#indoor-maps).

## Reading IMDF yourself

`loadIMDF(source, { language })` reads a venue without drawing it, into an
`IndoorVenue`: its `name`, `bounds`, `center`, `levels` in order, each
level's features, and its named `places`. `searchIndoor(venue, query)`
searches one. Pass the loaded venue to `indoorMap` to draw it without reading
it twice.
