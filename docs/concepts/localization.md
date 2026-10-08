# Localization

The built-in controls speak the reader's language, as Apple Maps does:
search and its place cards, Offline Maps, the map type picker, the indoor
level picker, Look Around, the zoom, compass, locate and fullscreen buttons,
and turn-by-turn, in its banner and its voice. English and German are built
in, and `addMessages` adds more.

```ts
import { control, mapTypes, styles, TsMap } from 'ts-maps'

const BASEMAP = 'https://tiles.openfreemap.org/planet'

const map = new TsMap('map', {
  center: [52.52, 13.405], // Berlin
  zoom: 14,
  locale: 'de',
  style: styles.light({ url: BASEMAP }),
})

control.search().addTo(map) // "Karten durchsuchen"
control.mapType({ types: mapTypes({ url: BASEMAP }) }).addTo(map) // "Kartentyp"
```

The [localization example](../examples/17-localization.md) shows the same
map in either language.

## Choosing the language

A control's own `locale` option wins over the map's `locale`; with neither,
the browser's language (`navigator.language`) is used. A locale missing a
message falls back to its language (`de-AT` to `de`), then to English, so a
partly translated language still reads whole.

```ts
control.offlineMaps({ locale: 'en' }).addTo(map) // English on a German map
```

The words on the map itself, its street and place names, come from the
tiles, not from here. Search asks its online geocoder for names in
`language` when you set it.

`control.geocoder()`, `control.layers()` and `control.scale()` are not
translated. The geocoder takes `placeholder`, `errorText` and
`noResultsText`; the layers control shows the names you give it.

## Turn-by-turn

Instructions are worded per language, after OSRM's
[`osrm-text-instructions`](https://github.com/Project-OSRM/osrm-text-instructions),
not translated word for word:

| | English | German |
| --- | --- | --- |
| Banner | Turn right onto Market St | Rechts abbiegen auf Friedrichstr. |
| Roundabout | At the roundabout, take the second exit | Im Kreisverkehr die zweite Ausfahrt nehmen |
| Voice | In 400 feet, use the left 2 lanes to turn left onto Broadway | In 400 Metern die linken 2 Spuren benutzen und links abbiegen auf Broadway |

The voice is a `speechSynthesis` voice for the locale: one for the exact
locale, else one for its language, else the browser's choice.

Outside the built-in UI, the same wording is in `services`:
`formatInstruction(maneuver, { name, locale })`,
`spokenInstruction(maneuver, name, distance, units, lanes, locale)`,
`formatDistance(meters, units, locale)` and `laneHint(lanes, locale)`. A
`services.Navigator` takes `locale` too. See
[turn-by-turn navigation](./services.md#turn-by-turn-navigation).

## Numbers, dates and units

Counts, distances and dates go through `Intl`: "1.2 km" and "1,2 km",
"1,200 results" and "1.200 Ergebnisse", "Downloaded Sep 23" and the German
date. Opening hours read "Open · Closes 9 PM" or "Geöffnet · Schließt um
21 Uhr".

Units follow the locale: miles and feet for the United States (and Liberia
and Myanmar, and a bare `en`), metres everywhere else. Set `units` to
`'metric'` or `'imperial'` on search or turn-by-turn to choose.

`formatNumber(value, locale)` and `formatDate(date, locale)` are exported
for your own UI, as is `resolveLocale(locale)`, which turns what you have,
`en_US.UTF-8` say, into a tag `Intl` accepts.

## Search in another language

Find Nearby's categories have their names and their words in each language:
in German, typing "Tankstelle" finds Gas Stations and "kaf" suggests
Kaffee. English words keep working in every language. Kinds of place read in
the language too ("Tankstelle", "Bäckerei"); a kind with no word is
title-cased from its tag: `art_school` reads "Art School".

## Adding a language

```ts
import { addMessages } from 'ts-maps'

addMessages('fr', {
  'search.placeholder': 'Rechercher dans Plans',
  'search.count': { one: '{count} résultat', other: '{count} résultats' },
  'category.coffee': 'Café',
  'category.coffee.words': 'café, expresso, thé',
  // …
})
```

Messages are keyed by what they are for, under `search.*`, `category.*`,
`kind.*`, `opening.*`, `offline.*`, `nav.*`, `transit.*`, `duration.*`,
`maptype.*`, `indoor.*`, `lookaround.*`, `zoom.*`, `compass.*`, `locate.*`
and `fullscreen.*`. `{name}` in a message is filled in. A message with a
`{count}` can give each plural form that `Intl.PluralRules` names (`one`,
`few`, `many`, `other`, …), with `other` required. A message left out falls
back to English. Calling `addMessages` for a language that is there already
changes only the keys you pass.

The English catalogue, in `packages/ts-maps/src/core-map/i18n/messages/` in
the repository, lists every key. `message(locale, key, params)` looks one up,
and `messageLocales()` lists the languages loaded.

Turn-by-turn instructions are built by functions rather than looked up as
messages. `services.addInstructionLanguage('fr', { instruction, spoken, spokenDistance, lanes })`
adds a language; the English and German ones in `services/instructions.ts`
show what each function is given.

Every framework binding takes `locale` on the map; see
[framework bindings](../guide/framework-bindings.md#localization).
