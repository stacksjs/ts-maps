import { afterEach, describe, expect, test } from 'bun:test'
import type { DirectionsOptions, LatLngLike, Route, TransitDetails } from '../src/core-map/services/types'
import { control, IndoorMap, mapTypes, TileLayer, TsMap } from '../src/core-map'
import { areaSize, formatBytes } from '../src/core-map/control/OfflineMapsControl'
import { Point } from '../src/core-map/geometry/Point'
import { formatDate, formatNumber, message } from '../src/core-map/i18n'
import { formatDuration, trafficNote, TurnByTurn, voiceFor } from '../src/core-map/navigation/TurnByTurn'
import { MemoryOfflineStore, OfflineMaps, setOfflineMaps } from '../src/core-map/offline'
import { transitInstruction, walkInstruction } from '../src/core-map/services/transit'

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const fetchTile = async (): Promise<Response> => new Response(PNG as unknown as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } })

function makeMap(options: Record<string, unknown> = {}): TsMap {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 800 })
  Object.defineProperty(container, 'clientHeight', { value: 600 })
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false, fadeAnimation: false, ...options })
  map.setView([37.78, -122.42], 15)
  return map
}

const tick = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

async function until(check: () => boolean, ms = 1000): Promise<void> {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end)
      throw new Error('timed out')
    await tick(5)
  }
}

afterEach(() => {
  setOfflineMaps(null)
  document.body.replaceChildren()
})

describe('the catalogue', () => {
  test('a regional locale falls back to its language, then to English', () => {
    expect(message('de-AT', 'nav.go')).toBe('Los')
    expect(message('fr', 'nav.go')).toBe('Go')
    expect(message('de', 'transit.stops', { count: 1 })).toBe('1 Station')
    expect(message('de', 'transit.stops', { count: 6 })).toBe('6 Stationen')
  })

  test('German messages keep the English slots', () => {
    const slots = (text: unknown): string[] => [...JSON.stringify(text).matchAll(/\{(\w+)\}/g)].map(m => m[1]!).sort()
    const keys = ['offline.used', 'offline.area', 'offline.pauseNamed', 'nav.directionsTo', 'nav.delay', 'transit.takeToward', 'duration.hrMin']
    for (const key of keys) {
      expect(message('de', key)).not.toBe(message('en', key))
      expect(slots(message('de', key))).toEqual(slots(message('en', key)))
    }
  })

  test('dates and numbers are written the locale’s way', () => {
    const day = new Date(2025, 8, 23)
    expect(formatDate(day, 'en-US')).toBe(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(day))
    expect(formatDate(day, 'de')).not.toBe(formatDate(day, 'en-US'))
    expect(formatNumber(1.5, 'de', { minimumFractionDigits: 1 })).toBe('1,5')
    expect(formatBytes(3_400_000)).toBe('3.4 MB')
    expect(formatBytes(3_400_000, 'de')).toBe('3,4 MB')
    expect(formatBytes(512, 'de')).toBe('512 Byte')
  })
})

describe('Offline Maps', () => {
  test('speaks German with locale: de, and English by default', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: fetchTile })
    const map = makeMap()
    const de = control.offlineMaps({ maps, locale: 'de' }).addTo(map)
    expect(de._button!.title).toBe('Karten offline')
    de.open()
    await tick()
    const card = map.getContainer().querySelector('.tsmap-offline-card')!
    expect(card.getAttribute('aria-label')).toBe('Karten offline')
    expect(card.querySelector('.tsmap-offline-title')?.textContent).toBe('Karten offline')
    expect(card.querySelector('.tsmap-offline-new')?.textContent).toBe('Neue Karte laden')
    expect(card.textContent).toContain('Nur Offline-Karten verwenden')
    expect(card.querySelector('.tsmap-offline-close')?.getAttribute('aria-label')).toBe('Schließen')
    de.close()

    const en = control.offlineMaps({ maps }).addTo(map)
    expect(en._button!.title).toBe('Offline Maps')
    en.open()
    await tick()
    const english = map.getContainer().querySelector('.tsmap-offline-card')!
    expect(english.querySelector('.tsmap-offline-new')?.textContent).toBe('Download New Map')
    expect(english.textContent).toContain('Only Use Offline Maps')
  })

  test('the area picker and the list in German, with German dates and sizes', async () => {
    const maps = new OfflineMaps({ store: new MemoryOfflineStore(), fetch: fetchTile })
    const map = makeMap()
    new TileLayer('https://img.test/{z}/{x}/{y}.png').addTo(map)
    const offline = control.offlineMaps({ maps, locale: 'de' }).addTo(map)
    offline.selectArea()
    const container = map.getContainer()
    expect(container.querySelector('.tsmap-offline-handle-nw')?.getAttribute('aria-label')).toBe('Linke obere Ecke des Bereichs bewegen')
    expect(container.querySelector('.tsmap-offline-download')?.textContent).toBe('Laden')
    expect(container.querySelector('.tsmap-offline-estimate')?.textContent).toContain('Geschätzte Größe')
    expect(container.querySelector('.tsmap-offline-estimate')?.textContent).toContain('Etwa')

    await maps.download({ bounds: [-122.421, 37.779, -122.419, 37.781], minZoom: 16, map, name: 'Block' })
    offline.open()
    await until(() => !!container.querySelector('.tsmap-offline-row[data-status="complete"]'))
    const row = container.querySelector('.tsmap-offline-row')!
    const region = maps.regions[0]!
    expect(row.textContent).toContain(`Geladen am ${formatDate(region.updatedAt, 'de')}`)
    expect(row.textContent).toContain(formatBytes(region.bytes, 'de'))
    expect(row.querySelector('[data-action="update"]')?.getAttribute('aria-label')).toBe('Block aktualisieren')
    expect(row.querySelector('[data-action="delete"]')?.getAttribute('aria-label')).toBe('Block löschen')
    expect(container.querySelector('.tsmap-offline-section')?.textContent).toBe('Geladene Karten')
  })

  test('an area is said in the locale', () => {
    const bounds: [number, number, number, number] = [-122.43, 37.77, -122.41, 37.79]
    expect(areaSize(bounds, 'metric')).toBe('About 1.8 × 2.2 km')
    expect(areaSize(bounds, 'metric', 'de')).toBe('Etwa 1,8 × 2,2 km')
    // German reads kilometres, without being told.
    expect(areaSize(bounds, undefined, 'de')).toBe('Etwa 1,8 × 2,2 km')
  })
})

describe('a map’s locale', () => {
  test('controls without one of their own speak the map’s', () => {
    const map = makeMap({ locale: 'de' })
    const zoom = (which: string): HTMLElement => map.getContainer().querySelector(`.tsmap-control-zoom-${which}`)!
    expect(zoom('in').title).toBe('Vergrößern')
    expect(zoom('out').getAttribute('aria-label')).toBe('Verkleinern')
    const offline = control.offlineMaps({ maps: new OfflineMaps({ store: new MemoryOfflineStore(), fetch: fetchTile }) }).addTo(map)
    expect(offline._button!.title).toBe('Karten offline')
    // A control's own wins.
    const fullscreen = control.fullscreen({ locale: 'en' }).addTo(map)
    expect(fullscreen._button!.title).toBe('View fullscreen')
  })

  test('English, unchanged, by default', () => {
    const map = makeMap()
    expect(map.getContainer().querySelector<HTMLElement>('.tsmap-control-zoom-in')!.title).toBe('Zoom in')
    expect(control.locate().addTo(map)._button!.title).toBe('Show your location')
    expect(control.fullscreen().addTo(map)._button!.title).toBe('View fullscreen')
  })
})

describe('the smaller controls', () => {
  test('zoom, compass, locate and fullscreen', () => {
    const map = makeMap()
    const nav = control.navigation({ locale: 'de' }).addTo(map)
    expect(nav._zoomInButton!.title).toBe('Vergrößern')
    expect(nav._compassButton!.getAttribute('aria-label')).toBe('Nach Norden ausrichten')
    const locate = control.locate({ locale: 'de' }).addTo(map)
    expect(locate._button!.title).toBe('Standort anzeigen')
    locate._setState('locating')
    expect(locate._button!.title).toBe('Standort wird ermittelt …')
    const fullscreen = control.fullscreen({ locale: 'de' }).addTo(map)
    expect(fullscreen._button!.title).toBe('Vollbild')
    fullscreen._updateButton(true)
    expect(fullscreen._button!.getAttribute('aria-label')).toBe('Vollbild beenden')
    // A title given is a title kept.
    expect(control.navigation({ locale: 'de', zoomInTitle: 'Näher' }).addTo(map)._zoomInButton!.title).toBe('Näher')
  })

  test('the map type picker', () => {
    const map = makeMap()
    const types = mapTypes({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf' })
    expect(types.map(t => t.label)).toEqual(['Explore', 'Driving', 'Transit', 'Satellite'])
    expect(mapTypes({ tiles: 'https://tiles.test/{z}/{x}/{y}.pbf', locale: 'de' }).map(t => t.label)).toEqual(['Entdecken', 'Fahren', 'ÖPNV', 'Satellit'])

    const picker = control.mapType({ types, locale: 'de' }).addTo(map)
    expect(picker._button!.title).toBe('Kartentyp')
    picker.open()
    const card = map.getContainer().querySelector('.tsmap-maptype-card')!
    expect(card.getAttribute('aria-label')).toBe('Karte auswählen')
    expect(card.querySelector('.tsmap-maptype-title')?.textContent).toBe('Karte auswählen')
    expect(card.querySelector('.tsmap-maptype-close')?.getAttribute('aria-label')).toBe('Schließen')
    expect([...card.querySelectorAll('.tsmap-maptype-label')].map(l => l.textContent)).toEqual(['Entdecken', 'Fahren', 'ÖPNV', 'Satellit'])
    picker.close()

    const english = control.mapType({ types }).addTo(map)
    expect(english._button!.title).toBe('Map Type')
    english.open()
    expect([...map.getContainer().querySelectorAll('.tsmap-maptype-label')].map(l => l.textContent)).toEqual(['Explore', 'Driving', 'Transit', 'Satellite'])
  })

  test('the indoor level picker', () => {
    const map = makeMap()
    const venue = {
      id: 'v',
      name: 'Terminal',
      category: 'airport',
      bounds: [-122.421, 37.779, -122.419, 37.781] as [number, number, number, number],
      center: { lat: 37.78, lng: -122.42 },
      levels: [{ id: 'l0', ordinal: 0, name: 'Arrivals', shortName: '1' }, { id: 'l1', ordinal: 1, name: 'Departures', shortName: '2' }],
      features: new Map(),
      places: [],
    }
    const de = new IndoorMap({ venue: venue as any, locale: 'de' }).addTo(map)
    expect(de._list!.getAttribute('aria-label')).toBe('Ebenen')
    const en = new IndoorMap({ venue: venue as any }).addTo(map)
    expect(en._list!.getAttribute('aria-label')).toBe('Levels')
  })
})

describe('turn-by-turn', () => {
  const route: Route = {
    distance: 1500,
    duration: 3900,
    typicalDuration: 3000,
    traffic: true,
    geometry: [{ lat: 0, lng: 0 }, { lat: 0.0135, lng: 0 }],
    steps: [
      { distance: 1500, duration: 3900, instruction: '', geometry: [{ lat: 0, lng: 0 }, { lat: 0.0135, lng: 0 }], maneuver: 'depart', name: 'Hauptstraße' },
      { distance: 0, duration: 0, instruction: '', geometry: [{ lat: 0.0135, lng: 0 }], maneuver: 'arrive' },
    ],
  }

  function navMap(options: Record<string, unknown> = {}): TsMap {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const map = new TsMap(el, { center: [0.005, 0], zoom: 15, ...options })
    map._size = new Point(430, 860)
    map._sizeChanged = false
    map._pixelOrigin = map._getNewPixelOrigin(map._lastCenter, map._zoom)
    return map
  }

  test('the route card, the banner and the trip card in German', async () => {
    const asked: DirectionsOptions[] = []
    const directions = { name: 'fake', getDirections: async (_: LatLngLike[], o?: DirectionsOptions) => { asked.push(o ?? {}); return [route] } }
    const map = navMap()
    const nav = new TurnByTurn(map, { directions, voice: false, simulate: { speed: 0 }, locale: 'de', destinationName: 'Bahnhof' })
    await nav.preview({ lat: 0, lng: 0 }, { lat: 0.0135, lng: 0 })
    expect(asked[0]!.language).toBe('de')
    const card = map.getContainer().querySelector('.tsmap-nav-card')!
    expect(card.querySelector('.tsmap-nav-card-title')?.textContent).toBe('Route nach Bahnhof')
    expect(card.querySelector('.tsmap-nav-go')?.textContent).toBe('Los')
    expect(card.querySelector('.tsmap-nav-go')?.getAttribute('aria-label')).toBe('Route starten')
    expect(card.querySelector('.tsmap-nav-option-time')?.textContent).toBe('1 Std. 5 Min.')
    expect(card.querySelector('.tsmap-nav-option-detail')?.textContent).toBe('1,5 km · Schnellste')
    expect(card.textContent).toContain('15 Min. Verzögerung')

    nav.start()
    expect(nav.navigator!.options.locale).toBe('de')
    const trip = map.getContainer().querySelector('.tsmap-nav-trip')!
    expect(trip.querySelector('.tsmap-nav-end')?.textContent).toBe('Beenden')
    expect(trip.querySelector('.tsmap-nav-end')?.getAttribute('aria-label')).toBe('Route beenden')
    expect([...trip.querySelectorAll('.tsmap-nav-stat-label')].map(l => l.textContent).slice(0, 2)).toEqual(['Ankunft', 'Min.'])
    expect(trip.querySelector('.tsmap-nav-mute')?.getAttribute('aria-label')).toBe('Sprachansagen stummschalten')
    nav.stop()
  })

  test('English by default, and the map’s locale when it has none', async () => {
    const asked: DirectionsOptions[] = []
    const directions = { name: 'fake', getDirections: async (_: LatLngLike[], o?: DirectionsOptions) => { asked.push(o ?? {}); return [route] } }
    const map = navMap()
    const nav = new TurnByTurn(map, { directions, voice: false, units: 'metric' })
    await nav.preview({ lat: 0, lng: 0 }, { lat: 0.0135, lng: 0 })
    expect(asked[0]!.language).toBeUndefined()
    let card = map.getContainer().querySelector('.tsmap-nav-card')!
    expect(card.querySelector('.tsmap-nav-go')?.textContent).toBe('Go')
    expect(card.querySelector('.tsmap-nav-option-detail')?.textContent).toBe('1.5 km · Fastest')
    nav.stop()

    const german = navMap({ locale: 'de' })
    const de = new TurnByTurn(german, { directions, voice: false })
    // Kilometres, for a German map.
    expect(de.options.units).toBe('metric')
    await de.preview({ lat: 0, lng: 0 }, { lat: 0.0135, lng: 0 })
    card = german.getContainer().querySelector('.tsmap-nav-card')!
    expect(card.querySelector('.tsmap-nav-go')?.textContent).toBe('Los')
    expect(asked[1]!.language).toBe('de')
    de.stop()
  })

  test('durations and traffic', () => {
    expect(formatDuration(720)).toBe('12 min')
    expect(formatDuration(3900)).toBe('1 hr 5 min')
    expect(formatDuration(720, 'de')).toBe('12 Min.')
    expect(formatDuration(7200, 'de')).toBe('2 Std.')
    expect(trafficNote({ ...route, duration: 3010 }, 'de')).toContain('Wenig Verkehr')
    expect(trafficNote({ ...route, duration: 3010 })).toContain('Light traffic')
  })

  test('the voice speaks the locale, in a voice for it', () => {
    const spoken: Array<{ text: string, lang: string, voice: unknown }> = []
    const voices = [{ lang: 'en-US', name: 'Samantha' }, { lang: 'de-DE', name: 'Anna' }]
    const g = globalThis as any
    const saved = { speechSynthesis: g.speechSynthesis, SpeechSynthesisUtterance: g.SpeechSynthesisUtterance }
    g.SpeechSynthesisUtterance = class {
      text: string
      lang = ''
      voice: unknown = null
      constructor(text: string) { this.text = text }
    }
    g.speechSynthesis = { cancel: () => {}, speak: (u: any) => spoken.push(u), getVoices: () => voices }
    try {
      const nav = new TurnByTurn(navMap(), { locale: 'de-AT' })
      nav._speak('Hallo')
      expect(spoken[0]).toMatchObject({ text: 'Hallo', lang: 'de-AT', voice: voices[1] })
    }
    finally {
      g.speechSynthesis = saved.speechSynthesis
      g.SpeechSynthesisUtterance = saved.SpeechSynthesisUtterance
    }
  })

  test('voiceFor: the exact locale, else the language, else none', () => {
    const voices = [{ lang: 'en-US' }, { lang: 'de-DE' }, { lang: 'de-AT' }, { lang: 'fr_FR' }]
    expect(voiceFor('de-AT', voices)).toBe(voices[2]!)
    expect(voiceFor('de-CH', voices)).toBe(voices[1]!)
    expect(voiceFor('de', voices)).toBe(voices[1]!)
    expect(voiceFor('fr-FR', voices)).toBe(voices[3]!)
    expect(voiceFor('ja-JP', voices)).toBeUndefined()
    expect(voiceFor('de', [])).toBeUndefined()
  })
})

describe('transit steps', () => {
  const ride: TransitDetails = {
    vehicle: 'tram',
    line: 'N',
    lineName: 'Judah',
    headsign: 'Ocean Beach',
    from: { name: 'Church St' },
    to: { name: 'Sunset Blvd' },
    departure: new Date(0),
    arrival: new Date(0),
    stops: 6,
  }

  test('worded in the locale', () => {
    expect(transitInstruction(ride)).toBe('Take the N Judah toward Ocean Beach, 6 stops')
    expect(transitInstruction(ride, 'de')).toBe('N Judah Richtung Ocean Beach nehmen, 6 Stationen')
    expect(transitInstruction({ ...ride, vehicle: 'bus', line: '38', lineName: undefined, stops: 1 }, 'de')).toBe('Bus 38 Richtung Ocean Beach nehmen, 1 Station')
    expect(walkInstruction('Church St', 'de')).toBe('Zu Church St gehen')
    expect(walkInstruction(undefined, 'de')).toBe('Zum Ziel gehen')
    expect(walkInstruction(undefined)).toBe('Walk to your destination')
  })
})
