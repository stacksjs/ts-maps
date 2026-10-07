import type { JSX } from 'solid-js'
import type { SearchControlOptions } from 'ts-maps'
import type { ControlPosition } from './controls'
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js'
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
  onReady?: (control: SearchControl) => void
  onResults?: (e: any) => void
  onSelect?: (e: any) => void
  /** A chosen place's hours, phone and website arrived: `{ place, details }`. */
  onDetails?: (e: any) => void
  /** Save on a place's card added it to Favorites: `{ place }`. */
  onSave?: (e: any) => void
  /** Save on a place's card took it out of Favorites: `{ place }`. */
  onUnsave?: (e: any) => void
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
 * Every prop is followed as it changes: a new `provider` is asked from the
 * next query on, new `categories` redraw Find Nearby in place.
 */
export function Search(props: SearchProps): JSX.Element {
  let search: SearchControl | null = null
  let unlisten: (() => void) | null = null
  const [control, setControl] = createSignal<SearchControl | null>(null)

  // An effect rather than onMount: the map arrives through a signal. The
  // options are read untracked here; the effects below follow them.
  createEffect(() => {
    const map = useMap()
    if (!map || search)
      return
    search = untrack(() => new SearchControl({
      position: props.position,
      placeholder: props.placeholder,
      provider: props.provider,
      offline: props.offline,
      categories: props.categories,
      recents: props.recents,
      units: props.units,
      location: props.location,
      turnByTurn: props.turnByTurn,
      origin: props.origin,
      language: props.language,
      locale: props.locale,
      details: props.details,
      shareUrl: props.shareUrl,
      saved: props.saved,
      showSaved: props.showSaved,
    }))
    search.addTo(map)
    unlisten = search.listen((type, e) => (props as any)[SEARCH_EVENTS[type]]?.(e))
    props.onReady?.(search)
    setControl(search)
  })

  // Every option is followed; the control does nothing for one that has not
  // changed. A `TurnByTurn` usually arrives after mount, from its own onReady.
  createEffect(() => {
    const target = {
      position: props.position,
      placeholder: props.placeholder,
      provider: props.provider,
      offline: props.offline,
      categories: props.categories,
      recents: props.recents,
      units: props.units,
      location: props.location,
      turnByTurn: props.turnByTurn,
      origin: props.origin,
      language: props.language,
      locale: props.locale,
      details: props.details,
      shareUrl: props.shareUrl,
      saved: props.saved,
      showSaved: props.showSaved,
    }
    control()?.sync(target)
  })

  // `query` on its own, so another prop changing does not search again.
  createEffect(() => {
    const target = { query: props.query }
    control()?.sync(target)
  })

  onCleanup(() => {
    unlisten?.()
    search?.remove()
    search = null
  })

  return null as unknown as JSX.Element
}
