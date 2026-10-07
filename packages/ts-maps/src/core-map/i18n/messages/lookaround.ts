import type { Catalogue } from '../index'

/** Look Around: the button, the viewer and its hints. */
export const lookAroundMessages: Record<string, Catalogue> = {
  en: {
    'lookaround.title': 'Look Around',
    'lookaround.done': 'Done',
    'lookaround.forward': 'Move forward',
    'lookaround.back': 'Move back',
    'lookaround.choose': 'Tap a blue street to look around',
    'lookaround.none': 'No Look Around imagery here',
    'lookaround.failed': 'This picture could not be loaded',
    'lookaround.captured': 'Captured {date}',
    'lookaround.mini': 'Map of where you are looking',
  },
  de: {
    'lookaround.title': 'Umsehen',
    'lookaround.done': 'Fertig',
    'lookaround.forward': 'Vorwärts',
    'lookaround.back': 'Zurück',
    'lookaround.choose': 'Zum Umsehen eine blaue Straße antippen',
    'lookaround.none': 'Hier gibt es keine Bilder zum Umsehen',
    'lookaround.failed': 'Dieses Bild konnte nicht geladen werden',
    'lookaround.captured': 'Aufgenommen {date}',
    'lookaround.mini': 'Karte des Blickfelds',
  },
}
