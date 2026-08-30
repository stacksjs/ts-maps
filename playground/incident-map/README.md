# Incident Map — a Citizen-style demo on ts-maps

A mobile-shaped incident map: dark vector basemap with rotated street labels,
emoji incident markers in category-coloured rings, an anchored callout, a
pulsing location dot, a search box, filter chips, and a floating tab bar.

Every pixel of the map is ts-maps. The app shell around it is
[stx](https://github.com/stacksjs/stx) and `@stacksjs/components`.

> The incident feed is fabricated. Nothing here is, or should be mistaken for, a
> real public safety feed.

## What it exercises

| Screen element | ts-maps feature |
|---|---|
| Dark / light basemap | `styles.dark()` / `styles.light()` over OpenFreeMap vector tiles |
| Rotated street names | `symbol-placement: 'line'`, `text-max-angle`, `symbol-spacing` |
| Place labels clearing their dot | `text-anchor`, `text-offset`, `symbol-sort-key` |
| Incident pins | `Marker` + `DivIcon` with live HTML |
| Callout above the pin | `Popup` with `autoPan`, restyled |
| Blue location dot | the `.tsmap-locate-dot` styling `LocateControl` draws |
| Map chrome that follows the theme | `theme: 'dark' \| 'light' \| 'auto'`, `map.setTheme()` |
| Search | `NominatimGeocoder` (keyless) → `flyTo` |
| Attribution | the built-in `AttributionControl` |
| Coordinate readout | `map.on('move')` → `map.getCenter()` |

The theme toggle is the interesting one: a single press repaints the basemap
(`setStyle`), the map's own chrome (`setTheme`), and the page around it.

## Running it

The demo is not a workspace package — it points at a local stx checkout, which
is a machine-specific path — so it is run directly rather than installed:

```bash
bun playground:incident-map
```

Then open <http://localhost:3400>. Narrow the window, or use a phone-sized
device toolbar: the layout is a 430px column.

If your stx checkout is not at `~/Code/Tools/stx`, point the two overrides at
yours:

```bash
STX_CLI=/path/to/stx/packages/stx/dist/cli.js STX_COMPONENTS=/path/to/stx/packages/components/stx-plugin.ts bun playground:incident-map
```

## Layout

```
stx.config.ts          pages/components/layouts/stores dirs + the components plugin
public/ts-maps.css     symlink to the real stylesheet (see below)
layouts/app.stx        the phone shell, and the light/dark page surround
pages/index.stx        the map, all the client wiring, and the screen's styles
components/
  IncidentFilters.stx  the chip row
  CoordinateReadout.stx bottom-left lat/lng, fed by a `map:move` event
  BottomBar.stx        tab bar + the record button that breaks out of it
stores/incidents.ts    the mock feed
```

## Two things worth knowing

**The stylesheet is `<link>`ed, not imported.** stx extracts vendor CSS that
resolves through `node_modules`; ts-maps is consumed here straight from the
repo's source tree, so `import '…/ts-maps.css'` inside `<script client>`
produced no stylesheet at all — and with no stylesheet every map pane falls back
to `position: static` and stacks down the page instead of overlaying.
`public/ts-maps.css` is a symlink, so it cannot drift from the real file.

**ts-maps is imported by relative source path.** The package exposes its source
under the `bun` export condition, and stx bundles client scripts for the
browser, where that condition does not apply. The existing `playground/core-map`
demos import the same way.

## Tracking stx

The demo follows whatever is checked out at `STX_COMPONENTS` / `STX_CLI` — there
is no pinned version. If an stx refactor breaks it, the surface it depends on is
small: the directives, the client-script runtime (`state`, `onMount`, `useRef`),
and `SearchInput`.
