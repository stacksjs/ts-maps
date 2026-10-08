<script lang="ts">
  /**
   * An indoor map, after Apple Maps: zoomed in on an airport or a mall, its
   * IMDF floor plan is drawn over the map one level at a time, with a level
   * picker beside it.
   *
   * ```svelte
   * <Map center={[37.6155, -122.3866]} zoom={17}>
   *   <Search onReady={(c) => (search = c)} />
   *   <IndoorMap venue="/imdf/sfo.zip" {search} bind:level />
   * </Map>
   * ```
   *
   * `level`, `position` and `search` are followed as they change, and `level`
   * can be bound: it follows the picker and a place chosen in `search`.
   * `venue`, `minZoom`, `language` and `locale` are read when the control is
   * made: a new one makes it again. Events are callback props with the same names the
   * other bindings use — `onLoad`, `onLevelChange`, `onVisibilityChange`.
   */
  import type { IMDFSource, IndoorVenue, Map as MapInstance, SearchControl } from 'ts-maps'
  import { onDestroy, onMount } from 'svelte'
  import { INDOOR_EVENTS, IndoorMap } from 'ts-maps'
  import { useMap } from './useMap'

  export let venue: IndoorVenue | IMDFSource
  export let level: number | undefined = undefined
  export let position: 'topleft' | 'topright' | 'bottomleft' | 'bottomright' | undefined = undefined
  export let minZoom: number | undefined = undefined
  export let language: string | undefined = undefined
  /** The language of the level picker. Default `language`, else the map's `locale`, else the browser's. */
  export let locale: string | undefined = undefined
  /** A `SearchControl` — from `<Search onReady>` — to find the venue's places in. */
  export let search: SearchControl | undefined = undefined

  /* eslint-disable no-unused-vars */
  export let onReady: ((control: IndoorMap) => void) | undefined = undefined
  export let onLoad: ((e: any) => void) | undefined = undefined
  export let onLevelChange: ((e: any) => void) | undefined = undefined
  export let onVisibilityChange: ((e: any) => void) | undefined = undefined
  /* eslint-enable no-unused-vars */

  let map: MapInstance | null = null
  let indoor: IndoorMap | null = null
  let unlisten: (() => void) | null = null
  let disconnect: (() => void) | null = null

  // Read at the moment of the event, so a changed handler is honoured.
  const handler = (prop: string): ((e: any) => void) | undefined => ({
    onLoad, onLevelChange, onVisibilityChange,
  } as Record<string, ((e: any) => void) | undefined>)[prop]

  function teardown(): void {
    disconnect?.()
    disconnect = null
    unlisten?.()
    unlisten = null
    indoor?.remove()
    indoor = null
  }

  function build(from: IndoorVenue | IMDFSource, zoom: number | undefined, lang: string | undefined, words: string | undefined): void {
    teardown()
    if (!map) return
    const made = new IndoorMap({ venue: from, level, position, minZoom: zoom, language: lang, locale: words })
    made.addTo(map)
    unlisten = made.listen((type, e) => {
      // Kept in step, so `bind:level` sees a level chosen on the picker.
      if (type === 'levelchange') level = e.level
      handler(INDOOR_EVENTS[type])?.(e)
    })
    indoor = made
    onReady?.(made)
    // A level asked for while the venue was loading is shown once it has,
    // and the level showing is bound back.
    made.ready().then(() => {
      if (indoor !== made) return
      made.sync({ level })
      level = made.level
    }, () => {})
  }

  function connect(target: IndoorMap | null, to: SearchControl | undefined): void {
    disconnect?.()
    disconnect = target && to ? target.connect(to) : null
  }

  // Read during initialisation: `getContext` is not available in onMount
  // under Svelte 4, nor in onDestroy under Svelte 5.
  const contextMap = useMap()

  onMount(() => {
    map = contextMap
  })

  $: if (map) build(venue, minZoom, language, locale)
  $: if (indoor) indoor.sync({ level, position })
  $: connect(indoor, search)

  onDestroy(() => {
    teardown()
  })
</script>
