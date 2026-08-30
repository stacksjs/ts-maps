# Controls

Controls are the small pieces of UI the map draws over itself. Each one is
added the same way, and each takes a `position` of `'topleft'`, `'topright'`,
`'bottomleft'` or `'bottomright'`:

```ts
import { control } from 'ts-maps'

control.navigation({ position: 'topright' }).addTo(map)
```

Every control's colours come from the theme tokens described in
[Styles & theming](./styles-and-theming.md), so they follow `map.setTheme()`
without any per-control configuration.

## Zoom and navigation

`control.zoom()` is the plain `+`/`−` pair, and is added automatically unless
you pass `zoomControl: false` when creating the map.

`control.navigation()` is the Mapbox-shaped control: the zoom pair plus a
compass that shows the current bearing and returns the map to north when
pressed.

```ts
control.navigation({
  showZoom: true,
  showCompass: true,
  // Tilt the needle to reflect pitch, and reset pitch along with bearing.
  visualizePitch: false,
  // Milliseconds for the swing back to north; 0 snaps.
  resetDuration: 300,
}).addTo(map)
```

The compass is the only always-visible indication that the map is rotated at
all, which is why it is worth having as soon as rotation is enabled. When the
viewer has asked for reduced motion the reset always snaps, whatever
`resetDuration` says.

## Locate

`control.locate()` centres the map on the device's position and, unless told
otherwise, follows it — drawing a blue dot with a pulsing halo and a circle
showing the reported accuracy.

```ts
control.locate({
  // null keeps the current zoom on the first fix.
  zoom: 16,
  follow: true,
  showMarker: true,
}).addTo(map)
```

Geolocation is requested **on click and never on load**. A permission prompt
that appears unasked is the fastest way to be denied for the rest of the
session, and a denied permission cannot be re-requested from script.

Following stops the moment the user pans or zooms by hand; the dot stays where
it is. The map fires `locatefound` and `locateerror`.

## Geocoder

A search box over the geocoding providers in `services/`. The default provider
is Nominatim, which needs no key, so this works out of the box:

```ts
control.geocoder({
  placeholder: 'Search for a place',
  // Any GeocoderProvider — Photon, MapTiler, Mapbox, Google.
  provider: services.defaultGeocoder(),
  limit: 5,
  debounce: 300,
  minLength: 3,
  collapsed: false,
  flyTo: true,
  marker: true,
  // Bias results towards what is on screen.
  proximity: true,
}).addTo(map)
```

Requests are debounced, and the in-flight request is aborted on each keystroke —
politeness towards a shared public endpoint, and also correctness: without the
abort a slow early response can land after a fast later one and repopulate the
list for a query the user has moved past.

Arrow keys walk the results, Enter picks one (the top hit if none is
highlighted), Escape clears. A result with a bounding box fits those bounds;
one without uses `zoom`. The map fires `geocoderesults`, `geocodeselect` and
`geocodeerror`.

## Fullscreen

```ts
control.fullscreen({ position: 'topright' }).addTo(map)
```

Uses the Fullscreen API where it exists and falls back to a fixed,
full-viewport class where it does not — which is more often than it looks: the
API is blocked in cross-origin iframes without `allowfullscreen`, and iPhone
Safari has never implemented it. Both are exactly where maps get embedded. The
fallback is not true fullscreen (browser chrome stays) but it does what the
button was pressed for.

Either way the map re-measures itself, and fires `fullscreenstart` /
`fullscreenend`. Pass `container` to expand a wrapper element instead of the
map.

## Scale, layers, attribution

`control.scale()` draws a metric and/or imperial scale bar.

`control.layers(baseLayers, overlays)` is the collapsible base-layer and overlay
switcher.

`control.attribution()` renders layer credits and is added automatically. Tile
services generally require attribution as a licence condition, so prefer moving
it over hiding it. To drop the library's own prefix while keeping the credits:

```ts
map.attributionControl?.setPrefix(false)
```
