import type { SearchControlOptions } from 'ts-maps'
import type { ControlPosition } from './controls'
import { useEffect, useRef } from 'react'
import { SEARCH_EVENTS, SearchControl } from 'ts-maps'
import { useMap } from './useMap'

/* eslint-disable no-unused-vars */
export interface SearchEventProps {
  /** A search or category found places: `{ query?, category?, places }`. */
  onResults?: (e: any) => void
  /** A place was chosen: `{ place }`. */
  onSelect?: (e: any) => void
  /** A chosen place's hours, phone and website arrived: `{ place, details }`. */
  onDetails?: (e: any) => void
  /** Save on a place's card added it to Favorites: `{ place }`. */
  onSave?: (e: any) => void
  /** Save on a place's card took it out of Favorites: `{ place }`. */
  onUnsave?: (e: any) => void
  /** Directions was pressed on a place's card: `{ place }`. */
  onDirections?: (e: any) => void
  /** The search was closed. */
  onClear?: (e: any) => void
}
/* eslint-enable no-unused-vars */

export interface SearchProps extends SearchEventProps {
  /** Search for this; a category's name runs the category. Empty clears. */
  query?: string
  position?: ControlPosition
  placeholder?: string
  /** Online geocoder. Default Photon; `null` to search only the map and offline maps. */
  provider?: SearchControlOptions['provider']
  /** Downloaded maps to search. Default the page's; `null` for none. */
  offline?: SearchControlOptions['offline']
  /** Find Nearby buttons. */
  categories?: SearchControlOptions['categories']
  /** Keep Recents. Default true. */
  recents?: boolean
  units?: SearchControlOptions['units']
  /** Where distances are measured from. Default the middle of the map. */
  location?: SearchControlOptions['location']
  /** A `TurnByTurn` — from `<TurnByTurn onReady>` — for Directions to preview routes on. */
  turnByTurn?: SearchControlOptions['turnByTurn']
  /** Where Directions starts. Default the device's position. */
  origin?: SearchControlOptions['origin']
  /** A `LookAround` — from `<LookAround onReady>` — for the place card's picture of the street. */
  lookAround?: SearchControlOptions['lookAround']
  language?: string
  /** The language its words are in. Default `language`, else the map's `locale`, else the browser's. */
  locale?: string
  /** Where a chosen place's hours, phone and website come from. Default OpenStreetMap; `null` for none. */
  details?: SearchControlOptions['details']
  /** The link Share sends. Default the place on openstreetmap.org. */
  shareUrl?: SearchControlOptions['shareUrl']
  /** Where Save keeps Favorites and Guides. Default the page's `savedPlaces()`; `null` for none. */
  saved?: SearchControlOptions['saved']
  /** Favorites as stars on the map. Default true. */
  showSaved?: boolean
  /** The underlying control, for `search`, `searchCategory`, `select` and `cancel`. */
  // eslint-disable-next-line no-unused-vars
  onReady?: (control: SearchControl) => void
}

/**
 * Search, after Apple Maps: "Search Maps" with Find Nearby and Recents,
 * suggestions as you type, pins for results, and a card with Directions.
 *
 * ```tsx
 * <Map center={[37.79, -122.41]} zoom={15}>
 *   <TurnByTurn onReady={setNav} />
 *   <Search turnByTurn={nav} onSelect={({ place }) => console.log(place.name)} />
 * </Map>
 * ```
 *
 * Every prop is followed as it changes: a new `provider` is asked from the
 * next query on, new `categories` redraw Find Nearby in place.
 */
export function Search(props: SearchProps): null {
  const map = useMap()
  const controlRef = useRef<SearchControl | null>(null)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const { position, placeholder, provider, offline, categories, recents, units, location, turnByTurn, origin, lookAround, language, locale, details, shareUrl, saved, showSaved } = latest.current
    const search = new SearchControl({ position, placeholder, provider, offline, categories, recents, units, location, turnByTurn, origin, lookAround, language, locale, details, shareUrl, saved, showSaved })
    search.addTo(map)
    const stop = search.listen((type, e) => (latest.current as any)[SEARCH_EVENTS[type]]?.(e))
    controlRef.current = search
    latest.current.onReady?.(search)
    return () => {
      stop()
      search.remove()
      controlRef.current = null
    }
  }, [map])

  // Every option is followed; the control does nothing for one that has not
  // changed. A `TurnByTurn` usually arrives after the first render, from its
  // own onReady, and a `LookAround` the same way. Categories are compared by
  // value, so an inline list is not a change on every render.
  const { position, placeholder, provider, offline, categories, recents, units, location, turnByTurn, origin, lookAround, language, locale, details, shareUrl, saved, showSaved } = props
  const categoriesKey = JSON.stringify(categories?.map(c => [c.id, c.label, c.icon]) ?? null)
  useEffect(() => {
    controlRef.current?.sync({ position, placeholder, provider, offline, categories, recents, units, location, turnByTurn, origin, lookAround, language, locale, details, shareUrl, saved, showSaved })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, position, placeholder, provider, offline, categoriesKey, recents, units, location, turnByTurn, origin, lookAround, language, locale, details, shareUrl, saved, showSaved])

  const { query } = props
  useEffect(() => {
    controlRef.current?.sync({ query })
  }, [map, query])

  return null
}
