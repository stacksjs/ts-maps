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
   * Options are read when the component mounts; `query` and `turnByTurn`
   * are followed as they change. Events are callback props with the same
   * names the other bindings use — `onResults`, `onSelect`, `onDirections`,
   * `onClear`.
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
  export let language: string | undefined = undefined

  /* eslint-disable no-unused-vars */
  export let onReady: ((control: SearchControl) => void) | undefined = undefined
  export let onResults: ((e: any) => void) | undefined = undefined
  export let onSelect: ((e: any) => void) | undefined = undefined
  export let onDirections: ((e: any) => void) | undefined = undefined
  export let onClear: ((e: any) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  let search: SearchControl | null = null
  let unlisten: (() => void) | null = null

  // Read at the moment of the event, so a changed handler is honoured.
  const handler = (prop: string): ((e: any) => void) | undefined => ({
    onResults, onSelect, onDirections, onClear,
  } as Record<string, ((e: any) => void) | undefined>)[prop]

  onMount(() => {
    const map = useMap()
    if (!map) return
    search = new SearchControl({ position, placeholder, provider, offline, categories, recents, units, location, turnByTurn, origin, language })
    search.addTo(map)
    unlisten = search.listen((type, e) => handler(SEARCH_EVENTS[type])?.(e))
    onReady?.(search)
  })

  $: if (search) search.options.turnByTurn = turnByTurn
  $: if (search) search.sync({ query })

  onDestroy(() => {
    unlisten?.()
    search?.remove()
    search = null
  })
</script>
