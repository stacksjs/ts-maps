# Localization

The built-in UI speaks the reader's language, as Apple Maps does: the search
field and place card, Offline Maps, the map type picker, the indoor level
picker, the zoom and locate buttons, and turn-by-turn, banner and voice.
English and German are built in.

```ts
const map = new TsMap('map', { locale: 'de' })
control.search().addTo(map) // "Karten durchsuchen"
```

A control's own `locale` option wins over the map's; with neither, the
browser's language (`navigator.language`). A locale missing a message falls
back to its language (`de-AT` to `de`), then to English, so a partly
translated language still reads whole.

## Turn-by-turn

Instructions are worded per language, after OSRM's
[`osrm-text-instructions`](https://github.com/Project-OSRM/osrm-text-instructions),
not translated word for word:

| | English | German |
| --- | --- | --- |
| Banner | Turn right onto Market St | Rechts abbiegen auf Friedrichstr. |
| Roundabout | At the roundabout, take the second exit | Im Kreisverkehr die zweite Ausfahrt nehmen |
| Voice | In 400 feet, use the left 2 lanes to turn left onto Broadway | In 400 Metern die linken 2 Spuren benutzen und links abbiegen auf Broadway |

The voice uses a `speechSynthesis` voice for the locale: one for the exact
locale, else one for its language, else the browser's choice.

`services.formatInstruction`, `spokenInstruction`, `formatDistance` and
`laneHint` take a `locale` for use outside the built-in UI, as does the
`Navigator`.

## Numbers and dates

Counts, distances and dates go through `Intl`: "1.2 km" and "1,2 km",
"1,200 results" and "1.200 Ergebnisse", "Downloaded Sep 23" and the German
date. Opening hours read "Open · Closes 9 PM" or "Geöffnet · Schließt um
21 Uhr". Units still follow the locale: miles and feet for `en-US`, metres
elsewhere, unless a control's `units` says otherwise.

## Search in another language

Find Nearby's categories have their names and their words in each language:
in German, typing "Tankstelle" finds Gas Stations and "kaf" suggests Kaffee.
English words keep working in every language. Kinds read in the language
too ("Tankstelle", "Bäckerei"); a kind with no word is title-cased.

## Adding a language

```ts
import { addMessages } from 'ts-maps'

addMessages('fr', {
  'search.placeholder': 'Rechercher dans Plans',
  'search.count': { one: '{count} résultat', other: '{count} résultats' },
  // …
})
```

Messages are keyed by what they are for: `search.*`, `offline.*`, `nav.*`,
`maptype.*`, `category.*`, `kind.*`, `opening.*`. A message with a
`{count}` can give each plural form `Intl.PluralRules` names. Any message
left out falls back to English. The English catalogue in
`ts-maps/src/core-map/i18n/messages` lists every key.

`services.addInstructionLanguage('fr', { instruction, spoken, spokenDistance, lanes })`
words turn-by-turn for a language; see the English and German ones in
`services/instructions.ts`.
