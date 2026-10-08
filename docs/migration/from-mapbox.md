# Migrating from Mapbox GL JS

ts-maps reads the same style documents and expressions as Mapbox GL JS, and
its camera, source and feature-state methods have the same names. Two things
differ throughout, and they account for most of a port:

- **Coordinates are `[lat, lng]`** in the map's own API — `center`, markers,
  `flyTo`, `fitBounds` — as in Leaflet. GeoJSON and the style spec keep
  `[lng, lat]`. A `{ lng, lat }` object works anywhere a point is taken, which
  sidesteps the question.
- **Markers, popups and controls are Leaflet-style.** `new Marker([lat, lng])`,
  `bindPopup`, `control.navigation()`.

There is no access token and no account. The basemap below is
[OpenFreeMap](https://openfreemap.org), which is free and keyless.

## A first map

Mapbox GL JS:

```ts
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = 'pk.…'

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-73.9855, 40.758],
  zoom: 13,
})

map.addControl(new mapboxgl.NavigationControl())

new mapboxgl.Marker()
  .setLngLat([-73.9855, 40.758])
  .setPopup(new mapboxgl.Popup().setHTML('<b>Times Square</b>'))
  .addTo(map)
```

ts-maps:

```ts
import { control, Marker, styles, TsMap } from 'ts-maps'
import 'ts-maps/styles.css'

const map = new TsMap('map', {
  center: [40.758, -73.9855], // [lat, lng]
  zoom: 13,
  zoomControl: false, // the navigation control has its own zoom buttons
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

control.navigation().addTo(map)

new Marker([40.758, -73.9855])
  .addTo(map)
  .bindPopup('<b>Times Square</b>')
```

## Adding data

The `load` handler becomes a `style.load` handler, and `addLayer` with a style
layer becomes `addStyleLayer`. In ts-maps, `addLayer` takes a `Layer` object
such as a `Marker`.

Mapbox GL JS:

```ts
map.on('load', () => {
  map.addSource('quakes', {
    type: 'geojson',
    data: 'https://docs.mapbox.com/mapbox-gl-js/assets/earthquakes.geojson',
    cluster: true,
    clusterRadius: 50,
  })
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'quakes',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 100, '#f1f075', 750, '#f28cb1'],
      'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40],
    },
  })
  map.addLayer({
    id: 'count',
    type: 'symbol',
    source: 'quakes',
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
  })
})

map.on('click', 'clusters', (e) => {
  console.log(e.features[0].properties.point_count)
})
```

ts-maps:

```ts
map.on('style.load', () => {
  map.addSource('quakes', {
    type: 'geojson',
    data: 'https://docs.mapbox.com/mapbox-gl-js/assets/earthquakes.geojson',
    cluster: true,
    clusterRadius: 50,
  })
  map.addStyleLayer({
    id: 'clusters',
    type: 'circle',
    source: 'quakes',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 100, '#f1f075', 750, '#f28cb1'],
      'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40],
    },
  })
  map.addStyleLayer({
    id: 'count',
    type: 'symbol',
    source: 'quakes',
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
  })
})

map.on('click', 'clusters', (e) => {
  console.log(e.features[0].feature.properties.point_count)
})
```

`style.load` fires when a style has gone in, after any style URL and TileJSON
sources are read, and always after the constructor has returned. `load` is
different: it fires when the view is first set, which with `center` and `zoom`
options happens inside the constructor, before a listener can be added. Use
`style.load` for data, or `map.whenReady(fn)` for code that needs the view.

## Method by method

### The map

| Mapbox GL JS | ts-maps |
| ------------ | ------- |
| `new mapboxgl.Map({ container, … })` | `new TsMap(container, { … })` |
| `center: [lng, lat]` | `center: [lat, lng]`, or `{ lng, lat }` |
| `style: 'mapbox://styles/…'` | A style object, or an `https://` URL to one. See [Styles](#styles). |
| `map.on('load', fn)` | `map.on('style.load', fn)`, or `map.whenReady(fn)` for the view |
| `map.resize()` | `map.invalidateSize()` — rarely needed; the map watches its container |
| `map.getCanvas()` | No single canvas: tiles are drawn per tile. `map.toCanvas()` composites them. |
| `map.getCanvas().toDataURL()` | `map.toDataURL()`, with no `preserveDrawingBuffer` needed |
| `map.remove()` | `map.remove()` |

### Camera

| Mapbox GL JS | ts-maps |
| ------------ | ------- |
| `map.flyTo({ center, zoom, bearing, pitch })` | `map.flyTo(center, zoom, { bearing, pitch })` |
| `map.easeTo({ center, zoom, bearing, pitch, duration })` | The same, with `center` as `[lat, lng]` |
| `map.jumpTo({ … })` | The same |
| `map.fitBounds([[w, s], [e, n]], { padding: 40 })` | `map.fitBounds([[s, w], [n, e]], { padding: [40, 40] })` |
| `map.getCenter()` → `LngLat` | `map.getCenter()` → `LatLng`, with `.lat` and `.lng` |
| `map.getFreeCameraOptions()` | Not available |
| `map.project(lngLat)` | `map.latLngToContainerPoint(latlng)` (`project` gives world pixels) |
| `map.unproject(point)` | `map.containerPointToLatLng(point)` |

Durations are milliseconds, as in Mapbox. A reader who prefers reduced motion
gets the move without the animation unless it is `essential: true`, also as in
Mapbox.

### Style

| Mapbox GL JS | ts-maps |
| ------------ | ------- |
| `map.addSource(id, source)` | The same, TileJSON `url`s included |
| `map.getSource(id).setData(data)` | `map.setSourceData(id, data)` — `getSource` returns the source's spec, not an object with methods |
| `map.addLayer(layer, beforeId)` | `map.addStyleLayer(layer, beforeId)` |
| `map.getLayer(id)` | `map.getStyleLayer(id)` |
| `map.removeLayer(id)` | `map.removeStyleLayer(id)` |
| `map.setPaintProperty`, `setLayoutProperty`, `setFilter`, `setLayerZoomRange` | The same |
| `map.setStyle(style)` | The same; changes are diffed in place |
| `map.addLayer({ type: 'custom', … })` | `map.addCustomLayer({ id, type: 'custom', render })` |
| `map.setTerrain`, `setFog`, `setProjection('globe')` | The same |

### Querying and events

| Mapbox GL JS | ts-maps |
| ------------ | ------- |
| `e.lngLat` | `e.latlng` |
| `e.point` | `e.containerPoint` |
| `e.features[0].properties` | `e.features[0].feature.properties` |
| `map.queryRenderedFeatures(point, { layers, filter })` | The same |
| `map.queryRenderedFeatures([[x1, y1], [x2, y2]], { layers })` | The same |
| `map.on('mousemove', layerId, fn)` | `map.on('pointermove', layerId, fn)` |
| `map.on('mouseenter' / 'mouseleave', layerId, fn)` | Not available. Use `pointermove` on the layer and on the map. |

A query result is `{ feature, layer, tile }`; the GeoJSON-like feature is
`result.feature`, with `properties`, `id` and `toGeoJSON(x, y, z)`.

### Markers, popups and controls

| Mapbox GL JS | ts-maps |
| ------------ | ------- |
| `new mapboxgl.Marker().setLngLat([lng, lat]).addTo(map)` | `new Marker([lat, lng]).addTo(map)` |
| `new mapboxgl.Marker({ element })` | `new Marker(latlng, { icon: new DivIcon({ html }) })` |
| `new mapboxgl.Marker({ draggable: true })` | `new Marker(latlng, { draggable: true })` |
| `marker.setPopup(popup)` | `marker.bindPopup(html)` |
| `new mapboxgl.Popup().setLngLat(ll).setHTML(html).addTo(map)` | `new Popup().setLatLng(latlng).setContent(html).openOn(map)` |
| `map.addControl(new mapboxgl.NavigationControl(), 'top-right')` | `control.navigation({ position: 'topright' }).addTo(map)` |
| `GeolocateControl`, `FullscreenControl`, `ScaleControl`, `AttributionControl` | `control.locate()`, `control.fullscreen()`, `control.scale()`, `control.attribution()` |

Positions are written `topleft`, `topright`, `bottomleft` and `bottomright`.

## Styles

A style is the same JSON document, `version: 8`, and ts-maps draws
`background`, `fill`, `fill-extrusion`, `line`, `circle`, `symbol`, `raster`,
`hillshade` and `heatmap` layers from `vector`, `raster`, `raster-dem` and
`geojson` sources. Pass one as an object or as a URL:

```ts
map.setStyle(styles.dark({ url: 'https://tiles.openfreemap.org/planet' }))
map.setStyle('https://example.com/my-style.json')
```

`mapbox://` URLs are not resolved, so styles hosted by Mapbox, and other
styles whose sources point at `mapbox://`, will not load. Styles whose sources
are `https://` TileJSON or tile URLs — OpenFreeMap, MapTiler, Protomaps, a
server of your own — do. The built-in `styles.light` and `styles.dark` draw
any source that uses the OpenMapTiles schema.

These parts of a style are read but not applied: the root `center`, `zoom`,
`bearing` and `pitch` (set them on the map), and `projection`, `terrain` and
`fog` (call `setProjection`, `setTerrain` and `setFog`). A `raster` source is
drawn through its `raster` layers, with their zoom range, `visibility` and
`raster-opacity`; the other `raster-*` paint properties are approximated with
a CSS filter. An `image` or `video` source, or a `sky` or `model` layer, fails
validation; use `ImageOverlay`, `VideoOverlay` and `setSky` instead. The
Mapbox Standard style's `imports`, `config` and slots are not supported.

The expression language is the same, type assertions such as
`['boolean', ['feature-state', 'hover'], false]` included;
[Expressions](../api/expressions.md) lists the operators ts-maps has and the
few it does not. An unknown operator is an error that names it, as in Mapbox.

## Services

Geocoding and directions come without an account, from Nominatim, Photon,
OSRM and Valhalla's public servers. Mapbox's own APIs are there when you have
a token:

```ts
import { services } from 'ts-maps'
import { MapboxDirections, MapboxGeocoder } from 'ts-maps/services'

const [place] = await services.defaultGeocoder().search('Tower Bridge, London')
const [route] = await services.defaultDirections().getDirections([place.center, { lat: 51.5033, lng: -0.1196 }])

const geocoder = new MapboxGeocoder({ accessToken: 'pk.…' })
const directions = new MapboxDirections({ accessToken: 'pk.…' })
```

`control.search()` is a full search UI over them, and `turnByTurn(map)` gives
route choices and guidance. The public servers have usage limits; see
[Services](../concepts/services.md) for running your own.

## Not available

- `mapbox://` URLs and the Mapbox Standard style.
- `mouseenter` and `mouseleave` layer events.
- Methods on sources: `getSource(id)` returns the spec. Use
  `setSourceData` for `setData`; there is no `getClusterExpansionZoom` on a
  style source, though `GeoJSONClusterSource` has one if you cluster yourself.
- `map.getFreeCameraOptions()`, and camera `padding` on `easeTo` and `jumpTo`.
- 3D lights.
