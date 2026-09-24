import type { JSX } from 'solid-js'
import type { SearchControlOptions } from 'ts-maps'
import type { ControlPosition } from './controls'
import { createEffect, onCleanup } from 'solid-js'
import { SEARCH_EVENTS, SearchControl } from 'ts-maps'
import { useMap } from './context'

/* eslint-disable no-unused-vars */
export interface SearchProps {
  /** Search for this; a category's name runs the category. Empty clears. */
  query?: string
  position?: ControlPosition
  placeholder?: string
  /** Online geocoder. Default Photon; `null` to search only the map and offline maps. */
  provider?: SearchControlOptions['provider']
  /** Downloaded maps to search. Default the page's; `null` for none. */
  offline?: SearchControlOptions['offline']
  categories?: SearchControlOptions['categories']
  recents?: boolean
  units?: SearchControlOptions['units']
  location?: SearchControlOptions['location']
  /** A `TurnByTurn` for Directions to preview routes on. */
  turnByTurn?: SearchControlOptions['turnByTurn']
  origin?: SearchControlOptions['origin']
  language?: string
  /** The underlying control, for `search`, `searchCategory`, `select` and `cancel`. */
  onReady?: (control: SearchControl) => void
  onResults?: (e: any) => void
  onSelect?: (e: any) => void
  onDirections?: (e: any) => void
  onClear?: (e: any) => void
}
/* eslint-enable no-unused-vars */

/**
 * Search, after Apple Maps: "Search Maps" with Find Nearby and Recents,
 * suggestions as you type, pins for results, and a card with Directions.
 *
 * ```tsx
 * <Map center={[37.79, -122.41]} zoom={15}>
 *   <Search query={query()} onSelect={({ place }) => setChosen(place)} />
 * </Map>
 * ```
 *
 * Options are read when the map arrives; `query` and `turnByTurn` are
 * followed as they change.
 */
export function Search(props: SearchProps): JSX.Element {
  let search: SearchControl | null = null
  let unlisten: (() => void) | null = null

  createEffect(() => {
    const map = useMap()
    const query = props.query
    const turnByTurn = props.turnByTurn
    if (!map)
      return
    if (!search) {
      search = new SearchControl({
        position: props.position,
        placeholder: props.placeholder,
        provider: props.provider,
        offline: props.offline,
        categories: props.categories,
        recents: props.recents,
        units: props.units,
        location: props.location,
        turnByTurn,
        origin: props.origin,
        language: props.language,
      })
      search.addTo(map)
      unlisten = search.listen((type, e) => (props as any)[SEARCH_EVENTS[type]]?.(e))
      props.onReady?.(search)
    }
    search.options.turnByTurn = turnByTurn
    search.sync({ query })
  })

  onCleanup(() => {
    unlisten?.()
    search?.remove()
    search = null
  })

  return null as unknown as JSX.Element
}
