# Controls

Controls are the buttons and panels the map draws over itself. Each one is
made by a function on `control` and added the same way:

```ts
import { control, Map, styles } from 'ts-maps'

const map = new Map('map', {
  center: [40.758, -73.9855],
  zoom: 14,
  zoomControl: false, // navigation below has its own zoom buttons
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

control.navigation().addTo(map)
control.locate().addTo(map)
control.scale({ position: 'bottomleft' }).addTo(map)
```

Every control takes a `position`: `'topleft'`, `'topright'`, `'bottomleft'`
or `'bottomright'`. Controls in the same corner stack in the order they were
added. `control.remove()` takes one off, `control.setPosition(corner)` moves
it, and `map.addControl(c)` and `map.removeControl(c)` do the same from the
map's side. The zoom buttons and the attribution are added for you; pass
`zoomControl: false` or `attributionControl: false` to leave them out.

Every control's colours come from the theme's CSS custom properties, so they
follow `map.setTheme()` with nothing to configure; see
[theming the chrome](./styles-and-theming.md#theming-the-chrome). Their words
come in the map's language; see [Localization](./localization.md).

| Control | Default corner | |
| --- | --- | --- |
| `control.zoom()` | top left | `+` and `−` |
| `control.navigation()` | top right | Zoom and a compass |
| `control.locate()` | top right | The device's position |
| `control.fullscreen()` | top right | Fullscreen |
| `control.scale()` | bottom left | A scale bar |
| `control.attribution()` | bottom right | Credits |
| `control.layers()` | top right | A switcher for layer objects |
| `control.geocoder()` | top left | A simple search box |
| `control.search()` | top left | Apple Maps' search. See [Search](./search.md). |
| `control.mapType()` | top right | Explore, Driving, Transit, Satellite. See [Map types](./map-types.md). |
| `control.offlineMaps()` | top right | Downloaded areas. See [Offline maps](./offline.md). |
| `control.lookAround()` | top right | Street-level pictures. See [Look Around](./look-around.md). |
| `indoorMap()` | top right | A venue's floor plan and level picker. See [Indoor maps](./indoor.md). |

## Zoom and navigation

`control.zoom()` is the plain `+`/`−` pair. Shift-click moves three levels.
It is the one the map adds unless `zoomControl: false`. `zoomInText`,
`zoomOutText`, `zoomInTitle` and `zoomOutTitle` change its buttons.

`control.navigation()` is the Mapbox-shaped control: the zoom pair plus a
compass that shows the current bearing and turns the map back to north when
pressed.

```ts
control.navigation({
  showZoom: true,
  showCompass: true,
  // Tilt the needle to show pitch, and reset pitch along with bearing.
  visualizePitch: false,
  // Milliseconds for the swing back to north; 0 snaps. Default 300.
  resetDuration: 300,
}).addTo(map)
```

The compass is the only always-visible sign that the map is turned at all,
and on a desktop the only way back to north without code, so it is worth
having on any map that can rotate. When the reader has asked for reduced
motion the reset always snaps, whatever `resetDuration` says.

## Locate

`control.locate()` centres the map on the device's position and, unless told
otherwise, follows it, with a blue dot, a pulsing halo, and a circle showing
how accurate the fix is.

```ts
control.locate({
  zoom: 16, // on the first fix; null keeps the current zoom
  follow: true, // keep centring as the position changes
  showMarker: true,
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000,
}).addTo(map)
```

Those are the defaults. The last three go to the browser's Geolocation API.

Geolocation is asked for **on click, never on load**. A permission prompt
nobody asked for is the quickest way to be refused for the rest of the
session, and a page cannot ask again once refused.

The button shows its state: an outline crosshair when idle, pulsing while
the first fix comes in, filled while following, struck through when the
position is not to be had. Following stops the moment the map is dragged or
zoomed by hand, and a second press turns it off. `start()` and `stop()` do
the same from code.

The map fires `locatefound` with `{ latlng, accuracy, position }` and
`locateerror` with `{ code, message }`.

## Fullscreen

```ts
control.fullscreen().addTo(map)
```

It uses the Fullscreen API where it can, and otherwise fills the window with
the map. The API is missing more often than you might think: it is blocked in
cross-origin iframes without `allowfullscreen`, and iPhone Safari has never
had it, and those are where maps get embedded. Filling the window is not
true fullscreen, since the browser's own bars stay, but it does what the
button was pressed for.

Either way the map re-measures itself and fires `fullscreenstart` or
`fullscreenend`. Pass `container` to expand a wrapper element instead of the
map. `isFullscreen()`, `toggle()`, `request()` and `exit()` drive it from
code.

## Scale

`control.scale()` draws a scale bar, metric and imperial by default.

```ts
control.scale({ metric: true, imperial: false, maxWidth: 120 }).addTo(map)
```

Pass `transient: true` to show it only while the zoom changes, fading out
`transientDelay` milliseconds (default 1200) after, as Apple Maps does.
`updateWhenIdle: true` updates it at the end of a move rather than during.

## Attribution

`control.attribution()` lists the credits of every source and layer on the
map, and is added for you. Tile services generally require attribution as a
licence condition, so move it rather than hide it. The map keeps it as
`map.attributionControl`:

```ts
map.attributionControl?.setPrefix(false) // drop the library's own link
map.attributionControl?.addAttribution('Data © City of New York')
```

`removeAttribution(text)` takes one back off.

## Layers

`control.layers(baseLayers, overlays)` is a collapsible list for switching
[layer objects](./layers.md) on and off: radio buttons for base layers, of
which one shows at a time, and checkboxes for overlays.

```ts
import { control, LayerGroup, Marker } from 'ts-maps'

const cafes = new LayerGroup([new Marker([40.7536, -73.9832]), new Marker([40.7614, -73.9776])])
const museums = new LayerGroup([new Marker([40.7614, -73.9776])])

control.layers(undefined, { Cafés: cafes, Museums: museums }).addTo(map)
```

It works with layer objects, not with the layers of the map's style. To
switch between styles, use the [map type picker](./map-types.md); to hide a
style layer, `map.setLayoutProperty(id, 'visibility', 'none')`.

`collapsed: false` keeps it open, and `sortLayers: true` sorts it by name.
`addBaseLayer(layer, name)`, `addOverlay(layer, name)` and
`removeLayer(layer)` change its list. The map fires `baselayerchange`,
`overlayadd` and `overlayremove` as they are switched.

## Geocoder

`control.geocoder()` is a plain search box over one geocoding provider: no
Find Nearby, no places from the map's tiles, no cards. For the full search,
use [`control.search()`](./search.md).

```ts
import { control, services } from 'ts-maps'

control.geocoder({
  // Any GeocoderProvider from services. Default: Photon, keyless and built
  // for search as you type.
  provider: new services.PhotonGeocoder(),
  placeholder: 'Search for a place',
  limit: 5,
  debounce: 300,
  minLength: 3,
  collapsed: false,
  flyTo: true,
  zoom: 14,
  marker: true,
  proximity: true, // prefer results near the map's centre
}).addTo(map)
```

The values shown are the defaults, apart from `placeholder`. Any provider
from [Services](./services.md#geocoding) works.

Given the public Nominatim server, the box searches when you press Enter
rather than as you type: Nominatim's usage policy forbids autocomplete, and
the provider says so (`autocomplete: false`). The first Enter asks, the next
takes a result. Your own Nominatim (`baseUrl`) is searched as you type.
`searchAsYouType` overrides either way.

Searching as you type, requests wait for a pause, and the one in flight is cancelled on
each keystroke. That spares a shared server, and keeps a slow early answer
from landing after a quick later one and filling the list for a query the
user has moved past.

Arrow keys walk the results, Enter picks one (the top hit if none is
highlighted), and Escape clears. A result with a bounding box fits it; one
without goes to `zoom`. `language`, `countries` and `bbox` narrow what the
provider is asked. `setQuery(text)`, `select(index)` and `clear()` drive it
from code. The map fires `geocoderesults` (`{ query, results }`),
`geocodeselect` (`{ result }`) and `geocodeerror` (`{ query, error }`).

The geocoder's words are not translated; set `placeholder`, `errorText` and
`noResultsText` yourself for another language.

## Search

Search as in Apple Maps: one field for places, addresses and kinds of place,
with Find Nearby, Recents, a pin for every result and a card for the place
chosen, with its hours, Directions and Save.

```ts
control.search().addTo(map)
```

[Search](./search.md) covers what it does, its options, saved places, and
choosing a geocoder for production.

## Map type

The map type picker, as in Apple Maps: a card of Explore, Driving, Transit
and Satellite that sets the map's style, keeping the camera and what you
added.

```ts
import { control, mapTypes } from 'ts-maps'

control.mapType({ types: mapTypes({ url: 'https://tiles.openfreemap.org/planet' }) }).addTo(map)
```

See [Map types](./map-types.md).

### Traffic

Live traffic, roads coloured by how freely it moves and incidents with
cards, with a Traffic switch on the map type card. See
[Map types](./map-types.md#traffic).

## Offline maps

```ts
control.offlineMaps().addTo(map)
```

Apple Maps' Offline Maps: a list of downloaded areas with size, date,
progress, pause, update and delete; an area picker that dims the map around a
frame you resize by its corners, with an estimated size before downloading;
and a pill when the connection drops. See [Offline maps](./offline.md).

## Indoor maps

```ts
import { indoorMap } from 'ts-maps'

indoorMap({ venue: '/imdf/terminal-2.zip' }).addTo(map)
```

A venue's floor plan over the basemap, one level at a time, with a level
picker beside the map. See [Indoor maps](./indoor.md).

## Look Around

```ts
import { lookAround } from 'ts-maps'

lookAround().addTo(map)
```

A binoculars button that shows the streets with pictures, and a full-bleed
street-level viewer. See [Look Around](./look-around.md).

## Accessibility

The panels follow WAI-ARIA's patterns, so a screen reader and a keyboard can
use them:

- **Search** is a combobox: the field names the highlighted row with
  `aria-activedescendant` as the arrow keys move, and a live region says how
  many results a search found and which place was chosen. Closing a place's
  card puts the keyboard back in the field.
- **Offline Maps**, the **map type picker** and **Look Around** are dialogs:
  opening one from its button moves the keyboard into it, and Escape closes
  it and returns to the button. In Offline Maps each map's buttons name it
  ("Pause San Francisco download"), and a download is a `progressbar` with
  its value. The area picker's corners take focus with Tab and move with the
  arrow keys (Shift for bigger steps), and the area is described in words:
  "About 2.1 × 1.4 km · Estimated size: 312 MB".
- **Turn-by-turn**'s banner is a polite live region, so the next maneuver is
  read out as it changes; End and mute say what they do.
- **Buttons** carry their state: the zoom buttons are `aria-disabled` at the
  zoom limits, and the level picker's levels are `aria-pressed`.
- **Motion:** with `prefers-reduced-motion`, `flyTo` and `easeTo` jump rather
  than fly (pass `essential: true` where the animation is the point), the
  compass snaps back to north, and pins and cards appear without moving.
- **Contrast:** text on the panels is at 4.5:1 or better in both themes.
  Action blue is `#0066cc` in light and `#5eb0ff` in dark rather than Apple's
  `#0a84ff`, which is 3.6:1 on white.

## Writing your own

A control is a `Control` with an `onAdd(map)` that returns its element, and
an optional `onRemove(map)` to tidy up:

```ts
import { Control, Map } from 'ts-maps'

class ResetView extends Control {
  onAdd(map: Map): HTMLElement {
    const button = document.createElement('button')
    button.className = 'tsmap-bar'
    button.textContent = 'Reset'
    button.addEventListener('click', () => map.flyTo([40.758, -73.9855], 14))
    return button
  }
}

new ResetView({ position: 'topleft' }).addTo(map)
```

Give it the `tsmap-bar` class to look like the built-in buttons. A click on
it also reaches the map unless you stop it, which
`DomEvent.disableClickPropagation(button)` does (`DomEvent` is exported from
`ts-maps`).
