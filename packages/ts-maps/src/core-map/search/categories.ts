/**
 * What people search for by kind rather than by name — "Coffee", "Gas" — and
 * how a place's kind reads in a result: "Café", "Fast Food", "Neighborhood".
 *
 * Kinds are OpenMapTiles `class` and `subclass` values, the schema the
 * built-in styles draw, and each maps to one of the POI badge categories so a
 * result wears the same icon as the place on the map.
 */

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

/** Kinds that read better written out than title-cased. */
const LABELS: Record<string, string> = {
  cafe: 'Café',
  fast_food: 'Fast Food',
  ice_cream: 'Ice Cream',
  alcohol_shop: 'Liquor Store',
  fuel: 'Gas Station',
  charging_station: 'EV Charger',
  place_of_worship: 'Place of Worship',
  town_hall: 'City Hall',
  post: 'Post Office',
  doctors: 'Doctor',
  bus: 'Bus Stop',
  railway: 'Station',
  ferry_terminal: 'Ferry Terminal',
  neighbourhood: 'Neighborhood',
  suburb: 'Neighborhood',
  quarter: 'Neighborhood',
  city: 'City',
  town: 'Town',
  village: 'Village',
  hamlet: 'Hamlet',
  state: 'State',
  country: 'Country',
  street: 'Street',
  address: 'Address',
  peak: 'Mountain',
  airport: 'Airport',
  ocean: 'Ocean',
  sea: 'Sea',
  bay: 'Bay',
  lake: 'Lake',
  river: 'River',
  art_gallery: 'Art Gallery',
  dog_park: 'Dog Park',
  department_store: 'Department Store',
  clothing_store: 'Clothing Store',
}

/** "Café", "Fast Food", "Neighborhood": a kind as a result's second line says it. */
export function kindLabel(kind: string | undefined): string {
  if (!kind)
    return ''
  return LABELS[kind] ?? kind.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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

/** The category a query names, if it names one: "coffee", "gas station", "Pharmacies". */
export function categoryForQuery(query: string): SearchCategory | undefined {
  const q = fold(query)
  if (!q)
    return undefined
  return SEARCH_CATEGORIES.find(c => fold(c.label) === q || c.synonyms.some(s => fold(s) === q))
}

/** Categories whose name starts with what has been typed so far. */
export function categoriesMatching(query: string): SearchCategory[] {
  const q = fold(query)
  if (q.length < 2)
    return []
  return SEARCH_CATEGORIES.filter(c => fold(c.label).startsWith(q) || c.synonyms.some(s => fold(s).startsWith(q)))
}
