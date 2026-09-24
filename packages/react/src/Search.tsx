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
  language?: string
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
 * Options are read when the component mounts; `query` is followed as it
 * changes.
 */
export function Search(props: SearchProps): null {
  const map = useMap()
  const controlRef = useRef<SearchControl | null>(null)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const { position, placeholder, provider, offline, categories, recents, units, location, turnByTurn, origin, language } = latest.current
    const search = new SearchControl({ position, placeholder, provider, offline, categories, recents, units, location, turnByTurn, origin, language })
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

  // A `TurnByTurn` usually arrives after the first render, from its own onReady.
  const { query, turnByTurn } = props
  useEffect(() => {
    if (controlRef.current)
      controlRef.current.options.turnByTurn = turnByTurn
  }, [map, turnByTurn])

  useEffect(() => {
    controlRef.current?.sync({ query })
  }, [map, query])

  return null
}
