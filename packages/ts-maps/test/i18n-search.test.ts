import { afterEach, describe, expect, test } from 'bun:test'
import { addMessages, message } from '../src/core-map/i18n'
import { categoriesMatching, categoryForQuery, categoryLabel, control, kindLabel, SEARCH_CATEGORIES, TsMap } from '../src/core-map'
import { describeOpening } from '../src/core-map/search/details'
import { formatDistance, formatInstruction, laneHint, parseManeuver, spokenInstruction } from '../src/core-map/services/instructions'

function makeMap(locale?: string): TsMap {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 430 })
  Object.defineProperty(container, 'clientHeight', { value: 800 })
  document.body.appendChild(container)
  const map = new TsMap(container, { zoomAnimation: false, fadeAnimation: false, ...(locale ? { locale } : {}) })
  map.setView([52.52, 13.405], 14)
  return map
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the catalogue', () => {
  test('falls back from region to language to English, and to the key', () => {
    expect(message('de-AT', 'search.placeholder')).toBe('Karten durchsuchen')
    expect(message('fr', 'search.placeholder')).toBe('Search Maps')
    expect(message('de', 'no.such.key')).toBe('no.such.key')
  })

  test('picks the plural form, and formats the count in the language', () => {
    expect(message('en', 'search.count', { count: 1 })).toBe('1 result')
    expect(message('en', 'search.count', { count: 1200 })).toBe('1,200 results')
    expect(message('de', 'search.count', { count: 1200 })).toBe('1.200 Ergebnisse')
  })

  test('takes a new language, or new words for one', () => {
    addMessages('nl', { 'search.placeholder': 'Zoek in Kaarten' })
    expect(message('nl-BE', 'search.placeholder')).toBe('Zoek in Kaarten')
    expect(message('nl', 'search.cancel')).toBe('Cancel')
  })
})

describe('turn-by-turn in German', () => {
  const right = parseManeuver('turn-right')

  test('the banner, abbreviated', () => {
    expect(formatInstruction(right, { name: 'Friedrichstraße', abbreviate: true, locale: 'de' })).toBe('Rechts abbiegen auf Friedrichstr.')
    expect(formatInstruction(parseManeuver('roundabout', 2), { locale: 'de-DE' })).toBe('Im Kreisverkehr die zweite Ausfahrt nehmen')
    expect(formatInstruction(parseManeuver('arrive'), { locale: 'de' })).toBe('Ziel erreicht')
  })

  test('the voice, with lanes, in the dative', () => {
    const lanes = [{ valid: true, indications: ['left'] }, { valid: true, indications: ['left'] }, { valid: false, indications: ['straight'] }]
    expect(spokenInstruction(parseManeuver('turn-left'), 'Unter den Linden', 400, 'metric', lanes, 'de'))
      .toBe('In 400 Metern die linken 2 Spuren benutzen und links abbiegen auf Unter den Linden')
    expect(spokenInstruction(right, undefined, 1000, 'metric', undefined, 'de')).toBe('In einem Kilometer rechts abbiegen')
    expect(spokenInstruction(parseManeuver('arrive'), undefined, 200, 'metric', undefined, 'de')).toBe('In 200 Metern erreichen Sie Ihr Ziel')
    expect(laneHint([{ valid: false, indications: [] }, { valid: true, indications: [] }, { valid: false, indications: [] }], 'de')).toBe('die mittlere Spur')
  })

  test('distances with a decimal comma; English unchanged', () => {
    expect(formatDistance(1234, 'metric', 'de')).toBe('1,2 km')
    expect(formatDistance(1234, 'metric', 'en')).toBe('1.2 km')
    expect(spokenInstruction(right, 'Market Street', 400, 'metric', undefined, 'en')).toBe('In 400 meters, turn right onto Market Street')
  })
})

describe('search in German', () => {
  test('categories by their German names and words', () => {
    const coffee = SEARCH_CATEGORIES.find(c => c.id === 'coffee')!
    expect(categoryLabel(coffee, 'de')).toBe('Kaffee')
    expect(categoryForQuery('Tankstelle', 'de')!.id).toBe('gas')
    expect(categoriesMatching('kaf', 'de').map(c => c.id)).toEqual(['coffee'])
    // English still works in German.
    expect(categoryForQuery('coffee', 'de')!.id).toBe('coffee')
    expect(categoryLabel({ id: 'mine', label: 'Bakeries', icon: 'food', kinds: [], synonyms: [] }, 'de')).toBe('Bakeries')
  })

  test('kinds, and hours', () => {
    expect(kindLabel('fuel', 'de')).toBe('Tankstelle')
    expect(kindLabel('fuel', 'en')).toBe('Gas Station')
    expect(kindLabel('art_school', 'de')).toBe('Art School')
    const now = new Date(2026, 9, 7, 12, 0)
    expect(describeOpening({ open: true, closes: new Date(2026, 9, 7, 21, 0) }, now, 'de')).toStartWith('Geöffnet · Schließt um ')
    expect(describeOpening({ open: false, opens: new Date(2026, 9, 8, 8, 0) }, now, 'de')).toStartWith('Geschlossen · Öffnet morgen um ')
    expect(describeOpening({ open: true, always: true }, now, 'de')).toBe('24 Stunden geöffnet')
    expect(describeOpening({ open: true, closes: new Date(2026, 9, 8, 1, 0) }, now, 'en')).not.toContain('tomorrow')
  })

  test('the control speaks the map\'s language, or its own', () => {
    const map = makeMap('de')
    const search = control.search({ provider: null, offline: null, recents: false }).addTo(map)
    const input = map.getContainer().querySelector<HTMLInputElement>('.tsmap-search-input')!
    expect(input.getAttribute('placeholder')).toBe('Karten durchsuchen')
    search._show('home')
    const text = map.getContainer().querySelector('.tsmap-search-body')!.textContent!
    expect(text).toContain('In der Nähe')
    expect(text).toContain('Kaffee')
    // Its own locale wins, and follows sync.
    search.sync({ locale: 'en' })
    expect(input.getAttribute('placeholder')).toBe('Search Maps')
    expect(map.getContainer().querySelector('.tsmap-search-cancel')!.textContent).toBe('Cancel')
  })

  test('English by default', () => {
    const map = makeMap()
    control.search({ provider: null, offline: null, recents: false, locale: 'en' }).addTo(map)
    expect(map.getContainer().querySelector('.tsmap-search-input')!.getAttribute('placeholder')).toBe('Search Maps')
  })
})
