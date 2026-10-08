<script lang="ts">
  /**
   * Search, after Apple Maps: "Search Maps" with Find Nearby and Recents,
   * suggestions as you type, pins for results, and a card with Directions.
   *
   * ```svelte
   * <Map center={[37.79, -122.41]} zoom={15}>
   *   <Search {query} onSelect={({ place }) => (chosen = place)} />
   * </Map>
   * ```
   *
   * Every prop is followed as it changes: a new `provider` is asked from the
   * next query on, new `categories` redraw Find Nearby in place. Events are
   * callback props with the same names the other bindings use — `onResults`,
   * `onSelect`, `onDetails`, `onDirections`, `onSave`, `onUnsave`, `onClear`.
   * `saved` is where Save keeps Favorites (default the page's `savedPlaces()`,
   * `null` for none); `showSaved` puts them on the map as stars.
   */
  import type { SearchControlOptions } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { SEARCH_EVENTS, SearchControl } from 'ts-maps'
  import { useMap } from './useMap'

  export let query: string | undefined = undefined
  export let position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright' | undefined = undefined
  export let placeholder: string | undefined = undefined
  export let provider: SearchControlOptions['provider'] = undefined
  export let offline: SearchControlOptions['offline'] = undefined
  export let categories: SearchControlOptions['categories'] = undefined
  export let recents: boolean | undefined = undefined
  export let units: SearchControlOptions['units'] = undefined
  export let location: SearchControlOptions['location'] = undefined
  export let turnByTurn: SearchControlOptions['turnByTurn'] = undefined
  export let origin: SearchControlOptions['origin'] = undefined
  /** A `LookAround` — from `<LookAround onReady>` — for the place card's picture of the street. */
  export let lookAround: SearchControlOptions['lookAround'] = undefined
  export let language: string | undefined = undefined
  /** The language its words are in. Default `language`, else the map's `locale`, else the browser's. */
  export let locale: string | undefined = undefined
  export let details: SearchControlOptions['details'] = undefined
  export let shareUrl: SearchControlOptions['shareUrl'] = undefined
  export let saved: SearchControlOptions['saved'] = undefined
  export let showSaved: boolean | undefined = undefined

  /* eslint-disable no-unused-vars */
  export let onReady: ((control: SearchControl) => void) | undefined = undefined
  export let onResults: ((e: any) => void) | undefined = undefined
  export let onSelect: ((e: any) => void) | undefined = undefined
  export let onDetails: ((e: any) => void) | undefined = undefined
  export let onDirections: ((e: any) => void) | undefined = undefined
  export let onSave: ((e: any) => void) | undefined = undefined
  export let onUnsave: ((e: any) => void) | undefined = undefined
  export let onClear: ((e: any) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  let search: SearchControl | null = null
  let unlisten: (() => void) | null = null

  // Read at the moment of the event, so a changed handler is honoured.
  const handler = (prop: string): ((e: any) => void) | undefined => ({
    onResults, onSelect, onDetails, onDirections, onSave, onUnsave, onClear,
  } as Record<string, ((e: any) => void) | undefined>)[prop]

  // Read during initialisation: `getContext` is not available in onMount
  // under Svelte 4, nor in onDestroy under Svelte 5.
  const contextMap = useMap()

  onMount(() => {
    const map = contextMap
    if (!map) return
    search = new SearchControl({ position, placeholder, provider, offline, categories, recents, units, location, turnByTurn, origin, lookAround, language, locale, details, shareUrl, saved, showSaved })
    search.addTo(map)
    unlisten = search.listen((type, e) => handler(SEARCH_EVENTS[type])?.(e))
    onReady?.(search)
  })

  // Every option is followed; the control does nothing for one that has not
  // changed. A `TurnByTurn` usually arrives after mount, from its own
  // onReady, and a `LookAround` the same way. The query is followed on its
  // own, so another option does not search again.
  $: if (search) search.sync({ position, placeholder, provider, offline, categories, recents, units, location, turnByTurn, origin, lookAround, language, locale, details, shareUrl, saved, showSaved })
  $: if (search) search.sync({ query })

  onDestroy(() => {
    unlisten?.()
    search?.remove()
    search = null
  })
</script>
