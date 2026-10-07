import type { Catalogue } from '../index'

/** The smaller controls: map type, indoor levels, navigation, locate, fullscreen and zoom. */
export const controlMessages: Record<string, Catalogue> = {
  en: {
    'maptype.title': 'Map Type',
    'maptype.choose': 'Choose Map',
    'maptype.close': 'Close',
    'maptype.traffic': 'Traffic',
    'maptype.explore': 'Explore',
    'maptype.driving': 'Driving',
    'maptype.transit': 'Transit',
    'maptype.satellite': 'Satellite',

    'indoor.levels': 'Levels',

    'zoom.in': 'Zoom in',
    'zoom.out': 'Zoom out',
    'compass.reset': 'Reset bearing to north',

    'locate.show': 'Show your location',
    'locate.locating': 'Finding your location…',
    'locate.active': 'Following your location',
    'locate.denied': 'Location unavailable — check browser permissions',

    'fullscreen.enter': 'View fullscreen',
    'fullscreen.exit': 'Exit fullscreen',
  },
  de: {
    'maptype.title': 'Kartentyp',
    'maptype.choose': 'Karte auswählen',
    'maptype.close': 'Schließen',
    'maptype.traffic': 'Verkehr',
    'maptype.explore': 'Entdecken',
    'maptype.driving': 'Fahren',
    'maptype.transit': 'ÖPNV',
    'maptype.satellite': 'Satellit',

    'indoor.levels': 'Ebenen',

    'zoom.in': 'Vergrößern',
    'zoom.out': 'Verkleinern',
    'compass.reset': 'Nach Norden ausrichten',

    'locate.show': 'Standort anzeigen',
    'locate.locating': 'Standort wird ermittelt …',
    'locate.active': 'Standort wird verfolgt',
    'locate.denied': 'Standort nicht verfügbar – Browserberechtigungen prüfen',

    'fullscreen.enter': 'Vollbild',
    'fullscreen.exit': 'Vollbild beenden',
  },
}
