# Map types

The map type picker is Apple Maps' card of Explore, Driving, Transit and
Satellite. A button opens it; choosing a type sets the map's style.

```ts
import { control, mapTypes, styles, TsMap } from 'ts-maps'

const BASEMAP = 'https://tiles.openfreemap.org/planet'

const map = new TsMap('map', {
  center: [37.7793, -122.4193],
  zoom: 14,
  style: styles.light({ url: BASEMAP }),
})

const picker = control.mapType({ types: mapTypes({ url: BASEMAP }) }).addTo(map)
```

The [map types example](../examples/13-map-types.md) is this, running.

## The four types

`mapTypes(options)` builds Apple's set from one vector source and one imagery
source. Each is a built-in style from
[Styles & theming](./styles-and-theming.md#satellite-hybrid-and-driving):

| Type | Style | Chrome |
| --- | --- | --- |
| Explore | `styles.light()`, or `styles.dark()` with `theme: 'dark'` | as `theme` |
| Driving | the same with `emphasis: 'driving'`: roads first | as `theme` |
| Transit | `styles.transit()`: rail and tram lines in colour, stations named | as `theme` |
| Satellite | `styles.hybrid()`: imagery with roads and names, or `styles.satellite()` with `labels: false` | dark |

It takes the basemap's options (`url` or `tiles`, `attribution`, `palette`,
`fonts`, `sourceLayers`, …), the imagery's (`imagery`, `imageryAttribution`,
`imageryMaxzoom`), and:

- `theme`: `'light'` (the default) or `'dark'`, for Explore, Driving and
  Transit.
- `labels`: `false` for imagery with no names on it.
- `locale`: fixes the type names in one language. Without it, the picker
  words them in its own locale.

Satellite turns the chrome dark, as Apple does, since white controls glare
over imagery.

## What a switch keeps

Choosing a type replaces the style, but not what you put on the map:

- The camera, markers, popups and other [layer objects](./layers.md) are not
  part of a style and stay where they are.
- Sources and layers you added to the style itself are carried onto the new
  one. By default those are layers drawing a GeoJSON source, layers added
  since the picker last set a style, and layers marked
  `metadata: { 'ts-maps:overlay': true }`. Pass `keep: (layer, style) => boolean`
  to decide for yourself.

## Options and methods

| Option | Default | |
| --- | --- | --- |
| `types` | `[]` | The types to offer, in order: `mapTypes()`, or your own list. |
| `value` | the first type | The type showing. |
| `keep` | see above | Which of the current style's layers to carry over. |
| `traffic` | — | A `TrafficLayer` for a Traffic switch on the card. See [Traffic](#traffic). |
| `title` | "Map Type" | The button's label. |
| `locale` | the map's | The card's language. |
| `position` | `'topright'` | |

A type of your own is `{ id, label, style, theme }`, where `style` is a style
document or a function that builds one when the type is chosen:

```ts
control.mapType({
  types: [
    { id: 'day', label: 'Day', style: () => styles.light({ url: BASEMAP }) },
    { id: 'night', label: 'Night', style: () => styles.dark({ url: BASEMAP }), theme: 'dark' },
  ],
}).addTo(map)
```

`picker.select('satellite')` chooses from code, and `open()` and `close()`
show and hide the card. `picker.listen((type, e) => …)` hears `change`
(`{ value }`), `openchange` (`{ open }`) and `trafficchange`
(`{ traffic }`). Every framework binding has it as `<MapType>`; see
[framework bindings](../guide/framework-bindings.md#map-type).

## Traffic

`trafficLayer()` colours roads by how freely traffic moves, green, yellow,
red and dark red as Apple's are, and marks the incidents slowing it, each
with a card:

```ts
import { control, mapTypes, TomTomIncidents, trafficLayer, trafficSources } from 'ts-maps'

const key = 'YOUR_TOMTOM_KEY'

const traffic = trafficLayer({
  source: trafficSources.tomtom(key), // or trafficSources.mapbox(token)
  incidents: new TomTomIncidents({ key }),
})
traffic.addTo(map)

// A Traffic switch on the map type card.
control.mapType({ types: mapTypes({ url: BASEMAP }), traffic }).addTo(map)
```

Both built-in services need their own key; neither has a keyless tier.

- Flow is drawn as a line layer in the style, under the labels, and marked
  as an overlay, so the picker carries it from one map type to the next.
- Flow and incidents are fetched again every two minutes (`refresh`, in
  milliseconds; `0` never), and incidents again when the map moves.
- `opacity` (default 0.9) and `before` (a layer id) adjust how it is drawn.
- `traffic.toggle(map)` turns it on and off, `traffic.active` says which,
  `traffic.refresh()` fetches now, and the map fires `trafficchange` with
  `{ active }`.

Any vector traffic service works as a `TrafficSourceSpec`: its tile URLs,
the layer in them with road segments, and an expression reading its own
attributes into `low`, `moderate`, `heavy`, `severe` or `closed`:

```ts
const myTraffic = trafficLayer({
  source: {
    tiles: ['https://traffic.example.com/{z}/{x}/{y}.pbf'],
    sourceLayer: 'flow',
    congestion: ['step', ['get', 'speed_ratio'], 'severe', 0.25, 'heavy', 0.5, 'moderate', 0.8, 'low'],
    attribution: '© Example Traffic',
  },
})
```

Incidents come from any object with `name` and
`incidents(bounds, { signal })`, resolving to a list of `TrafficIncident`s.
The colours are exported as `CONGESTION_COLORS`.
