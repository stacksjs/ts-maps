/**
 * What people search for by kind rather than by name — "Coffee", "Gas" — and
 * how a place's kind reads in a result: "Café", "Fast Food", "Neighborhood".
 *
 * Kinds are OpenMapTiles `class` and `subclass` values, the schema the
 * built-in styles draw, and each maps to one of the POI badge categories so a
 * result wears the same icon as the place on the map.
 */

import { hasMessage, message } from '../i18n'
import { POI_CLASSES } from '../symbols/poiIcons'

export interface SearchCategory {
  id: string
  /** What the button says. */
  label: string
  /** The badge it wears: a `POI_CATEGORIES` name. */
  icon: string
  /** OpenMapTiles `class` or `subclass` values that belong to it. */
  kinds: string[]
  /** Other words that mean it, so typing "petrol" finds Gas Stations. */
  synonyms: string[]
}

/** Apple Maps' "Find Nearby", in the order it shows them. */
export const SEARCH_CATEGORIES: SearchCategory[] = [
  { id: 'restaurants', label: 'Restaurants', icon: 'food', kinds: ['restaurant', 'food_court'], synonyms: ['restaurant', 'food', 'dinner', 'lunch', 'eat'] },
  { id: 'fast-food', label: 'Fast Food', icon: 'food', kinds: ['fast_food'], synonyms: ['fast food', 'burger', 'takeaway'] },
  { id: 'coffee', label: 'Coffee', icon: 'cafe', kinds: ['cafe'], synonyms: ['coffee', 'cafe', 'café', 'espresso', 'tea'] },
  { id: 'bars', label: 'Bars', icon: 'nightlife', kinds: ['bar', 'pub', 'beer', 'biergarten', 'nightclub'], synonyms: ['bar', 'bars', 'pub', 'drinks', 'beer'] },
  { id: 'groceries', label: 'Groceries', icon: 'grocery', kinds: ['grocery', 'supermarket', 'convenience', 'greengrocer'], synonyms: ['grocery', 'groceries', 'supermarket', 'market'] },
  { id: 'gas', label: 'Gas Stations', icon: 'car', kinds: ['fuel'], synonyms: ['gas', 'gas station', 'fuel', 'petrol'] },
  { id: 'parking', label: 'Parking', icon: 'car', kinds: ['parking', 'parking_garage'], synonyms: ['parking', 'car park', 'garage'] },
  { id: 'ev-charging', label: 'EV Chargers', icon: 'car', kinds: ['charging_station'], synonyms: ['ev', 'charger', 'charging'] },
  { id: 'hotels', label: 'Hotels', icon: 'lodging', kinds: ['hotel', 'hostel', 'motel', 'guest_house', 'lodging'], synonyms: ['hotel', 'hotels', 'motel', 'hostel', 'stay'] },
  { id: 'pharmacies', label: 'Pharmacies', icon: 'health', kinds: ['pharmacy', 'chemist'], synonyms: ['pharmacy', 'drugstore', 'chemist'] },
  { id: 'hospitals', label: 'Hospitals', icon: 'health', kinds: ['hospital', 'clinic', 'doctors'], synonyms: ['hospital', 'emergency', 'clinic', 'doctor'] },
  { id: 'parks', label: 'Parks', icon: 'park', kinds: ['park', 'garden', 'playground', 'dog_park'], synonyms: ['park', 'parks', 'garden', 'playground'] },
]

/**
 * A category's name in a language: "Coffee", "Kaffee". A category of the
 * page's own, with no message, keeps its `label`.
 */
export function categoryLabel(category: SearchCategory, locale?: string): string {
  const key = `category.${category.id}`
  return hasMessage(locale, key) ? message(locale, key) : category.label
}

/** "Café", "Fast Food", "Neighborhood": a kind as a result's second line says it. */
export function kindLabel(kind: string | undefined, locale?: string): string {
  if (!kind)
    return ''
  const key = `kind.${kind}`
  if (hasMessage(locale, key))
    return message(locale, key)
  // Kinds the catalogue does not name are title-cased: `art_school`, "Art School".
  return kind.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const ICON_FOR_KIND = new Map<string, string>()
for (const [category, classes] of Object.entries(POI_CLASSES)) {
  for (const kind of classes)
    ICON_FOR_KIND.set(kind, category)
}
for (const category of SEARCH_CATEGORIES) {
  for (const kind of category.kinds) {
    if (!ICON_FOR_KIND.has(kind))
      ICON_FOR_KIND.set(kind, category.icon)
  }
}

/** The badge a kind of place wears. */
export function iconForKind(kind: string | undefined, fallbackClass?: string): string {
  return (kind && ICON_FOR_KIND.get(kind)) ?? (fallbackClass && ICON_FOR_KIND.get(fallbackClass)) ?? 'place'
}

function fold(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036F]/g, '').toLowerCase().trim()
}

/**
 * The words that name a category: its English label and synonyms, and in
 * another language its name there and the words its catalogue lists
 * (`category.coffee.words`: "kaffee, café, espresso").
 */
function wordsFor(category: SearchCategory, locale?: string): string[] {
  const words = [category.label, ...category.synonyms]
  if (locale) {
    words.push(categoryLabel(category, locale))
    const key = `category.${category.id}.words`
    if (hasMessage(locale, key))
      words.push(...message(locale, key).split(',').map(w => w.trim()).filter(Boolean))
  }
  return words.map(fold)
}

/** The category a query names, if it names one: "coffee", "gas station", "Pharmacies", "Tankstelle". */
export function categoryForQuery(query: string, locale?: string): SearchCategory | undefined {
  const q = fold(query)
  if (!q)
    return undefined
  return SEARCH_CATEGORIES.find(c => wordsFor(c, locale).includes(q))
}

/** Categories whose name starts with what has been typed so far. */
export function categoriesMatching(query: string, locale?: string): SearchCategory[] {
  const q = fold(query)
  if (q.length < 2)
    return []
  return SEARCH_CATEGORIES.filter(c => wordsFor(c, locale).some(w => w.startsWith(q)))
}
